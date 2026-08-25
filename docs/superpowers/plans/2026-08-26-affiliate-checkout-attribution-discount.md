# Affiliate Checkout Attribution And Discount Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Atomically apply an affiliate code or signed URL to Booking checkout, persist immutable JPY price snapshots, reserve one fixed completion-reward budget unit, and release that reservation exactly once when the unfinished order is cancelled.

**Architecture:** Keep `BookingRepository` as owner of the existing schedule-slot and order transaction. Add a focused `AffiliateCheckoutService`/Prisma repository behind transaction callbacks: prepare the promotion and final price before order creation, persist Touch/Attribution/counters after the order ID exists, and invalidate/release through the existing transition callback on cancellation. Preview validation is advisory and uses the same eligibility and price calculator without reserving anything.

**Tech Stack:** Node.js 22, Express, TypeScript strict mode, Prisma/MySQL 8, Zod, JWT/RBAC, Jest, Supertest, OpenAPI.

## Global Constraints

- This is one microstep: checkout attribution, JPY discount snapshot, NDP reward-budget allocation, and pre-completion cancellation release only.
- Do not create `AffiliateReward`, settle/capture NDP, credit claimant wallets, implement completion limits, task-end release, refund reversal, click analytics, or UI.
- Do not add a schema migration; use the existing Affiliate Touch/Attribution/BudgetReservation models.
- Explicit nonblank code wins over URL. An invalid explicit code aborts the promotional Booking and never silently falls back.
- All price and scope facts come from the server-resolved ScheduleSlot/Service; never accept a client amount, shop, claimant, task, or reward amount.
- Ordinary Booking without promotion must preserve existing behavior.
- Every mutation uses the Booking transaction client; rollback must include slot count, order, Touch, Attribution, aggregate counters, and allocation.
- Cancellation must compose with the current Ledger settlement callback instead of replacing or bypassing it.
- Promotion APIs use `booking:create`; do not add or seed a new permission.
- Do not expose claimant user IDs, token/hash material, wallet IDs, or budget reservation internals.

---

### Task 1: Pure Promotion Contract, Pricing, And Stable Errors

**Files:**
- Create: `backend/src/services/affiliate-checkout.service.ts`
- Modify: `backend/src/constants/error-codes.ts`
- Test: `backend/tests/affiliate-checkout.service.test.ts`

**Interfaces:**
- Consumes: public code or signed token, customer/slot/service/price context, current time.
- Produces: normalized promotion selector, deterministic integer-JPY discount, public checkout summary, and typed repository port.

- [ ] **Step 1: Write failing price and selector tests**

```ts
expect(calculateAffiliatePrice({
  originalPriceJpy: 12_000,
  discountType: "fixed_jpy",
  fixedDiscountJpy: 1_000,
  discountRateBps: 0,
  discountCapJpy: 0
})).toEqual({ originalPriceJpy: 12_000, customerDiscountJpy: 1_000, finalPriceJpy: 11_000 });

expect(calculateAffiliatePrice({
  originalPriceJpy: 12_999,
  discountType: "percent",
  fixedDiscountJpy: 0,
  discountRateBps: 1_500,
  discountCapJpy: 1_500
})).toEqual({ originalPriceJpy: 12_999, customerDiscountJpy: 1_500, finalPriceJpy: 11_499 });

expect(selectAffiliatePromotion({
  affiliateCode: " NDO-CODE ",
  affiliatePublicToken: "token.signature"
})).toEqual({ source: "code", value: "NDO-CODE" });
```

Cover `none`, fixed discount capped at original price, percent floor, percent cap, zero price, malformed integer inputs, URL-only selection, empty values, and explicit-code priority.

- [ ] **Step 2: Run tests and verify RED**

Run: `npm --prefix backend test -- --runInBand tests/affiliate-checkout.service.test.ts`

Expected: FAIL because the checkout service and new errors do not exist.

- [ ] **Step 3: Implement minimal pure contracts and error mapping**

```ts
export type AffiliatePromotionSelector =
  | { source: "code"; value: string }
  | { source: "url"; value: string };

export interface AffiliatePriceSnapshot {
  originalPriceJpy: number;
  customerDiscountJpy: number;
  finalPriceJpy: number;
}

export interface AffiliateCheckoutSummary extends AffiliatePriceSnapshot {
  taskId: number;
  publicCode: string;
  source: "code" | "url";
  rewardAllocatedNdp: number;
  attributionStatus: "attributed" | "invalidated";
}
```

Add distinct constants for promotion invalid, task not attributable, self-attribution, scope mismatch, minimum amount, and unavailable budget. Service errors must use the exact keys from the approved design and never leak repository errors.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run: `npm --prefix backend test -- --runInBand tests/affiliate-checkout.service.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/affiliate-checkout.service.ts backend/src/constants/error-codes.ts backend/tests/affiliate-checkout.service.test.ts
git commit -m "feat: define affiliate checkout pricing"
```

### Task 2: Transaction-Scoped Promotion Resolution And Budget Allocation

**Files:**
- Create: `backend/src/repositories/affiliate-checkout.repository.ts`
- Modify: `backend/src/services/affiliate-checkout.service.ts`
- Modify: `backend/src/services/affiliate-link-token.service.ts` only if a public parse helper is required without weakening verification
- Test: `backend/tests/affiliate-checkout.service.test.ts`
- Test: `backend/tests/affiliate-checkout.repository.test.ts`

**Interfaces:**
- Consumes: Task 1 selector, transaction client, resolved Booking scope, and existing link verifier.
- Produces: `prepareCheckout`, `persistAttribution`, and `validateCode` without owning the Booking transaction.

- [ ] **Step 1: Write failing eligibility and repository-contract tests**

```ts
const prepared = await service.prepareCheckout({
  selector: { source: "code", value: "NDO-VALID" },
  customerUserId: 501,
  shopId: 8,
  serviceId: 88,
  originalPriceJpy: 12_000,
  scheduledStartAt: new Date("2026-09-15T03:00:00.000Z"),
  transactionClient
});

expect(prepared).toEqual(expect.objectContaining({
  claimId: 41,
  taskId: 31,
  source: "code",
  finalPriceJpy: 11_000,
  rewardAllocatedNdp: 1_000
}));
```

Cover active/revoked/expired Claim, valid/tampered URL, scheduled/active vs paused/ended task, current time before task end, scheduled service time inside task window, shop/service snapshots, self-attribution, minimum amount, reservation status, exact remaining-budget boundary, and insufficient budget. Assert explicit invalid code never invokes URL resolution.

Repository tests must assert parameterized SQL/Prisma calls acquire exclusive locks on Claim, Task, and BudgetReservation in a deterministic order, and map the linked task/shop/service/reservation without token/private fields in public results.

- [ ] **Step 2: Run tests and verify RED**

Run: `npm --prefix backend test -- --runInBand tests/affiliate-checkout.service.test.ts tests/affiliate-checkout.repository.test.ts`

Expected: FAIL because transaction resolution and persistence are absent.

- [ ] **Step 3: Implement transaction repository and service preparation**

```ts
export interface AffiliateCheckoutRepositoryPort {
  resolveAndLockPromotion(input: {
    source: "code" | "url";
    lookupValue: string;
  }): Promise<AffiliateCheckoutClaimRecord | null>;
  serviceIsInTaskScope(taskId: number, shopId: number, serviceId: number): Promise<boolean>;
  createTouch(input: AffiliateCheckoutTouchInput): Promise<number>;
  createAttribution(input: AffiliateCheckoutAttributionInput): Promise<void>;
  allocateRewardBudget(input: { taskId: number; claimId: number; rewardNdp: number; source: "code" | "url" }): Promise<void>;
  createAttributionAudit(input: AffiliateCheckoutAuditInput): Promise<void>;
}
```

Parse URL into `publicTokenId` plus signature, lock the resolved Claim and then verify the locked Claim using `AffiliateLinkTokenService.verify`. For code, normalize to uppercase only if the existing issued-code contract is uppercase; do not fuzzy-match.

Compute Attribution/Touch expiry as the earlier of Claim expiry and `now + attributionWindowDays`. `persistAttribution` creates one checkout Touch, creates Attribution with `activeKey = booking:<bookingOrderId>`, increments `allocatedNdp` on Task and BudgetReservation, increments Claim code-use only for code and attributed-order for both sources, and writes token-free audit evidence. If the remaining amount after allocation is below one reward, set Task `BUDGET_EXHAUSTED` and reservation `EXHAUSTED`.

Use guarded updates in addition to row locks so a stale or non-MySQL test adapter cannot exceed:

```text
allocatedNdp + capturedNdp + releasedNdp + rewardNdp <= totalFrozenNdp
```

- [ ] **Step 4: Run focused tests and verify GREEN**

Run: `npm --prefix backend test -- --runInBand tests/affiliate-checkout.service.test.ts tests/affiliate-checkout.repository.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/repositories/affiliate-checkout.repository.ts backend/src/services/affiliate-checkout.service.ts backend/src/services/affiliate-link-token.service.ts backend/tests/affiliate-checkout.service.test.ts backend/tests/affiliate-checkout.repository.test.ts
git commit -m "feat: reserve affiliate checkout attribution"
```

### Task 3: Atomic Booking Creation And Public Price Snapshot

**Files:**
- Modify: `backend/src/repositories/booking.repository.ts`
- Modify: `backend/src/services/booking.service.ts`
- Modify: `backend/src/routes/booking.routes.ts`
- Modify: `backend/src/app.ts`
- Modify: `backend/src/validators/booking.validator.ts`
- Test: `backend/tests/booking-service.test.ts`
- Test: `backend/tests/booking-repository-scope.test.ts`
- Test: `backend/tests/booking-api.test.ts`

**Interfaces:**
- Consumes: Task 2 `AffiliateCheckoutService` and existing Booking transaction.
- Produces: optional promotion inputs on create Booking and nullable `BookingOrderPayload.affiliate` on create/list/detail/transition reads.

- [ ] **Step 1: Write failing Booking service/repository/API tests**

```ts
await service.createBooking(customerActor, {
  serviceId: 88,
  scheduleSlotId: 1201,
  fulfillmentMode: "store",
  affiliateCode: "NDO-VALID"
});

expect(affiliateCheckout.prepareCheckout).toHaveBeenCalledWith(
  expect.objectContaining({
    customerUserId: customerActor.userId,
    shopId: 8,
    serviceId: 88,
    originalPriceJpy: 12_000
  })
);
await request(app)
  .post("/api/v1/bookings")
  .set("Authorization", "Bearer valid-token")
  .send({ ...validBody, customerUserId: 999 })
  .expect(400);
```

The request assertion verifies the client cannot choose a customer. Cover normal Booking unchanged, fixed/percent final price, `servicePriceSnapshot` original price, `priceAmount`/`paymentAmountJpy` final price, code priority, rollback when promotion persistence fails, and public summary without claimant/token/budget internals.

Cover technician pricing: map `TechnicianService.sourceShopServiceId` into affiliate scope; reject promotion when the source Shop Service is absent while leaving ordinary technician Booking valid.

- [ ] **Step 2: Run tests and verify RED**

Run: `npm --prefix backend test -- --runInBand tests/booking-service.test.ts tests/booking-repository-scope.test.ts tests/booking-api.test.ts`

Expected: FAIL because Booking does not accept or persist affiliate attribution.

- [ ] **Step 3: Add transaction hooks without moving the Booking transaction**

```ts
export interface BookingCreateAffiliateContext {
  transactionClient: LedgerTransactionClient;
  customerUserId: number;
  shopId: number;
  serviceId: number;
  originalPriceJpy: number;
  scheduledStartAt: Date;
}

export interface BookingCreateRepositoryOptions {
  prepareAffiliate?: (context: BookingCreateAffiliateContext) => Promise<AffiliateCheckoutPrepared | null>;
  persistAffiliate?: (input: BookingCreateAffiliateContext & {
    bookingOrderId: number;
    prepared: AffiliateCheckoutPrepared;
  }) => Promise<void>;
}
```

Call `prepareAffiliate` after slot/service/server-price resolution and schedule-owner lock, before mutating the slot. Use the returned final JPY price for Booking `priceAmount` and `paymentAmountJpy`, retain original `servicePriceSnapshot`, create Booking, then call `persistAffiliate` before returning. Every callback receives the same Prisma transaction client.

Add optional `affiliateCode`/`affiliatePublicToken` to the strict Zod body. `BookingService` derives customer from the authenticated actor and supplies hooks only when a selector exists. Booking routes construct a production `AffiliateCheckoutService` with the same config-backed link verifier; `AppDependencies.affiliateCheckoutService` supports test injection.

Extend `orderInclude` and `mapOrder` to return at most one non-deleted Attribution summary, including invalidated state after cancellation and no claimant identity.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run: `npm --prefix backend test -- --runInBand tests/booking-service.test.ts tests/booking-repository-scope.test.ts tests/booking-api.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/repositories/booking.repository.ts backend/src/services/booking.service.ts backend/src/routes/booking.routes.ts backend/src/app.ts backend/src/validators/booking.validator.ts backend/tests/booking-service.test.ts backend/tests/booking-repository-scope.test.ts backend/tests/booking-api.test.ts
git commit -m "feat: apply affiliate promotion to bookings"
```

### Task 4: Idempotent Cancellation Release Composed With Ledger Settlement

**Files:**
- Modify: `backend/src/services/affiliate-checkout.service.ts`
- Modify: `backend/src/repositories/affiliate-checkout.repository.ts`
- Modify: `backend/src/services/booking.service.ts`
- Test: `backend/tests/affiliate-checkout.service.test.ts`
- Test: `backend/tests/affiliate-checkout.repository.test.ts`
- Test: `backend/tests/booking-service.test.ts`

**Interfaces:**
- Consumes: existing `BookingRepository.transitionOrder(... options.settle)` transaction callback.
- Produces: `invalidateCancelledBooking(orderId, now, transactionClient)` and a composed Booking transition callback.

- [ ] **Step 1: Write failing cancellation and callback-composition tests**

```ts
await service.invalidateCancelledBooking({
  bookingOrderId: 9001,
  invalidatedAt: now,
  reason: "booking_cancelled",
  transactionClient
});

expect(repository.invalidateAttribution).toHaveBeenCalledTimes(1);
expect(repository.releaseAllocatedBudget).toHaveBeenCalledWith({
  taskId: 31,
  rewardNdp: 1_000,
  restoreTaskStatus: "active"
});
```

Cover pending and confirmed cancellation, no-attribution no-op, repeated cancellation/no active attribution no-op, exact allocation decrement, `budget_exhausted` recovery to scheduled before task start or active during task, no recovery after task end, no captured/settled/wallet mutation, and token-free audit.

Booking tests must prove confirmed cancellation executes both the existing ledger release/compensation action and affiliate invalidation once; affiliate release must also run when no LedgerService is injected.

- [ ] **Step 2: Run tests and verify RED**

Run: `npm --prefix backend test -- --runInBand tests/affiliate-checkout.service.test.ts tests/affiliate-checkout.repository.test.ts tests/booking-service.test.ts`

Expected: FAIL because cancellation release and callback composition are absent.

- [ ] **Step 3: Implement guarded invalidation and composed transition action**

Lock the active Attribution, Task, and BudgetReservation in deterministic order. Update Attribution only when `status = ATTRIBUTED` and `activeKey IS NOT NULL`; set `INVALIDATED`, clear `activeKey`, and record reason/time. Decrement Task and reservation allocation with `allocatedNdp >= rewardAllocatedNdp` guards.

Only change task state when it was `BUDGET_EXHAUSTED`: restore `SCHEDULED` if now is before `taskStartsAt`, restore `ACTIVE` if now is inside the task window, otherwise retain terminal/exhausted task state. Restore reservation to `ACTIVE` only when the task can accept future attribution. Preserve Claim historical counters.

Refactor `BookingService.createSettlementOptions` into a composer that accumulates applicable async transaction actions:

```ts
return actions.length === 0
  ? {}
  : { settle: async (context) => {
      for (const action of actions) await action(context);
    } };
```

Do not return early when LedgerService is absent. Any action failure rolls the entire order transition back.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run: `npm --prefix backend test -- --runInBand tests/affiliate-checkout.service.test.ts tests/affiliate-checkout.repository.test.ts tests/booking-service.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/affiliate-checkout.service.ts backend/src/repositories/affiliate-checkout.repository.ts backend/src/services/booking.service.ts backend/tests/affiliate-checkout.service.test.ts backend/tests/affiliate-checkout.repository.test.ts backend/tests/booking-service.test.ts
git commit -m "feat: release affiliate allocation on cancellation"
```

### Task 5: Code Validation REST Contract And OpenAPI

**Files:**
- Modify: `backend/src/validators/affiliate-marketplace.validator.ts`
- Modify: `backend/src/controllers/affiliate-marketplace.controller.ts`
- Modify: `backend/src/routes/affiliate-marketplace.routes.ts`
- Modify: `backend/src/api/openapi.ts`
- Test: `backend/tests/affiliate-marketplace-api.test.ts`
- Test: `backend/tests/openapi.test.ts`

**Interfaces:**
- Consumes: `AffiliateCheckoutService.validateCode`, current authenticated customer, and `scheduleSlotId`.
- Produces: `POST /api/v1/affiliate/codes/validate` under `booking:create` and updated Booking/OpenAPI schemas.

- [ ] **Step 1: Write failing Supertest and OpenAPI tests**

```ts
const response = await request(app)
  .post("/api/v1/affiliate/codes/validate")
  .set("Authorization", "Bearer valid-token")
  .send({ publicCode: "NDO-VALID", scheduleSlotId: 1201 })
  .expect(200);

expect(response.body.data).toEqual(expect.objectContaining({
  publicCode: "NDO-VALID",
  originalPriceJpy: 12_000,
  customerDiscountJpy: 1_000,
  finalPriceJpy: 11_000
}));
```

Cover authentication, `booking:create`, strict Zod rejection of extra/client scope fields, invalid code, self-attribution, scope, minimum amount, budget availability, unified response envelope, and proof validation creates no Booking/Touch/Attribution/allocation.

OpenAPI tests cover validation request/response, all stable error responses, optional Booking affiliate inputs, and nullable Booking affiliate summary.

- [ ] **Step 2: Run tests and verify RED**

Run: `npm --prefix backend test -- --runInBand tests/affiliate-marketplace-api.test.ts tests/openapi.test.ts`

Expected: FAIL because validation route and API schemas are absent.

- [ ] **Step 3: Add thin validator/controller/route and OpenAPI**

```ts
export const affiliateCodeValidateBodySchema = z.object({
  publicCode: z.string().trim().min(1).max(40),
  scheduleSlotId: z.coerce.number().int().positive()
}).strict();
```

Controller passes only authenticated `userId` plus parsed body to service. Route uses `BOOKING_ROUTE_PERMISSIONS.create`; keep shared permission string in one import-safe constant to avoid drift. The service reads the slot and linked service server-side and performs advisory validation without exclusive allocation or persistence.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run: `npm --prefix backend test -- --runInBand tests/affiliate-marketplace-api.test.ts tests/booking-api.test.ts tests/openapi.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/validators/affiliate-marketplace.validator.ts backend/src/controllers/affiliate-marketplace.controller.ts backend/src/routes/affiliate-marketplace.routes.ts backend/src/api/openapi.ts backend/tests/affiliate-marketplace-api.test.ts backend/tests/booking-api.test.ts backend/tests/openapi.test.ts
git commit -m "feat: expose affiliate code validation"
```

### Task 6: Real MySQL Acceptance, Documentation, And Full Gates

**Files:**
- Create: `backend/scripts/check-affiliate-checkout-attribution-flow.ts`
- Modify: `backend/package.json`
- Modify: `backend/tests/affiliate-marketplace-claim-flow-script.test.ts` or create `backend/tests/affiliate-checkout-attribution-flow-script.test.ts`
- Modify: `README.md`
- Modify: `docs/00_MASTER_MICRO_STEP_PLAN.md`
- Modify: `docs/superpowers/specs/2026-08-26-needo-affiliate-service-completion-rewards-design.md`

**Interfaces:**
- Consumes: real `.env.dev` MySQL and the completed formal API/service contracts.
- Produces: guarded acceptance command and accurate completion evidence.

- [ ] **Step 1: Write failing script-contract test**

Assert the script refuses unsafe database names/environments, uses an exact run marker for created records, tests API/service behavior rather than direct fake results, cleans only marker-owned records in dependency order, and reports fixed/percent/URL/code/concurrency/cancellation/wallet/reward/audit assertions.

- [ ] **Step 2: Run test and verify RED**

Run: `npm --prefix backend test -- --runInBand tests/affiliate-checkout-attribution-flow-script.test.ts`

Expected: FAIL because the acceptance script and package command are absent.

- [ ] **Step 3: Implement guarded real-MySQL acceptance**

Add:

```json
"check:affiliate-checkout-attribution-flow": "tsx scripts/check-affiliate-checkout-attribution-flow.ts"
```

The script must validate fixed/percent/none prices, code and URL attribution, code priority, self/scope/minimum/state/budget errors, concurrent last-slot and last-budget behavior, cancellation release, exact non-change of Wallet available/frozen balances, zero Reward creation, and token-free audit evidence. It must print identifiers and before/after counters sufficient for review.

- [ ] **Step 4: Run focused automated tests**

Run: `npm --prefix backend test -- --runInBand tests/affiliate-checkout-attribution-flow-script.test.ts tests/affiliate-checkout.service.test.ts tests/affiliate-checkout.repository.test.ts tests/booking-service.test.ts tests/booking-api.test.ts tests/affiliate-marketplace-api.test.ts tests/openapi.test.ts`

Expected: PASS.

- [ ] **Step 5: Run the real MySQL acceptance command**

Run: `ENV_FILE=.env.dev npm --prefix backend run check:affiliate-checkout-attribution-flow`

Expected: PASS with fixed/percent/code/URL/concurrency/cancellation/wallet/reward/audit checks and exact cleanup.

- [ ] **Step 6: Update truthful documentation**

Document the two supported checkout inputs, code validation endpoint, price snapshot semantics, transaction boundary, cancellation release, real acceptance command, and explicit deferral of completion reward settlement/UI.

- [ ] **Step 7: Run required repository gates**

Run:

```bash
npm --prefix backend run lint
npm --prefix backend test -- --runInBand
npm --prefix backend run build
npm test -- --runInBand
npm run build
rg -n "TODO|FIXME|not implemented|placeholder|mock|demo|fake" backend/src/services/affiliate-checkout.service.ts backend/src/repositories/affiliate-checkout.repository.ts backend/src/routes/booking.routes.ts backend/src/routes/affiliate-marketplace.routes.ts backend/scripts/check-affiliate-checkout-attribution-flow.ts
git diff --check
```

Expected: all commands PASS; source scan contains no newly introduced prohibited implementation markers.

- [ ] **Step 8: Commit**

```bash
git add backend/scripts/check-affiliate-checkout-attribution-flow.ts backend/package.json backend/tests/affiliate-checkout-attribution-flow-script.test.ts README.md docs/00_MASTER_MICRO_STEP_PLAN.md docs/superpowers/specs/2026-08-26-needo-affiliate-service-completion-rewards-design.md
git commit -m "test: verify affiliate checkout attribution flow"
```

## Final Review Checklist

- [ ] `POST /api/v1/bookings` accepts optional code/token, derives all scope and price data server-side, and stays backwards compatible without a promotion.
- [ ] Explicit code priority, link signature verification, self-attribution rejection, service scope, task time, minimum price, and budget checks are deterministic.
- [ ] Booking, Touch, Attribution, Claim counters, and NDP allocation commit or roll back together.
- [ ] JPY discount affects order price snapshots only; task NDP allocation is exactly one fixed reward.
- [ ] Cancellation composes with ledger actions, invalidates once, releases once, and does not mutate wallet balances or create Reward.
- [ ] Validation is authenticated, authorized, advisory, and mutation-free.
- [ ] No token/hash/claimant/wallet details appear in API or audit evidence.
- [ ] Focused tests, real MySQL acceptance, backend/full frontend tests, lint, and both builds pass.
