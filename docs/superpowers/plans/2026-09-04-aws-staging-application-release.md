# NeeDo Staging Application Release Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deploy the immutable NeeDo release to the accepted single-EC2 staging environment, create only one formal non-test administrator, activate `staging.needo.life` with TLS, and prove backup and rollback readiness.

**Architecture:** Build frontend and backend TypeScript locally from the approved clean Git revision, package only tracked sources plus verified build outputs, and store the SHA-256-addressed archive in the private release bucket. The EC2 instance retrieves that object with its instance role, builds ARM64 runtime images, starts MySQL/Redis privately, runs migrations and the one-shot administrator bootstrap, and exposes frontend/API traffic only through Nginx. Every state-changing phase records bounded JSON evidence and stops before the next phase when a postcondition fails.

**Tech Stack:** Node.js 22, TypeScript, Prisma 7, MySQL 8, Redis 7.2, Docker Compose, Nginx, Certbot, AWS CLI v2, S3, Secrets Manager, SSM Run Command, EBS snapshots.

## Global Constraints

- Target account is exactly `430611185505`; target region is exactly `ap-southeast-2`.
- Hostname is exactly `staging.needo.life`; apex `needo.life` and `www.needo.life` stay unchanged.
- Release source is a clean committed tree; untracked and uncommitted files are excluded.
- `NODE_ENV=production`, `DEPLOY_ENV=staging`, `ALLOW_TEST_LOGIN=false`, `ALLOW_FORMAL_TEST_SEED=false`, and `ALLOW_SIMULATION_SEED=false` are mandatory.
- No secret value is written to Git, command output, application logs, deployment evidence, or chat.
- The existing general Prisma seed is never run in staging.
- Existing waived frontend/backend baseline failures are not repaired or reported as passing.
- No port other than 80/443 is exposed publicly; MySQL, Redis, backend, ops API, and merchant API remain container-local.
- Each cloud mutation is followed by a read-only postcondition before the next mutation.

---

### Task 1: Guarded formal staging administrator bootstrap

**Files:**
- Create: `backend/src/staging/staging-admin-bootstrap.ts`
- Create: `backend/src/staging/staging-admin-bootstrap.repository.ts`
- Create: `backend/src/staging/staging-admin-bootstrap.cli.ts`
- Create: `backend/tests/staging-admin-bootstrap.test.ts`
- Create: `backend/tests/staging-admin-bootstrap.repository.integration.test.ts`
- Modify: `backend/package.json`

**Interfaces:**
- Consumes: `PrismaClient`, `bcryptjs`, `ADMIN_DEFAULT_EMAIL`, `ADMIN_DEFAULT_USERNAME`, `ADMIN_DEFAULT_PASSWORD`, and `ALLOW_STAGING_ADMIN_BOOTSTRAP`.
- Produces: `parseStagingAdminBootstrapConfig(env)`, `StagingAdminBootstrapService.bootstrap(input)`, and `npm run bootstrap:staging-admin`.

- [ ] **Step 1: Write configuration and service tests that fail because the staging bootstrap module does not exist**

```ts
expect(() => parseStagingAdminBootstrapConfig({ NODE_ENV: "production", DEPLOY_ENV: "prod" })).toThrow();
expect(result).toEqual({ status: "created", administratorCount: 1 });
expect(repository.createdArtifacts()).toEqual({ users: 1, platformIdentities: 1, wallets: 0, testNdp: 0 });
```

- [ ] **Step 2: Run the focused unit test and observe the missing-module failure**

Run: `npm --prefix backend test -- --runTestsByPath tests/staging-admin-bootstrap.test.ts --runInBand`
Expected: FAIL because `src/staging/staging-admin-bootstrap` is absent.

- [ ] **Step 3: Implement the fail-closed config parser and transactional service**

```ts
export type StagingAdminBootstrapResult = {
  status: "created" | "already-complete";
  administratorCount: 1;
};

export function parseStagingAdminBootstrapConfig(env: NodeJS.ProcessEnv): StagingAdminBootstrapConfig;

export class StagingAdminBootstrapService {
  constructor(private readonly repository: StagingAdminBootstrapRepository) {}
  bootstrap(input: StagingAdminBootstrapInput): Promise<StagingAdminBootstrapResult>;
}
```

The transaction locks the bootstrap marker, rejects any conflicting administrator, hashes with 12 rounds, creates one `isTestAccount=false` user plus one platform identity, attaches the existing global administrator role, writes one audit record, and verifies that it created no customer profile, wallet, ledger, NDP, TEST_NDP, shop, or technician row.

- [ ] **Step 4: Add the repository integration test and guarded CLI**

The integration test creates a uniquely named isolated database, applies the exact migration set, runs the real repository twice, proves create then exact idempotency, queries all forbidden business tables, and drops only that isolated database in `afterAll`.

- [ ] **Step 5: Run focused unit/integration tests and commit**

Run: `npm --prefix backend test -- --runTestsByPath tests/staging-admin-bootstrap.test.ts tests/staging-admin-bootstrap.repository.integration.test.ts --runInBand`
Expected: PASS with one created administrator and zero forbidden rows.

Commit: `feat: add guarded staging administrator bootstrap`

### Task 2: Staging runtime and same-origin proxy

**Files:**
- Create: `deploy/staging/backend-runtime.Dockerfile`
- Create: `deploy/staging/frontend.Dockerfile`
- Create: `deploy/staging/nginx-http.conf`
- Create: `deploy/staging/nginx-https.conf`
- Create: `deploy/staging/runtime-contract.test.mjs`
- Modify: `deploy/staging/docker-compose.yml`

**Interfaces:**
- Consumes: local `dist/`, `backend/dist/`, `backend/prisma/`, and the root-owned `/srv/needo/config/staging.env`.
- Produces: Compose services `mysql`, `redis`, `migrate`, `bootstrap-admin`, `backend`, `ops-api`, `merchant-api`, and `web` on the private `needo` network.

- [ ] **Step 1: Write a failing static contract test**

```js
assert.equal(compose.services.backend.ports, undefined);
assert.equal(compose.services.mysql.ports, undefined);
assert.equal(compose.services.redis.ports, undefined);
assert.deepEqual(compose.services.web.ports, ["80:80"]);
assert.match(httpsConfig, /location = \/api\/v1\/metrics[\s\S]*deny all/);
```

- [ ] **Step 2: Run the runtime contract and observe the exposed backend port failure**

Run: `node --test deploy/staging/runtime-contract.test.mjs`
Expected: FAIL because the current compose publishes backend port 3000 and has no web service.

- [ ] **Step 3: Implement the minimum runtime files**

The backend image installs locked dependencies, generates the Prisma client, copies the prebuilt backend output, and runs as the unprivileged `node` user. The frontend image copies only the prebuilt Vite output. Nginx maps portal route prefixes to their exact HTML entry, proxies `/api/v1`, `/ops-api/v1`, `/merchant-api/v1`, and `/media`, denies `/api/v1/metrics`, and serves the ACME challenge directory.

- [ ] **Step 4: Run the contract and local production builds**

Run: `node --test deploy/staging/runtime-contract.test.mjs`
Run: `npm run verify:production-build`
Run: `npm --prefix backend run prisma:generate && npm --prefix backend run build`
Expected: runtime contract and both production builds PASS; only recorded waived full-suite failures remain outside this task.

- [ ] **Step 5: Commit**

Commit: `feat: add staging application runtime`

### Task 3: Immutable release packaging and bounded SSM deployment

**Files:**
- Create: `scripts/aws-staging-application-lib.mjs`
- Create: `scripts/aws-staging-application-lib.test.mjs`
- Create: `scripts/aws-staging-package-application.mjs`
- Create: `scripts/aws-staging-deploy-application.mjs`
- Create: `docs/aws-staging-application-runbook.md`

**Interfaces:**
- Consumes: accepted environment evidence, exact full source revision, S3 release bucket, EC2 instance ID, and secret ARN.
- Produces: `outputs/aws-staging/application-package.json`, `outputs/aws-staging/application-deployment.json`, immutable S3 key `staging/releases/<revision>/<sha256>.tar.gz`, and one bounded SSM command ID.

- [ ] **Step 1: Write failing tests for clean-source, archive-path, redaction, and command bounds**

```js
assert.equal(assertCleanRevision(repository, revision).revision, revision);
assert.equal(releaseKey(revision, sha256), `staging/releases/${revision}/${sha256}.tar.gz`);
assert.equal(JSON.stringify(evidence).includes("ADMIN_DEFAULT_PASSWORD"), false);
assert.match(command, /sha256sum --check/);
```

- [ ] **Step 2: Run the test and observe missing exports**

Run: `node --test scripts/aws-staging-application-lib.test.mjs`
Expected: FAIL because the application release library is absent.

- [ ] **Step 3: Implement deterministic packaging**

The packager verifies `git status --porcelain` is empty, resolves the exact revision, runs production builds, stages `dist`, `backend/dist`, locked manifests, Prisma schema/migrations, and `deploy/staging`, writes a canonical manifest, creates a deterministic gzip tarball, computes SHA-256, and emits redacted JSON evidence.

- [ ] **Step 4: Implement the bounded SSM deployer**

The deployer validates environment acceptance, uploads with S3 metadata containing the revision and digest, creates a pre-migration EBS snapshot, runs one repository-owned shell payload through SSM, verifies archive SHA-256 before extraction, materializes the Secrets Manager JSON as mode `0600`, starts MySQL/Redis, records a logical pre-migration backup when a database exists, runs `migrate` then `bootstrap-admin`, starts application services, waits for health/readiness, and switches `/srv/needo/current` only after success.

- [ ] **Step 5: Run tests and commit**

Run: `node --test scripts/aws-staging-application-lib.test.mjs`
Expected: PASS, including exact resource binding and secret redaction.

Commit: `feat: add immutable staging application release`

### Task 4: Populate secrets and deploy to EC2

**Files:**
- Modify only ignored local temporary secret input under `/private/tmp` and AWS-managed resources.
- Create evidence: `outputs/aws-staging/application-deployment.json`.

**Interfaces:**
- Consumes: the Task 3 scripts and accepted environment outputs.
- Produces: one Secrets Manager version, one immutable S3 object/version, one pre-migration EBS snapshot, one running application release, and one formal administrator.

- [ ] **Step 1: Generate secrets without printing them**

Use `openssl rand` into an owner-only temporary file, set exact production/staging switches, use `yisun0316@gmail.com` as the initial administrator email, and upload through `aws secretsmanager put-secret-value --secret-string file://...`. Delete the exact temporary file after the version postcondition succeeds.

- [ ] **Step 2: Package and upload the approved revision**

Run: `node scripts/aws-staging-package-application.mjs --source-revision <full-revision> --environment-evidence outputs/aws-staging/environment-acceptance.json`
Expected: one archive whose reported SHA-256 matches a local independent `shasum -a 256`.

- [ ] **Step 3: Execute the bounded deployment**

Run: `node scripts/aws-staging-deploy-application.mjs --profile needo-staging-bootstrap --account-id 430611185505 --region ap-southeast-2 --source-revision <full-revision>`
Expected: SSM `Success`; migrations and bootstrap complete once; `/api/v1/health` and `/api/v1/ready` return code `0` through the Elastic IP.

- [ ] **Step 4: Verify cloud and database postconditions**

Read only the secret version count, object metadata/version, snapshot state, container health, migration table, administrator count/classification, and forbidden bootstrap row counts. Evidence contains IDs/counts/digests only.

- [ ] **Step 5: Commit redacted evidence references**

Commit: `chore: record staging application deployment evidence`

### Task 5: DNS, TLS, backup, rollback, and browser/API acceptance

**Files:**
- Create: `scripts/aws-staging-application-verify.mjs`
- Create: `scripts/aws-staging-application-verify.test.mjs`
- Update: `docs/aws-staging-application-runbook.md`

**Interfaces:**
- Consumes: active release, EIP `32.236.134.43`, Onamae `staging` A record, Certbot certificate, admin credentials held outside chat, and application deployment evidence.
- Produces: `outputs/aws-staging/application-acceptance.json` and a verified rollback rehearsal result.

- [ ] **Step 1: Write the failing acceptance reconstruction test**

```js
assert.equal(result.dns.address, "32.236.134.43");
assert.equal(result.tls.hostname, "staging.needo.life");
assert.equal(result.health.ready, true);
assert.equal(result.bootstrap.testAdministrators, 0);
assert.equal(result.rollback.rehearsed, true);
```

- [ ] **Step 2: Run it and observe the missing verifier failure**

Run: `node --test scripts/aws-staging-application-verify.test.mjs`
Expected: FAIL because the application verifier is absent.

- [ ] **Step 3: Add only the Onamae staging record and issue TLS**

Create `A staging 32.236.134.43 TTL 300`; do not change nameservers, apex, wildcard, or `www`. After public resolvers return the EIP, run Certbot HTTP-01, switch Nginx to the HTTPS config, and prove automatic renewal with `certbot renew --dry-run`.

- [ ] **Step 4: Rehearse backup and application rollback**

Create an encrypted logical dump and integrity manifest in `staging/daily/`, verify its S3 version and digest, deploy the same compatible release into a second inactive directory, switch `current` to it and back, and verify readiness after both switches. Do not restore or mutate business data during this rehearsal.

- [ ] **Step 5: Run API and authenticated browser acceptance**

Verify HTTPS redirect, certificate hostname/chain, static portal entries, same-origin API routes, public metrics denial, internal metrics authorization, administrator password login, `/auth/me` role/permissions, and logout/token revocation. Record no credential or token.

- [ ] **Step 6: Run final verification and commit**

Run: `node scripts/aws-staging-application-verify.mjs --profile needo-staging-bootstrap --account-id 430611185505 --region ap-southeast-2 --hostname staging.needo.life --source-revision <full-revision>`
Expected: `{ "gate": "aws-staging-application-acceptance", "status": "passed" }`.

Commit: `chore: accept NeeDo staging application deployment`
