# Affiliate Platform Fee Reserve And Settlement Implementation Plan

> **Resumed checkpoint (2026-08-30):** Work remains isolated on branch
> `codex/affiliate-merchant-task-ui`. Task 1 now has a generated Prisma Client
> and 6/6 focused schema/migration assertions passing. Do not merge this branch
> until Tasks 2-5 and the final verification matrix are complete.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every newly submitted Affiliate task snapshot the effective platform fee, freeze commission plus fee, and settle each completed order to the promoter and platform wallets in one auditable transaction.

**Architecture:** Add a versioned Affiliate-only fee policy beside the existing Booking fee policy. Existing tasks are backfilled with a zero-fee compatibility snapshot; newly submitted tasks resolve one effective rate across their selected shops, store the immutable snapshot, freeze the gross amount, and later debit the publisher's frozen wallet once while crediting the claimant reward and platform fee separately. Existing commission allocation fields remain commission-only; new fee fields prevent the fee reserve from inflating claim capacity.

**Tech Stack:** Node.js 22, Express, TypeScript strict mode, Prisma/MySQL, Zod, Jest/Supertest, existing Wallet/Ledger/FinanceReconciliation/AuditLog modules.

## Global Constraints

- One NDP is one integer JPY-equivalent point; no floating-point money.
- Default Affiliate platform fee is 1,000 bps (10%).
- `platformFeeReserveNdp = ceil(totalBudgetNdp * platformFeeBps / 10000)`.
- `platformFeeNdp = floor(rewardNdp * platformFeeBps / 10000)`.
- A 2,000,000 NDP commission budget at 10% freezes exactly 2,200,000 NDP.
- A 10,000 NDP reward at 10% debits exactly 11,000 frozen NDP, credits 10,000 to the claimant, and credits 1,000 to the platform wallet.
- A task version snapshots one fee rule and one rate; later rule changes never rewrite existing tasks, claims, rewards, or ledgers.
- A multi-shop task must resolve one identical effective rate across every selected shop or submission fails before wallet mutation.
- Existing submitted tasks and reservations retain zero-fee behavior after migration.
- No refund reversal, recovery, merchant UI, or operations UI in this microstep.
- No mock data, browser storage, direct balance writes, or unprotected admin actions.

---

### Task 1: Persist Versioned Affiliate Fee Rules And Immutable Task Snapshots

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Create: `backend/prisma/migrations/20260830010000_affiliate_platform_fee_reserve_settlement/migration.sql`
- Test: `backend/tests/affiliate-platform-fee-schema.test.ts`
- Test: `backend/tests/affiliate-platform-fee-migration.test.ts`

**Interfaces:**
- Produces: `AffiliatePlatformFeeRule`, task fee snapshot columns, reward platform allocation columns, and reservation commission/fee accounting columns.
- Consumes: existing `AffiliateTask`, `AffiliateReward`, `AffiliateBudgetReservation`, `Wallet`, `Shop`, and `User` models.

- [x] **Step 1: Write failing schema tests**

```ts
expect(schema).toContain("model AffiliatePlatformFeeRule");
expect(schema).toContain("feeBps");
expect(schema).toContain("platformFeeReserveNdp");
expect(schema).toContain("commissionFrozenNdp");
expect(schema).toContain("platformFeeCapturedNdp");
expect(schema).toContain("platformWalletId");
```

- [x] **Step 2: Run the tests and verify RED**

Run: `npm test -- affiliate-platform-fee-schema.test.ts affiliate-platform-fee-migration.test.ts`

Expected: FAIL because the model, migration, and columns do not exist.

- [x] **Step 3: Add the schema and additive migration**

Add a versioned rule with this API-facing shape:

```ts
type AffiliatePlatformFeeScope = "global" | "shop";

interface AffiliatePlatformFeeRuleRecord {
  id: number;
  scopeType: AffiliatePlatformFeeScope;
  shopId: number | null;
  feeBps: number;
  version: number;
  effectiveFrom: Date;
  effectiveTo: Date | null;
  activeKey: string | null;
  reason: string;
}
```

The migration must:

1. Create `affiliate_platform_fee_rules` with soft deletion, actor relations, the reporting index `(scope_type, shop_id, version)`, a non-null `scope_key` plus `(scope_key, version)` uniqueness (required because MySQL unique indexes treat `NULL` values as distinct), effective-time indexes, and nullable unique `active_key`.
2. Insert one active global version at 1,000 bps.
3. Add to `affiliate_tasks`: nullable rule ID, `platform_fee_bps`, `platform_fee_reserve_ndp`, `settled_platform_fee_ndp`, and `released_platform_fee_ndp`.
4. Add to `affiliate_budget_reservations`: `commission_frozen_ndp`, `platform_fee_frozen_ndp`, `platform_fee_captured_ndp`, and `platform_fee_released_ndp`.
5. Add to `affiliate_rewards`: `platform_fee_ndp` and nullable `platform_wallet_id`.
6. Backfill every existing reservation with `commission_frozen_ndp = total_frozen_ndp`, fee fields zero, and every existing task/reward with a zero-fee compatibility snapshot.
7. Preserve every existing wallet, ledger, task, reservation, attribution, and reward amount.

- [x] **Step 4: Generate Prisma Client and verify GREEN**

Run: `npm run prisma:generate`

Run: `npm test -- affiliate-platform-fee-schema.test.ts affiliate-platform-fee-migration.test.ts`

Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations/20260830010000_affiliate_platform_fee_reserve_settlement backend/tests/affiliate-platform-fee-schema.test.ts backend/tests/affiliate-platform-fee-migration.test.ts
git commit -m "feat: add affiliate platform fee snapshots"
```

---

### Task 2: Resolve And Version Global Or Shop Affiliate Fee Policies

**Files:**
- Create: `backend/src/services/affiliate-platform-fee.service.ts`
- Create: `backend/src/repositories/affiliate-platform-fee.repository.ts`
- Create: `backend/src/validators/affiliate-platform-fee.validator.ts`
- Create: `backend/src/controllers/affiliate-platform-fee.controller.ts`
- Create: `backend/src/routes/affiliate-platform-fee.routes.ts`
- Modify: `backend/src/app.ts`
- Modify: `backend/src/constants/permissions.constants.ts`
- Modify: `backend/prisma/seed.ts`
- Test: `backend/tests/affiliate-platform-fee.service.test.ts`
- Test: `backend/tests/affiliate-platform-fee.repository.test.ts`
- Test: `backend/tests/affiliate-platform-fee-api.test.ts`
- Test: `backend/tests/affiliate-permissions.test.ts`

**Interfaces:**
- Produces: `resolveForTask(shopIds, submittedAt, tx?)`, `listRules`, and `createRuleVersion`.
- Produces routes: `GET /api/v1/backoffice/affiliate/fee-rules` and `POST /api/v1/backoffice/affiliate/fee-rules`.
- Consumes permissions `page:backoffice-affiliate-fee-rule` and `button:backoffice-affiliate-fee-rule-create`.

- [x] **Step 1: Write failing service and API tests**

```ts
await expect(service.resolveForTask([8], now)).resolves.toMatchObject({
  feeBps: 1000,
  source: "global"
});
await expect(service.resolveForTask([8, 9], now)).rejects.toMatchObject({
  message: "error.affiliate.platform_fee_rate_mismatch"
});
```

API tests must prove pagination, Zod strictness, operations identity, least-privilege permissions, optimistic `expectedVersion`, reason capture, audit metadata, and soft-deleted rule exclusion.

- [x] **Step 2: Run the tests and verify RED**

Run: `npm test -- affiliate-platform-fee.service.test.ts affiliate-platform-fee.repository.test.ts affiliate-platform-fee-api.test.ts affiliate-permissions.test.ts`

Expected: FAIL because the policy module and permissions do not exist.

- [x] **Step 3: Implement deterministic policy resolution**

Use this contract:

```ts
export interface AffiliateTaskFeeSnapshot {
  ruleId: number;
  feeBps: number;
  source: "global" | "shop";
  shopIds: number[];
  effectiveAt: Date;
}

resolveForTask(
  shopIds: number[],
  effectiveAt: Date,
  transactionClient?: unknown
): Promise<AffiliateTaskFeeSnapshot>;
```

For each shop, choose its effective shop rule first and otherwise the effective global rule. Reject missing global policy, duplicate shops, inactive/deleted shops, and differing rates. A rule update closes the current active row and creates the next version in one transaction; it never edits an old row.

- [x] **Step 4: Register RBAC, routes, audit, and seed assignments**

`prisma/seed.ts` already consumes `SYSTEM_PERMISSIONS` and
`buildRolePermissionAssignments`; adding the definitions and assignments to the
shared constants therefore updates seed behavior without a separate seed-file
branch. The migration also inserts the two permissions and least-privilege role
links so migration-only deployments do not expose unusable protected routes.

Admin and finance receive read/write; operator receives read; viewer receives read-only. Every write records prior and next rate/version, scope, reason, actor, and effective time.

- [x] **Step 5: Run the focused tests and verify GREEN**

Run: `npm test -- affiliate-platform-fee.service.test.ts affiliate-platform-fee.repository.test.ts affiliate-platform-fee-api.test.ts affiliate-permissions.test.ts`

Expected: PASS.

- [x] **Step 6: Commit**

```bash
git add backend/src/services/affiliate-platform-fee.service.ts backend/src/repositories/affiliate-platform-fee.repository.ts backend/src/validators/affiliate-platform-fee.validator.ts backend/src/controllers/affiliate-platform-fee.controller.ts backend/src/routes/affiliate-platform-fee.routes.ts backend/src/app.ts backend/src/constants/permissions.constants.ts backend/prisma/seed.ts backend/tests/affiliate-platform-fee.service.test.ts backend/tests/affiliate-platform-fee.repository.test.ts backend/tests/affiliate-platform-fee-api.test.ts backend/tests/affiliate-permissions.test.ts
git commit -m "feat: add affiliate fee policy API"
```

---

### Task 3: Freeze Gross Task Budget And Release Commission Plus Fee

**Files:**
- Modify: `backend/src/services/affiliate-task.service.ts`
- Modify: `backend/src/repositories/affiliate-task.repository.ts`
- Modify: `backend/src/services/affiliate-state-machine.service.ts`
- Modify: `backend/src/services/affiliate-task-expiry.service.ts`
- Modify: `backend/src/repositories/affiliate-task-expiry.repository.ts`
- Modify: `backend/src/routes/affiliate-task.routes.ts`
- Modify: `backend/src/app.ts`
- Test: `backend/tests/affiliate-task.service.test.ts`
- Test: `backend/tests/affiliate-task.repository.test.ts`
- Test: `backend/tests/affiliate-task-expiry.service.test.ts`
- Test: `backend/tests/affiliate-task-expiry.repository.test.ts`

**Interfaces:**
- Consumes: `AffiliatePlatformFeeService.resolveForTask`.
- Produces task DTO fields `platformFeeBps`, `platformFeeReserveNdp`, and `grossReservedBudgetNdp`.
- Keeps allocation capacity based on `commissionFrozenNdp`, never `totalFrozenNdp`.

- [x] **Step 1: Write failing task submission tests**

```ts
expect(ledger.freezeAffiliateTaskBudget).toHaveBeenCalledWith(
  expect.objectContaining({ amountNdp: 2_200_000 }),
  expect.anything()
);
expect(submitted.platformFeeBps).toBe(1000);
expect(submitted.platformFeeReserveNdp).toBe(200_000);
expect(submitted.reservedBudgetNdp).toBe(2_200_000);
```

Also prove differing multi-shop rates reject before `freezeAffiliateTaskBudget`, retry submission freezes once, rejection releases gross, and existing zero-fee tasks retain old behavior.

- [x] **Step 2: Run the tests and verify RED**

Run: `npm test -- affiliate-task.service.test.ts affiliate-task.repository.test.ts affiliate-task-expiry.service.test.ts affiliate-task-expiry.repository.test.ts`

Expected: FAIL because submission still freezes commission only.

- [x] **Step 3: Implement gross freeze and snapshot persistence**

```ts
const platformFeeReserveNdp = Math.ceil(
  task.totalBudgetNdp * feeSnapshot.feeBps / 10_000
);
const grossFrozenNdp = task.totalBudgetNdp + platformFeeReserveNdp;
```

Persist the snapshot before ledger freeze in the same database transaction. Store commission and fee components separately on the reservation. `reservedBudgetNdp` becomes the actual gross frozen amount; task allocation/claim limits remain based on `totalBudgetNdp` and commission-only reservation fields.

- [x] **Step 4: Update rejection and expiry release**

Rejection releases the full gross amount. Expiry releases remaining commission plus `platformFeeFrozenNdp - platformFeeCapturedNdp - platformFeeReleasedNdp`. Audit metadata must show both components and their gross sum.

- [x] **Step 5: Run the focused tests and verify GREEN**

Run: `npm test -- affiliate-task.service.test.ts affiliate-task.repository.test.ts affiliate-task-expiry.service.test.ts affiliate-task-expiry.repository.test.ts`

Expected: PASS.

- [x] **Step 6: Commit**

```bash
git add backend/src/services/affiliate-task.service.ts backend/src/repositories/affiliate-task.repository.ts backend/src/services/affiliate-state-machine.service.ts backend/src/services/affiliate-task-expiry.service.ts backend/src/repositories/affiliate-task-expiry.repository.ts backend/src/routes/affiliate-task.routes.ts backend/src/app.ts backend/tests/affiliate-task.service.test.ts backend/tests/affiliate-task.repository.test.ts backend/tests/affiliate-task-expiry.service.test.ts backend/tests/affiliate-task-expiry.repository.test.ts
git commit -m "feat: freeze affiliate commission and platform fee"
```

---

### Task 4: Settle Reward And Platform Fee In One Three-Wallet Transaction

**Files:**
- Modify: `backend/src/services/ledger.service.ts`
- Modify: `backend/src/repositories/ledger.repository.ts`
- Modify: `backend/src/services/affiliate-checkout.service.ts`
- Modify: `backend/src/repositories/affiliate-checkout.repository.ts`
- Test: `backend/tests/affiliate-budget-ledger.service.test.ts`
- Test: `backend/tests/affiliate-checkout.service.test.ts`
- Test: `backend/tests/affiliate-checkout.repository.test.ts`

**Interfaces:**
- Changes `SettleAffiliateRewardInput` to carry `rewardNdp`, `platformFeeNdp`, and immutable `platformFeeBps`.
- Produces `AffiliateRewardLedgerResult.platformWalletId`.
- Uses platform wallet `{ ownerType: "platform", ownerId: 1, currency: "NDP" }`.

- [x] **Step 1: Write failing three-wallet settlement tests**

```ts
expect(result.transaction.amount).toBe(11_000);
expect(publisher.frozenBalance).toBe(beforeFrozen - 11_000);
expect(claimant.availableBalance).toBe(beforeClaimant + 10_000);
expect(platform.availableBalance).toBe(beforePlatform + 1_000);
```

Cover replay idempotency, publisher-wallet mismatch, insufficient gross frozen balance, zero-fee compatibility tasks, reconciliation amount 11,000, and rollback when any wallet update fails.

- [x] **Step 2: Run the tests and verify RED**

Run: `npm test -- affiliate-budget-ledger.service.test.ts affiliate-checkout.service.test.ts affiliate-checkout.repository.test.ts`

Expected: FAIL because settlement currently creates only publisher and claimant entries.

- [x] **Step 3: Implement the atomic transaction**

Create one `AFFILIATE_REWARD_SETTLEMENT` transaction with amount `rewardNdp + platformFeeNdp`. Debit the publisher frozen balance by the gross amount, credit the claimant by reward, and credit the platform by fee. Zero-fee compatibility tasks omit the zero-value platform ledger entry but still resolve the canonical platform wallet only when fee is positive.

- [x] **Step 4: Persist reward and reservation allocation evidence**

Save `platformFeeNdp` and `platformWalletId` on `AffiliateReward`; increment commission `capturedNdp` by reward and fee `platformFeeCapturedNdp` by platform fee. Store both values in reconciliation and audit metadata. Replay must validate all three wallet IDs and both amounts.

- [x] **Step 5: Run focused tests and verify GREEN**

Run: `npm test -- affiliate-budget-ledger.service.test.ts affiliate-checkout.service.test.ts affiliate-checkout.repository.test.ts`

Expected: PASS.

- [x] **Step 6: Commit**

```bash
git add backend/src/services/ledger.service.ts backend/src/repositories/ledger.repository.ts backend/src/services/affiliate-checkout.service.ts backend/src/repositories/affiliate-checkout.repository.ts backend/tests/affiliate-budget-ledger.service.test.ts backend/tests/affiliate-checkout.service.test.ts backend/tests/affiliate-checkout.repository.test.ts
git commit -m "feat: settle affiliate platform fee atomically"
```

---

### Task 5: Publish The Contract And Prove It Against Local MySQL

**Files:**
- Modify: `backend/src/api/openapi.ts`
- Create: `backend/scripts/check-affiliate-platform-fee-flow.ts`
- Modify: `backend/package.json`
- Modify: `backend/tests/openapi.test.ts`
- Create: `backend/tests/affiliate-platform-fee-flow-script.test.ts`
- Modify: `docs/affiliate-marketplace-mobile-ui.md`
- Modify: `docs/ledger.md`
- Modify: `README.md`

**Interfaces:**
- Produces command: `ENV_FILE=.env.dev npm --prefix backend run check:affiliate-platform-fee-flow`.
- Documents the fee-rule APIs and expanded task/reward DTOs.

- [x] **Step 1: Write failing OpenAPI and checker-contract tests**

Assert both fee-rule paths exist, use JWT/RBAC, paginate, document stable errors, and expose no internal numeric actor IDs. Assert the checker refuses production flags, remote MySQL, and production-like database names.

- [x] **Step 2: Run the tests and verify RED**

Run: `npm test -- openapi.test.ts affiliate-platform-fee-flow-script.test.ts`

Expected: FAIL because the API documentation and checker do not exist.

- [x] **Step 3: Implement the guarded real-database checker**

The checker must create uniquely marked shop and merchant publisher tasks and prove:

1. 2,000,000 commission at 10% freezes exactly 2,200,000.
2. A 10,000 reward captures 11,000 gross and credits claimant/platform 10,000/1,000.
3. A shop override is snapshotted and later rule changes do not alter the task.
4. Mixed-rate multi-shop submission fails before wallet mutation.
5. Rejection and expiry release both commission and remaining fee correctly.
6. Exact retries do not duplicate rules, freezes, settlements, ledger entries, reconciliation, or audit.
7. Cleanup restores captured row counts and wallet aggregate balances exactly.

- [x] **Step 4: Run complete verification**

Run: `npm test`

Run: `npm run lint`

Run: `npm run build`

Run from repository root: `npm test`

Run from repository root: `npm run lint`

Run from repository root: `npm run verify:production-build`

Run: `ENV_FILE=.env.dev npm run check:affiliate-platform-fee-flow`

Expected: every command exits 0; the checker reports exact 2,200,000 freeze, 11,000 capture, 10,000 claimant credit, 1,000 platform credit, and zero cleanup residue.

- [x] **Step 5: Commit**

```bash
git add backend/src/api/openapi.ts backend/scripts/check-affiliate-platform-fee-flow.ts backend/package.json backend/tests/openapi.test.ts backend/tests/affiliate-platform-fee-flow-script.test.ts docs/affiliate-marketplace-mobile-ui.md docs/ledger.md README.md
git commit -m "test: verify affiliate platform fee flow"
```

## Self-Review

- Spec coverage: default/global and shop-specific rates, immutable snapshots, gross freeze, per-order gross capture, release, audit, RBAC, OpenAPI, real MySQL, idempotency, and backward compatibility are covered.
- Deliberate next microstep: refund reversal/recovery remains separate because it must consume immutable reward allocations and introduce withdrawal recovery gates without weakening this settlement contract.
- Deliberate later UI work: merchant publishing/management and operations fee-policy screens consume these APIs only after this backend contract passes.
- Placeholder scan: no TBD, TODO, fake implementation, or unspecified test step remains.
- Type consistency: `rewardNdp`, `platformFeeNdp`, `platformFeeBps`, `platformWalletId`, commission-only reservation counters, and gross transaction amounts use the same meanings in Tasks 1–5.
