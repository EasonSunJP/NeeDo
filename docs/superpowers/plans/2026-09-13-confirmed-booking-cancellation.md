# Confirmed Booking Cancellation Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every authorized `confirmed -> cancelled` Booking transition commit atomically even when historical or inconsistent NDP hold state prevents the normal release/compensation path, while preserving an auditable formal ledger result and accurate UI errors.

**Architecture:** Keep `BookingService` and `BookingRepository.transitionOrderWithScheduleGuard` as the single atomic order/schedule/history boundary. Harden the existing `LedgerService` cancellation settlement in place: release only verifiably frozen NDP, record missing/short hold evidence in the existing `OrderFinancial.moneyTimelineJson`, and allow the already-supported negative wallet balance/debt model to fund provider compensation. Reuse one frontend booking error mapper across customer, technician, merchant, and operations cancellation surfaces.

**Tech Stack:** TypeScript, Express, Prisma/MySQL, Jest, Vitest, React/Vite.

## Global Constraints

- Work only on `codex/fix-confirmed-booking-cancellation-20260913` in the existing isolated worktree.
- Do not use, stop, restart, or kill port 5180 before the branch is merged into local `main`.
- Do not push, deploy, access staging/production, or write any remote database.
- Preserve Booking status, schedule release, cancellation reason, payment refund state, performance classification, notifications, timeline, ledger, RBAC, and audit atomicity.
- Add no mock API, fake persistence, second cancellation state machine, or weakened wallet validation outside this cancellation-specific recovery.

---

### Task 1: Lock the ledger regression matrix in RED

**Files:**
- Modify: `backend/tests/ledger-service.test.ts`
- Modify: `backend/tests/booking-service.test.ts`

**Interfaces:**
- Consumes: `LedgerService.releaseBookingHold`, `LedgerService.compensateCustomerForMerchantCancellation`, `BookingService.transitionOrder`.
- Produces: regression coverage for normal hold, missing historical hold, frozen shortfall, available-balance shortfall, disabled platform fee, NDP/Test NDP, payment states, and customer/technician/merchant/platform actors.

- [x] **Step 1: Add the missing-hold and short-balance tests**

```ts
await expect(service.compensateCustomerForMerchantCancellation(input)).resolves.not.toThrow();
expect(repository.financials.get(input.bookingOrderId)).toMatchObject({
  settlementStatus: "compensated"
});
```

- [x] **Step 2: Add Booking actor/payment atomicity expectations**

```ts
await service.transitionOrder(actor, order.id, "cancel", "provider cancellation");
expect(repository.transitionOrderWithScheduleGuard).toHaveBeenCalledTimes(1);
```

- [x] **Step 3: Run focused tests and verify expected failures**

Run: `npm --prefix backend test -- --runInBand tests/ledger-service.test.ts tests/booking-service.test.ts`

Expected: new historical-hold/frozen/available-balance cases fail in the current cancellation settlement path.

### Task 2: Repair cancellation settlement without weakening ledger boundaries

**Files:**
- Modify: `backend/src/services/ledger.service.ts`

**Interfaces:**
- Consumes: existing `LedgerRepositoryPort`, wallet delta, wallet hold, OrderFinancial timeline, reconciliation, and audit methods.
- Produces: idempotent best-effort hold release that never invents frozen funds, plus exact provider compensation which may create an existing-model negative merchant wallet balance.

- [x] **Step 1: Make hold release tolerate legacy absence and frozen shortfall**

```ts
const releasableAmount = Math.min(remainingHoldAmount, Math.max(0, wallet.frozenBalance));
```

Persist `expectedReleaseNdp`, `releasedNdp`, and `releaseShortfallNdp` in the existing order-financial timeline. Do not create a zero-value ledger entry.

- [x] **Step 2: Fund provider compensation through the existing overdraft-capable wallet model**

```ts
await repository.applyWalletDelta({
  walletId: merchantWallet.id,
  availableDelta: -penaltyAmount,
  frozenDelta: 0
});
```

The customer receives the full rule-calculated compensation in the same transaction; the merchant's negative available balance remains formal debt evidence.

- [x] **Step 3: Run focused backend tests and verify GREEN**

Run: `npm --prefix backend test -- --runInBand tests/ledger-service.test.ts tests/booking-service.test.ts`

Expected: all focused suites pass with no partial writes.

### Task 3: Preserve distinct API errors in every cancellation UI

**Files:**
- Create: `src/features/booking/orderMutationError.ts`
- Create: `src/features/booking/orderMutationError.test.ts`
- Modify: `src/pages/merchant-admin/MerchantAdminOrdersPage.tsx`
- Modify: `src/pages/admin/OrdersAdminPage.tsx`
- Modify: `src/components/technician/FormalTechnicianOrdersPanel.tsx`
- Modify: `src/pages/user/UserOrderDetailPage.tsx`
- Modify: `src/pages/mobile/MerchantOrderRoutePages.tsx`
- Modify: `src/features/technician-schedule/route-pages.tsx`

**Interfaces:**
- Consumes: `ApiClientError.message`, `.code`, and `.status`.
- Produces: `describeBookingOrderMutationError(error, language)` with exact mappings for invalid transition, Exchange cancellation workflow, payment conflicts, wallet inconsistencies, permission/not-found, and server/network failures.

- [x] **Step 1: Add RED mapper tests**

```ts
expect(describeBookingOrderMutationError(
  new ApiClientError("error.wallet.insufficient_frozen", 40908, 409),
  messages
)).toContain("NDP");
```

- [x] **Step 2: Implement and reuse the shared mapper**

Map only known 409 meanings to state-conflict copy; preserve a distinct financial-processing message for wallet errors and an Exchange-specific message for matched orders.

- [x] **Step 3: Run focused frontend tests**

Run: `npm test -- src/features/booking/orderMutationError.test.ts src/pages/merchant-admin/MerchantAdminOrdersPage.test.ts src/components/technician/FormalTechnicianOrdersPanel.test.ts`

Expected: all focused tests pass.

### Task 4: Verify formal local integration and finish the local branch

**Files:**
- Modify if required: `backend/scripts/check-booking-platform-fee-debt-flow.ts`
- Modify: `docs/ledger.md`
- Modify: `docs/order-state-machine.md`

**Interfaces:**
- Consumes: local-only `.env.dev`, Prisma/MySQL/Redis guards, existing Booking and ledger APIs.
- Produces: executable local acceptance evidence and updated formal behavior documentation.

- [x] **Step 1: Add or extend the guarded local checker**

Exercise the historical missing-hold/insufficient-shop-balance path in the real local MySQL checker, retaining the checker's existing normal release, disabled-fee, payer, debt, concurrency, idempotency, and exact-cleanup cases. Cover short holds, NDP/Test NDP, payment states, and all four actor categories in focused deterministic tests.

- [x] **Step 2: Run risk-proportionate branch verification**

Run focused Jest/Vitest, backend lint/build, frontend lint/build, and guarded local MySQL acceptance after confirming loopback/non-production configuration.

- [ ] **Step 3: Commit and merge locally**

Commit only task files, verify a clean branch, merge to local `main` without pull/push, and rerun the relevant verification on the integrated result.

- [ ] **Step 4: Perform final 5180 acceptance and safe cleanup**

Only after local-main merge, confirm listener PID/cwd/branch/proxies, load latest local main on 5180, verify API/page/core cancellation behavior, then clean only this task's disposable branch/worktree if ownership and cleanliness are proven.
