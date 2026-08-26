# Affiliate Service Completion Reward Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Settle one Checkout-allocated fixed NDP affiliate reward when its Booking order enters `COMPLETED`, using the existing wallet ledger in the same order transition transaction.

**Architecture:** `BookingRepository.transitionOrder` remains the outer transaction owner. `BookingService` composes the existing Booking settlement with `AffiliateCheckoutService.settleCompletedBooking`; the affiliate service locks and validates domain rows, delegates the two-wallet transfer to a new idempotent `LedgerService.settleAffiliateReward`, then finalizes Attribution, Reward, budget counters, transaction links and audit evidence.

**Tech Stack:** Node.js 22, TypeScript strict mode, Express, Prisma 7/MySQL 8, Zod, Jest/Supertest, ESLint, Prettier.

## Global Constraints

- Execute only the service-completion reward microstep; task-end release, refund reversal, risk review and all affiliate UI remain gated.
- Do not add mock, demo, placeholder or fake production implementations.
- Do not change the Prisma schema or create a migration; the required formal models already exist.
- Every wallet mutation must use `LedgerService` and create immutable WalletLedger, LedgerTransaction, FinanceReconciliation and AuditLog evidence.
- Reward amount is the integer `AffiliateAttribution.rewardAllocatedNdp` snapshot; customer JPY discount is never part of NDP settlement.
- An affiliate eligibility limit must not block the Booking order from completing.
- Any financial-integrity failure must roll back the entire order transition transaction.
- Use TDD for every production behavior and commit each independently reviewable task.

---

### Task 1: Affiliate Reward Ledger Transfer

**Files:**
- Modify: `backend/src/services/ledger.service.ts`
- Modify: `backend/tests/affiliate-budget-ledger.service.test.ts`
- Modify: `backend/tests/ledger-service.test.ts`

**Interfaces:**
- Consumes: `LedgerRepositoryPort.runInTransaction`, `getOrCreateWallet`, `applyWalletDelta`, `createTransaction`, `createLedgerEntry`, `createFinanceReconciliation`, `createAuditLog`.
- Produces: `AffiliateRewardSettlementPort.settleAffiliateReward(input, context)` and `AffiliateRewardLedgerResult`.

- [ ] **Step 1: Write the failing ledger transfer tests**

Add tests that seed a Shop or MerchantAccount publisher wallet with frozen NDP and call the wished-for method twice:

```ts
const input = {
  taskId: 31,
  attributionId: 301,
  rewardId: 401,
  bookingOrderId: 9001,
  publisherOwnerType: "shop" as const,
  publisherOwnerId: 8,
  publisherWalletId: publisher.id,
  claimantUserId: 701,
  amountNdp: 1_000,
  idempotencyKey: "affiliate:task:31:booking:9001:reward:settlement",
  actorUserId: 77
};
const first = await service.settleAffiliateReward(input, { transactionClient });
const repeated = await service.settleAffiliateReward(input, { transactionClient });

expect(repeated.transaction.id).toBe(first.transaction.id);
expect(repository.wallets.get("shop:8:NDP")).toMatchObject({ frozenBalance: 2_000 });
expect(repository.wallets.get("user:701:NDP")).toMatchObject({ availableBalance: 1_000 });
expect(repository.entries).toEqual([
  expect.objectContaining({ direction: "frozen_debit", amount: 1_000 }),
  expect.objectContaining({ direction: "available_credit", amount: 1_000 })
]);
expect(repository.reconciliationRows).toHaveLength(1);
expect(repository.auditRows).toEqual([
  expect.objectContaining({ action: "ledger.affiliate_reward.settlement" })
]);
```

Add separate tests for publisher-wallet identity mismatch and frozen balance below `amountNdp`; both must reject before creating a transaction, ledger entry, reconciliation or audit row.

- [ ] **Step 2: Run the focused tests and verify RED**

Run:

```bash
npm --prefix backend test -- --runInBand tests/affiliate-budget-ledger.service.test.ts
```

Expected: TypeScript/Jest failure because `LedgerService.settleAffiliateReward` and its input/result types do not exist.

- [ ] **Step 3: Add the ledger settlement contract**

Add these types next to the existing affiliate budget types:

```ts
export interface SettleAffiliateRewardInput {
  taskId: number;
  attributionId: number;
  rewardId: number;
  bookingOrderId: number;
  publisherOwnerType: Extract<WalletOwnerType, "merchant_account" | "shop">;
  publisherOwnerId: number;
  publisherWalletId: number;
  claimantUserId: number;
  amountNdp: number;
  idempotencyKey: string;
  actorUserId: number;
}

export interface AffiliateRewardLedgerResult {
  transaction: LedgerTransactionPayload;
  publisherWalletId: number;
  claimantWalletId: number;
}

export interface AffiliateRewardSettlementPort {
  settleAffiliateReward(
    input: SettleAffiliateRewardInput,
    context?: LedgerMutationContext
  ): Promise<AffiliateRewardLedgerResult>;
}
```

Implement `LedgerService.settleAffiliateReward` using `repository.runInTransaction`. Validate positive safe-integer NDP, resolve and verify the publisher wallet ID, resolve the claimant User wallet, check the idempotency key before mutation, guarded-decrement publisher frozen NDP, credit claimant available NDP, create one `affiliate_reward_settlement` transaction with `referenceType: "affiliate_reward"`, create the two ledger entries, then call the existing `recordFinanceAndAudit` with:

```ts
{
  action: "ledger.affiliate_reward.settlement",
  expectedAmount: input.amountNdp,
  actualAmount: input.amountNdp
}
```

Use reasons `affiliate_reward_publisher_frozen_debit` and `affiliate_reward_claimant_available_credit`. Reuse existing stable wallet errors for insufficient frozen NDP and wallet mutation failure.

- [ ] **Step 4: Run focused ledger tests and lint/build**

Run:

```bash
npm --prefix backend test -- --runInBand tests/affiliate-budget-ledger.service.test.ts tests/ledger-service.test.ts
npm --prefix backend run lint
npm --prefix backend run build
```

Expected: all focused tests pass, ESLint exits 0, TypeScript build exits 0.

- [ ] **Step 5: Commit Task 1**

```bash
git add backend/src/services/ledger.service.ts backend/tests/affiliate-budget-ledger.service.test.ts backend/tests/ledger-service.test.ts
git commit -m "feat: settle affiliate reward ledger transfer"
```

---

### Task 2: Affiliate Completion Domain Transaction

**Files:**
- Modify: `backend/src/constants/error-codes.ts`
- Modify: `backend/src/services/affiliate-checkout.service.ts`
- Modify: `backend/src/repositories/affiliate-checkout.repository.ts`
- Modify: `backend/tests/affiliate-checkout.service.test.ts`
- Modify: `backend/tests/affiliate-checkout.repository.test.ts`

**Interfaces:**
- Consumes: `AffiliateRewardSettlementPort` from Task 1 and the caller's Prisma transaction client.
- Produces: `AffiliateCheckoutService.settleCompletedBooking(input)` plus repository lock/qualify/finalize methods.

- [ ] **Step 1: Write failing AffiliateCheckoutService tests**

Extend the mocked repository boundary with:

```ts
lockAttributionForCompletion: jest.fn(),
countSettledCustomerOrders: jest.fn(),
qualifyAttributionAndCreateReward: jest.fn(),
settleRewardAndCaptureBudget: jest.fn(),
createRewardSettlementAudit: jest.fn()
```

Define a completion record containing attribution/task/claim/reservation snapshots, publisher ownership and optional existing Reward. Add tests for:

- no Attribution returns `no_attribution` without calling ledger;
- an active Attribution calls qualify → ledger → finalize using the same `transactionClient`;
- a settled Attribution returns `already_settled` without moving wallets or counters;
- claimant maximum and customer maximum invalidate/release the Attribution without calling ledger;
- invalidated/reversed Attribution is a no-op;
- customer/shop/service mismatch rejects with `error.affiliate.reward_settlement_conflict`;
- ledger failure propagates and finalize/audit are not called.

The success assertion must include:

```ts
expect(rewardLedger.settleAffiliateReward).toHaveBeenCalledWith(
  expect.objectContaining({
    taskId: 31,
    attributionId: 301,
    rewardId: 401,
    bookingOrderId: 9001,
    publisherWalletId: 91,
    claimantUserId: 701,
    amountNdp: 1_000,
    idempotencyKey: "affiliate:task:31:booking:9001:reward:settlement"
  }),
  { transactionClient: TRANSACTION_CLIENT }
);
```

- [ ] **Step 2: Run service tests and verify RED**

Run:

```bash
npm --prefix backend test -- --runInBand tests/affiliate-checkout.service.test.ts
```

Expected: compile failure because the completion repository methods and service method do not exist.

- [ ] **Step 3: Define completion records and service orchestration**

Add `AFFILIATE_REWARD_SETTLEMENT_CONFLICT: 40926`. Extend `AffiliateCheckoutServiceOptions` with:

```ts
rewardLedger?: AffiliateRewardSettlementPort;
```

Add an input containing `bookingOrderId`, `customerUserId`, `shopId`, `serviceId`, `actorUserId`, and `transactionClient`. Implement `settleCompletedBooking` to:

```ts
const repository = this.repository.forTransaction(input.transactionClient);
const record = await repository.lockAttributionForCompletion(input.bookingOrderId);
if (!record) return { outcome: "no_attribution" as const };
if (record.status === "settled") return this.assertExistingSettlement(record);
if (record.status === "invalidated" || record.status === "reversed") {
  return { outcome: "ineligible" as const };
}
this.assertCompletionSnapshot(record, input);
const limitReason = await this.completionLimitReason(repository, record);
if (limitReason) {
  await this.invalidateCompletionLimit(repository, record, input, limitReason);
  return { outcome: "ineligible" as const };
}
const settledAt = this.now();
const reward = await repository.qualifyAttributionAndCreateReward({
  attributionId: record.attributionId,
  taskId: record.taskId,
  claimId: record.claimId,
  bookingOrderId: input.bookingOrderId,
  publisherWalletId: record.publisherWalletId,
  claimantUserId: record.claimantUserId,
  rewardNdp: record.rewardAllocatedNdp,
  qualifiedAt: settledAt
});
const ledger = await this.rewardLedger!.settleAffiliateReward(
  {
    taskId: record.taskId,
    attributionId: record.attributionId,
    rewardId: reward.rewardId,
    bookingOrderId: input.bookingOrderId,
    publisherOwnerType: record.publisherOwnerType,
    publisherOwnerId: record.publisherOwnerId,
    publisherWalletId: record.publisherWalletId,
    claimantUserId: record.claimantUserId,
    amountNdp: record.rewardAllocatedNdp,
    idempotencyKey: `affiliate:task:${record.taskId}:booking:${input.bookingOrderId}:reward:settlement`,
    actorUserId: input.actorUserId
  },
  { transactionClient: input.transactionClient }
);
if (reward.claimantWalletId !== ledger.claimantWalletId) {
  throw this.rewardSettlementConflictError();
}
await repository.settleRewardAndCaptureBudget({
  attributionId: record.attributionId,
  rewardId: reward.rewardId,
  taskId: record.taskId,
  claimId: record.claimId,
  rewardNdp: record.rewardAllocatedNdp,
  ledgerTransactionId: ledger.transaction.id,
  settledAt
});
await repository.createRewardSettlementAudit({
  actorUserId: input.actorUserId,
  bookingOrderId: input.bookingOrderId,
  attributionId: record.attributionId,
  rewardId: reward.rewardId,
  taskId: record.taskId,
  claimId: record.claimId,
  ledgerTransactionId: ledger.transaction.id,
  rewardNdp: record.rewardAllocatedNdp
});
return { outcome: "settled" as const, rewardId: reward.rewardId };
```

Use the existing `resolveCancellationRestoreStatus` for limit invalidation and generalize invalidation reasons to `booking_cancelled | claim_completed_order_limit_reached | customer_completed_order_limit_reached`.

- [ ] **Step 4: Write repository contract tests and verify RED**

Update the repository surface test to require all completion methods. Add mocked-Prisma tests proving the lock query uses `FOR UPDATE`, success finalization decrements allocated/increments captured and writes both transaction links, and guarded update counts other than one throw `error.affiliate.reward_settlement_conflict`.

Run:

```bash
npm --prefix backend test -- --runInBand tests/affiliate-checkout.repository.test.ts
```

Expected: failures because the methods are absent.

- [ ] **Step 5: Implement repository lock, qualification, invalidation and finalization**

`lockAttributionForCompletion` must lock the Attribution, Task, Claim and BudgetReservation rows and return the existing Reward plus settlement transaction link when present. `countSettledCustomerOrders` counts non-deleted `SETTLED` attributions for the same task/customer.

`qualifyAttributionAndCreateReward` must guarded-update `ATTRIBUTED → QUALIFIED`, set `qualifiedAt`, resolve or create the claimant's existing User NDP wallet without changing its balance, and create one `PENDING` Reward with the publisher reservation wallet ID and claimant wallet ID. Return both Reward ID and claimant wallet ID so the service can verify that LedgerService used the same wallet.

`settleRewardAndCaptureBudget` must perform guarded updates equivalent to:

```ts
reservation: allocatedNdp -= R; capturedNdp += R;
task: allocatedBudgetNdp -= R; settledBudgetNdp += R;
claim: completedOrderCount += 1; settledRewardNdp += R;
attribution: QUALIFIED -> SETTLED; settledAt = now;
reward: PENDING -> SETTLED; settledAt = now;
```

Then create one `AffiliateBudgetTransaction(kind: SETTLEMENT)` and one `AffiliateRewardTransaction(kind: SETTLEMENT)` linked to the ledger transaction. Every guarded-write mismatch throws the stable 40926 AppError via the service translation layer.

- [ ] **Step 6: Run focused domain tests and lint/build**

Run:

```bash
npm --prefix backend test -- --runInBand tests/affiliate-checkout.service.test.ts tests/affiliate-checkout.repository.test.ts tests/affiliate-state-machine.service.test.ts
npm --prefix backend run lint
npm --prefix backend run build
```

Expected: focused tests, lint and build pass.

- [ ] **Step 7: Commit Task 2**

```bash
git add backend/src/constants/error-codes.ts backend/src/services/affiliate-checkout.service.ts backend/src/repositories/affiliate-checkout.repository.ts backend/tests/affiliate-checkout.service.test.ts backend/tests/affiliate-checkout.repository.test.ts
git commit -m "feat: finalize affiliate rewards on completion"
```

---

### Task 3: Booking Completion Composition And Public Payload

**Files:**
- Modify: `backend/src/services/booking.service.ts`
- Modify: `backend/src/routes/booking.routes.ts`
- Modify: `backend/src/repositories/booking.repository.ts`
- Modify: `backend/src/api/openapi.ts`
- Modify: `backend/tests/booking-service.test.ts`
- Modify: `backend/tests/booking-api.test.ts`
- Modify: `backend/tests/openapi.test.ts`

**Interfaces:**
- Consumes: `AffiliateCheckoutService.settleCompletedBooking` and the shared `LedgerService` created by booking routes.
- Produces: atomic Booking completion plus `affiliate.attributionStatus: "settled"` in formal order payloads.

- [ ] **Step 1: Write failing BookingService composition tests**

Extend every typed affiliate mock Pick to include `settleCompletedBooking`. Add a test that completes an `inService` order and asserts both settlement calls receive the same transaction client:

```ts
expect(ledgerService.settleBookingCompletion).toHaveBeenCalledWith(
  expect.objectContaining({ bookingOrderId: 1 }),
  { transactionClient }
);
expect(affiliateCheckout.settleCompletedBooking).toHaveBeenCalledWith({
  bookingOrderId: 1,
  customerUserId: 1,
  shopId: 1,
  serviceId: 1,
  actorUserId: 2,
  transactionClient
});
```

Add a rejection test where affiliate settlement throws and the repository transition promise rejects. Verify ordinary orders still call affiliate settlement, which returns `no_attribution`, without changing the public response.

- [ ] **Step 2: Run Booking tests and verify RED**

Run:

```bash
npm --prefix backend test -- --runInBand tests/booking-service.test.ts tests/booking-api.test.ts
```

Expected: failures because the Booking completion callback is not composed and the summary union excludes `settled`.

- [ ] **Step 3: Wire completion settlement and route dependencies**

Extend the BookingService affiliate Pick with `settleCompletedBooking`. In `createSettlementOptions`, append an affiliate handler for `action === "complete"` after the existing Booking ledger handler:

```ts
actions.push((context) =>
  this.affiliateCheckoutService!.settleCompletedBooking({
    bookingOrderId: order.id,
    customerUserId: order.customerUserId,
    shopId: order.shopId,
    serviceId: order.serviceId,
    actorUserId: actor.userId,
    transactionClient: context.transactionClient
  }).then(() => undefined)
);
```

In `createBookingRoutes`, create one LedgerService instance and pass it to `AffiliateCheckoutService` through `{ rewardLedger: ledgerService }`. Preserve dependency injection: when a custom `affiliateCheckoutService` is supplied, use it unchanged.

Extend `AffiliateCheckoutSummary.attributionStatus` and repository mapping to include `qualified`, `settled`, `invalidated`, and `reversed`. Do not expose claimant identity, wallet IDs, token hash or ledger metadata in Booking responses.

- [ ] **Step 4: Update OpenAPI and API contract tests**

Update the existing affiliate order summary schema enum to:

```ts
["attributed", "qualified", "settled", "invalidated", "reversed"]
```

Add an API fixture completing an attributed order and returning the settled summary. Verify authorization and the existing `POST /api/v1/orders/{id}/complete` request/response contract remain unchanged.

- [ ] **Step 5: Run focused integration tests and lint/build**

Run:

```bash
npm --prefix backend test -- --runInBand tests/booking-service.test.ts tests/booking-api.test.ts tests/openapi.test.ts tests/booking-repository-scope.test.ts
npm --prefix backend run lint
npm --prefix backend run build
```

Expected: focused integration tests, ESLint and build pass.

- [ ] **Step 6: Commit Task 3**

```bash
git add backend/src/services/booking.service.ts backend/src/routes/booking.routes.ts backend/src/repositories/booking.repository.ts backend/src/api/openapi.ts backend/tests/booking-service.test.ts backend/tests/booking-api.test.ts backend/tests/openapi.test.ts
git commit -m "feat: settle affiliate rewards with booking completion"
```

---

### Task 4: Formal MySQL Acceptance And Documentation

**Files:**
- Create: `backend/scripts/check-affiliate-service-completion-reward-flow.ts`
- Create: `backend/tests/affiliate-service-completion-reward-flow-script.test.ts`
- Modify: `backend/package.json`
- Modify: `README.md`
- Modify: `docs/00_MASTER_MICRO_STEP_PLAN.md`
- Modify: `docs/superpowers/specs/2026-08-26-needo-affiliate-service-completion-rewards-design.md`

**Interfaces:**
- Consumes: formal Booking, Affiliate, Wallet and Ledger services against local MySQL.
- Produces: `npm --prefix backend run check:affiliate-service-completion-reward-flow` and current capability-gate documentation.

- [ ] **Step 1: Write the failing script contract test**

Require package registration and exact safety/evidence markers:

```ts
expect(packageJson.scripts["check:affiliate-service-completion-reward-flow"]).toBe(
  "tsx scripts/check-affiliate-service-completion-reward-flow.ts"
);
for (const evidence of [
  "assertSafeLocalDatabase",
  "affiliate-service-completion-reward-${Date.now()}",
  "Promise.allSettled",
  "affiliate_reward_settlement",
  "affiliate_reward_publisher_frozen_debit",
  "affiliate_reward_claimant_available_credit",
  "completed-order limit did not invalidate attribution",
  "duplicate completion reward mutated balances",
  "marker cleanup left completion reward rows behind"
]) expect(scriptSource).toContain(evidence);
```

- [ ] **Step 2: Run the script test and verify RED**

Run:

```bash
npm --prefix backend test -- --runInBand tests/affiliate-service-completion-reward-flow-script.test.ts
```

Expected: failure because the script and package command do not exist.

- [ ] **Step 3: Implement the guarded real-MySQL acceptance script**

The script must reject production/staging flags, remote hosts and production-looking database names. Seed uniquely marker-owned Users, Category, Shop, Service, schedule slots, publisher wallet, Tasks, Claims, Booking orders and Checkout attributions using formal services/Prisma rows only.

Exercise and assert:

1. pending/confirmed/in-service states create no AffiliateReward;
2. completing an attributed order transfers exactly the snapshotted fixed NDP and creates one settled Attribution/Reward, one ledger transaction, two ledger entries, one reconciliation and token-free audits;
3. direct repeated settlement is idempotent and does not mutate wallets/counters;
4. `Promise.allSettled` concurrent completion of two separately allocated orders preserves total budget and settles each at most once;
5. claimant/customer completion limits invalidate the excess Attribution, release its allocation and create no Reward;
6. a forced ledger failure rolls back order status and every affiliate mutation;
7. exact cleanup removes only marker-owned rows in relation-safe order and verifies zero remaining counts.

- [ ] **Step 4: Run contract, lint, build and real MySQL checks**

Run:

```bash
npm --prefix backend test -- --runInBand tests/affiliate-service-completion-reward-flow-script.test.ts
npm --prefix backend run lint
npm --prefix backend run build
ENV_FILE=.env.dev npm --prefix backend run check:affiliate-service-completion-reward-flow
```

Expected: all commands exit 0 and the acceptance JSON reports wallet, budget, Reward, ledger, reconciliation, audit, idempotency, concurrency, rollback and cleanup status `ok`.

- [ ] **Step 5: Update formal documentation**

Document the new automatic completion settlement, immutable price/reward snapshot separation, endpoint reuse, transaction invariants, command and deferred capabilities. Mark only “service completion reward” complete; keep task-end release, refund reversal and all UI unchecked.

- [ ] **Step 6: Commit Task 4**

```bash
git add backend/scripts/check-affiliate-service-completion-reward-flow.ts backend/tests/affiliate-service-completion-reward-flow-script.test.ts backend/package.json README.md docs/00_MASTER_MICRO_STEP_PLAN.md docs/superpowers/specs/2026-08-26-needo-affiliate-service-completion-rewards-design.md
git commit -m "test: verify affiliate service completion rewards"
```

---

### Task 5: Final Verification And Integration

**Files:**
- Verify all files changed in Tasks 1-4.

**Interfaces:**
- Consumes: the complete microstep.
- Produces: evidence-backed merge-ready branch with no unfinished implementation markers.

- [ ] **Step 1: Run task-specific verification**

```bash
npm --prefix backend test -- --runInBand tests/affiliate-budget-ledger.service.test.ts tests/affiliate-checkout.service.test.ts tests/affiliate-checkout.repository.test.ts tests/booking-service.test.ts tests/booking-api.test.ts tests/openapi.test.ts tests/affiliate-service-completion-reward-flow-script.test.ts
ENV_FILE=.env.dev npm --prefix backend run check:affiliate-service-completion-reward-flow
```

- [ ] **Step 2: Run complete repository gates**

```bash
npm --prefix backend run lint
npm --prefix backend test -- --runInBand
npm --prefix backend run build
npm run lint
npm test
npm run build
git diff --check
```

Expected: all commands exit 0. Existing production bundle size warnings are informational only; any test, lint, build or type failure blocks completion.

- [ ] **Step 3: Scan changed production files**

Run `rg` against the changed production files for `TODO`, `FIXME`, `not implemented`, new mock/fake/placeholder code, hard-coded credentials and signed affiliate tokens. Confirm no forbidden implementation is present.

- [ ] **Step 4: Review exact diff and requirements**

Confirm no schema/migration or UI was added, every wallet delta has ledger/reconciliation/audit evidence, limit invalidation does not block Booking completion, and task-end/reversal capabilities remain explicitly gated.

- [ ] **Step 5: Finish the branch**

Invoke `superpowers:verification-before-completion`, then `superpowers:finishing-a-development-branch`. For local merge, first merge current `main` into the feature branch, re-run full tests/builds, merge the verified feature branch into `main`, preserve unrelated working-tree changes, and clean up only the worktree created for this plan.
