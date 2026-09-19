# Cash Checkout Finance Attribution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Project a formally confirmed cash/other checkout receipt into the same `OrderFinancial` row as confirmed offline service income, while preserving checkout totals, add-on compensation inputs, platform fees, splits, and auditable timing.

**Architecture:** Keep `OrderFinancial` as the single settlement projection. Extend the existing `BookingService -> LedgerService -> LedgerRepository` completion call with the already-validated checkout receipt snapshot; do not add a second reconciliation path or schema. Persist the receipt actor/time/reason and a finance timeline event in the same transaction that completes the order and settles its platform fee.

**Tech Stack:** TypeScript, Prisma, Jest, existing Booking/Ledger/OrderFinance services.

## Global Constraints

- Work only on `codex/fix-cash-settlement-attribution-20260920` until local verification passes.
- Add the failing regression before production changes and observe the expected failure.
- Do not add a migration, mock API, remote write, push, PR, or deployment.
- Do not use port 5180 during feature development; reserve it for final merged-main verification.

---

### Task 1: Lock the checkout-to-finance contract with failing tests

**Files:**
- Modify: `backend/tests/order-checkout-service.test.ts`
- Modify: `backend/tests/ledger-service.test.ts`
- Modify: `backend/tests/ledger.repository.test.ts`

**Interfaces:**
- Consumes: `BookingService.confirmCheckoutReceipt`, `LedgerService.settleBookingCompletion`, `LedgerRepository.upsertOrderFinancial`.
- Produces: regression assertions for cash receipt evidence, `14_850 = 8_200 + 6_650`, platform-fee settlement, and finance audit fields.

- [ ] **Step 1: Add a BookingService regression that invokes the real settlement callback**

  Assert the callback passes a discriminated cash receipt snapshot with checkout total, base/add-on components, confirming actor, confirmation time, reason, and evidence.

- [ ] **Step 2: Add LedgerService and repository persistence regressions**

  Assert the persisted row contains `offline_cash`, confirmed service income, zero unknown amount, exact components, preserved fee/reward values, and receipt audit fields/timeline metadata.

- [ ] **Step 3: Run the focused tests and verify RED**

  Run: `npm --prefix backend test -- --runInBand tests/order-checkout-service.test.ts tests/ledger-service.test.ts tests/ledger.repository.test.ts`

  Expected: assertions fail because cash checkout evidence is not forwarded and the financial row remains `unknown/unreported`.

### Task 2: Implement the minimal transactional projection

**Files:**
- Modify: `backend/src/services/booking.service.ts`
- Modify: `backend/src/repositories/booking.repository.ts`
- Modify: `backend/src/services/ledger.service.ts`
- Modify: `backend/src/repositories/ledger.repository.ts`

**Interfaces:**
- Consumes: immutable `OrderCheckoutPayload` and existing completion actor.
- Produces: an extended `BookingLedgerSettlementInput.checkoutPayment` union and the existing `OrderFinancialUpsertInput` populated with offline income and audit snapshots.

- [ ] **Step 1: Forward formal offline receipt evidence from BookingService**

  Make the repository completion callback expose the just-persisted checkout receipt snapshot. For `cash` and `other`, pass its exact checkout amount, base/add-on components, evidence type, confirming actor/time, and reason. Keep NDP behavior unchanged.

- [ ] **Step 2: Map offline receipt evidence in LedgerService**

  Map cash to `offline_cash`, other to `other`, set offline amount to the checkout total, unknown amount to zero, and service income to confirmed. Append one typed `service_income_confirmed` event using the receipt timestamp and evidence metadata.

- [ ] **Step 3: Persist existing OrderFinancial audit and component fields**

  Extend the existing repository upsert data only; do not introduce another table or writer.

- [ ] **Step 4: Run the focused tests and verify GREEN**

  Run the Task 1 command and require zero failures.

### Task 3: Verify the complete local change and integrate locally

**Files:**
- Modify: `backend/scripts/check-order-fulfillment-checkout-flow.ts` only if the real-flow checker needs an assertion update.
- Modify: `backend/tests/order-fulfillment-flow-script.test.ts` only if its contract fixture must lock the new finance projection.

**Interfaces:**
- Consumes: final branch implementation.
- Produces: branch commit, local-main merge, and final main runtime evidence.

- [ ] **Step 1: Run related service/repository/checkout suites, backend lint and build**

  Run focused Jest suites, `npm --prefix backend run lint`, and `npm --prefix backend run build`.

- [ ] **Step 2: Run the guarded local checkout flow when its configured local database is available**

  Run: `ENV_FILE=.env.dev npm --prefix backend run check:order-fulfillment-checkout`.

- [ ] **Step 3: Commit the branch and merge it into local main**

  Recheck status/diff, commit the scoped files, merge into the checkout that owns local `main`, and rerun the same verification on the merged commit.

- [ ] **Step 4: Verify main on port 5180 and clean only task-owned artifacts**

  Prove listener PID/cwd/commit/proxy and relevant API behavior. Do not remove the host-managed worktree; delete only the merged local feature branch if safe.
