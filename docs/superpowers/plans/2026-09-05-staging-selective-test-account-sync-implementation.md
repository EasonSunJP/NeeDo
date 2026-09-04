# Staging Selective Test Account Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Import all 251 current local NeeDo test accounts and their login/identity graph into AWS Staging while preserving the existing `yisun0316@gmail.com` administrator, producing exactly 252 active test accounts and no business-history copy. The former 261/262 counts are historical snapshots.

**Architecture:** Build a fixed-allowlist exporter and importer around the MariaDB driver. The exporter computes the minimal account graph and writes one owner-only, content-addressed gzip bundle; the importer validates schema, target identity, collisions, roles, and keyed collection digests before inserting all rows and marking the existing administrator inside one MySQL transaction. A separate AWS orchestrator uploads the exact bundle to the encrypted versioned release bucket, completes an EBS snapshot and logical backup, executes the importer through SSM, deletes transient copies, and emits redacted evidence only.

**Tech Stack:** Node.js 22, TypeScript, MariaDB 3.4, Zod, Jest, MySQL 8, gzip/SHA-256/HMAC-SHA-256, AWS CLI v2, S3 versioning, EBS snapshots, SSM Run Command, Docker Compose.

## Global Constraints

- Execute only after the registration-disabled Staging release has passed public API, UI, readiness, and existing-login acceptance.
- Source is local `needo_dev` on loopback; target is `needo_staging` inside the approved Staging Compose network in AWS account `430611185505`, region `ap-southeast-2`.
- Import 251 source `users` rows where `deleted_at IS NULL`; preserve the one existing Staging administrator and finish with exactly 252 undeleted users.
- Set `is_test_account=1` for all 252 accounts; preserve the administrator's existing ID, password hash, identity, and admin role.
- Preserve imported password hashes without printing, decrypting, resetting, or transferring them outside the owner-only encrypted path; imported `session_generation` is reset to `0`, and Redis sessions/OTP/challenges are never copied.
- Copy only `users`, `user_identities`, `user_roles`, `customer_profiles`, `technician_profiles`, `merchant_identity_profiles`, `public_identifiers`, `shops`, `merchant_accounts`, `merchant_shop_memberships`, and `technician_shop_affiliations` within the defined active account closure.
- Do not copy soft-deleted rows, external auth, login/audit logs, identity applications, protected bank data, media files, Booking, orders, schedules, wallet/ledger/payment, membership transactions, IM, Social, notifications, exchange, analytics, or operating history.
- Never disable foreign-key checks, modify `_prisma_migrations`, run Seed, expose MySQL/Redis publicly, or reuse source numeric IDs as target IDs.
- One named MySQL lock and one transaction contain every target account mutation. Any mismatch rolls back all imported rows and the administrator test flag.
- Evidence may contain only identifiers, counts, timestamps, statuses, object versions, snapshot/command IDs, and cryptographic digests; never email lists, phones, hashes, passwords, tokens, database URLs, or SSM output bodies.

---

### Task 1: Define and validate the account-sync bundle contract

**Files:**
- Create: `backend/src/staging/selective-account-sync-contract.ts`
- Create: `backend/tests/selective-account-sync-contract.test.ts`

**Interfaces:**
- Consumes: Zod and Node crypto/zlib callers.
- Produces: `ACCOUNT_SYNC_TABLES`, `SelectiveAccountSyncBundle`, `parseSelectiveAccountSyncBundle(value)`, `canonicalizeCollection(rows)`, and `collectionDigest(key, rows)`.

- [ ] **Step 1: Write failing contract tests**

Cover exact table order, unknown-table rejection, unsafe scalar rejection, duplicate source ID rejection, digest determinism under row/key ordering, and rejection of any manifest count mismatch:

```ts
const minimal = {
  formatVersion: 2,
  sourceDatabase: "needo_dev",
  sourceMigrationCount: 1,
  sourceLatestMigration: "20260903170000_order_review_shop_summary",
  sourceMigrations: [{ migration_name: "20260903170000_order_review_shop_summary", checksum: "a".repeat(64) }],
  exportedAt: "2026-09-05T00:00:00.000Z",
  verificationKey: "a".repeat(64),
  tables: Object.fromEntries(ACCOUNT_SYNC_TABLES.map((name) => [name, []])),
  counts: Object.fromEntries(ACCOUNT_SYNC_TABLES.map((name) => [name, 0])),
  digests: Object.fromEntries(ACCOUNT_SYNC_TABLES.map((name) => [name, collectionDigest("a".repeat(64), [])]))
};

expect(parseSelectiveAccountSyncBundle(minimal).counts.users).toBe(0);
expect(() => parseSelectiveAccountSyncBundle({ ...minimal, tables: { ...minimal.tables, sessions: [] } }))
  .toThrow("ACCOUNT_SYNC_TABLE_SET_INVALID");
expect(() => parseSelectiveAccountSyncBundle({ ...minimal, counts: { ...minimal.counts, users: 1 } }))
  .toThrow("ACCOUNT_SYNC_COUNT_MISMATCH");
```

- [ ] **Step 2: Run the contract test and prove it fails**

```bash
cd backend
npm test -- --runInBand tests/selective-account-sync-contract.test.ts
```

Expected: FAIL because the contract module does not exist.

- [ ] **Step 3: Implement the fixed contract**

Define the only accepted table order:

```ts
export const ACCOUNT_SYNC_TABLES = [
  "users",
  "shops",
  "merchant_accounts",
  "customer_profiles",
  "technician_profiles",
  "user_identities",
  "merchant_identity_profiles",
  "user_roles",
  "merchant_shop_memberships",
  "technician_shop_affiliations",
  "public_identifiers"
] as const;
```

Use a JSON-safe scalar schema (`null | boolean | safe integer | finite string`) and rows shaped as `{ sourceId: positive safe integer, values: Record<string, JsonScalar> }`. Reject extra top-level and table keys with `.strict()`. Canonicalize by sorting object keys and rows by `sourceId`; compute each collection digest as:

```ts
export const collectionDigest = (key: string, rows: readonly SyncRow[]): string =>
  createHmac("sha256", Buffer.from(key, "hex"))
    .update(canonicalizeCollection(rows), "utf8")
    .digest("hex");
```

`parseSelectiveAccountSyncBundle` must recompute every count/digest and throw stable non-data-bearing error messages on mismatch.

- [ ] **Step 4: Run and commit the bundle contract**

```bash
cd backend
npm test -- --runInBand tests/selective-account-sync-contract.test.ts
npm run build
git add src/staging/selective-account-sync-contract.ts tests/selective-account-sync-contract.test.ts
git commit -m "feat: define staging account sync contract"
```

Expected: tests and build pass; the commit contains no account data.

---

### Task 2: Build the loopback-only selective exporter

**Files:**
- Create: `backend/src/staging/selective-account-export.ts`
- Create: `backend/src/staging/selective-account-export.cli.ts`
- Create: `backend/tests/selective-account-export.test.ts`
- Modify: `backend/package.json`

**Interfaces:**
- Consumes: `DATABASE_URL`, `ACCOUNT_SYNC_TABLES`, MariaDB connection port, and `--output <absolute-path>`.
- Produces: `resolveAccountClosure(input): AccountClosure`, `exportSelectiveAccounts(port, now): Promise<ExportSummary>`, and a mode-`0600` gzip bundle whose stdout summary contains only counts and SHA-256.

- [ ] **Step 1: Write failing exporter selection and security tests**

Keep closure expansion pure and test it with literal ID sets; the MariaDB query port only supplies those sets. Prove the selection closure is exactly:

```ts
expect(resolveAccountClosure({
  activeUserIds: [1, 2],
  ownedMerchantAccountIds: [20],
  merchantAccountIdentityScopeIds: [21],
  ownedShopIds: [30],
  technicianProfileShopIds: [31],
  shopIdentityScopeIds: [32],
  shopsForSelectedMerchantAccounts: [33],
  shopsForSelectedTechnicianProfiles: [34]
})).toEqual({
  userIds: [1, 2],
  merchantAccountIds: [20, 21],
  shopIds: [30, 31, 32, 33, 34]
});
```

Also assert: deleted users/relations are absent; `session_generation` becomes `0`; every exported user has `is_test_account=1`; a referenced user outside the active set becomes `null` only on nullable actor/grant fields; output mode is `0600`; and stdout does not contain fixture emails, phones, password hashes, or profile text.

- [ ] **Step 2: Run exporter tests and prove they fail**

```bash
cd backend
npm test -- --runInBand tests/selective-account-export.test.ts
```

Expected: FAIL because exporter modules do not exist.

- [ ] **Step 3: Implement strict source-boundary parsing**

Require `DEPLOY_ENV=local`, database name `needo_dev`, protocol `mysql:`, and a loopback hostname. Reject any other host or database before connecting:

```ts
export function parseLocalSourceDatabaseUrl(value: string): URL {
  const url = new URL(value);
  const database = url.pathname.replace(/^\/+/, "");
  if (url.protocol !== "mysql:" || !["127.0.0.1", "localhost", "::1"].includes(url.hostname)
      || database !== "needo_dev") {
    throw new Error("ACCOUNT_SYNC_SOURCE_BOUNDARY_REJECTED");
  }
  return url;
}
```

- [ ] **Step 4: Implement the active account closure and fixed queries**

Select `users.deleted_at IS NULL` first. Select only undeleted profiles, identities, roles, relationships, and public identifiers reachable through those users. Compute merchant-account and shop closure as specified in Step 1; do not follow services, orders, schedules, wallets, media, logs, or application tables.

`resolveAccountClosure` must sort and de-duplicate every returned ID list and reject a scoped identity that points outside the allowlisted `customer_profile`, `technician_profile`, `shop`, or `merchant_account` types. Exclude `public_identifiers` owned by non-selected objects, including customer-support accounts; do not enlarge the graph to include them.

Use fixed query constants and `dateStrings: true`; never interpolate user input into identifiers. Export every physical column except auto-increment `id`, while preserving `sourceId` separately. For `user_roles`, replace the source-only `role_id` value with the joined immutable `role_code`; the importer must never consume a source role ID. Apply these mapping rules before serialization:

```ts
const USER_OVERRIDES = {
  is_test_account: 1,
  session_generation: 0
};
const NULL_IF_USER_NOT_SELECTED = [
  "membership_granted_by_id",
  "pricing_mode_updated_by",
  "created_by_id",
  "updated_by_id",
  "removed_by_id"
] as const;
```

Always set `merchant_accounts.settlement_bank_account_id` to `null` because protected bank data is outside the approved graph. Reject any required user/shop/profile/merchant reference outside the closure; only the nullable actor/grant fields above may be normalized to `null`.

Generate `verificationKey` with `randomBytes(32).toString("hex")`, build counts/digests, gzip with deterministic `mtime: 0`, write with `{ flag: "wx", mode: 0o600 }`, then verify the final file mode and SHA-256 before returning.

- [ ] **Step 5: Add the CLI and package command**

The CLI accepts exactly one `--output` absolute path, refuses an existing file, logs only this structure, closes the connection in `finally`, and emits a generic failure without data:

```ts
{
  gate: "staging-selective-account-export",
  status: "passed",
  counts: summary.counts,
  archiveSha256: summary.archiveSha256,
  archiveBytes: summary.archiveBytes
}
```

Add:

```json
"export:staging-test-accounts": "tsx src/staging/selective-account-export.cli.ts"
```

- [ ] **Step 6: Run exporter tests, build, and commit**

```bash
cd backend
npm test -- --runInBand tests/selective-account-sync-contract.test.ts tests/selective-account-export.test.ts
npm run build
npm run lint
git add src/staging/selective-account-export.ts src/staging/selective-account-export.cli.ts tests/selective-account-export.test.ts package.json
git commit -m "feat: export selective staging account graph"
```

Expected: all checks pass; no generated bundle is committed.

---

### Task 3: Build the single-transaction Staging importer

**Files:**
- Create: `backend/src/staging/selective-account-import.ts`
- Create: `backend/src/staging/selective-account-import.cli.ts`
- Create: `backend/tests/selective-account-import.test.ts`
- Modify: `backend/package.json`

**Interfaces:**
- Consumes: `DATABASE_URL`, `ADMIN_DEFAULT_EMAIL`, `DEPLOY_ENV=staging`, `NODE_ENV=production`, and `--input <absolute-path> --sha256 <64-hex>`.
- Produces: `SelectiveAccountImportPort`, `importSelectiveAccounts(port, bundle): Promise<ImportSummary>`, and CLI command `import:staging-test-accounts`.

- [ ] **Step 1: Write failing boundary, rollback, mapping, and postcondition tests**

At the top of the test file, define `createImportHarness(state)` as a test-local implementation of `SelectiveAccountImportPort`. It must keep committed and transactional working copies separately, apply `commit` by replacing the committed copy, discard the working copy on `rollback`, and expose `committedRows(table)` for assertions. Cover these cases:

```ts
const targetWithTwoUsers = createImportHarness({ existingUsers: [administrator, secondUser] });
await expect(importSelectiveAccounts(targetWithTwoUsers, validBundle))
  .rejects.toThrow("ACCOUNT_SYNC_TARGET_BASELINE_INVALID");

const targetWithCollision = createImportHarness({
  existingUsers: [administrator],
  occupiedUniqueValues: { email: [validBundle.tables.users[0].values.email] }
});
await expect(importSelectiveAccounts(targetWithCollision, validBundle))
  .rejects.toThrow("ACCOUNT_SYNC_UNIQUE_COLLISION");

const targetMissingRole = createImportHarness({ existingUsers: [administrator], roles: [] });
await expect(importSelectiveAccounts(targetMissingRole, validBundle))
  .rejects.toThrow("ACCOUNT_SYNC_ROLE_MISSING");

const targetFailingAfterUsers = createImportHarness({
  existingUsers: [administrator],
  roles: requiredRoles,
  failAfterTable: "users"
});
await expect(importSelectiveAccounts(targetFailingAfterUsers, validBundle))
  .rejects.toThrow("ACCOUNT_SYNC_TRANSACTION_ROLLED_BACK");
expect(targetFailingAfterUsers.committedRows("users")).toEqual([administrator]);
```

The success fixture must prove source IDs are remapped, all foreign keys point to target IDs, the administrator row is not inserted or rehashed, all 252 users are test accounts, and target collection digests/counts match the bundle.

- [ ] **Step 2: Run importer tests and prove they fail**

```bash
cd backend
npm test -- --runInBand tests/selective-account-import.test.ts
```

Expected: FAIL because importer modules do not exist.

- [ ] **Step 3: Implement exact target and baseline guards**

Require `NODE_ENV=production`, `DEPLOY_ENV=staging`, host `mysql`, database `needo_staging`, and a normalized valid `ADMIN_DEFAULT_EMAIL`. Before the transaction, verify the bundle SHA-256 and gzip/JSON contract. Acquire a named lock:

```sql
SELECT GET_LOCK('needo-staging-selective-account-sync', 0) AS acquired
```

Inside `connection.beginTransaction()`, verify exactly one undeleted target user, its normalized email equals `ADMIN_DEFAULT_EMAIL`, it is active, it has exactly one active platform identity, and it owns an undeleted `admin` role. The v2 bundle includes `sourceMigrations` with all completed, non-rolled-back names/checksums. Require full set/checksum equality, except the user-approved source-only `20260903100000_exchange_matched_booking_conversion` with checksum `ecae7c8e14424f4d35def9fa51bffc1ca7292270db54b58d58545c471e7148f2`, exactly 126 source / 125 target entries, and all common entries identical. This exception requires prior 11-table column/index/foreign-key compatibility verification. Reject every other delta; never change migration history or deploy the unrelated Exchange branch.

- [ ] **Step 4: Implement multi-key collision and role preflight**

Before the first insert, compare every non-null source value against target unique columns: `users.email`, `users.needo_id`, `users.account_no`, `users.phone`, `shops.shop_no`, `merchant_accounts.code`, `merchant_accounts.owner_no`, `user_identities.active_key`, relationship `active_key` fields, and `public_identifiers.public_id` plus `(kind, number_part)`. Resolve all required `roles.code` values to target role IDs and reject missing/deleted roles. Emit only the stable error name and collision field, never its value.

- [ ] **Step 5: Insert in fixed order with source-to-target ID maps**

For each inserted row, omit `id`, execute a parameterized insert, and store `result.insertId` under its `sourceId`. Apply foreign-key maps in this order:

```ts
const insertOrder = [
  "users",
  "shops",
  "merchant_accounts",
  "customer_profiles",
  "technician_profiles",
  "user_identities",
  "merchant_identity_profiles",
  "user_roles",
  "merchant_shop_memberships",
  "technician_shop_affiliations",
  "public_identifiers"
] as const;
```

Map user/profile/shop/merchant-account/identity IDs explicitly. Rebuild `user_roles.role_id` from exported `role_code`. Map both `user_identities.scope_id` and `user_roles.scope_id` through explicit allowlists: `customer_profile`, `technician_profile`, `shop`, and `merchant_account`; accept `merchant` only as the existing alias for `merchant_account`; require `null` for `global`/`platform`, and reject every other non-null scope. Map `shops.owner_user_id`, `merchant_accounts.owner_user_id`, and nullable actor/grant fields through the user ID map. Require `merchant_accounts.settlement_bank_account_id=null`. For each `public_identifiers` row, require exactly one non-null approved owner among `user_identity_id`, `shop_id`, and `merchant_account_id`, and require `customer_support_account_id=null`. Do not run `SET FOREIGN_KEY_CHECKS=0`.

Update the existing administrator only with:

```sql
UPDATE users
SET is_test_account = 1, updated_at = updated_at
WHERE id = ? AND deleted_at IS NULL
```

- [ ] **Step 6: Validate postconditions before commit**

Within the same transaction, require: 252 undeleted users, zero undeleted non-test users, one matching administrator with active admin role, exact imported row counts, zero orphan references, one default active identity per imported user where present in source, and matching keyed collection digests calculated from target rows normalized back to source natural keys. Only then call `commit`; on every error call `rollback`. Release the named lock in `finally`.

- [ ] **Step 7: Implement a non-disclosing CLI**

Read an owner-only absolute input path, verify the passed SHA-256 before decompression, and log only:

```ts
{
  gate: "staging-selective-account-import",
  status: "passed",
  userCount: 252,
  nonTestUserCount: 0,
  administratorCount: 1,
  tableCounts: summary.tableCounts,
  verificationDigests: summary.verificationDigests
}
```

Add:

```json
"import:staging-test-accounts": "node dist/staging/selective-account-import.cli.js"
```

- [ ] **Step 8: Run importer regression tests and commit**

```bash
cd backend
npm test -- --runInBand tests/selective-account-sync-contract.test.ts tests/selective-account-import.test.ts
npm run build
npm run lint
git add src/staging/selective-account-import.ts src/staging/selective-account-import.cli.ts tests/selective-account-import.test.ts package.json
git commit -m "feat: import selective staging account graph"
```

Expected: all checks pass and the rollback test leaves no mutation.

---

### Task 4: Build the AWS snapshot, backup, transfer, and SSM orchestrator

**Files:**
- Create: `scripts/aws-staging-account-sync-lib.mjs`
- Create: `scripts/aws-staging-account-sync-lib.test.mjs`
- Create: `scripts/aws-staging-sync-test-accounts.mjs`
- Modify: `docs/aws-staging-application-runbook.md`

**Interfaces:**
- Consumes: `--profile needo-staging-bootstrap --account-id 430611185505 --region ap-southeast-2 --bundle <absolute-path> --sha256 <64-hex> --source-revision <40-hex>` plus current application-deployment evidence.
- Produces: a versioned S3 transfer object, completed EBS snapshot, versioned logical backup, bounded SSM import, and `outputs/aws-staging/account-sync.json` redacted evidence.

- [ ] **Step 1: Write failing pure-orchestrator tests**

Test exact target rejection, bundle digest mismatch, changed stack instance/volume/bucket/release rejection, S3 version/metadata rejection, snapshot identity/state rejection, failed SSM status rejection, and command safety. The generated host command must include all of these and contain no bundle content:

```js
assert.match(command, /set -euo pipefail/);
assert.match(command, /umask 077/);
assert.match(command, /mysqldump --single-transaction/);
assert.match(command, /sha256sum --check/);
assert.match(command, /import:staging-test-accounts/);
assert.match(command, /rm -f -- "\$bundle_path"/);
assert.doesNotMatch(command, /FOREIGN_KEY_CHECKS|prisma db seed/);
```

- [ ] **Step 2: Run orchestrator tests and prove they fail**

```bash
node --test scripts/aws-staging-account-sync-lib.test.mjs
```

Expected: FAIL because the library does not exist.

- [ ] **Step 3: Implement live identity and upload validation**

Reuse the existing AWS CLI adapter pattern. Require the approved assumed-role caller; one live stack; exact instance, data volume, release bucket, and backup bucket; SSM Online; active release revision matching `application-deployment.json`; and public registration endpoints already returning `40313` before upload.

Upload the verified bundle under:

```js
const objectKey = `staging/account-sync/${sourceRevision}/${bundleSha256}.json.gz`;
```

Require a version ID and matching `ContentLength` plus metadata `sha256` and `source-revision` from `head-object`.

- [ ] **Step 4: Complete EBS snapshot before SSM import**

Create a snapshot for the exact stack data volume with tags `Project=needo`, `Environment=staging`, `Purpose=pre-account-sync`, and `SourceRevision=<revision>`. Poll only until `completed`, fail on `error`, and refuse an unexpected volume ID.

- [ ] **Step 5: Build the bounded SSM host command**

The command must: acquire `/srv/needo/account-sync.lock`; verify `/srv/needo/current` and its manifest revision; download and SHA-check the exact S3 object version; create `/srv/needo/tmp/pre-account-sync-<timestamp>.sql.gz`; run `mysqldump --single-transaction --routines --triggers`; upload the backup to `s3://<backup-bucket>/staging/pre-account-sync/<revision>/<timestamp>-<sha>.sql.gz`; run the importer in the current release container with an explicit read-only bind mount; delete the remote bundle and local backup; and print only the import summary.

The import call is:

```bash
docker compose --env-file /srv/needo/config/staging.env \
  --project-name needo-staging \
  --file "$current_release/deploy/staging/docker-compose.yml" \
  run --rm --no-deps \
  --volume "$bundle_path:/run/needo/account-sync.json.gz:ro" \
  backend npm run import:staging-test-accounts -- \
  --input /run/needo/account-sync.json.gz \
  --sha256 "$bundle_sha256"
```

- [ ] **Step 6: Emit redacted evidence and document recovery**

Write the evidence atomically as mode `0600` with: gate/status/timestamp, account/region/instance/data-volume IDs, source revision, bundle digest/bytes, transfer bucket/key/version ID, snapshot ID, logical-backup bucket/key/version ID/digest, SSM command ID, final user/non-test/admin counts, table counts, and verification digests. Never persist SSM stdout or bundle path/content.

Document rollback as a separately approved outage procedure: stop application writes, restore the pre-import logical backup first, verify counts/readiness, and use the EBS snapshot only if logical restore validation fails.

- [ ] **Step 7: Run orchestrator tests and commit**

```bash
node --test scripts/aws-staging-account-sync-lib.test.mjs
git diff --check
git add scripts/aws-staging-account-sync-lib.mjs scripts/aws-staging-account-sync-lib.test.mjs scripts/aws-staging-sync-test-accounts.mjs docs/aws-staging-application-runbook.md
git commit -m "ops: orchestrate staging account sync"
```

Expected: the suite passes and no generated evidence or bundle is committed.

---

### Task 5: Package and deploy the importer-capable registration-disabled release

**Files:**
- Generate locally, do not commit: `outputs/aws-staging/application-package.json`
- Generate locally, do not commit: `outputs/aws-staging/application-deployment.json`

**Interfaces:**
- Consumes: the clean implementation revision from Tasks 1–4 and the already-disabled registration release.
- Produces: an active immutable release containing the compiled importer while keeping both registration flags false.

- [ ] **Step 1: Run the full focused gate**

```bash
cd backend
npm test -- --runInBand tests/selective-account-sync-contract.test.ts tests/selective-account-export.test.ts tests/selective-account-import.test.ts tests/auth.test.ts
npm run build
npm run lint
cd ..
npx vitest run src/pages/auth/LoginPage.test.ts
node --test deploy/staging/runtime-contract.test.mjs scripts/aws-staging-application-lib.test.mjs scripts/aws-staging-account-sync-lib.test.mjs
npm run verify:production-build
git diff --check
git status --porcelain=v1
```

Expected: all checks pass and the repository is clean.

- [ ] **Step 2: Package and deploy the exact revision**

```bash
sync_release_revision="$(git rev-parse HEAD)"
node scripts/aws-staging-package-application.mjs \
  --source-revision "$sync_release_revision" \
  --environment-evidence outputs/aws-staging/environment-acceptance.json
NEEDO_AWS_CLI="$(command -v aws)" node scripts/aws-staging-deploy-application.mjs \
  --profile needo-staging-bootstrap \
  --account-id 430611185505 \
  --region ap-southeast-2 \
  --source-revision "$sync_release_revision"
```

Expected: deployment passes, active release equals the clean revision, registration remains `40313`, and the user table still contains only the pre-sync administrator. Stop if any account rows appear before the explicit sync command.

---

### Task 6: Export, preflight, back up, and import the approved account graph

**Files:**
- Generate privately, do not commit: a `mktemp -d` bundle directory and `.json.gz` bundle.
- Generate privately, do not commit: `outputs/aws-staging/account-sync.json`.

**Interfaces:**
- Consumes: local `.env.dev`, clean implementation revision, and the AWS orchestrator.
- Produces: one completed account import with exactly 252 test users.

- [ ] **Step 1: Re-run local and Staging read-only preflight**

Verify source database/listener identity, 251 current users, password-hash and verified-email counts, source migration count/latest name, relationship counts, Staging account/region/instance/current release, SSM Online, one existing administrator, Staging migration parity, and zero unique-key collisions. Do not print email/phone/hash lists. Stop on any drift from the approved design.

- [ ] **Step 2: Export to an owner-only temporary bundle**

```bash
sync_tmp="$(mktemp -d /private/tmp/needo-account-sync.XXXXXX)"
chmod 0700 "$sync_tmp"
cd backend
DEPLOY_ENV=local ENV_FILE=.env.dev npm run export:staging-test-accounts -- \
  --output "$sync_tmp/accounts.json.gz"
chmod 0600 "$sync_tmp/accounts.json.gz"
bundle_sha256="$(shasum -a 256 "$sync_tmp/accounts.json.gz" | awk '{print $1}')"
cd ..
```

Expected: redacted export summary reports 251 users and the approved relationship counts; the file owner is the current user and mode is `0600`.

- [ ] **Step 3: Execute the bounded AWS account-sync command**

```bash
sync_revision="$(git rev-parse HEAD)"
NEEDO_AWS_CLI="$(command -v aws)" node scripts/aws-staging-sync-test-accounts.mjs \
  --profile needo-staging-bootstrap \
  --account-id 430611185505 \
  --region ap-southeast-2 \
  --bundle "$sync_tmp/accounts.json.gz" \
  --sha256 "$bundle_sha256" \
  --source-revision "$sync_revision"
```

Expected sequence: transfer upload verified; EBS snapshot completed; logical backup uploaded and versioned; SSM import succeeds; importer transaction commits; remote plaintext bundle is deleted; evidence file is written without account data.

- [ ] **Step 4: Remove the exact local transient bundle**

```bash
rm -f -- "$sync_tmp/accounts.json.gz"
rmdir -- "$sync_tmp"
```

Expected: only the redacted evidence remains; no local or remote plaintext migration bundle remains.

---

### Task 7: Database, API, and browser acceptance

**Files:**
- Read privately: `/Users/eason/Documents/New project/outputs/NeeDo_正式测试账号_权限身份后台整理版_2026-08-28.csv`
- Read privately if needed: `/Users/eason/Documents/New project/outputs/NeeDo_最新账号权限总表_2026-08-29.csv`
- Update: `docs/superpowers/specs/2026-09-05-staging-selective-test-account-sync-design.md`

**Interfaces:**
- Consumes: redacted account-sync evidence and private known test credentials.
- Produces: independently verified completion evidence for database state, login, identity/RBAC, UI, and registration closure.

- [ ] **Step 1: Verify final database invariants through a read-only SSM command**

Require: 252 undeleted enabled users; zero undeleted `is_test_account=0`; exactly one normalized `ADMIN_DEFAULT_EMAIL`; that administrator still has an active platform identity and `admin` role; exact table counts from import evidence; zero orphans; no migration change; and keyed set digests matching the export/import evidence. Return only counts and digests.

- [ ] **Step 2: Verify representative formal logins without exposing credentials**

From the private account inventory, select at least one current account for each present role family: customer, technician, merchant owner/organization, scout/broker, operator/admin. First verify every selected identifier still exists in the local source and imported digest set. Submit credentials to `POST /api/v1/auth/login`, call `/api/v1/auth/me`, assert the expected identity/role/permission, then `POST /api/v1/auth/logout`. Redact request bodies and full tokens from logs and screenshots. The existing `yisun0316@gmail.com` administrator must also pass login and `/auth/me` with its unchanged private Staging credential.

- [ ] **Step 3: Verify registration remains closed after import**

Repeat both malformed registration requests and require `40313 / error.auth.registration_disabled`. Open the public user login page at desktop and mobile widths and require no create-account control, no registration panel, successful password-login rendering, no console errors, and no horizontal overflow.

- [ ] **Step 4: Mark the design implemented and commit documentation only**

Update the design status to `已实施并通过验收` and add a redacted acceptance section containing only revision, timestamp, counts, digests, snapshot ID, backup key/version, SSM command ID, readiness, login-role coverage, and browser result.

```bash
git add docs/superpowers/specs/2026-09-05-staging-selective-test-account-sync-design.md
git commit -m "docs: record staging account sync acceptance"
```

- [ ] **Step 5: Report completion states separately**

Report: implementation commits; importer release revision; deployment and active release; schema migration unchanged; EBS snapshot complete; logical backup complete; account transaction committed; 252-account database acceptance; representative authenticated API acceptance; registration API/UI closure; and browser acceptance. If any one is missing, report it as incomplete rather than calling the whole task finished.
