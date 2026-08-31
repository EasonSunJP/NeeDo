# Shop Membership Card Top-Up Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a formal, auditable merchant-recorded offline top-up that credits an active stored-value membership card and exposes read-only history to the merchant and customer.

**Architecture:** Add one immutable top-up aggregate beside the existing card, issuance, and adjustment aggregates. A dedicated Route -> Controller -> Service -> Repository chain performs scoped validation and one Prisma transaction containing the card compare-and-set update, top-up record, audit, and notification. React consumes only the paginated formal APIs.

**Tech Stack:** React 19, TypeScript, Vite, Express, Zod, Prisma, MySQL 8, Jest, Supertest, Vitest.

## Global Constraints

- This step implements top-up only; redemption, refund, online payment, NDP settlement, bonus balance, and count-card renewal remain outside scope.
- A top-up credits exactly 1 through 10,000,000 integer JPY to `principalBalanceJpy`; `bonusBalanceJpy` and all NDP wallet/ledger data remain unchanged.
- Only active, unexpired stored-value cards with active memberships and no live pending adjustment are eligible.
- Every protected route uses formal JWT scope, RBAC, Zod, OpenAPI, pagination where applicable, audit, and structured errors.
- Every production behavior is introduced by a failing test first.
- All visible copy is added to the existing five-locale membership i18n table.

---

### Task 1: Schema, migration, and permission contract

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Create: `backend/prisma/migrations/20260901040000_shop_membership_card_topup/migration.sql`
- Modify: `backend/src/constants/permissions.constants.ts`
- Create: `backend/tests/shop-membership-card-topup-schema.test.ts`
- Modify: `backend/tests/shop-membership-permissions.test.ts`

**Interfaces:**
- Produces: Prisma enum `ShopMembershipCardTopUpPaymentMethod` and model `ShopMembershipCardTopUp`.
- Produces: permission code `shop.member.card.topup.create`, granted only to `admin` and `merchant_owner` by default.

- [ ] **Step 1: Write failing schema and permission tests**

```ts
expect(schema).toContain("model ShopMembershipCardTopUp {");
expect(schema).toContain("topUps ShopMembershipCardTopUp[]");
expect(migration).toContain("CHECK (`amount_jpy` > 0)");
expect(ownerPermissions).toContain("shop.member.card.topup.create");
expect(staffPermissions).not.toContain("shop.member.card.topup.create");
```

- [ ] **Step 2: Verify RED**

Run: `npm test -- --runTestsByPath tests/shop-membership-card-topup-schema.test.ts tests/shop-membership-permissions.test.ts`

Expected: FAIL because the model, migration, and permission do not exist.

- [ ] **Step 3: Add the schema, additive migration, and permission seed contract**

```prisma
enum ShopMembershipCardTopUpPaymentMethod {
  CASH          @map("cash")
  CARD          @map("card")
  PAYPAY        @map("paypay")
  BANK_TRANSFER @map("bank_transfer")
  OTHER         @map("other")
}

model ShopMembershipCardTopUp {
  id                        Int      @id @default(autoincrement())
  publicId                  String   @unique @default(uuid()) @map("public_id") @db.Char(36)
  cardId                    Int      @map("card_id")
  shopId                    Int      @map("shop_id")
  createdById               Int      @map("created_by_id")
  amountJpy                 Int      @map("amount_jpy")
  paymentMethod             ShopMembershipCardTopUpPaymentMethod @map("payment_method")
  paymentReference          String?  @map("payment_reference") @db.VarChar(160)
  note                      String?  @db.VarChar(500)
  principalBalanceBeforeJpy Int      @map("principal_balance_before_jpy")
  principalBalanceAfterJpy  Int      @map("principal_balance_after_jpy")
  cardLockVersionBefore     Int      @map("card_lock_version_before")
  idempotencyKey            String   @unique @map("idempotency_key") @db.VarChar(160)
  requestFingerprint        String   @map("request_fingerprint") @db.Char(64)
  createdAt                 DateTime @default(now()) @map("created_at")
  updatedAt                 DateTime @updatedAt @map("updated_at")
  deletedAt                 DateTime? @map("deleted_at")
}
```

- [ ] **Step 4: Verify GREEN and generate Prisma client**

Run: `npm run prisma:generate`

Run: `npm test -- --runTestsByPath tests/shop-membership-card-topup-schema.test.ts tests/shop-membership-permissions.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/prisma backend/src/constants/permissions.constants.ts backend/tests/shop-membership-card-topup-schema.test.ts backend/tests/shop-membership-permissions.test.ts
git commit -m "feat: add membership card top-up schema"
```

### Task 2: Validator and domain service

**Files:**
- Create: `backend/src/validators/shop-membership-card-topup.validator.ts`
- Create: `backend/src/services/shop-membership-card-topup.service.ts`
- Create: `backend/tests/shop-membership-card-topup-validator.test.ts`
- Create: `backend/tests/shop-membership-card-topup.service.test.ts`
- Modify: `backend/src/constants/error-codes.ts`

**Interfaces:**
- Consumes: `ShopMembershipCardTopUpPaymentMethod` values mapped to lowercase API strings.
- Produces: `ShopMembershipCardTopUpService.create`, `listMerchant`, and `listCustomer`.
- Produces: repository port methods `findByIdempotencyKey`, `createWithAuditAndNotification`, `listMerchant`, and `listCustomer`.

- [ ] **Step 1: Write failing validator and service tests**

```ts
const result = await service.create(actor, requestContext, cardPublicId, {
  amountJpy: 5000,
  paymentMethod: "cash",
  paymentReference: "POS-20260901-001",
  note: null,
  idempotencyKey: "topup-test-0001"
});
expect(result.amountJpy).toBe(5000);
expect(result.replayed).toBe(false);
```

Cover invalid amount, missing evidence, wrong identity, exact replay, replay conflict, invalid card state, pending adjustment, and paginated scope forwarding.

- [ ] **Step 2: Verify RED**

Run: `npm test -- --runTestsByPath tests/shop-membership-card-topup-validator.test.ts tests/shop-membership-card-topup.service.test.ts`

Expected: FAIL because the validator and service do not exist.

- [ ] **Step 3: Implement normalized input, SHA-256 fingerprint, audit metadata, and result mapping**

```ts
const requestFingerprint = createHash("sha256")
  .update(JSON.stringify({ cardPublicId, amountJpy, paymentMethod, paymentReference, note }))
  .digest("hex");
```

Use `AppError` with structured codes for invalid value, not found, invalid state, pending adjustment, concurrency conflict, and idempotency conflict.

- [ ] **Step 4: Verify GREEN**

Run: `npm test -- --runTestsByPath tests/shop-membership-card-topup-validator.test.ts tests/shop-membership-card-topup.service.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/validators backend/src/services backend/src/constants/error-codes.ts backend/tests/shop-membership-card-topup-validator.test.ts backend/tests/shop-membership-card-topup.service.test.ts
git commit -m "feat: define membership card top-up service"
```

### Task 3: Atomic repository and concurrency contract

**Files:**
- Create: `backend/src/repositories/shop-membership-card-topup.repository.ts`
- Create: `backend/tests/shop-membership-card-topup.repository.test.ts`

**Interfaces:**
- Consumes: repository port from Task 2.
- Produces: transaction-safe Prisma implementation with authoritative before/after balances.

- [ ] **Step 1: Write failing repository tests**

```ts
expect(prisma.$transaction).toHaveBeenCalledTimes(1);
expect(cardUpdate).toMatchObject({
  data: { principalBalanceJpy: 15000, lockVersion: { increment: 1 } }
});
expect(createdTopUp.principalBalanceBeforeJpy).toBe(10000);
expect(createdTopUp.principalBalanceAfterJpy).toBe(15000);
```

Assert `SELECT ... FOR UPDATE`, database-time expiry, current-shop scope, active membership, stored-value type, live-pending-adjustment rejection, compare-and-set, audit/notification atomicity, exact replay, and conflict handling.

- [ ] **Step 2: Verify RED**

Run: `npm test -- --runTestsByPath tests/shop-membership-card-topup.repository.test.ts`

Expected: FAIL because the repository does not exist.

- [ ] **Step 3: Implement the Prisma repository transaction**

```ts
const locked = await transaction.$queryRaw<Array<{ id: number }>>`
  SELECT id FROM shop_membership_cards WHERE id = ${card.id} FOR UPDATE
`;
const databaseNow = await readDatabaseNow(transaction);
```

Create exactly one `Notification` and one `AuditLog` in the same transaction after the successful card compare-and-set.

- [ ] **Step 4: Verify GREEN**

Run: `npm test -- --runTestsByPath tests/shop-membership-card-topup.repository.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/repositories/shop-membership-card-topup.repository.ts backend/tests/shop-membership-card-topup.repository.test.ts
git commit -m "feat: persist membership card top-ups atomically"
```

### Task 4: Routes, controller, dependency wiring, and OpenAPI

**Files:**
- Create: `backend/src/controllers/shop-membership-card-topup.controller.ts`
- Create: `backend/src/routes/shop-membership-card-topup.routes.ts`
- Modify: `backend/src/app.ts`
- Modify: `backend/src/api/openapi.ts`
- Create: `backend/tests/shop-membership-card-topup-api.test.ts`
- Modify: `backend/tests/shop-membership-openapi.test.ts`

**Interfaces:**
- Produces the three endpoints from the design with standard response envelopes.

- [ ] **Step 1: Write failing Supertest and OpenAPI tests**

```ts
await request(app)
  .post(`/api/v1/merchant-admin/shop-membership-cards/${cardPublicId}/top-ups`)
  .send(validBody)
  .expect(201);
expect(openapi.paths[merchantCreatePath].post.security).toEqual([{ bearerAuth: [] }]);
```

Cover authentication, RBAC, validation, 201/200 replay, merchant/customer pagination, and dependency injection.

- [ ] **Step 2: Verify RED**

Run: `npm test -- --runTestsByPath tests/shop-membership-card-topup-api.test.ts tests/shop-membership-openapi.test.ts`

Expected: FAIL because the routes are not registered.

- [ ] **Step 3: Add controller, routes, dependencies, and exact OpenAPI schemas**

Use `validateRequest`, `createAuthenticateMiddleware`, `createAuthorizeMiddleware`, `successResponse`, and the established request-context helpers.

- [ ] **Step 4: Verify GREEN**

Run: `npm test -- --runTestsByPath tests/shop-membership-card-topup-api.test.ts tests/shop-membership-openapi.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/controllers backend/src/routes backend/src/app.ts backend/src/api/openapi.ts backend/tests/shop-membership-card-topup-api.test.ts backend/tests/shop-membership-openapi.test.ts
git commit -m "feat: expose membership card top-up api"
```

### Task 5: Frontend API adapter and presentational components

**Files:**
- Modify: `src/features/shop-member/api.ts`
- Modify: `src/features/shop-member/i18n.ts`
- Create: `src/features/shop-member/CardTopUpDialog.tsx`
- Create: `src/features/shop-member/CardTopUpHistory.tsx`
- Create: `src/features/shop-member/CardTopUpDialog.test.tsx`
- Create: `src/features/shop-member/CardTopUpHistory.test.tsx`
- Modify: `src/features/shop-member/api.test.ts`
- Modify: `src/features/shop-member/i18n.test.ts`

**Interfaces:**
- Produces: `ShopMembershipCardTopUp`, `ShopMembershipCardTopUpRequest`, `merchantShopMembershipApi.topUpCard`, merchant/customer history methods.
- Produces: controlled dialog and paginated history component with no browser persistence.

- [ ] **Step 1: Write failing adapter, copy, dialog, and history tests**

```ts
expect(source).toContain('充值');
expect(source).toContain('TestFeatureBadge');
expect(request.method).toBe('POST');
expect(request.body.amountJpy).toBe(5000);
```

Cover exact resulting-balance preview, evidence requirement, disabled submit, API error copy, empty/loading/error/history rows, and TEST badge.

- [ ] **Step 2: Verify RED**

Run: `npm test -- src/features/shop-member/CardTopUpDialog.test.tsx src/features/shop-member/CardTopUpHistory.test.tsx src/features/shop-member/api.test.ts src/features/shop-member/i18n.test.ts`

Expected: FAIL because the adapter and components do not exist.

- [ ] **Step 3: Implement the adapter and focused components**

```ts
topUpCard(cardPublicId: string, body: ShopMembershipCardTopUpRequest) {
  return httpClient.request<ShopMembershipCardTopUp>(
    `${publicPath("/merchant-admin/shop-membership-cards", cardPublicId)}/top-ups`,
    { method: "POST", body }
  );
}
```

Generate a new idempotency key per intentional submission and reuse it while the same submission is in flight.

- [ ] **Step 4: Verify GREEN**

Run: `npm test -- src/features/shop-member/CardTopUpDialog.test.tsx src/features/shop-member/CardTopUpHistory.test.tsx src/features/shop-member/api.test.ts src/features/shop-member/i18n.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/shop-member
git commit -m "feat: add membership card top-up ui components"
```

### Task 6: Merchant and customer page integration

**Files:**
- Modify: `src/features/shop-member/ShopMemberCenterPage.tsx`
- Modify: `src/features/shop-member/ShopMemberCenterPage.test.tsx`
- Modify: `src/pages/user/UserMembershipsPage.tsx`
- Modify: `src/pages/user/UserMembershipsPage.test.tsx`

**Interfaces:**
- Consumes: Task 5 components and API methods.
- Produces: merchant `充值 TEST` action/history tab and customer read-only history.

- [ ] **Step 1: Write failing page integration tests**

```ts
expect(merchantSource).toContain("CardTopUpDialog");
expect(merchantSource).toContain('hasPermission("shop.member.card.topup.create")');
expect(customerSource).toContain("CardTopUpHistory");
```

Assert ineligible cards do not enable top-up, successful top-up refetches cards/history, and customer membership detail scopes history to owned cards.

- [ ] **Step 2: Verify RED**

Run: `npm test -- src/features/shop-member/ShopMemberCenterPage.test.tsx src/pages/user/UserMembershipsPage.test.tsx`

Expected: FAIL because the pages are not wired.

- [ ] **Step 3: Integrate the components without changing existing navigation or theme tokens**

Use current `revision` refetch semantics, formal permissions from `useAuth`, and the existing mobile panels.

- [ ] **Step 4: Verify GREEN**

Run: `npm test -- src/features/shop-member/ShopMemberCenterPage.test.tsx src/pages/user/UserMembershipsPage.test.tsx`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/shop-member/ShopMemberCenterPage.tsx src/features/shop-member/ShopMemberCenterPage.test.tsx src/pages/user/UserMembershipsPage.tsx src/pages/user/UserMembershipsPage.test.tsx
git commit -m "feat: connect membership card top-up pages"
```

### Task 7: Guarded real-database verification and documentation

**Files:**
- Create: `backend/scripts/check-shop-membership-card-topup-flow.ts`
- Create: `backend/tests/shop-membership-card-topup-flow-script.test.ts`
- Modify: `backend/package.json`
- Modify: `README.md`
- Modify: `docs/11_NDP_LEDGER_FINANCE_RECONCILIATION.md`
- Modify: `docs/api.md`

**Interfaces:**
- Produces: `npm run check:shop-membership-card-topup-flow`.

- [ ] **Step 1: Write the failing checker contract test**

```ts
expect(source).toContain("duplicateKeySingleMutation");
expect(source).toContain("walletAndNdpUnchanged");
expect(source).toContain("cleanupVerified");
expect(packageJson.scripts).toHaveProperty("check:shop-membership-card-topup-flow");
```

- [ ] **Step 2: Verify RED**

Run: `npm test -- --runTestsByPath tests/shop-membership-card-topup-flow-script.test.ts`

Expected: FAIL because the guarded checker does not exist.

- [ ] **Step 3: Implement guarded local-MySQL checks and exact cleanup**

Use separate Prisma clients for different-key and duplicate-key races. Inject a failure after card update but before audit commit and assert the entire transaction rolls back. Snapshot wallet, ledger transaction, and ledger entry aggregates before and after.

- [ ] **Step 4: Verify the checker contract and real database**

Run: `npm test -- --runTestsByPath tests/shop-membership-card-topup-flow-script.test.ts`

Run: `ENV_FILE=.env.dev npm run prisma:migrate:deploy`

Run: `ENV_FILE=.env.dev npm run check:shop-membership-card-topup-flow`

Expected: PASS, `cleanupVerified: true`, exact audit/notification cardinality, and zero wallet/NDP delta.

- [ ] **Step 5: Commit**

```bash
git add backend/scripts backend/tests/shop-membership-card-topup-flow-script.test.ts backend/package.json README.md docs/11_NDP_LEDGER_FINANCE_RECONCILIATION.md docs/api.md
git commit -m "test: verify membership card top-up flow"
```

### Task 8: Final quality gates and browser acceptance

**Files:**
- Modify only files required by failures found during this task.

**Interfaces:**
- Produces a merge-ready branch with no untracked files except the local `backend/node_modules` symlink.

- [ ] **Step 1: Run focused tests**

Run: `npm test -- src/features/shop-member src/pages/user/UserMembershipsPage.test.tsx`

Run: `npm test -- --runTestsByPath tests/shop-membership-card-topup-schema.test.ts tests/shop-membership-card-topup-validator.test.ts tests/shop-membership-card-topup.service.test.ts tests/shop-membership-card-topup.repository.test.ts tests/shop-membership-card-topup-api.test.ts tests/shop-membership-card-topup-flow-script.test.ts tests/shop-membership-openapi.test.ts tests/shop-membership-permissions.test.ts`

- [ ] **Step 2: Run full gates**

Run: `npm test`

Run: `npm run lint`

Run: `npm run build`

Run the same three commands in `backend/`.

- [ ] **Step 3: Run static safety checks**

Run: `git diff --check`

Run: `rg -n "TODO|FIXME|not implemented"` against newly changed production files and expect no matches.

- [ ] **Step 4: Perform browser acceptance**

Start the isolated formal backend/frontend on unused explicit ports, prove listener PID/cwd/branch, authenticate with the formal local merchant and customer accounts, and inspect at 440x956. Verify the merchant top-up action/history, customer history, TEST badges, no horizontal overflow, no console warning/error, and no failed requests. Do not leave test financial records behind.

- [ ] **Step 5: Request code review and address only verified findings**

If review finds an actionable defect, first add a failing regression test, run it to confirm the expected failure, apply the minimal fix, rerun the focused suite, and commit only the regression test plus the production file it exercises with message `fix: harden membership card top-up`. If review finds no actionable defect, create no empty hardening commit.

- [ ] **Step 6: Integrate safely**

Recheck current `main`, dirty files, ancestry, and overlap. Merge current `main` into the feature branch, rerun affected tests, and only then fast-forward local `main` if its worktree remains safe. Do not push or deploy.
