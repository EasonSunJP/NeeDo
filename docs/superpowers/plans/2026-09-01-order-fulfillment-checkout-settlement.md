# Formal Order Fulfillment and Settlement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the browser-local service session with a formal, auditable workflow from service start through add-ons, checkout, NDP/manual payment completion and two-way review.

**Architecture:** Extend `BookingOrder` with two fulfillment states and add append-only session/event, add-on, checkout and NDP-rate records. Route every transition through `BookingService` and `BookingRepository` transactions; React pages become projections of the formal order API.

**Tech Stack:** Express, TypeScript, Zod, Prisma/MySQL, Jest/Supertest, React, Vitest

## Global Constraints

- Completion evidence is either an applied NDP ledger transaction or a technician/manual-receipt audit record.
- `complete` no longer means “service timer ended”; service end moves to `awaitingCheckout`.
- Default rate is `1 NDP = 1 JPY`; every checkout saves an immutable rate snapshot.
- Cash and other payment become complete only after technician confirmation; operations override needs a separate permission and reason.
- Completed-consumption analytics excludes cancelled, incomplete, fully refunded and fully reversed orders.
- Persist service/add-on price and duration snapshots; catalog changes never alter accepted history.
- All mutation endpoints require idempotency keys and transaction conflict handling.

---

### Task 1: Add the fulfillment persistence foundation

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Create: `backend/prisma/migrations/20260901090000_order_fulfillment_checkout/migration.sql`
- Create: `backend/tests/order-fulfillment-schema.test.ts`

**Interfaces:**
- Produces: `OrderServiceSession`, `OrderServiceEvent`, `OrderAddOn`, `OrderCheckout`, `NdpExchangeRateRule`
- Produces enum values `AWAITING_CHECKOUT`, `AWAITING_PAYMENT_CONFIRMATION`, `CASH`, `NDP`, `OTHER`

- [ ] **Step 1: Write a failing schema contract test**

```ts
it("defines immutable service, add-on, checkout and rate evidence", () => {
  const schema = readFileSync(schemaPath, "utf8");
  for (const token of [
    "AWAITING_CHECKOUT", "AWAITING_PAYMENT_CONFIRMATION",
    "model OrderServiceSession", "model OrderServiceEvent",
    "model OrderAddOn", "model OrderCheckout", "model NdpExchangeRateRule",
    "idempotencyKey", "rateSnapshotJson", "checkoutAmountJpy"
  ]) expect(schema).toContain(token);
});
```

- [ ] **Step 2: Run it and verify failure**

Run: `cd backend && npm test -- order-fulfillment-schema.test.ts`

Expected: FAIL on the first missing schema token.

- [ ] **Step 3: Add the schema models and safe migration**

Use these locked model responsibilities:

```prisma
model OrderServiceSession {
  id                  Int       @id @default(autoincrement())
  bookingOrderId      Int       @unique @map("booking_order_id")
  verificationHash    String    @map("verification_hash") @db.VarChar(255)
  startedByUserId     Int?      @map("started_by_user_id")
  startedAt           DateTime? @map("started_at")
  expectedEndsAt      DateTime? @map("expected_ends_at")
  endedByUserId       Int?      @map("ended_by_user_id")
  endedAt             DateTime? @map("ended_at")
  createdAt           DateTime  @default(now()) @map("created_at")
  updatedAt           DateTime  @updatedAt @map("updated_at")
  deletedAt           DateTime? @map("deleted_at")
}

model OrderCheckout {
  id                  Int       @id @default(autoincrement())
  bookingOrderId      Int       @unique @map("booking_order_id")
  checkoutAmountJpy   Int       @map("checkout_amount_jpy")
  payableNdp          Int       @map("payable_ndp")
  ndpRateRuleId       Int       @map("ndp_rate_rule_id")
  rateSnapshotJson    Json      @map("rate_snapshot_json")
  paymentMethod       ServicePaymentMethod? @map("payment_method")
  ledgerTransactionId Int?      @unique @map("ledger_transaction_id")
  receiptConfirmedById Int?     @map("receipt_confirmed_by_id")
  receiptConfirmedAt  DateTime? @map("receipt_confirmed_at")
  createdAt           DateTime  @default(now()) @map("created_at")
  updatedAt           DateTime  @updatedAt @map("updated_at")
  deletedAt           DateTime? @map("deleted_at")
}
```

The migration must add foreign keys, active/deleted indexes and unique idempotency keys, preserve existing payment enum values for historical rows, and add `CASH`, `NDP`, `OTHER` for new writes.

- [ ] **Step 4: Generate Prisma and run schema tests**

Run: `cd backend && npm run prisma:generate && npm test -- order-fulfillment-schema.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit the persistence foundation**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations/20260901090000_order_fulfillment_checkout/migration.sql backend/tests/order-fulfillment-schema.test.ts
git commit -m "feat: add formal order fulfillment persistence"
```

### Task 2: Define formal payloads and validation

**Files:**
- Modify: `backend/src/repositories/booking.repository.ts`
- Modify: `backend/src/validators/booking.validator.ts`
- Modify: `backend/tests/booking-service.test.ts`
- Create: `backend/tests/order-fulfillment-validator.test.ts`

**Interfaces:**
- Produces: `BookingOrderStatusPayload` with `awaitingCheckout` and `awaitingPaymentConfirmation`
- Produces: `StartServiceInput`, `CreateOrderAddOnInput`, `EndServiceInput`, `SelectPaymentMethodInput`, `PayWithNdpInput`, `ConfirmReceiptInput`

- [ ] **Step 1: Write failing validator cases**

```ts
expect(startServiceBodySchema.parse({ actor: "technician", verificationCode: "829104", idempotencyKey })).toEqual(expect.any(Object));
expect(() => startServiceBodySchema.parse({ actor: "technician", idempotencyKey })).toThrow();
expect(selectPaymentMethodBodySchema.parse({ method: "cash", idempotencyKey })).toEqual(expect.any(Object));
expect(confirmReceiptBodySchema.parse({ idempotencyKey, reason: "cash received" })).toEqual(expect.any(Object));
```

- [ ] **Step 2: Run and verify failure**

Run: `cd backend && npm test -- order-fulfillment-validator.test.ts`

Expected: FAIL because schemas are not exported.

- [ ] **Step 3: Add strict Zod schemas**

```ts
const idempotencyKeySchema = z.string().trim().min(16).max(160);

export const startServiceBodySchema = z.discriminatedUnion("actor", [
  z.object({ actor: z.literal("customer"), idempotencyKey: idempotencyKeySchema }).strict(),
  z.object({ actor: z.literal("technician"), verificationCode: z.string().regex(/^\d{6}$/), idempotencyKey: idempotencyKeySchema }).strict()
]);
export const selectPaymentMethodBodySchema = z.object({
  method: z.enum(["cash", "ndp", "other"]),
  otherMethodCode: z.string().trim().min(1).max(40).optional(),
  otherMethodLabel: z.string().trim().min(1).max(80).optional(),
  idempotencyKey: idempotencyKeySchema
}).strict().superRefine((value, context) => {
  if (value.method === "other" && (!value.otherMethodCode || !value.otherMethodLabel)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["otherMethodCode"], message: "other payment details are required" });
  }
});
```

- [ ] **Step 4: Run validator and type tests**

Run: `cd backend && npm test -- order-fulfillment-validator.test.ts booking-service.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit the contract**

```bash
git add backend/src/repositories/booking.repository.ts backend/src/validators/booking.validator.ts backend/tests/order-fulfillment-validator.test.ts backend/tests/booking-service.test.ts
git commit -m "feat: define fulfillment API contracts"
```

### Task 3: Persist service start, add-ons and service end

**Files:**
- Modify: `backend/src/repositories/booking.repository.ts`
- Modify: `backend/src/services/booking.service.ts`
- Modify: `backend/src/controllers/booking.controller.ts`
- Modify: `backend/src/routes/booking.routes.ts`
- Modify: `backend/src/constants/permissions.constants.ts`
- Create: `backend/tests/order-fulfillment-service.test.ts`
- Create: `backend/tests/order-fulfillment-api.test.ts`

**Interfaces:**
- Produces endpoints:
  - `POST /api/v1/orders/:id/service/start`
  - `POST /api/v1/orders/:id/add-ons`
  - `POST /api/v1/orders/:id/add-ons/:addOnId/accept`
  - `POST /api/v1/orders/:id/add-ons/:addOnId/reject`
  - `POST /api/v1/orders/:id/service/end`
- Produces permissions `order:service:start`, `order:add-on:write`, `order:service:end`

- [ ] **Step 1: Write failing service tests**

```ts
await expect(service.startService(customerActor, 41, { actor: "customer", idempotencyKey }, context)).resolves.toMatchObject({ status: "inService" });
await expect(service.startService(technicianActor, 41, { actor: "technician", verificationCode: "000000", idempotencyKey }, context)).rejects.toMatchObject({ message: "error.order.verification_code_invalid" });
await expect(service.acceptAddOn(customerActor, 41, 9, { idempotencyKey }, context)).resolves.toMatchObject({ expectedEndsAt: "2026-09-01T11:30:00.000Z" });
await expect(service.endService(customerActor, 41, { idempotencyKey, reason: "customer_completed" }, context)).resolves.toMatchObject({ status: "awaitingCheckout" });
```

- [ ] **Step 2: Run and verify failure**

Run: `cd backend && npm test -- order-fulfillment-service.test.ts`

Expected: FAIL because service methods do not exist.

- [ ] **Step 3: Implement guarded transactional methods**

Each repository method must: lock/read the order, validate the expected status and actor scope, check the idempotency key, write the mutation plus `OrderServiceEvent`, and return the newly projected order. Accepting an add-on updates `expectedEndsAt` by exactly `durationMinutes` and stores the service snapshot.

```ts
export type FulfillmentMutationResult =
  | { outcome: "ok"; order: BookingOrderPayload; applied: boolean }
  | { outcome: "not_found" | "forbidden" | "invalid_transition" | "verification_failed" | "conflict" };
```

- [ ] **Step 4: Run service and API tests**

Run: `cd backend && npm test -- order-fulfillment-service.test.ts order-fulfillment-api.test.ts booking-service.test.ts`

Expected: PASS including duplicate-idempotency and wrong-actor cases.

- [ ] **Step 5: Commit fulfillment mutations**

```bash
git add backend/src/repositories/booking.repository.ts backend/src/services/booking.service.ts backend/src/controllers/booking.controller.ts backend/src/routes/booking.routes.ts backend/src/constants/permissions.constants.ts backend/tests/order-fulfillment-service.test.ts backend/tests/order-fulfillment-api.test.ts
git commit -m "feat: persist formal service fulfillment"
```

### Task 4: Publish NDP exchange-rate versions

**Files:**
- Create: `backend/src/repositories/ndp-exchange-rate.repository.ts`
- Create: `backend/src/services/ndp-exchange-rate.service.ts`
- Create: `backend/src/controllers/ndp-exchange-rate.controller.ts`
- Create: `backend/src/validators/ndp-exchange-rate.validator.ts`
- Create: `backend/src/routes/ndp-exchange-rate.routes.ts`
- Modify: `backend/src/app.ts`
- Modify: `backend/src/constants/permissions.constants.ts`
- Create: `backend/tests/ndp-exchange-rate.service.test.ts`
- Create: `backend/tests/ndp-exchange-rate-api.test.ts`

**Interfaces:**
- Produces: `resolveEffectiveRate(at: Date): Promise<NdpRateSnapshot>`
- Produces: `GET /api/v1/backoffice/ndp-exchange-rates` and `POST /api/v1/backoffice/ndp-exchange-rates`
- Produces: permission `backoffice:ndp-exchange-rate:write`

- [ ] **Step 1: Write failing version/effective-date tests**

```ts
await expect(service.resolveEffectiveRate(new Date("2026-09-01T00:00:00Z"))).resolves.toEqual({
  ruleId: 1, version: 1, ndpUnits: 1, jpyUnits: 1, effectiveFrom: expect.any(Date)
});
await expect(service.publish(actor, { ndpUnits: 2, jpyUnits: 3, effectiveFrom, reason: "rate change" }, context)).resolves.toMatchObject({ version: 2 });
```

- [ ] **Step 2: Run and verify failure**

Run: `cd backend && npm test -- ndp-exchange-rate.service.test.ts`

Expected: FAIL because the service does not exist.

- [ ] **Step 3: Implement versioned repository/service/routes**

```ts
export interface NdpRateSnapshot {
  ruleId: number;
  version: number;
  ndpUnits: number;
  jpyUnits: number;
  effectiveFrom: Date;
}
```

Seed the first formal rule as 1:1 in the migration/seed path, reject overlapping active versions, and audit old/new values plus reason.

- [ ] **Step 4: Run service, API and permission tests**

Run: `cd backend && npm test -- ndp-exchange-rate.service.test.ts ndp-exchange-rate-api.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit the rate publisher**

```bash
git add backend/src/repositories/ndp-exchange-rate.repository.ts backend/src/services/ndp-exchange-rate.service.ts backend/src/controllers/ndp-exchange-rate.controller.ts backend/src/validators/ndp-exchange-rate.validator.ts backend/src/routes/ndp-exchange-rate.routes.ts backend/src/app.ts backend/src/constants/permissions.constants.ts backend/tests/ndp-exchange-rate.service.test.ts backend/tests/ndp-exchange-rate-api.test.ts
git commit -m "feat: publish versioned NDP exchange rates"
```

### Task 5: Create checkout and finish payment formally

**Files:**
- Modify: `backend/src/repositories/booking.repository.ts`
- Modify: `backend/src/services/booking.service.ts`
- Modify: `backend/src/services/ledger.service.ts`
- Modify: `backend/src/controllers/booking.controller.ts`
- Modify: `backend/src/routes/booking.routes.ts`
- Create: `backend/tests/order-checkout-service.test.ts`
- Create: `backend/tests/order-checkout-api.test.ts`

**Interfaces:**
- Produces endpoints:
  - `GET /api/v1/orders/:id/checkout`
  - `POST /api/v1/orders/:id/checkout/payment-method`
  - `POST /api/v1/orders/:id/checkout/pay/ndp`
  - `POST /api/v1/orders/:id/checkout/confirm-receipt`
- Consumes: `NdpExchangeRateService.resolveEffectiveRate()`

- [ ] **Step 1: Write failing payment-path tests**

```ts
expect(await service.getCheckout(customerActor, 41)).toMatchObject({ checkoutAmountJpy: 12800, payableNdp: 12800 });
expect(await service.payCheckoutWithNdp(customerActor, 41, { idempotencyKey }, context)).toMatchObject({ status: "completed", paymentEvidence: "ndp_ledger" });
expect(await service.selectPaymentMethod(customerActor, 42, { method: "cash", idempotencyKey }, context)).toMatchObject({ status: "awaitingPaymentConfirmation" });
expect(await service.confirmReceipt(technicianActor, 42, { idempotencyKey, reason: "cash received" }, context)).toMatchObject({ status: "completed", paymentEvidence: "technician_receipt_confirmation" });
```

- [ ] **Step 2: Run and verify failure**

Run: `cd backend && npm test -- order-checkout-service.test.ts`

Expected: FAIL because checkout methods do not exist.

- [ ] **Step 3: Implement atomic checkout/payment methods**

Create checkout amount from original snapshot + accepted add-ons - effective discounts. Save the exchange-rate JSON before returning checkout. NDP payment debits the customer wallet and writes the checkout ledger reference in one transaction; manual selection never completes the order; receipt confirmation completes it and records actor/reason.

- [ ] **Step 4: Run checkout, ledger and manual-payment tests**

Run: `cd backend && npm test -- order-checkout-service.test.ts order-checkout-api.test.ts ledger-service.test.ts manual-payment-service.test.ts`

Expected: PASS with double-submit, insufficient balance, wrong amount, refund and reversal cases.

- [ ] **Step 5: Commit formal settlement**

```bash
git add backend/src/repositories/booking.repository.ts backend/src/services/booking.service.ts backend/src/services/ledger.service.ts backend/src/controllers/booking.controller.ts backend/src/routes/booking.routes.ts backend/tests/order-checkout-service.test.ts backend/tests/order-checkout-api.test.ts
git commit -m "feat: settle checkout with NDP or receipt evidence"
```

### Task 6: Advance expired service timers

**Files:**
- Create: `backend/src/repositories/order-service-expiry.repository.ts`
- Create: `backend/src/services/order-service-expiry.service.ts`
- Create: `backend/src/workers/order-service-expiry.worker.ts`
- Modify: `backend/src/server.ts`
- Create: `backend/tests/order-service-expiry.service.test.ts`
- Create: `backend/tests/order-service-expiry.worker.test.ts`

**Interfaces:**
- Produces: `expireDueSessions(now: Date, batchSize: number): Promise<number>`
- Produces env configuration `ORDER_SERVICE_EXPIRY_INTERVAL_MS`, `ORDER_SERVICE_EXPIRY_BATCH_SIZE`

- [ ] **Step 1: Write failing expiry tests**

```ts
expect(await service.expireDueSessions(now, 100)).toBe(2);
expect(repository.moveDueSessionsToCheckout).toHaveBeenCalledWith({ now, batchSize: 100 });
```

- [ ] **Step 2: Run and verify failure**

Run: `cd backend && npm test -- order-service-expiry.service.test.ts`

Expected: FAIL because expiry service is absent.

- [ ] **Step 3: Implement an idempotent bounded worker**

The repository updates only `IN_SERVICE` rows whose `expectedEndsAt <= now`, writes a system service event, and creates checkout rows with the effective NDP rate inside conflict-retried transactions.

- [ ] **Step 4: Run service/worker tests**

Run: `cd backend && npm test -- order-service-expiry.service.test.ts order-service-expiry.worker.test.ts`

Expected: PASS, including two workers racing on the same order.

- [ ] **Step 5: Commit automatic checkout advancement**

```bash
git add backend/src/repositories/order-service-expiry.repository.ts backend/src/services/order-service-expiry.service.ts backend/src/workers/order-service-expiry.worker.ts backend/src/server.ts backend/tests/order-service-expiry.service.test.ts backend/tests/order-service-expiry.worker.test.ts
git commit -m "feat: advance expired services to checkout"
```

### Task 7: Replace frontend local session state with the formal API

**Files:**
- Modify: `src/features/booking/api.ts`
- Modify: `src/pages/user/UserOrderDetailPage.tsx`
- Modify: `src/pages/user/UserOrderDetailPage.test.ts`
- Modify: `src/components/technician/FormalTechnicianOrdersPanel.tsx`
- Modify: `src/components/technician/FormalTechnicianOrdersPanel.test.ts`
- Modify: `src/shared/order-detail/ServiceSessionUi.tsx`
- Delete after imports reach zero: `src/state/orderServiceSessionStore.ts`

**Interfaces:**
- Consumes: Task 3 and Task 5 endpoints
- Produces: typed API methods `startService`, `createAddOn`, `acceptAddOn`, `endService`, `getCheckout`, `selectPaymentMethod`, `payWithNdp`, `confirmReceipt`

- [ ] **Step 1: Write failing frontend API and page tests**

```ts
expect(source).not.toContain("orderServiceSessionStore");
expect(source).toContain("bookingApi.getCheckout");
expect(source).toContain("bookingApi.payWithNdp");
expect(technicianSource).toContain("bookingApi.confirmReceipt");
```

- [ ] **Step 2: Run and verify failure**

Run: `npm test -- src/pages/user/UserOrderDetailPage.test.ts src/components/technician/FormalTechnicianOrdersPanel.test.ts src/features/booking/api.test.ts`

Expected: FAIL because local store calls remain and API methods are absent.

- [ ] **Step 3: Implement typed API calls and formal UI states**

```ts
export type BookingOrderStatus = "pending" | "confirmed" | "inService" | "awaitingCheckout" | "awaitingPaymentConfirmation" | "completed" | "cancelled";

export const payWithNdp = (orderId: number, idempotencyKey: string) =>
  httpClient.request<BookingOrder>(`/orders/${orderId}/checkout/pay/ndp`, {
    method: "POST", body: { idempotencyKey }
  });
```

Render the approved start confirmation, countdown, add-on selection/confirmation, early-end confirmation, checkout buttons, receipt-waiting state and review entry from server payloads. Do not recreate persistence in component state.

- [ ] **Step 4: Run frontend focused tests**

Run: `npm test -- src/features/booking/api.test.ts src/pages/user/UserOrderDetailPage.test.ts src/components/technician/FormalTechnicianOrdersPanel.test.ts`

Expected: PASS and `rg -n "orderServiceSessionStore" src` returns no imports.

- [ ] **Step 5: Commit the frontend cutover**

```bash
git add src/features/booking/api.ts src/pages/user/UserOrderDetailPage.tsx src/pages/user/UserOrderDetailPage.test.ts src/components/technician/FormalTechnicianOrdersPanel.tsx src/components/technician/FormalTechnicianOrdersPanel.test.ts src/shared/order-detail/ServiceSessionUi.tsx src/state/orderServiceSessionStore.ts
git commit -m "feat: use formal service settlement UI"
```

### Task 8: Connect two-way reviews to completed orders

**Files:**
- Modify: `backend/src/repositories/booking.repository.ts`
- Modify: `backend/src/services/booking.service.ts`
- Modify: `backend/src/validators/booking.validator.ts`
- Modify: `backend/src/controllers/booking.controller.ts`
- Modify: `backend/src/routes/booking.routes.ts`
- Modify: `src/features/booking/api.ts`
- Modify: `src/pages/user/UserOrderDetailPage.tsx`
- Modify: `src/components/technician/FormalTechnicianOrdersPanel.tsx`
- Create: `backend/tests/order-review-service.test.ts`
- Create: `backend/tests/order-review-api.test.ts`

**Interfaces:**
- Produces: `POST /api/v1/orders/:id/reviews` with `targetType`, `rating`, `tags`, `comment`
- Reuses: existing `OrderReview` unique key `(bookingOrderId, reviewerUserId, targetType)`

- [ ] **Step 1: Write failing completed-only review tests**

```ts
await expect(service.createReview(customerActor, completedOrderId, { targetType: "technician", rating: 5, tags: ["服务精神"], comment: null }, context)).resolves.toMatchObject({ rating: 5 });
await expect(service.createReview(customerActor, inServiceOrderId, reviewInput, context)).rejects.toMatchObject({ message: "error.order.review_requires_completion" });
```

- [ ] **Step 2: Run and verify failure**

Run: `cd backend && npm test -- order-review-service.test.ts`

Expected: FAIL because formal review mutation is absent.

- [ ] **Step 3: Implement the formal review mutation**

Validate reviewer/target direction from actor identity and order participants, require `COMPLETED`, preserve the existing unique constraint, and write an audit record. Wire `ServiceReviewPrompt` submit to the endpoint; skipping closes the prompt without writing a review.

- [ ] **Step 4: Run backend and frontend review tests**

Run: `cd backend && npm test -- order-review-service.test.ts order-review-api.test.ts`

Run: `npm test -- src/pages/user/UserOrderDetailPage.test.ts src/components/technician/FormalTechnicianOrdersPanel.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit reviews**

```bash
git add backend/src/repositories/booking.repository.ts backend/src/services/booking.service.ts backend/src/validators/booking.validator.ts backend/src/controllers/booking.controller.ts backend/src/routes/booking.routes.ts backend/tests/order-review-service.test.ts backend/tests/order-review-api.test.ts src/features/booking/api.ts src/pages/user/UserOrderDetailPage.tsx src/components/technician/FormalTechnicianOrdersPanel.tsx
git commit -m "feat: submit completed-order reviews"
```

### Task 9: Build the operations NDP exchange-rate page

**Files:**
- Create: `src/api/ndpExchangeRate.ts`
- Create: `src/api/ndpExchangeRate.test.ts`
- Create: `src/pages/admin/NdpExchangeRatePage.tsx`
- Create: `src/pages/admin/NdpExchangeRatePage.test.tsx`
- Modify: `src/App.tsx`
- Modify: `src/App.test.tsx`
- Modify: `src/components/admin/AdminLayout.tsx`
- Modify: `src/components/admin/AdminLayout.test.ts`
- Modify: `src/i18n/translations.ts`

**Interfaces:**
- Consumes: Task 4 list/publish endpoints
- Produces route `/admin/settings/ndp-exchange-rate`

- [ ] **Step 1: Write failing route/form tests**

```tsx
expect(screen.getByText("当前比例：1 NDP = 1 JPY")).toBeVisible();
expect(screen.getByLabelText("NDP 数量")).toBeVisible();
expect(screen.getByLabelText("JPY 数量")).toBeVisible();
expect(screen.getByLabelText("生效时间")).toBeVisible();
expect(screen.getByLabelText("设置理由")).toBeVisible();
```

- [ ] **Step 2: Run and verify failure**

Run: `npm test -- src/api/ndpExchangeRate.test.ts src/pages/admin/NdpExchangeRatePage.test.tsx src/App.test.tsx`

Expected: FAIL because the API/page/route are absent.

- [ ] **Step 3: Implement version history and publish form**

The page lists immutable versions and their effective ranges, displays the current rate, requires positive integer units/effective date/reason, previews the equation before confirmation, and permission-gates publish while retaining read access.

- [ ] **Step 4: Run frontend tests, lint and build**

Run: `npm test -- src/api/ndpExchangeRate.test.ts src/pages/admin/NdpExchangeRatePage.test.tsx src/components/admin/AdminLayout.test.ts src/App.test.tsx && npm run lint && npm run build`

Expected: PASS.

- [ ] **Step 5: Commit the operations rate UI**

```bash
git add src/api/ndpExchangeRate.ts src/api/ndpExchangeRate.test.ts src/pages/admin/NdpExchangeRatePage.tsx src/pages/admin/NdpExchangeRatePage.test.tsx src/App.tsx src/App.test.tsx src/components/admin/AdminLayout.tsx src/components/admin/AdminLayout.test.ts src/i18n/translations.ts
git commit -m "feat: manage NDP exchange-rate versions"
```

### Task 10: Publish the fulfillment OpenAPI contract

**Files:**
- Modify: `backend/src/api/openapi.ts`
- Create: `backend/tests/order-fulfillment-openapi.test.ts`

**Interfaces:**
- Documents every endpoint, request, response, enum, error and permission introduced by Tasks 3-5 and 8

- [ ] **Step 1: Write the failing OpenAPI test**

```ts
for (const path of [
  "/api/v1/orders/{id}/service/start",
  "/api/v1/orders/{id}/add-ons",
  "/api/v1/orders/{id}/service/end",
  "/api/v1/orders/{id}/checkout/pay/ndp",
  "/api/v1/orders/{id}/checkout/confirm-receipt",
  "/api/v1/orders/{id}/reviews",
  "/api/v1/backoffice/ndp-exchange-rates"
]) expect(document.paths[path]).toBeDefined();
```

- [ ] **Step 2: Run and verify failure**

Run: `cd backend && npm test -- order-fulfillment-openapi.test.ts`

Expected: FAIL on missing paths/schemas.

- [ ] **Step 3: Add exact request/response schemas and status codes**

Document all new status/payment enums, idempotency-key fields, verification errors, insufficient-balance conflicts, forbidden actor responses and pagination for exchange-rate history.

- [ ] **Step 4: Run OpenAPI and route tests**

Run: `cd backend && npm test -- order-fulfillment-openapi.test.ts openapi.test.ts order-fulfillment-api.test.ts order-checkout-api.test.ts order-review-api.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit API documentation**

```bash
git add backend/src/api/openapi.ts backend/tests/order-fulfillment-openapi.test.ts
git commit -m "docs: publish order fulfillment API contract"
```

### Task 11: End-to-end verification

**Files:**
- Create: `backend/scripts/check-order-fulfillment-checkout-flow.ts`
- Create: `backend/tests/order-fulfillment-flow-script.test.ts`
- Modify: `backend/package.json`

**Interfaces:**
- Produces command `npm run check:order-fulfillment-checkout`
- Produces reproducible evidence for customer, technician, NDP and manual-payment paths

- [ ] **Step 1: Write the flow-script safety test**

```ts
expect(script).toContain("ROLLBACK");
expect(script).toContain("paymentEvidence");
expect(script).toContain("awaitingPaymentConfirmation");
```

- [ ] **Step 2: Run and verify failure**

Run: `cd backend && npm test -- order-fulfillment-flow-script.test.ts`

Expected: FAIL because the script does not exist.

- [ ] **Step 3: Implement a transaction-rollback flow check**

Create one NDP-paid order and one cash order inside a rollback-only test transaction; assert persisted events, add-on snapshots, checkout/rate snapshots, ledger or receipt evidence, completed status and review uniqueness.

- [ ] **Step 4: Run all gates and browser replay**

Run: `cd backend && npm test -- order-fulfillment order-checkout order-review && npm run build`

Run: `npm test -- src/features/booking src/pages/user/UserOrderDetailPage.test.ts src/components/technician/FormalTechnicianOrdersPanel.test.ts && npm run lint && npm run build`

Replay both payment paths on standard ports, refresh at every state, inspect the operations timeline, console and mobile overflow.

- [ ] **Step 5: Commit the flow evidence**

```bash
git add backend/scripts/check-order-fulfillment-checkout-flow.ts backend/tests/order-fulfillment-flow-script.test.ts backend/package.json
git commit -m "test: verify formal fulfillment checkout flow"
```
