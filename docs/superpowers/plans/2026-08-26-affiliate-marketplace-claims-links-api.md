# Affiliate Marketplace Claims And Links API Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the formal affiliate task marketplace, idempotent per-user claims, unique customer-facing codes, reproducible signed promotion URLs, current-user claim reads, and public link resolution.

**Architecture:** Add a focused `AffiliateMarketplaceService` and Prisma repository alongside the existing publisher-side task service. Keep token signing in a small cryptographic service, derive all claimant identity from authenticated context, use the existing Claim schema and database uniqueness as the concurrency boundary, and expose only public marketplace/claim view models.

**Tech Stack:** Node.js 22, Express, TypeScript strict mode, Prisma/MySQL 8, Zod, JWT/RBAC, Node `crypto`, Jest, Supertest, OpenAPI.

## Global Constraints

- This is one microstep: marketplace reads, claim creation/read, signed link generation, and read-only link resolution only.
- Do not implement touches, Checkout attribution, customer discount calculation, reward allocation/settlement, reversal, task lifecycle controls, or UI.
- Do not add simulated business implementations, unfinished markers, or inert branches.
- Claimant user ID comes only from `AuthenticatedAccessContext.userId`; request bodies cannot select a claimant.
- One non-deleted Claim per task/user; duplicate and concurrent requests return the same Claim.
- Every protected route declares an existing affiliate RBAC permission and every input uses Zod.
- All list APIs are paginated with page size at most 100.
- Do not expose `activeKey`, `tokenHash`, signing input, signing secret, claimant identity, publisher wallet, or budget ledger records.
- Reuse the existing affiliate schema; no migration is expected.
- Production uses HTTPS `AFFILIATE_PUBLIC_BASE_URL`; `AFFILIATE_LINK_SECRET` is at least 32 characters and differs from both Auth secrets.

---

### Task 1: Affiliate Link Configuration And Cryptographic Contract

**Files:**
- Create: `backend/src/services/affiliate-link-token.service.ts`
- Modify: `backend/src/config/env.ts`
- Modify: `backend/.env.dev.example`
- Modify: `backend/.env.staging.example`
- Modify: `backend/.env.prod.example`
- Modify: `backend/tests/setup-env.ts`
- Modify: `backend/tests/production-safety.test.ts`
- Test: `backend/tests/affiliate-link-token.service.test.ts`

**Interfaces:**
- Consumes: `AFFILIATE_LINK_SECRET`, `AFFILIATE_PUBLIC_BASE_URL` from `AppConfig`.
- Produces: `AffiliateLinkTokenService.issue(input)`, `rebuild(input)`, and `verify(input)` returning deterministic token/path data without exposing the secret.

- [ ] **Step 1: Write failing configuration and token tests**

```ts
const service = new AffiliateLinkTokenService({
  secret: "affiliate-test-secret-with-at-least-32-characters",
  publicBaseUrl: "https://app.needo.test/afirieito"
});
const issued = service.issue({ taskId: 22, userId: 33, expiresAt });
expect(service.rebuild({ ...issued.reference, taskId: 22, userId: 33, expiresAt }))
  .toEqual(issued);
expect(service.verify({ publicToken: issued.publicToken, tokenHash: issued.tokenHash, ...issued.reference, taskId: 22, userId: 33, expiresAt }))
  .toBe(true);
expect(service.verify({ publicToken: `${issued.publicToken}x`, tokenHash: issued.tokenHash, ...issued.reference, taskId: 22, userId: 33, expiresAt }))
  .toBe(false);
expect(issued.promotionUrl).toMatch(/^https:\/\/app\.needo\.test\/afirieito\/r\//);
```

Also assert production config rejects an HTTP base URL, known example affiliate secret, and affiliate secret equal to either Auth token secret.

- [ ] **Step 2: Run tests and verify RED**

Run: `npm --prefix backend test -- --runInBand tests/affiliate-link-token.service.test.ts tests/production-safety.test.ts`

Expected: FAIL because the affiliate environment fields and token service do not exist.

- [ ] **Step 3: Implement the minimal secure token service and config**

```ts
export interface AffiliateLinkSubject {
  taskId: number;
  userId: number;
  expiresAt: Date;
  publicTokenId: string;
}

export interface AffiliateIssuedLink {
  publicToken: string;
  tokenHash: string;
  promotionUrl: string;
  reference: { publicTokenId: string };
}

export class AffiliateLinkTokenService {
  public issue(input: Omit<AffiliateLinkSubject, "publicTokenId">): AffiliateIssuedLink;
  public rebuild(input: AffiliateLinkSubject): AffiliateIssuedLink;
  public verify(input: AffiliateLinkSubject & { publicToken: string; tokenHash: string }): boolean;
}
```

Use `randomBytes(18).toString("base64url")` for `publicTokenId`, HMAC-SHA256 for the signature, SHA-256 for `tokenHash`, `timingSafeEqual` for comparisons, and `${baseUrlWithoutTrailingSlash}/r/${encodeURIComponent(publicToken)}` for the URL. The signed payload is a versioned canonical string containing task, user, public token ID, and millisecond expiry; it deliberately excludes the database-generated Claim ID so the final hash can be persisted in the initial insert.

Add both config keys to Zod and all example/test environments. Production refinement requires HTTPS, rejects known example secrets, and requires three distinct secrets.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run: `npm --prefix backend test -- --runInBand tests/affiliate-link-token.service.test.ts tests/production-safety.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/config/env.ts backend/src/services/affiliate-link-token.service.ts backend/.env.dev.example backend/.env.staging.example backend/.env.prod.example backend/tests/setup-env.ts backend/tests/production-safety.test.ts backend/tests/affiliate-link-token.service.test.ts
git commit -m "feat: add secure affiliate link signing"
```

### Task 2: Public Marketplace Reads

**Files:**
- Create: `backend/src/services/affiliate-marketplace.service.ts`
- Create: `backend/src/repositories/affiliate-marketplace.repository.ts`
- Test: `backend/tests/affiliate-marketplace.service.test.ts`
- Test: `backend/tests/affiliate-marketplace.repository.test.ts`

**Interfaces:**
- Consumes: existing `AffiliateTask`, task shop/service snapshots, and active budget reservation.
- Produces: `listTasks(actor, input)`, `getTask(actor, taskId)`, `AffiliateMarketplaceTaskRecord`, and `AffiliateMarketplaceRepositoryPort`.

- [ ] **Step 1: Write failing public-task visibility tests**

```ts
expect(await service.listTasks(actor, { page: 1, pageSize: 20 })).toEqual({
  list: [expect.objectContaining({ id: 3, claimable: true })],
  total: 1,
  page: 1,
  page_size: 20
});
expect(result.list[0]).not.toHaveProperty("budgetReservation");
expect(result.list[0]).not.toHaveProperty("publisherMerchantAccountId");
```

Cover scheduled/active visibility, claim windows, task end, paused/ended exclusion, missing snapshots, inactive reservation, insufficient one-reward budget, keyword/shop/service/discount filters, stable ordering, pagination, and exact public view-model fields.

- [ ] **Step 2: Run tests and verify RED**

Run: `npm --prefix backend test -- --runInBand tests/affiliate-marketplace.service.test.ts tests/affiliate-marketplace.repository.test.ts`

Expected: FAIL because marketplace service/repository are absent.

- [ ] **Step 3: Implement repository query and public mapping**

```ts
export interface AffiliateMarketplaceListInput extends PaginationInput {
  keyword?: string;
  shopId?: number;
  serviceId?: number;
  customerDiscountType?: "none" | "fixed_jpy" | "percent";
}

export interface AffiliateMarketplaceRepositoryPort {
  listClaimableTasks(input: AffiliateMarketplaceListInput & { now: Date; page: number; pageSize: number }): Promise<PaginatedResponse<AffiliateMarketplaceTaskRecord>>;
  findClaimableTaskById(taskId: number, now: Date): Promise<AffiliateMarketplaceTaskRecord | null>;
  lockClaimableTaskForShare(taskId: number, now: Date): Promise<AffiliateMarketplaceTaskRecord | null>;
}
```

Use parameterized `Prisma.sql` only where MySQL column arithmetic is required to enforce `totalFrozenNdp - allocatedNdp - capturedNdp - releasedNdp >= rewardNdpPerCompletedOrder`; use normal Prisma includes/mapping for records. The same eligibility predicate must drive both count and page IDs so pagination stays exact. `lockClaimableTaskForShare` uses a shared database lock for the task and reservation, allowing different claimants to proceed concurrently while lifecycle writes cannot change eligibility mid-transaction. Sort by `claimEndsAt ASC`, `createdAt DESC`, `id DESC`. Map only the public task fields specified by the design.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run: `npm --prefix backend test -- --runInBand tests/affiliate-marketplace.service.test.ts tests/affiliate-marketplace.repository.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/affiliate-marketplace.service.ts backend/src/repositories/affiliate-marketplace.repository.ts backend/tests/affiliate-marketplace.service.test.ts backend/tests/affiliate-marketplace.repository.test.ts
git commit -m "feat: add formal affiliate task marketplace"
```

### Task 3: Idempotent Claim Transaction And Current-User Reads

**Files:**
- Modify: `backend/src/services/affiliate-marketplace.service.ts`
- Modify: `backend/src/repositories/affiliate-marketplace.repository.ts`
- Modify: `backend/src/constants/error-codes.ts`
- Test: `backend/tests/affiliate-marketplace.service.test.ts`
- Test: `backend/tests/affiliate-marketplace.repository.test.ts`

**Interfaces:**
- Consumes: Task 1 `AffiliateLinkTokenService` and Task 2 task records/repository.
- Produces: `claimTask(actor, taskId)`, `listMyClaims(actor, input)`, `getMyClaim(actor, claimId)`, `resolveLink(publicToken)`, and `AffiliateClaimView`.

- [ ] **Step 1: Write failing claim, isolation, idempotency, and resolution tests**

```ts
const first = await service.claimTask(actor, task.id);
const duplicate = await service.claimTask(actor, task.id);
expect(first.created).toBe(true);
expect(duplicate.created).toBe(false);
expect(duplicate.claim.id).toBe(first.claim.id);
expect(duplicate.claim.publicCode).toBe(first.claim.publicCode);
expect(duplicate.claim.promotionUrl).toBe(first.claim.promotionUrl);
expect(duplicate.claim).not.toHaveProperty("tokenHash");
expect(await service.resolveLink(first.claim.promotionUrl.split("/r/")[1])).toEqual(
  expect.objectContaining({ claimId: first.claim.id, task: { id: task.id } })
);
```

Cover current-user-only list/detail, duplicate transaction calls, database unique-conflict recovery, scheduled claimability, invalid state, expired/revoked/tampered links, no token in audit metadata, and no wallet/budget mutation.

- [ ] **Step 2: Run tests and verify RED**

Run: `npm --prefix backend test -- --runInBand tests/affiliate-marketplace.service.test.ts tests/affiliate-marketplace.repository.test.ts`

Expected: FAIL because claim methods and error codes are absent.

- [ ] **Step 3: Implement claim persistence and service transaction**

```ts
export interface AffiliateClaimView {
  id: number;
  taskId: number;
  publicCode: string;
  promotionUrl: string;
  status: "active" | "expired" | "revoked";
  claimedAt: Date;
  expiresAt: Date;
  clickCount: number;
  codeUseCount: number;
  attributedOrderCount: number;
  completedOrderCount: number;
  settledRewardNdp: number;
  task: AffiliateMarketplaceTaskPublicView;
}
```

In one transaction: read any existing current-user Claim first; otherwise acquire the shared task/reservation eligibility lock; revalidate claimability; create a Claim with `activeKey = taskId:userId`, generated unique code, issued public token ID/hash, and `expiresAt = taskEndsAt`; create `affiliate.claim.created` audit evidence. On Prisma uniqueness conflict, read and return the existing task/user Claim. Limit random-code retries and translate exhaustion to `AFFILIATE_CLAIM_CONFLICT`.

`resolveLink` parses the token, looks up by `publicTokenId`, rejects deleted/revoked/expired Claims, verifies HMAC and token hash in constant time, then returns only the public task/landing context.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run: `npm --prefix backend test -- --runInBand tests/affiliate-marketplace.service.test.ts tests/affiliate-marketplace.repository.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/affiliate-marketplace.service.ts backend/src/repositories/affiliate-marketplace.repository.ts backend/src/constants/error-codes.ts backend/tests/affiliate-marketplace.service.test.ts backend/tests/affiliate-marketplace.repository.test.ts
git commit -m "feat: add idempotent affiliate claims"
```

### Task 4: Protected REST Routes And OpenAPI

**Files:**
- Create: `backend/src/validators/affiliate-marketplace.validator.ts`
- Create: `backend/src/controllers/affiliate-marketplace.controller.ts`
- Create: `backend/src/routes/affiliate-marketplace.routes.ts`
- Modify: `backend/src/app.ts`
- Modify: `backend/src/api/openapi.ts`
- Test: `backend/tests/affiliate-marketplace-api.test.ts`
- Test: `backend/tests/openapi.test.ts`

**Interfaces:**
- Consumes: Task 3 `AffiliateMarketplaceService`.
- Produces: the six API routes from the design and `AppDependencies.affiliateMarketplaceService` injection for integration tests.

- [ ] **Step 1: Write failing Supertest and OpenAPI tests**

```ts
await request(app)
  .post(`/api/v1/affiliate/tasks/${task.id}/claims`)
  .set("Authorization", "Bearer valid-token")
  .send({ userId: 999 })
  .expect(400);

const created = await request(app)
  .post(`/api/v1/affiliate/tasks/${task.id}/claims`)
  .set("Authorization", "Bearer valid-token")
  .send({})
  .expect(201);
expect(created.body.data.publicCode).toMatch(/^NDO-/);
expect(JSON.stringify(created.body.data)).not.toContain("tokenHash");
```

Cover authentication, marketplace/read and claim/button permissions, pagination validation, current-user isolation, 201/200 idempotency, invalid public token, unified response envelopes, and every OpenAPI path/schema.

- [ ] **Step 2: Run tests and verify RED**

Run: `npm --prefix backend test -- --runInBand tests/affiliate-marketplace-api.test.ts tests/openapi.test.ts`

Expected: FAIL with missing routes/OpenAPI paths.

- [ ] **Step 3: Add validators, thin controller, routes, app wiring, and OpenAPI**

```ts
export const AFFILIATE_MARKETPLACE_ROUTE_PERMISSIONS = {
  read: "page:affiliate-marketplace",
  claim: "button:affiliate-claim"
} as const;
```

Register authenticated list/detail/my-claim routes with the appropriate permission, register resolve without authentication, parse every param/query/body through Zod, and select status `201` or `200` from `claimTask().created`. Ensure the empty claim body is `z.object({}).strict()`.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run: `npm --prefix backend test -- --runInBand tests/affiliate-marketplace-api.test.ts tests/openapi.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/validators/affiliate-marketplace.validator.ts backend/src/controllers/affiliate-marketplace.controller.ts backend/src/routes/affiliate-marketplace.routes.ts backend/src/app.ts backend/src/api/openapi.ts backend/tests/affiliate-marketplace-api.test.ts backend/tests/openapi.test.ts
git commit -m "feat: expose affiliate marketplace APIs"
```

### Task 5: Real MySQL Acceptance, Documentation, And Full Gates

**Files:**
- Create: `backend/scripts/check-affiliate-marketplace-claim-flow.ts`
- Modify: `backend/package.json`
- Modify: `README.md`
- Modify: `docs/superpowers/specs/2026-08-26-affiliate-marketplace-claim-links-design.md`
- Test: `backend/tests/affiliate-marketplace-claim-flow-script.test.ts`

**Interfaces:**
- Consumes: all prior tasks and local `ENV_FILE=.env.dev` MySQL.
- Produces: `check:affiliate-marketplace-claim-flow` acceptance command with production/remote safety guards and exact cleanup.

- [ ] **Step 1: Write the failing script-safety contract test**

```ts
expect(packageJson.scripts["check:affiliate-marketplace-claim-flow"])
  .toBe("tsx scripts/check-affiliate-marketplace-claim-flow.ts");
expect(scriptSource).toContain("assertSafeLocalDatabase");
expect(scriptSource).toContain("affiliate.claim.created");
```

- [ ] **Step 2: Run the test and verify RED**

Run: `npm --prefix backend test -- --runInBand tests/affiliate-marketplace-claim-flow-script.test.ts`

Expected: FAIL because the command and script do not exist.

- [ ] **Step 3: Implement the guarded MySQL acceptance flow and docs**

The script must refuse production flags, remote database hosts, and production-looking database names; create uniquely marked users, roles, shops, services, wallets, approved tasks, reservations and claims; verify marketplace filtering, first claim, duplicate claim, signed link reconstruction, tamper rejection, cross-user isolation, no wallet mutation, and audit evidence; then delete only marker-owned rows in foreign-key-safe order and verify zero marker rows remain.

Update README with the six formal endpoints, environment fields, acceptance command, completed scope, and deferred Checkout/reward/UI boundary. Update the design spec only if implementation discovered a concrete contract correction.

- [ ] **Step 4: Run focused, database, and full verification**

Run in order:

```bash
npm --prefix backend test -- --runInBand tests/affiliate-marketplace-claim-flow-script.test.ts
ENV_FILE=.env.dev npm --prefix backend run prisma:status
ENV_FILE=.env.dev npm --prefix backend run check:affiliate-marketplace-claim-flow
npm --prefix backend run lint
npm --prefix backend test -- --runInBand
npm --prefix backend run build
npm run lint
npm test -- --run
npm run build -- --mode formal
git diff --check
```

Expected: 22 migrations up to date with no new migration; guarded MySQL flow reports `status: ok` and exact cleanup; all test/lint/build commands pass; only the existing Vite large-chunk warning may remain.

- [ ] **Step 5: Scan prohibited patterns and commit**

Run:

```bash
rg -n "T[O]DO|F[I]XME|not[[:space:]]implemented|m[o]ck|place[h]older|f[a]ke API" backend/src/services/affiliate-marketplace.service.ts backend/src/repositories/affiliate-marketplace.repository.ts backend/src/controllers/affiliate-marketplace.controller.ts backend/src/routes/affiliate-marketplace.routes.ts backend/src/validators/affiliate-marketplace.validator.ts backend/scripts/check-affiliate-marketplace-claim-flow.ts
```

Expected: no matches.

```bash
git add README.md backend/package.json backend/scripts/check-affiliate-marketplace-claim-flow.ts backend/tests/affiliate-marketplace-claim-flow-script.test.ts docs/superpowers/specs/2026-08-26-affiliate-marketplace-claim-links-design.md
git commit -m "test: verify affiliate marketplace claim flow"
```
