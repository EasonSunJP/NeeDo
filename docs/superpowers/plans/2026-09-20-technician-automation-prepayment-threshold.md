# Technician Automation Prepayment Threshold Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an integer `0` or `10–100` service-prepayment threshold to Booking auto-accept and Request auto-apply, backed by confirmed service-payment evidence rather than client claims or Request publication fees.

**Architecture:** Extend the existing versioned automation rules and pure evaluator, then add one formal `ServicePrepayment` aggregate that references the existing wallet hold and audit authorities. Booking creation evaluates the frozen order price; Request publication freezes a publisher-selected percentage of the effective maximum budget and Request-to-Booking conversion allocates the held service amount deterministically. Existing Booking confirm, Exchange claim, matching, cancellation, checkout, refund, and ledger services remain the mutation authorities.

**Tech Stack:** React 19, TypeScript, Vite, Express, Zod, Prisma/MySQL, NDP ledger, Vitest, Jest, Supertest.

## Global Constraints

- Persist one authoritative `minimumPrepaymentPercent`: `0` means off; valid enabled values are integer `10–100`.
- Calculate integer JPY with `Math.ceil(baseAmountJpy * percent / 100)` on the server.
- Count only confirmed, unreversed service prepayment; never count Request publication fees, technician deposits, pending funds, coupons, or client assertions.
- Keep Booking and Request settings independent and place the control after project types at the bottom of **订单属性**.
- Preserve existing Booking/Request state machines, matching authority, wallet ledger, refund authority, RBAC, audit, idempotency, and i18n patterns.
- Add no mock, fake payment adapter, placeholder, parallel balance, hard-coded domain, or hard-coded port.
- Use tests first for each behavioral unit and verify the final integrated `main`, not only the feature branch.

---

### Task 1: Add the rule, evaluator condition, and settings UI

**Files:**
- Modify: `backend/src/validators/technician-automation.validator.ts`
- Modify: `backend/src/domain/technician-automation-rules.ts`
- Modify: `backend/src/repositories/technician-automation.repository.ts`
- Modify: `backend/src/api/openapi.ts`
- Modify: `backend/tests/technician-automation-validator.test.ts`
- Modify: `backend/tests/technician-automation-rules.test.ts`
- Modify: `backend/tests/technician-automation-openapi.test.ts`
- Modify: `src/features/technician-schedule/automation-api.ts`
- Modify: `src/features/technician-schedule/TechnicianAutomationSettingsPanel.tsx`
- Modify: `src/features/technician-schedule/TechnicianAutomationSettingsPanel.test.tsx`
- Modify: `src/features/technician-schedule/automation-i18n.ts`

**Interfaces:**
- Produces `rules.minimumPrepaymentPercent: 0 | number`, validated as literal `0` or integer `10–100`.
- Extends `TechnicianAutomationEvaluationContext` with `prepaidServiceAmountJpy`, `prepaymentBaseAmountJpy`, and `prepaymentConfirmed`.
- Emits `payment:prepayment_minimum`, `payment:prepayment_unconfirmed`, or `payment:prepayment_too_low`.

- [ ] **Step 1: Write failing validator and evaluator tests**

```ts
expect(technicianAutomationRulesSchema.parse({
  ...defaultTechnicianAutomationRules("booking"),
  minimumPrepaymentPercent: 30
}).minimumPrepaymentPercent).toBe(30);
for (const value of [1, 9, 10.5, 101]) {
  expect(() => technicianAutomationRulesSchema.parse({
    ...defaultTechnicianAutomationRules("booking"),
    minimumPrepaymentPercent: value
  })).toThrow();
}
expect(evaluateTechnicianAutomationRules("booking", {
  ...defaultTechnicianAutomationRules("booking"),
  minimumPrepaymentPercent: 30
}, context({
  prepaymentBaseAmountJpy: 10_001,
  prepaidServiceAmountJpy: 3_001,
  prepaymentConfirmed: true
})).matched).toBe(true);
```

- [ ] **Step 2: Run the focused backend tests and confirm RED**

Run: `npm --prefix backend test -- --runInBand tests/technician-automation-validator.test.ts tests/technician-automation-rules.test.ts`

Expected: TypeScript/schema failures because the new rule and evidence fields do not exist.

- [ ] **Step 3: Implement the strict rule and evaluator**

```ts
const minimumPrepaymentPercentSchema = z.union([
  z.literal(0),
  z.number().int().min(10).max(100)
]);

const requiredPrepaymentJpy = Math.ceil(
  context.prepaymentBaseAmountJpy * rules.minimumPrepaymentPercent / 100
);
if (rules.minimumPrepaymentPercent > 0) {
  pass(
    "payment:prepayment_minimum",
    context.prepaymentConfirmed && context.prepaidServiceAmountJpy >= requiredPrepaymentJpy,
    context.prepaymentConfirmed
      ? "payment:prepayment_too_low"
      : "payment:prepayment_unconfirmed"
  );
}
```

Set both default rule objects to `minimumPrepaymentPercent: 0`. Add zero-valued evidence to every candidate projection until the formal prepayment aggregate is added in later tasks. Update OpenAPI schemas and examples.

- [ ] **Step 4: Write the failing settings-panel interaction test**

```tsx
expect(within(orderAttributes).getByRole("checkbox", { name: "需要预付" })).toBeInTheDocument();
fireEvent.click(within(orderAttributes).getByRole("checkbox", { name: "需要预付" }));
const input = within(orderAttributes).getByRole("spinbutton", { name: "最低预付比例" });
expect(input).toHaveValue(10);
fireEvent.change(input, { target: { value: "30" } });
fireEvent.click(screen.getByTestId("automation-save"));
expect(updateSetting).toHaveBeenCalledWith(expect.objectContaining({
  rules: expect.objectContaining({ minimumPrepaymentPercent: 30 })
}));
```

- [ ] **Step 5: Implement the bottom-of-card switch and integer input**

Derive the switch from `rules.minimumPrepaymentPercent > 0`. Turning it on writes `10`; turning it off writes `0`. Render the input only while enabled with `min={10}`, `max={100}`, `step={1}`, and `inputMode="numeric"`. Reject decimal text in form validation rather than rounding it. Add Chinese Simplified, Chinese Traditional, Japanese, English, and Korean strings through `automation-i18n.ts`.

- [ ] **Step 6: Run focused tests and commit**

Run:

```bash
npm --prefix backend test -- --runInBand tests/technician-automation-validator.test.ts tests/technician-automation-rules.test.ts tests/technician-automation-openapi.test.ts tests/technician-automation-processor.test.ts
npm test -- --run src/features/technician-schedule/TechnicianAutomationSettingsPanel.test.tsx
```

Expected: all focused tests pass.

Commit: `feat(automation): add prepayment threshold rule`

---

### Task 2: Persist formal service-prepayment aggregates

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Create: `backend/prisma/migrations/20260920120000_service_prepayments/migration.sql`
- Create: `backend/src/domain/service-prepayment.ts`
- Create: `backend/src/validators/service-prepayment.validator.ts`
- Create: `backend/tests/service-prepayment-schema.test.ts`
- Create: `backend/tests/service-prepayment-domain.test.ts`
- Modify: `backend/tests/exchange-request-publication-schema.test.ts`

**Interfaces:**
- Produces `ServicePrepayment`, `ServicePrepaymentStatus`, and `ServicePrepaymentAllocation` Prisma models.
- Produces `calculateRequiredPrepaymentJpy(baseAmountJpy: number, percent: number): number`.
- Produces `allocatePrepaymentJpy(totalJpy: number, quotes: Array<{ id: number; quoteAmountJpy: number }>): Array<{ id: number; amountJpy: number }>` using largest remainder.

- [ ] **Step 1: Write schema and pure-domain RED tests**

```ts
expect(calculateRequiredPrepaymentJpy(10_001, 30)).toBe(3_001);
expect(allocatePrepaymentJpy(3_000, [
  { id: 1, quoteAmountJpy: 6_000 },
  { id: 2, quoteAmountJpy: 4_000 }
])).toEqual([{ id: 1, amountJpy: 1_800 }, { id: 2, amountJpy: 1_200 }]);
```

The schema test must require one-of Booking/Exchange subject enforcement, active-subject uniqueness, immutable allocation uniqueness, audit timestamps, soft delete, wallet-hold linkage, and removal of the single-column unique constraint from `WalletHold.exchangePostId`.

- [ ] **Step 2: Run tests and confirm RED**

Run: `npm --prefix backend test -- --runInBand tests/service-prepayment-schema.test.ts tests/service-prepayment-domain.test.ts tests/exchange-request-publication-schema.test.ts`

Expected: missing models/functions and the old unique hold relation fail.

- [ ] **Step 3: Add Prisma models and migration**

Create an enum with `PENDING`, `CONFIRMED`, `CAPTURED`, `RELEASED`, `REFUND_PENDING`, and `REFUNDED`. `ServicePrepayment` stores nullable unique `bookingOrderId` and `exchangePostId`, base/percent/amount snapshots, payment method, status, optional unique `walletHoldId`, external reference, idempotency/fingerprint, actor identity, transition timestamps, and `deletedAt`. Add a raw SQL `CHECK` that exactly one subject column is non-null.

Change `wallet_holds.exchange_post_id` from unique to indexed. Add a unique key over `(exchange_post_id, fee_type, deleted_at)` only where the repository's active-row contract remains enforceable in MySQL; otherwise enforce active uniqueness transactionally and retain indexed lookups plus unique idempotency keys.

- [ ] **Step 4: Implement exact integer calculations**

```ts
export function calculateRequiredPrepaymentJpy(baseAmountJpy: number, percent: number): number {
  if (!Number.isSafeInteger(baseAmountJpy) || baseAmountJpy < 0) throw new Error("invalid_base_amount");
  if (!Number.isInteger(percent) || (percent !== 0 && (percent < 10 || percent > 100))) {
    throw new Error("invalid_prepayment_percent");
  }
  return Math.ceil(baseAmountJpy * percent / 100);
}
```

The allocation helper caps `totalJpy` at total accepted quotes, assigns floors, and distributes remaining yen by descending remainder then ascending ID.

- [ ] **Step 5: Generate Prisma, run tests, and commit**

Run:

```bash
npm --prefix backend run prisma:generate
npm --prefix backend run prisma:validate
npm --prefix backend test -- --runInBand tests/service-prepayment-schema.test.ts tests/service-prepayment-domain.test.ts tests/exchange-request-publication-schema.test.ts
```

Expected: generation, validation, and tests pass.

Commit: `feat(payments): add service prepayment aggregate`

---

### Task 3: Add idempotent prepayment and ledger authority

**Files:**
- Create: `backend/src/repositories/service-prepayment.repository.ts`
- Create: `backend/src/services/service-prepayment.service.ts`
- Modify: `backend/src/repositories/ledger.repository.ts`
- Modify: `backend/src/services/ledger.service.ts`
- Modify: `backend/src/constants/permissions.constants.ts`
- Modify: `backend/src/api/openapi.ts`
- Create: `backend/tests/service-prepayment.repository.test.ts`
- Create: `backend/tests/service-prepayment.service.test.ts`
- Modify: `backend/tests/exchange-request-ledger.service.test.ts`
- Modify: `backend/tests/ledger.repository.test.ts`

**Interfaces:**
- Produces `ServicePrepaymentService.confirm`, `.release`, `.refund`, and `.getEvidence`.
- Produces `ServicePrepaymentEvidence` with `{ baseAmountJpy, confirmedAmountJpy, confirmed, percent, status }`.
- Changes publication-fee lookup to `findWalletHoldByExchangePostId(exchangePostId, "exchange_request_publication_fee")`.

- [ ] **Step 1: Write failing service tests for trust boundaries and idempotency**

Cover server-calculated amount, exact replay, fingerprint conflict, insufficient NDP rollback, external pending confirmation, one winning concurrent confirmation, release/refund transitions, subject ownership, and audit metadata. Assert that a publication-fee hold never appears in `getEvidence`.

```ts
const confirmed = await service.confirm(access, {
  subject: { type: "booking", id: 71 },
  baseAmountJpy: 10_000,
  percent: 30,
  method: "ndp",
  idempotencyKey: "booking:71:prepayment",
  requestFingerprint: "a".repeat(64)
});
expect(confirmed).toMatchObject({ amountJpy: 3_000, status: "confirmed" });
expect(repository.createWalletHold).toHaveBeenCalledWith(
  expect.objectContaining({ feeType: "service_prepayment" })
);
expect(await service.getEvidence({ type: "exchange", id: 91 })).not.toEqual(
  expect.objectContaining({ sourceFeeType: "exchange_request_publication_fee" })
);
```

- [ ] **Step 2: Run tests and confirm RED**

Run: `npm --prefix backend test -- --runInBand tests/service-prepayment.repository.test.ts tests/service-prepayment.service.test.ts tests/exchange-request-ledger.service.test.ts tests/ledger.repository.test.ts`

Expected: missing repository/service and ambiguous Exchange hold lookup failures.

- [ ] **Step 3: Implement repository locks and state transitions**

Use a Prisma interactive transaction and `SELECT ... FOR UPDATE` for the active aggregate and wallet owner. Persist amount, percentage, and base snapshots before creating a hold. Accept no caller-provided calculated amount. An exact idempotent replay returns the saved aggregate; a mismatched fingerprint returns the standard conflict.

```ts
const amountJpy = calculateRequiredPrepaymentJpy(input.baseAmountJpy, input.percent);
return this.repository.transaction(async (tx) => {
  const replay = await tx.findByIdempotencyKeyForUpdate(input.idempotencyKey);
  if (replay) return assertExactReplay(replay, input.requestFingerprint);
  await tx.lockWalletOwner(input.walletOwnerType, input.walletOwnerId);
  return tx.createConfirmedNdpPrepayment({ ...input, amountJpy });
});
```

- [ ] **Step 4: Make publication-fee hold lookup explicit**

```ts
findWalletHoldByExchangePostId(
  exchangePostId: number,
  feeType: WalletHoldFeeType
): Promise<WalletHoldPayload | null>;
```

Update every existing call to pass `"exchange_request_publication_fee"`; add SQL assertions that both `exchange_post_id` and `fee_type` appear in the query.

- [ ] **Step 5: Run ledger/prepayment tests and commit**

Run the four focused suites from Step 2 and `npm --prefix backend run lint`.

Expected: all pass.

Commit: `feat(payments): manage confirmed service prepayments`

---

### Task 4: Integrate Booking preview, creation, and automation retry

**Files:**
- Modify: `backend/src/validators/booking.validator.ts`
- Modify: `backend/src/repositories/booking.repository.ts`
- Modify: `backend/src/services/booking.service.ts`
- Modify: `backend/src/controllers/booking.controller.ts`
- Modify: `backend/src/routes/booking.routes.ts`
- Modify: `backend/src/repositories/technician-automation.repository.ts`
- Modify: `backend/src/services/technician-automation-processor.ts`
- Modify: `backend/src/api/openapi.ts`
- Modify: `backend/tests/booking-validator.test.ts`
- Modify: `backend/tests/booking-service.test.ts`
- Modify: `backend/tests/booking-api.test.ts`
- Modify: `backend/tests/technician-automation-processor.test.ts`
- Create: `backend/tests/booking-service-prepayment.test.ts`

**Interfaces:**
- Booking preview returns `{ baseAmountJpy, minimumPercent, requiredAmountJpy }` from the current rule.
- Booking create accepts `servicePrepayment: { method, idempotencyKey, providerToken? } | null` and ignores all client amount fields.
- Payment confirmation calls `processBooking(orderId)` after commit; pre-action revalidation reads locked evidence.

- [ ] **Step 1: Write Booking RED tests**

Prove a JPY 10,000 Booking with a 30% rule requires JPY 3,000, the server rejects client amount overrides, NDP confirmation triggers one auto-accept, JPY 2,999 stays manual, refunded funds stay manual, stale preview uses the current rule, and processor retries do not duplicate status history.

```ts
expect(await service.previewPrepayment(access, bookingDraft)).toEqual({
  baseAmountJpy: 10_000,
  minimumPercent: 30,
  requiredAmountJpy: 3_000
});
await processor.processBooking(503);
expect(confirmBooking).toHaveBeenCalledTimes(1);
repository.getEvidence.mockResolvedValue({
  baseAmountJpy: 10_000,
  confirmedAmountJpy: 2_999,
  confirmed: true,
  percent: 29,
  status: "confirmed"
});
expect((await processor.processBooking(504)).outcome).toBe("not_matched");
```

- [ ] **Step 2: Run tests and confirm RED**

Run: `npm --prefix backend test -- --runInBand tests/booking-validator.test.ts tests/booking-service.test.ts tests/booking-api.test.ts tests/booking-service-prepayment.test.ts tests/technician-automation-processor.test.ts`

- [ ] **Step 3: Implement Booking integration**

Use `Number(order.priceAmount)` only after safe-integer/currency validation. Load service-prepayment evidence in `loadBookingCandidate`; set `prepaymentBaseAmountJpy` from the frozen `priceAmount`. Immediately before `confirmBooking`, re-read confirmed evidence under transaction/authority control and record `payment:prepayment_unconfirmed` or `payment:prepayment_too_low` instead of accepting stale evidence.

```ts
const evidence = await this.prepayments.getEvidence({ type: "booking", id: order.id });
context.prepaymentBaseAmountJpy = assertIntegerJpy(order.priceAmount, order.currency);
context.prepaidServiceAmountJpy = evidence?.confirmedAmountJpy ?? 0;
context.prepaymentConfirmed = evidence?.confirmed === true;
```

- [ ] **Step 4: Update OpenAPI and rerun focused tests**

Expected: all five suites pass and API examples contain no client-calculated amount.

- [ ] **Step 5: Commit**

Commit: `feat(booking): require confirmed prepayment for automation`

---

### Task 5: Integrate Request publication, automation, and release lifecycle

**Files:**
- Modify: `backend/src/validators/exchange.validators.ts`
- Modify: `backend/src/types/exchange.types.ts`
- Modify: `backend/src/repositories/exchange.repository.ts`
- Modify: `backend/src/services/exchange.service.ts`
- Modify: `backend/src/repositories/technician-automation.repository.ts`
- Modify: `backend/src/services/technician-automation-processor.ts`
- Modify: `backend/src/repositories/exchange-cancellation.repository.ts`
- Modify: `backend/src/services/exchange-cancellation.service.ts`
- Modify: `backend/src/workers/exchange-post-expiry.worker.ts`
- Modify: `backend/src/api/openapi.ts`
- Modify: `backend/tests/exchange.validators.test.ts`
- Modify: `backend/tests/exchange.service.test.ts`
- Modify: `backend/tests/exchange.repository.test.ts`
- Modify: `backend/tests/technician-request-automation.integration.test.ts`
- Modify: `backend/tests/exchange-cancellation.test.ts`
- Modify: `backend/tests/exchange-post-expiry.worker.test.ts`

**Interfaces:**
- Request input gains `servicePrepaymentPercent: 0 | 10..100`.
- Effective base is `budgetMaxJpy` for total budget and `budgetMaxJpy * targetProviderCount` for per-provider budget.
- Request candidate evidence comes only from `ServicePrepayment`, never `ExchangeRequestFinancial`.

- [ ] **Step 1: Write Request RED tests**

Cover strict integer input, total/per-provider calculation, atomic publication rollback, separate publication/service holds, exact-threshold automatic application, below-threshold manual behavior, publication-fee exclusion, release on withdrawal/expiry/cancellation, and idempotent replay.

```ts
expect(exchangeRequestInputSchema.safeParse({
  ...validRequest,
  servicePrepaymentPercent: 30.5
}).success).toBe(false);
expect(await service.publish(access, {
  ...validRequest,
  budgetMode: "per_provider",
  budgetMaxJpy: 10_000,
  targetProviderCount: 2,
  servicePrepaymentPercent: 30
})).toMatchObject({
  servicePrepayment: { baseAmountJpy: 20_000, amountJpy: 6_000, status: "confirmed" }
});
expect(repository.createHold).toHaveBeenCalledWith(
  expect.objectContaining({ feeType: "service_prepayment" })
);
```

- [ ] **Step 2: Run focused tests and confirm RED**

Run the seven Request suites listed above with `--runInBand`.

- [ ] **Step 3: Implement transactional Request funding**

Calculate the base on the server, create the Request and publication-fee financial record, then create service prepayment when percent is positive. For NDP, both holds commit in one transaction or both roll back. Persist `0` without a service hold when the publisher declines prepayment.

```ts
const baseAmountJpy = input.budgetMode === "per_provider"
  ? input.budgetMaxJpy * input.targetProviderCount
  : input.budgetMaxJpy;
const amountJpy = calculateRequiredPrepaymentJpy(baseAmountJpy, input.servicePrepaymentPercent);
```

- [ ] **Step 4: Wire evaluator evidence and lifecycle release**

Populate the Request candidate with confirmed service amount/base. Revalidate immediately before `applyRequest`. Withdrawal, terminal cancellation, and expiry invoke `ServicePrepaymentService.release` with stable idempotency keys derived from post ID and transition.

```ts
await this.prepayments.release(access, {
  subject: { type: "exchange", id: postId },
  idempotencyKey: `exchange:${postId}:${terminalReason}:service-prepayment-release`
});
```

- [ ] **Step 5: Rerun focused tests and commit**

Expected: all Request suites pass.

Commit: `feat(exchange): fund request service prepayments`

---

### Task 6: Allocate Request prepayment to converted Bookings

**Files:**
- Modify: `backend/src/repositories/exchange-booking-conversion.repository.ts`
- Modify: `backend/src/services/exchange-booking-conversion.service.ts`
- Modify: `backend/src/types/exchange-booking-conversion.types.ts`
- Modify: `backend/src/repositories/booking.repository.ts`
- Modify: `backend/src/services/booking.service.ts`
- Modify: `backend/tests/exchange-booking-conversion.repository.test.ts`
- Modify: `backend/tests/exchange-booking-conversion.repository.integration.test.ts`
- Modify: `backend/tests/exchange-booking-conversion.service.test.ts`
- Modify: `backend/tests/exchange-cancellation.repository.integration.test.ts`
- Modify: `backend/tests/order-checkout-service.test.ts`

**Interfaces:**
- Conversion allocates `min(confirmedRequestPrepaymentJpy, selectedQuoteTotalJpy)` by largest remainder.
- Each allocation links the source Request prepayment, participant, and resulting Booking prepayment.
- Checkout uses allocated prepayment as paid service amount without marking the full order paid unless the allocation covers the order total.

- [ ] **Step 1: Write conversion RED tests**

Use quotes JPY 6,000 and JPY 4,000 with JPY 3,000 held and assert JPY 1,800/JPY 1,200 allocations, exact total conservation, stable tie-breaking, replay idempotency, rollback on any failed order creation, and release of unused held funds when matching closes.

```ts
expect(result.orders.map((order) => ({
  participantId: order.participantId,
  amountJpy: order.servicePrepayment.amountJpy
}))).toEqual([
  { participantId: 1, amountJpy: 1_800 },
  { participantId: 2, amountJpy: 1_200 }
]);
expect(result.orders.reduce((sum, order) => sum + order.servicePrepayment.amountJpy, 0)).toBe(3_000);
```

- [ ] **Step 2: Run tests and confirm RED**

Run: `npm --prefix backend test -- --runInBand tests/exchange-booking-conversion.repository.test.ts tests/exchange-booking-conversion.repository.integration.test.ts tests/exchange-booking-conversion.service.test.ts tests/exchange-cancellation.repository.integration.test.ts tests/order-checkout-service.test.ts`

- [ ] **Step 3: Implement allocation inside the existing conversion transaction**

Lock the Request prepayment before creating orders. Create allocation rows and Booking subject aggregates in the same transaction as participant/order linkage. Update the source hold captured/remaining amounts through the ledger authority. Preserve `BookingOrder.paymentStatus = PENDING` for partial allocations and confirm only when the allocated amount covers the entire order price.

```ts
const allocations = allocatePrepaymentJpy(
  Math.min(requestPrepayment.confirmedAmountJpy, selectedQuoteTotalJpy),
  participants.map(({ id, quoteAmountJpy }) => ({ id, quoteAmountJpy }))
);
```

- [ ] **Step 4: Rerun focused tests and commit**

Expected: all five suites pass with no extra settlement or duplicate wallet movement.

Commit: `feat(exchange): allocate request prepayments to bookings`

---

### Task 7: Add customer Booking and Request controls and status projections

**Files:**
- Modify: `src/features/booking/api.ts`
- Modify: `src/features/booking/api.test.ts`
- Modify: `src/pages/user/FormalCheckoutPage.tsx`
- Modify: `src/pages/user/FormalCheckoutPage.test.ts`
- Modify: `src/features/exchange/types.ts`
- Modify: `src/features/exchange/exchange-composer-model.ts`
- Modify: `src/features/exchange/RequestComposerFields.tsx`
- Modify: `src/features/exchange/RequestComposerFields.test.tsx`
- Modify: `src/features/exchange/ExchangePublicationReview.tsx`
- Modify: `src/features/exchange/ExchangeComposer.test.tsx`
- Modify: `src/features/exchange/api.ts`
- Modify: `src/features/exchange/api.test.ts`
- Modify: `src/features/exchange/i18n.ts`
- Modify: `src/i18n/translations.ts`

**Interfaces:**
- Booking UI displays server preview `{ minimumPercent, requiredAmountJpy }` and submits an existing formal payment method/token.
- Request draft adds string `servicePrepaymentPercent`, normalized to `0 | 10..100` only after integer validation.
- Publication review displays publication fee and service prepayment as separate rows.

- [ ] **Step 1: Write frontend RED tests**

Assert Booking shows `最低预付 30%（¥3,000）`, Request supports off or integer `10–100`, decimal input blocks publication, per-provider total is displayed correctly, publication fee and service prepayment appear separately, and API payloads contain percentage but no calculated amount.

```tsx
expect(screen.getByText("最低预付 30%（¥3,000）")).toBeInTheDocument();
fireEvent.change(screen.getByRole("spinbutton", { name: "服务预付比例" }), {
  target: { value: "30.5" }
});
expect(screen.getByRole("button", { name: "发布" })).toBeDisabled();
expect(screen.getByText("发布费")).toBeInTheDocument();
expect(screen.getByText("服务预付款")).toBeInTheDocument();
```

- [ ] **Step 2: Run tests and confirm RED**

Run:

```bash
npm test -- --run src/features/booking/api.test.ts src/pages/user/FormalCheckoutPage.test.ts src/features/exchange/RequestComposerFields.test.tsx src/features/exchange/ExchangeComposer.test.tsx src/features/exchange/api.test.ts
```

- [ ] **Step 3: Implement the controls with existing form components and i18n**

Use `inputMode="numeric"`, `step="1"`, explicit integer parsing, and server preview output. Keep all five supported languages complete. Do not introduce a local price calculator as an authority; display the API's calculated value.

```ts
const parsedPercent = /^\d+$/.test(draft.servicePrepaymentPercent)
  ? Number(draft.servicePrepaymentPercent)
  : Number.NaN;
const validPercent = parsedPercent === 0
  || (Number.isInteger(parsedPercent) && parsedPercent >= 10 && parsedPercent <= 100);
```

- [ ] **Step 4: Rerun tests, run root build, and commit**

Run the focused tests from Step 2 and `npm run build`.

Expected: focused tests and production build pass.

Commit: `feat(payments): expose service prepayment flows`

---

### Task 8: Verify, integrate, deploy, and clean safely

**Files:**
- Modify: `docs/api.md`
- Modify: `README.md`

**Interfaces:**
- Produces final verified `main` revision and matching staging deployment metadata.
- Preserves evidence for local listener ownership, exact Git SHA, GitHub push, SSM/deployment success, readiness, and authenticated UI/API checks.

- [ ] **Step 1: Update documentation**

Document the settings field, Booking/Request inputs and projections, formula, qualifying evidence, lifecycle states, publication-fee exclusion, cancellation/refund behavior, and API examples.

- [ ] **Step 2: Run complete local gates on the feature branch**

Run Prisma generation/validation, backend lint/build and repository shard runner, root lint/tests/build, plus `git diff --check`. If runtime images changed, run `npm run optimize:production-images` and `npm run verify:production-images`; otherwise record that the image gate is not applicable.

- [ ] **Step 3: Verify on port 5180**

Identify the listener PID, cwd, branch, and proxy before use. Start/restart the repository's formal local services only through documented scripts. Verify authenticated Booking and Request settings at `0`, `10`, `30`, and `100`; verify the JPY 10,000/JPY 3,000 threshold; verify publication-fee exclusion; and verify daily/weekly/monthly/yearly recurring calendar instances.

- [ ] **Step 4: Merge to local main and repeat final-state gates**

Confirm worktree cleanliness and ancestry, switch to the canonical main worktree, merge the feature branch without dropping unrelated commits, and rerun the relevant backend/frontend tests, builds, and 5180 smoke checks on the merged `main` SHA.

- [ ] **Step 5: Push and deploy the exact main revision**

Push `main` to GitHub. Use the repository's documented staging deployment command for that exact SHA. Record GitHub remote SHA, deployment package/revision metadata, successful SSM command status, health/readiness responses, and authenticated staging Booking/Request/calendar checks.

- [ ] **Step 6: Clean merged branches/worktrees and report archival readiness**

Before deletion, inspect `git worktree list`, each candidate status, branch divergence, merge ancestry, and process ownership. Remove only clean, fully merged, unused worktrees and branches. Report remaining blockers separately; state that the task can be archived only when staging validation and cleanup have both completed.
