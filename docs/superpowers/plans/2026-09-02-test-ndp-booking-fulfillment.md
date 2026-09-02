# Test NDP Booking Fulfillment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the formal local checker and product surfaces prove the complete test-account booking lifecycle using only `TEST_NDP`.

**Architecture:** Keep the existing Booking, Schedule, Order Fulfillment, Ledger, Review, and authenticated identity boundaries. Change only test-fixture construction and stale checker/test adapters unless a failing behavior test proves a production defect; `LedgerCurrencyService` remains the sole authority that selects `TEST_NDP`.

**Tech Stack:** Node.js 22, TypeScript, Express, Prisma/MySQL, Redis, Jest/Supertest, React/Vite.

## Global Constraints

- Do not implement or simulate third-party payment.
- Do not change formal-account `NDP` settlement behavior.
- Do not add mock business data or a parallel checkout path.
- Every real-database fixture must be rollback-only or prove exact marker cleanup.
- Preserve unrelated dirty files and migrations.

---

### Task 1: Lock the checker to Test NDP

**Files:**
- Modify: `backend/tests/order-fulfillment-flow-script.test.ts`
- Modify: `backend/scripts/check-order-fulfillment-checkout-flow.ts`

**Interfaces:**
- Consumes: `resolveFixtureLedgerCurrency(transaction, userId): Promise<"NDP" | "TEST_NDP">`
- Produces: a rollback-only checker whose customer is a valid test account and whose checkout ledger currency is `TEST_NDP`.

- [ ] **Step 1: Write failing source-contract tests**

Add assertions that the fixture uses a valid `u##########` identifier, sets the customer `isTestAccount: true`, expects `currency === "TEST_NDP"`, and expects no production reconciliation record for Test NDP settlement.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npm test -- tests/order-fulfillment-flow-script.test.ts`

Expected: FAIL because the current fixture writes its long marker into `needoId`, classifies the customer as non-test, and expects formal reconciliation.

- [ ] **Step 3: Implement the minimal fixture correction**

Create valid deterministic fixture identifiers:

```ts
const accountNo = `${String(now.getTime() % 1_000_000_000).padStart(9, "0")}${sequence}`;
const needoId = `u${accountNo}`;
```

Set the customer to `isTestAccount: true`, keep the technician fixture explicitly classified, assert `TEST_NDP`, and assert the test wallet/transaction/ledger/audit evidence without creating production reconciliation data.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `npm test -- tests/order-fulfillment-flow-script.test.ts`

Expected: all tests pass.

---

### Task 2: Prove the complete Test NDP lifecycle against MySQL

**Files:**
- Modify only if a failing regression requires it: `backend/src/services/booking.service.ts`
- Modify only if a failing regression requires it: `backend/src/repositories/booking.repository.ts`
- Modify only if a failing regression requires it: `backend/src/services/ledger.service.ts`
- Modify only if a failing regression requires it: `backend/src/repositories/ledger.repository.ts`
- Test: `backend/tests/order-fulfillment-service.test.ts`
- Test: `backend/tests/order-checkout-service.test.ts`
- Test: `backend/tests/order-checkout-ledger.test.ts`
- Test: `backend/tests/order-review-service.test.ts`

**Interfaces:**
- Consumes: existing protected order service, add-on, checkout, Test NDP debit, and review methods.
- Produces: one real-MySQL rollback proof for service code, start, add-on, end, settlement, review, insufficient balance, replay, and failed-write rollback.

- [ ] **Step 1: Run the corrected real-database checker**

Run: `FORMAL_BACKEND_ENV_FILE=.env.dev npm run check:order-fulfillment-checkout`

Expected: either exit 0 with unchanged external baseline or one precise product failure.

- [ ] **Step 2: If a product behavior fails, add one focused failing test**

Use the nearest existing test file and assert the externally visible result, for example:

```ts
await expect(service.payCheckoutWithNdp(testCustomer, orderId, input, context))
  .resolves.toMatchObject({ status: "completed", paymentEvidence: "ndp_ledger" });
expect(ledgerTransaction.currency).toBe("TEST_NDP");
expect(reconciliation).toBeNull();
```

- [ ] **Step 3: Verify RED, implement the smallest fix, and verify GREEN**

Run the exact focused suite first, then rerun the real-database checker. Do not change production code if the failure is only a stale checker expectation.

---

### Task 3: Restore auxiliary booking verification safety

**Files:**
- Modify: `backend/tests/check-schedule-flow.test.ts`
- Modify: `backend/scripts/support/formal-test-user.ts`
- Modify: `backend/scripts/check-schedule-flow.ts`
- Modify: `backend/scripts/check-manual-payment-flow.ts`
- Modify: `backend/tests/schedule-service.test.ts`
- Modify: `backend/scripts/check-order-acceptance-control-flow.ts`

**Interfaces:**
- Consumes: current User foundation tables and `BookingRepositoryPort`.
- Produces: checkers/tests compatible with identity profile, experience account, fulfillment repository methods, and current merchant shop identity claims.

- [ ] **Step 1: Add failing cleanup and actor-contract assertions**

Require generated `merchantIdentityProfile` and `userExperienceAccount` rows to be deleted before User/Identity deletion, and require the order-acceptance actor to contain `currentIdentityType: "merchant_owner"`.

- [ ] **Step 2: Verify RED**

Run: `npm test -- tests/check-schedule-flow.test.ts tests/schedule-service.test.ts`

Expected: source-contract failure plus the current incomplete `BookingRepositoryPort` mock compile error.

- [ ] **Step 3: Implement minimal compatibility fixes**

Extend `deleteFormalTestUserFoundations` in dependency order, reuse it from applicable checkers, add the missing fulfillment Jest mocks, and supply the current merchant identity type in the acceptance checker.

- [ ] **Step 4: Verify GREEN and rerun local checkers**

Run the focused tests, then `ENV_FILE=.env.dev npm run check:schedule-flow` and `ENV_FILE=.env.dev npm run check:order-acceptance-control-flow`. Confirm exact cleanup after both.

---

### Task 4: Frontend and browser acceptance

**Files:**
- Test: `src/pages/user/FormalCheckoutPage.test.ts`
- Test: `src/pages/user/UserOrderDetailPage.formal.test.tsx`
- Test: `src/components/technician/FormalTechnicianOrdersPanel.test.ts`
- Modify production frontend files only if a failing interaction test proves a UI defect.

**Interfaces:**
- Consumes: existing formal Booking API responses and current authenticated identities.
- Produces: visible customer, merchant, and technician flow evidence without browser-local order mutations.

- [ ] **Step 1: Run focused frontend tests**

Run: `npm test -- src/pages/user/FormalCheckoutPage.test.ts src/pages/user/UserOrderDetailPage.formal.test.tsx src/components/technician/FormalTechnicianOrdersPanel.test.ts`

- [ ] **Step 2: Add a failing interaction test only for any reproduced UI break**

The test must assert the actual button, request, status, service-code input, Test NDP checkout, or review behavior that failed.

- [ ] **Step 3: Apply the smallest UI fix and rerun focused tests**

Do not redesign the pages or introduce local fallback data.

- [ ] **Step 4: Verify current-main runtime and browser flow**

Confirm 5180/3000 listener cwd, `/api/v1/health`, `/api/v1/ready`, then inspect customer, merchant, and technician pages in a narrow viewport. Record any auth or seed-data limitation separately from product defects.

---

### Task 5: Final regression and residue audit

**Files:**
- No new files expected.

**Interfaces:**
- Consumes: all preceding fixes.
- Produces: evidence-backed completion report.

- [ ] **Step 1: Run backend focused suites and the Test NDP real-database checker**
- [ ] **Step 2: Run frontend focused suites, typecheck/lint, and production build**
- [ ] **Step 3: Query marker prefixes and prove zero test residue**
- [ ] **Step 4: Inspect `git diff --check` and exact changed-file scope**
- [ ] **Step 5: Report passed, failed, and untested scenarios separately**
