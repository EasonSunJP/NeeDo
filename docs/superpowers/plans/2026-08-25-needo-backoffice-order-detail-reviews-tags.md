# NeeDo Backoffice Order Detail, Reviews, and Tags Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make newly created bookings immediately visible in backoffice order lists, provide one formal order-detail/timeline contract, persist bidirectional order reviews, and expose audited backoffice-only profile tags.

**Architecture:** Keep `BookingOrder` and `OrderStatusHistory` as the transaction/state facts. Add focused tables and services for reviews, review tags, backoffice profile tags, and backoffice timeline comments; assemble a read-optimized backoffice detail DTO without N+1 queries. Reuse one frontend detail drawer and the approved `ContactEventTimelinePanel` in both Data Center and Order Center.

**Tech Stack:** Node.js 22, Express, TypeScript strict mode, Prisma 7/MySQL 8, Zod, Jest/Supertest, React 19, Vite, Vitest, Tailwind.

## Global Constraints

- Preserve the existing React/TSX/Vite frontend and Express/Prisma backend.
- Do not add mock, demo, placeholder, fake API, browser-only formal data, `TODO`, `FIXME`, or `not implemented` bodies.
- Every new table has `id`, `createdAt`, `updatedAt`, and `deletedAt`; all reads filter `deletedAt IS NULL`.
- Controllers handle HTTP only; services own business rules; repositories own Prisma access.
- Every request path, query, and body is validated with Zod and documented in OpenAPI.
- Every protected endpoint has an explicit RBAC permission and every manual tag/comment mutation writes `AuditLog`.
- User-visible copy is added to all existing localization languages.
- `reviewTags`, `backofficeTags`, and local address-book tags remain separate contracts.
- Address-book local tags, IM, Social, public user-page redesign, review moderation, and NDP changes are out of scope.
- Existing unrelated worktree changes must be preserved and excluded from feature commits.

---

## File Structure

### Backend files to create

- `backend/src/constants/backoffice-profile-tags.constants.ts`: versioned automatic rule definitions and label metadata.
- `backend/src/repositories/order-review.repository.ts`: transactional order-review writes and summary recalculation.
- `backend/src/repositories/backoffice-profile-tag.repository.ts`: automatic/manual tag persistence and evidence reads.
- `backend/src/repositories/order-timeline-comment.repository.ts`: backoffice comment persistence.
- `backend/src/services/order-review.service.ts`: identity direction, completed-order, uniqueness, and tag-catalog rules.
- `backend/src/services/backoffice-profile-tag.service.ts`: deterministic tag evaluation and manual-tag rules.
- `backend/src/services/order-timeline.service.ts`: shared status-history-to-event mapping.
- `backend/src/controllers/order-review.controller.ts`: review HTTP adapter.
- `backend/src/controllers/backoffice-order-detail.controller.ts`: order detail, comment, and manual-tag HTTP adapter.
- `backend/src/routes/order-review.routes.ts`: authenticated review endpoint.
- `backend/src/routes/backoffice-order-detail.routes.ts`: protected detail/comment/tag endpoints.
- `backend/src/validators/order-review.validator.ts`: review request schemas.
- `backend/src/validators/backoffice-order-detail.validator.ts`: detail, comment, and manual-tag schemas.
- `backend/tests/order-review-service.test.ts`: review domain tests.
- `backend/tests/order-review-api.test.ts`: review integration tests.
- `backend/tests/backoffice-profile-tag-service.test.ts`: threshold and manual-tag tests.
- `backend/tests/backoffice-order-detail-api.test.ts`: detail/comment/RBAC tests.
- `backend/prisma/migrations/20260825190000_order_reviews_backoffice_tags/migration.sql`: formal schema migration.

### Frontend files to create

- `src/components/admin/BackofficeOrderDetailDrawer.tsx`: shared formal detail surface.
- `src/components/admin/BackofficeOrderDetailDrawer.test.tsx`: component contract tests.
- `src/lib/orderTimeline.ts`: shared API timeline-to-component mapping.
- `src/lib/orderTimeline.test.ts`: mapping tests.

### Existing files to modify

- `backend/prisma/schema.prisma`: relations and four formal models.
- `backend/prisma/seed.ts`: permissions only; no production simulation tags.
- `backend/scripts/seed-three-month-simulation.ts`: deterministic non-production profile tags.
- `backend/scripts/check-three-month-simulation.ts`: seed idempotency and coverage checks.
- `backend/src/app.ts`: mount two focused route modules.
- `backend/src/api/openapi.ts`: schemas and paths.
- `backend/src/constants/permissions.constants.ts`: review/detail/comment/tag permissions.
- `backend/src/repositories/backoffice.repository.ts`: created-time sort and detailed order read.
- `backend/src/repositories/booking.repository.ts`: actor-aware status history.
- `backend/src/services/backoffice.service.ts`: detailed order DTO and platform scope method.
- `backend/src/services/booking.service.ts`: shared timeline output and post-transition tag recalculation hook.
- `backend/src/routes/backoffice.routes.ts`: retain list routes; no duplicate detail route.
- `backend/tests/backoffice-repository-search.test.ts`: sort and lightweight-list assertions.
- `backend/tests/backoffice-api.test.ts`: permission fixture compatibility.
- `backend/tests/openapi.test.ts`: new path/schema assertions.
- `docs/backoffice-real-data.md`: final contract and acceptance evidence.
- `docs/order-state-machine.md`: review and timeline additions.
- `src/api/backofficeRealData.ts`: detail/comment/tag API types and methods.
- `src/api/backofficeRealData.test.ts`: endpoint and DTO tests.
- `src/features/booking/api.ts`: review submission and shared timeline types.
- `src/features/booking/api.test.ts`: review request test.
- `src/pages/admin/DataCenterPage.tsx`: created/booking time columns and shared drawer.
- `src/pages/admin/DataCenterPage.test.ts`: formal detail boundary assertions.
- `src/pages/admin/OrdersAdminPage.tsx`: created/booking time columns and shared drawer.
- `src/pages/admin/OrdersAdminPage.test.ts`: mutation preservation and shared drawer assertions.
- `src/pages/user/UserOrderDetailPage.tsx`: formal review submission and shared timeline semantics.
- `src/pages/user/UserOrderDetailPage.test.ts`: review/timeline source assertions.
- `src/i18n/translations.ts`: all new visible strings.

---

### Task 1: Make New Orders Visible by Creation Time

**Files:**
- Modify: `backend/tests/backoffice-repository-search.test.ts`
- Modify: `backend/src/repositories/backoffice.repository.ts:listOrders`
- Modify: `src/pages/admin/DataCenterPage.test.ts`
- Modify: `src/pages/admin/OrdersAdminPage.test.ts`
- Modify: `src/pages/admin/DataCenterPage.tsx:columnsFor`
- Modify: `src/pages/admin/OrdersAdminPage.tsx:DataTable columns`

**Interfaces:**
- Consumes: existing `BackofficeOrderPayload.createdAt`, `startsAt`, and `endsAt`.
- Produces: lists ordered by `{ createdAt: "desc" }, { id: "desc" }`, with separate `下单时间` and `预约时间` columns.

- [ ] **Step 1: Write the failing backend sort test**

Add this assertion after `repository.listOrders(query)`:

```ts
expect(client.bookingOrder.findMany).toHaveBeenCalledWith(
  expect.objectContaining({
    orderBy: [{ createdAt: "desc" }, { id: "desc" }]
  })
);
```

- [ ] **Step 2: Run the focused test and verify the expected failure**

Run: `npm test -- --runInBand tests/backoffice-repository-search.test.ts` in `backend/`  
Expected: FAIL because `listOrders` still uses `startsAt`.

- [ ] **Step 3: Change only the list ordering**

In `BackofficeRepository.listOrders`, replace the existing `orderBy` with:

```ts
orderBy: [{ createdAt: "desc" }, { id: "desc" }]
```

Do not change the date filter; `from/to` continues to filter appointment time until a separately specified filter contract exists.

- [ ] **Step 4: Run the focused backend test**

Run: `npm test -- --runInBand tests/backoffice-repository-search.test.ts` in `backend/`  
Expected: PASS.

- [ ] **Step 5: Write failing frontend source-contract tests**

Add to both admin page tests:

```ts
expect(source).toContain('title: "下单时间"');
expect(source).toContain('title: "预约时间"');
expect(source).toContain("createdAt");
expect(source).toContain("startsAt");
```

- [ ] **Step 6: Run the focused frontend tests and verify failure**

Run: `npm test -- src/pages/admin/DataCenterPage.test.ts src/pages/admin/OrdersAdminPage.test.ts`  
Expected: FAIL because Data Center has no time columns and Order Center labels only appointment time.

- [ ] **Step 7: Add both columns with one formatting helper**

Use a local helper temporarily; Task 6 will move it into the shared drawer module:

```ts
function formatOrderDateTime(value: string) {
  return new Intl.DateTimeFormat("ja-JP", {
    dateStyle: "medium",
    timeStyle: "medium"
  }).format(new Date(value));
}
```

Render `createdAt` as `下单时间` and `startsAt` as `预约时间` in both tables.

- [ ] **Step 8: Run focused tests, frontend lint, and backend lint**

Run: `npm test -- src/pages/admin/DataCenterPage.test.ts src/pages/admin/OrdersAdminPage.test.ts`  
Expected: PASS.  
Run: `npm run lint`  
Expected: PASS.  
Run: `npm run lint` in `backend/`  
Expected: PASS.

- [ ] **Step 9: Commit Task 1 only**

```bash
git add backend/tests/backoffice-repository-search.test.ts backend/src/repositories/backoffice.repository.ts src/pages/admin/DataCenterPage.test.ts src/pages/admin/OrdersAdminPage.test.ts src/pages/admin/DataCenterPage.tsx src/pages/admin/OrdersAdminPage.tsx
git commit -m "fix: show newest backoffice orders first"
```

### Task 2: Add Formal Review, Tag, and Timeline-Comment Tables

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Create: `backend/prisma/migrations/20260825190000_order_reviews_backoffice_tags/migration.sql`
- Modify: `backend/tests/user-management-seed.test.ts`

**Interfaces:**
- Produces Prisma models `OrderReview`, `OrderReviewTag`, `BackofficeProfileTag`, and `OrderTimelineComment`.
- Produces enums `OrderReviewTargetType`, `BackofficeTagSentiment`, and `BackofficeTagSource`.

- [ ] **Step 1: Write failing schema contract assertions**

In `backend/tests/user-management-seed.test.ts`, read `schema.prisma` and assert:

```ts
expect(schema).toContain("model OrderReview {");
expect(schema).toContain("model OrderReviewTag {");
expect(schema).toContain("model BackofficeProfileTag {");
expect(schema).toContain("model OrderTimelineComment {");
expect(schema).toContain("@@map(\"order_reviews\")");
expect(schema).toContain("@@map(\"backoffice_profile_tags\")");
```

- [ ] **Step 2: Run the schema test and verify failure**

Run: `npm test -- --runInBand tests/user-management-seed.test.ts` in `backend/`  
Expected: FAIL because the four models do not exist.

- [ ] **Step 3: Add Prisma enums and models**

Use these exact enum values:

```prisma
enum OrderReviewTargetType {
  CUSTOMER   @map("customer")
  TECHNICIAN @map("technician")
}

enum BackofficeTagSentiment {
  POSITIVE @map("positive")
  NEGATIVE @map("negative")
}

enum BackofficeTagSource {
  SYSTEM          @map("system")
  MANUAL          @map("manual")
  SIMULATION_SEED @map("simulation_seed")
}
```

Add the fields defined in the approved design, foreign keys to `BookingOrder`, `User`, `CustomerProfile`, and `TechnicianProfile`, soft-delete indexes, and these uniqueness constraints:

```prisma
@@unique([bookingOrderId, reviewerUserId, targetType])
@@unique([orderReviewId, label])
```

Add relation arrays to the four existing parent models without reformatting unrelated schema blocks.

- [ ] **Step 4: Generate and inspect the migration**

Run: `npx prisma format` in `backend/`  
Expected: schema formats successfully.  
Run: `ENV_FILE=.env.dev npx prisma migrate dev --name order_reviews_backoffice_tags` in `backend/`  
Expected: one migration creates exactly four tables, three enums, foreign keys, and indexes.

If the generated timestamp differs, keep Prisma's generated directory name and update this plan's recorded path in the completion note; do not rename an applied migration.

- [ ] **Step 5: Generate Prisma client and run the schema test**

Run: `npm run prisma:generate` in `backend/`  
Expected: PASS.  
Run: `npm test -- --runInBand tests/user-management-seed.test.ts` in `backend/`  
Expected: PASS.

- [ ] **Step 6: Commit Task 2 only**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations backend/tests/user-management-seed.test.ts
git commit -m "feat: add formal order review and profile tag schema"
```

### Task 3: Implement Bidirectional Order Reviews

**Files:**
- Create: `backend/src/repositories/order-review.repository.ts`
- Create: `backend/src/services/order-review.service.ts`
- Create: `backend/src/controllers/order-review.controller.ts`
- Create: `backend/src/routes/order-review.routes.ts`
- Create: `backend/src/validators/order-review.validator.ts`
- Create: `backend/tests/order-review-service.test.ts`
- Create: `backend/tests/order-review-api.test.ts`
- Modify: `backend/src/app.ts`
- Modify: `backend/src/api/openapi.ts`
- Modify: `backend/src/constants/permissions.constants.ts`
- Modify: `backend/prisma/seed.ts`
- Modify: `backend/tests/openapi.test.ts`

**Interfaces:**
- Consumes: authenticated identity and completed `BookingOrder` participants.
- Produces: `POST /api/v1/orders/:id/reviews` and `OrderReviewPayload`.
- Produces repository method `createReview(input: CreateOrderReviewRepositoryInput): Promise<OrderReviewPayload>`.

- [ ] **Step 1: Write failing service tests for both directions**

Cover these exact cases with mocked repository ports:

```ts
await service.createReview(customerActor, 41, { rating: 5, comment: "专业", tags: ["准时"] });
expect(repository.createReview).toHaveBeenCalledWith(expect.objectContaining({
  reviewerUserId: customerActor.userId,
  targetType: "technician",
  technicianProfileId: 17
}));

await service.createReview(technicianActor, 41, { rating: 4, comment: "沟通顺畅", tags: ["准时到达"] });
expect(repository.createReview).toHaveBeenCalledWith(expect.objectContaining({
  reviewerUserId: technicianActor.userId,
  targetType: "customer",
  customerProfileId: 23
}));
```

Also assert rejection for non-completed orders, non-participants, unassigned technician, duplicate review, rating outside 1–5, more than 8 tags, and a tag absent from the target catalog.

- [ ] **Step 2: Run service tests and verify failure**

Run: `npm test -- --runInBand tests/order-review-service.test.ts` in `backend/`  
Expected: FAIL because `OrderReviewService` does not exist.

- [ ] **Step 3: Implement validators and service contracts**

Use:

```ts
export const orderReviewBodySchema = z.object({
  rating: z.number().int().min(1).max(5),
  comment: z.string().trim().max(2000).nullable().optional(),
  tags: z.array(z.string().trim().min(1).max(40)).max(8).default([])
});
```

Normalize tags with `Array.from(new Set(tags.map(tag => tag.trim())))`. The service derives the target from the authenticated order participant; it never accepts target IDs from the client.

- [ ] **Step 4: Implement repository transaction**

Inside one Prisma transaction:

1. Re-read the completed, undeleted order and participants.
2. Create `OrderReview` and nested `OrderReviewTag` rows.
3. Aggregate all undeleted reviews for the selected target.
4. Upsert `ReviewSummary` with average, count, latest time, and the most frequent labels.

Map Prisma unique conflicts to `error.order.review_already_submitted` with HTTP 409.

- [ ] **Step 5: Run service tests**

Run: `npm test -- --runInBand tests/order-review-service.test.ts` in `backend/`  
Expected: PASS.

- [ ] **Step 6: Write failing API and OpenAPI tests**

Assert:

```ts
await request(app)
  .post("/api/v1/orders/41/reviews")
  .set("Authorization", `Bearer ${customerToken}`)
  .send({ rating: 5, comment: "专业", tags: ["准时"] })
  .expect(201);

expect(openapi.body.paths).toHaveProperty("/api/v1/orders/{id}/reviews");
expect(openapi.body.components.schemas).toHaveProperty("OrderReview");
```

- [ ] **Step 7: Mount route, permission, controller, and OpenAPI contract**

Add permission code `order:review` to customer and technician system roles. Route order:

```ts
router.post(
  "/orders/:id/reviews",
  authenticate(),
  authorize("order:review"),
  validateRequest({ params: orderIdParamSchema, body: orderReviewBodySchema }),
  controller.create
);
```

- [ ] **Step 8: Run focused API, permission, OpenAPI, lint, and build checks**

Run: `npm test -- --runInBand tests/order-review-api.test.ts tests/openapi.test.ts tests/user-management-seed.test.ts` in `backend/`  
Expected: PASS.  
Run: `npm run lint` in `backend/`  
Expected: PASS.  
Run: `npm run build` in `backend/`  
Expected: PASS.

- [ ] **Step 9: Commit Task 3 only**

```bash
git add backend/src backend/tests backend/prisma/seed.ts
git commit -m "feat: persist bidirectional order reviews"
```

### Task 4: Implement Automatic and Manual Backoffice Tags

**Files:**
- Create: `backend/src/constants/backoffice-profile-tags.constants.ts`
- Create: `backend/src/repositories/backoffice-profile-tag.repository.ts`
- Create: `backend/src/services/backoffice-profile-tag.service.ts`
- Create: `backend/tests/backoffice-profile-tag-service.test.ts`
- Modify: `backend/src/constants/permissions.constants.ts`
- Modify: `backend/src/services/booking.service.ts`
- Modify: `backend/src/services/order-review.service.ts`
- Modify: `backend/src/routes/booking.routes.ts`
- Modify: `backend/src/routes/order-review.routes.ts`
- Modify: `backend/prisma/seed.ts`
- Modify: `backend/scripts/seed-three-month-simulation.ts`
- Modify: `backend/scripts/check-three-month-simulation.ts`

**Interfaces:**
- Consumes: completed/cancelled orders, payment timestamps, order reviews, and status-history actors.
- Produces: `recalculateCustomer(customerProfileId, now)` and `recalculateTechnician(technicianProfileId, now)`.
- Produces: `addManualTag(actor, target, input)` and `removeManualTag(actor, tagId)`.

- [ ] **Step 1: Write failing boundary tests for version 1 rules**

Use a fixed `now = 2026-08-25T00:00:00.000Z` and assert both sides of every approved threshold:

```ts
expect(evaluateCustomerTags({ completedPaidJpy: 100_000, completedCount: 6, reviewRate: 0.7, finalCount: 5, cancelRate: 0.3, confirmedPaymentCount: 3, averagePaymentDelayHours: 49 })).toEqual(
  expect.arrayContaining(["high_spend", "high_frequency", "active_reviewer", "high_cancel_rate", "slow_payment"])
);
```

Assert `99_999`, `5`, `0.699`, `0.299`, and `48` do not activate their corresponding tags. Add technician tests for `high_rating`, `high_completion`, and `high_self_cancel_rate`.

- [ ] **Step 2: Run the rule tests and verify failure**

Run: `npm test -- --runInBand tests/backoffice-profile-tag-service.test.ts` in `backend/`  
Expected: FAIL because the evaluator does not exist.

- [ ] **Step 3: Implement pure evaluators and metadata**

Export:

```ts
export const BACKOFFICE_TAG_RULE_VERSION = "backoffice-profile-tags-v1";
export type BackofficeTagCode =
  | "high_spend" | "high_frequency" | "active_reviewer"
  | "high_cancel_rate" | "slow_payment"
  | "high_rating" | "high_completion" | "high_self_cancel_rate"
  | "proactive_communication" | "poor_attitude";
```

Keep `proactive_communication` and `poor_attitude` out of automatic evaluators.

- [ ] **Step 4: Implement idempotent persistence and manual rules**

System recalculation activates current matching tags and deactivates no-longer-matching `system` rows. Manual mutations require `backoffice:profile-tags:write`; negative input requires non-empty `reason`; only `manual` rows can be removed by the endpoint. Both manual actions call `AuditLogService.record` with target type, target ID, label, sentiment, and reason.

- [ ] **Step 5: Run focused tag tests**

Run: `npm test -- --runInBand tests/backoffice-profile-tag-service.test.ts` in `backend/`  
Expected: PASS.

- [ ] **Step 6: Wire best-effort recalculation after formal mutations**

Export this port from the tag service module:

```ts
export interface ProfileTagRecalculationPort {
  recalculateCustomer(customerProfileId: number, now?: Date): Promise<void>;
  recalculateTechnician(technicianProfileId: number, now?: Date): Promise<void>;
}
```

Inject it into `BookingService` and `OrderReviewService`. After successful complete/cancel/payment/refund mutations, recalculate the order customer and assigned technician; after a review, recalculate the review target. Wrap only the recalculation call in `try/catch` and log with `backend/src/config/logger.ts`:

```ts
logger.error(
  { error, orderId: order.id, customerUserId: order.customerUserId, technicianProfileId: order.technicianProfileId },
  "Backoffice profile tag recalculation failed"
);
```

The already-committed order/payment/review result must still return successfully when tag recalculation fails. Add tests proving the mutation result is preserved and the error does not create a second transaction.

- [ ] **Step 7: Add deterministic simulation tags and failing checker assertions**

The simulation script must assign 2–4 tags to every simulation customer and technician using stable profile sequence modulo a fixed catalog. The checker asserts:

```ts
assert(customerProfilesWithTags === 100, "every simulation customer needs backoffice tags");
assert(technicianProfilesWithTags === 100, "every simulation technician needs backoffice tags");
assert(duplicateActiveTagCount === 0, "simulation tags must be idempotent");
```

All rows use `source = SIMULATION_SEED`; the existing local/test database guard stays intact.

- [ ] **Step 8: Run simulation plan tests without mutating a database**

Run: `npm test -- --runInBand tests/three-month-simulation-plan.test.ts tests/user-management-seed.test.ts` in `backend/`  
Expected: PASS.

- [ ] **Step 9: Run lint and build**

Run: `npm run lint` in `backend/`  
Expected: PASS.  
Run: `npm run build` in `backend/`  
Expected: PASS.

- [ ] **Step 10: Commit Task 4 only**

```bash
git add backend/src/constants/backoffice-profile-tags.constants.ts backend/src/repositories/backoffice-profile-tag.repository.ts backend/src/services/backoffice-profile-tag.service.ts backend/tests/backoffice-profile-tag-service.test.ts backend/src/constants/permissions.constants.ts backend/src/services/booking.service.ts backend/src/services/order-review.service.ts backend/src/routes/booking.routes.ts backend/src/routes/order-review.routes.ts backend/prisma/seed.ts backend/scripts/seed-three-month-simulation.ts backend/scripts/check-three-month-simulation.ts
git commit -m "feat: add audited backoffice profile tags"
```

### Task 5: Add Formal Backoffice Order Detail, Timeline, and Comments

**Files:**
- Create: `backend/src/services/order-timeline.service.ts`
- Create: `backend/src/repositories/order-timeline-comment.repository.ts`
- Create: `backend/src/controllers/backoffice-order-detail.controller.ts`
- Create: `backend/src/routes/backoffice-order-detail.routes.ts`
- Create: `backend/src/validators/backoffice-order-detail.validator.ts`
- Create: `backend/tests/backoffice-order-detail-api.test.ts`
- Modify: `backend/src/repositories/backoffice.repository.ts`
- Modify: `backend/src/repositories/booking.repository.ts`
- Modify: `backend/src/services/backoffice.service.ts`
- Modify: `backend/src/services/booking.service.ts`
- Modify: `backend/src/app.ts`
- Modify: `backend/src/api/openapi.ts`
- Modify: `backend/src/constants/permissions.constants.ts`
- Modify: `backend/prisma/seed.ts`
- Modify: `backend/tests/openapi.test.ts`
- Modify: `backend/tests/booking-api.test.ts`

**Interfaces:**
- Produces: `GET /api/v1/backoffice/orders/:id` returning `BackofficeOrderDetailPayload`.
- Produces: `POST /api/v1/backoffice/orders/:id/comments` returning `OrderTimelineEventPayload`.
- Produces: manual customer/technician tag POST/DELETE endpoints from the approved spec.
- Produces: `BookingOrderPayload.timeline` so formal user detail and backoffice detail share the same status-event assembler.
- Produces actor-scoped `reviewTags`: customer actors receive technician tags, technician actors receive customer tags, and merchant customer detail receives customer tags; no non-platform payload receives `backofficeTags`.

- [ ] **Step 1: Write failing detail assembler tests**

Build a fixture with creation, confirmation, and cancellation status rows and assert:

```ts
expect(buildOrderTimeline(source)).toEqual([
  expect.objectContaining({ kind: "status", actorRole: "预约创建", tone: "green" }),
  expect.objectContaining({ kind: "status", actorRole: "服务方接单", tone: "green" }),
  expect.objectContaining({ kind: "status", actorRole: "预约取消", tone: "red" })
]);
```

Assert events are ordered by `createdAt`, actor avatar/name are preserved, and backoffice comments merge without appearing in the user-visible subset.

- [ ] **Step 2: Run the detail test and verify failure**

Run: `npm test -- --runInBand tests/backoffice-order-detail-api.test.ts` in `backend/`  
Expected: FAIL because the route and assembler do not exist.

- [ ] **Step 3: Implement one scoped repository read**

Add:

```ts
getOrderDetail(input: { scope: "platform"; id: number }): Promise<BackofficeOrderDetailPayload | null>;
```

The Prisma query must select/include order, customer account/profile/media/review summary/reviews/tags, technician account/profile/shop/media/review summary/reviews/tags, status-history actors, and timeline comments in one bounded graph. It must filter the order and every soft-deletable relation by `deletedAt: null` and must never select `passwordHash`.

- [ ] **Step 4: Implement timeline mapping and platform service method**

Map status results exactly as approved:

```ts
const roleByStatus = {
  pending: "预约创建",
  confirmed: "服务方接单",
  inService: "服务开始",
  completed: "服务完成",
  cancelled: "预约取消"
} as const;
```

`BackofficeService.getPlatformOrderDetail` records a read audit event and throws `error.order.not_found` with 404 when the repository returns null. Extend `BookingRepository.orderInclude()` so every status history selects its actor's `username`, `avatarUrl`, and active identity display name; add these actor snapshots to `OrderStatusHistoryPayload`. `BookingService.getOrder` and backoffice detail both call `buildOrderTimeline`, while only backoffice merges `OrderTimelineComment` rows.

Apply the confirmed review-tag visibility in the service DTO layer:

```ts
if (actor.scope === "customer") detail.technician.reviewTags = technicianReviewTags;
if (actor.scope === "technician") detail.customer.reviewTags = customerReviewTags;
```

Extend the existing platform/merchant customer-detail mapper so both authorized platform staff and the scoped merchant receive customer `reviewTags`. Merchant scope must still prove at least one undeleted booking at the current shop. Never reuse this branch for `backofficeTags`.

- [ ] **Step 5: Implement comment and manual-tag endpoints**

Use:

```ts
export const orderTimelineCommentBodySchema = z.object({
  body: z.string().trim().min(1).max(2000)
});

export const manualBackofficeTagBodySchema = z.object({
  label: z.string().trim().min(1).max(40),
  sentiment: z.enum(["positive", "negative"]),
  reason: z.string().trim().max(500).optional()
}).superRefine((value, context) => {
  if (value.sentiment === "negative" && !value.reason) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["reason"], message: "reason is required" });
  }
});
```

Wire permissions `backoffice:orders:read`, `backoffice:orders:comment`, and `backoffice:profile-tags:write`.

- [ ] **Step 6: Add API tests for RBAC, comments, and privacy**

Assert platform admin gets 200, a user without detail permission gets 403, a missing ID gets 404, a saved comment survives a second GET, negative manual tags without reason gets 400, and no merchant/customer/technician endpoint response contains `backofficeTags`. Extend `backend/tests/booking-api.test.ts` to assert `GET /api/v1/orders/:id` returns the same status-event roles and tones as the backoffice detail, without backoffice comments; also assert a customer sees technician `reviewTags`, a technician sees customer `reviewTags`, and neither sees the opposite participant's private account fields. Extend the existing backoffice customer API test to prove a scoped merchant receives customer `reviewTags` only for a customer with a booking at that shop.

- [ ] **Step 7: Add OpenAPI schemas and paths**

Assert these paths exist:

```ts
expect(paths).toHaveProperty("/api/v1/backoffice/orders/{id}");
expect(paths).toHaveProperty("/api/v1/backoffice/orders/{id}/comments");
expect(paths).toHaveProperty("/api/v1/backoffice/customers/{id}/tags");
expect(paths).toHaveProperty("/api/v1/backoffice/technicians/{id}/tags");
```

- [ ] **Step 8: Run focused backend verification**

Run: `npm test -- --runInBand tests/backoffice-order-detail-api.test.ts tests/backoffice-api.test.ts tests/openapi.test.ts` in `backend/`  
Expected: PASS.  
Run: `npm run lint` in `backend/`  
Expected: PASS.  
Run: `npm run build` in `backend/`  
Expected: PASS.

- [ ] **Step 9: Commit Task 5 only**

```bash
git add backend/src backend/tests backend/prisma/seed.ts
git commit -m "feat: add formal backoffice order detail"
```

### Task 6: Build the Shared Backoffice Order Detail Drawer

**Files:**
- Create: `src/components/admin/BackofficeOrderDetailDrawer.tsx`
- Create: `src/components/admin/BackofficeOrderDetailDrawer.test.tsx`
- Create: `src/lib/orderTimeline.ts`
- Create: `src/lib/orderTimeline.test.ts`
- Modify: `src/api/backofficeRealData.ts`
- Modify: `src/api/backofficeRealData.test.ts`
- Modify: `src/i18n/translations.ts`

**Interfaces:**
- Consumes: `BackofficeOrderDetailPayload` and `OrderTimelineEventPayload`.
- Produces: `<BackofficeOrderDetailDrawer orderId open onClose />`.
- Produces API methods `orderDetail`, `addOrderComment`, `addCustomerTag`, `removeCustomerTag`, `addTechnicianTag`, and `removeTechnicianTag`.

- [ ] **Step 1: Write failing API adapter tests**

```ts
await backofficeRealDataApi.orderDetail(41);
expect(httpClient.request).toHaveBeenCalledWith("/backoffice/orders/41");

await backofficeRealDataApi.addOrderComment(41, "已电话复核");
expect(httpClient.request).toHaveBeenCalledWith("/backoffice/orders/41/comments", {
  body: { body: "已电话复核" },
  method: "POST"
});
```

- [ ] **Step 2: Run adapter tests and verify failure**

Run: `npm test -- src/api/backofficeRealData.test.ts`  
Expected: FAIL because the methods and types do not exist.

- [ ] **Step 3: Add exact frontend DTOs and adapter methods**

Define `BackofficeOrderDetailPayload`, `BackofficeOrderParticipantPayload`, `BackofficeReviewPayload`, `BackofficeProfileTagPayload`, and `OrderTimelineEventPayload` using the server's camelCase names. Do not derive participant details from list rows.

- [ ] **Step 4: Write failing timeline mapper tests**

```ts
expect(mapOrderTimelineEvent(event)).toEqual(expect.objectContaining({
  actorName: "林 小雨",
  actorRole: "预约创建",
  atLabel: "2026-08-25T08:51:00.000Z",
  tone: "green"
}));
```

Assert cancelled events map to red and avatar URLs pass through.

- [ ] **Step 5: Implement the mapper and drawer**

The drawer must:

1. Fetch detail only when `open && orderId !== null`.
2. Show loading, retryable error, and missing-technician states.
3. Render the order summary with both created and appointment times.
4. Render `ContactEventTimelinePanel` with server events and `onCommentSubmit` calling the formal comment endpoint.
5. Render customer and technician cards with review summaries, `reviewTags`, and green/red `backofficeTags` marked `仅后台可见`.
6. Expose manual tag add/remove controls only through callback props or the protected adapter.
7. Never append a comment locally before the server succeeds.

- [ ] **Step 6: Add component contract tests**

Use mocked adapter responses to assert loading, retry, actor avatars, the persisted comment call, positive/negative Badge tones, no `contactTags` field, and stacked profile cards under a narrow container class.

- [ ] **Step 7: Add all visible strings to localization**

Add entries for `下单时间`, `预约时间`, `订单时间线`, `预约客人`, `预约技师`, `仅后台可见`, `系统标签`, `人工标签`, `重新加载订单详情`, and mutation error messages in `zh-Hant`, `ja`, `en`, and `ko`.

- [ ] **Step 8: Run focused frontend verification**

Run: `npm test -- src/api/backofficeRealData.test.ts src/lib/orderTimeline.test.ts src/components/admin/BackofficeOrderDetailDrawer.test.tsx`  
Expected: PASS.  
Run: `npm run lint`  
Expected: PASS.

- [ ] **Step 9: Commit Task 6 only**

```bash
git add src/api/backofficeRealData.ts src/api/backofficeRealData.test.ts src/lib/orderTimeline.ts src/lib/orderTimeline.test.ts src/components/admin/BackofficeOrderDetailDrawer.tsx src/components/admin/BackofficeOrderDetailDrawer.test.tsx src/i18n/translations.ts
git commit -m "feat: add shared backoffice order detail drawer"
```

### Task 7: Integrate Both Admin Lists and Formal Review Submission

**Files:**
- Modify: `src/pages/admin/DataCenterPage.tsx`
- Modify: `src/pages/admin/DataCenterPage.test.ts`
- Modify: `src/pages/admin/OrdersAdminPage.tsx`
- Modify: `src/pages/admin/OrdersAdminPage.test.ts`
- Modify: `src/features/booking/api.ts`
- Modify: `src/features/booking/api.test.ts`
- Modify: `src/pages/user/UserOrderDetailPage.tsx`
- Modify: `src/pages/user/UserOrderDetailPage.test.ts`

**Interfaces:**
- Consumes: shared drawer and `bookingApi.submitReview`.
- Produces: both admin tables open the same server-backed drawer; formal completed orders submit reviews to the backend.

- [ ] **Step 1: Write failing admin integration tests**

Assert both pages import and render the shared component:

```ts
expect(source).toContain('import { BackofficeOrderDetailDrawer }');
expect(source).toContain("<BackofficeOrderDetailDrawer");
expect(source).not.toContain("Object.entries(selected).slice(0, 16)");
```

- [ ] **Step 2: Run admin tests and verify failure**

Run: `npm test -- src/pages/admin/DataCenterPage.test.ts src/pages/admin/OrdersAdminPage.test.ts`  
Expected: FAIL because both pages still own separate details.

- [ ] **Step 3: Replace both detail implementations**

Store only `selectedOrderId: number | null` for detail selection. Keep Order Center's state and payment mutation controls by passing them as a drawer action section or by rendering the existing controls beneath the shared summary; do not remove any implemented confirm/start/complete/cancel/payment/refund action.

- [ ] **Step 4: Write failing booking review adapter test**

```ts
await bookingApi.submitReview(41, { rating: 5, comment: "专业", tags: ["准时"] });
expect(httpClient.request).toHaveBeenCalledWith("/orders/41/reviews", {
  body: { rating: 5, comment: "专业", tags: ["准时"] },
  method: "POST"
});
```

- [ ] **Step 5: Implement `bookingApi.submitReview` and formal page submission**

For numeric formal orders, the existing review UI calls the formal endpoint. Legacy nonnumeric demo orders retain the existing local session behavior. On API failure, show the error and do not mark the review as submitted locally.

- [ ] **Step 6: Use the shared timeline mapper on the formal user detail**

Replace ad hoc `用户 #id` mapping for formal orders with server timeline events. Keep legacy order detail behavior unchanged.

- [ ] **Step 7: Run focused frontend tests**

Run: `npm test -- src/pages/admin/DataCenterPage.test.ts src/pages/admin/OrdersAdminPage.test.ts src/features/booking/api.test.ts src/pages/user/UserOrderDetailPage.test.ts`  
Expected: PASS.  
Run: `npm run lint`  
Expected: PASS.  
Run: `npm run build`  
Expected: PASS.

- [ ] **Step 8: Commit Task 7 only**

```bash
git add src/pages/admin/DataCenterPage.tsx src/pages/admin/DataCenterPage.test.ts src/pages/admin/OrdersAdminPage.tsx src/pages/admin/OrdersAdminPage.test.ts src/features/booking/api.ts src/features/booking/api.test.ts src/pages/user/UserOrderDetailPage.tsx src/pages/user/UserOrderDetailPage.test.ts
git commit -m "feat: connect formal order detail and reviews"
```

### Task 8: Documentation, Full Verification, and Real UI Acceptance

**Files:**
- Modify: `docs/backoffice-real-data.md`
- Modify: `docs/order-state-machine.md`

**Interfaces:**
- Consumes: all prior tasks.
- Produces: acceptance evidence and explicit remaining boundaries.

- [ ] **Step 1: Update the two formal development documents**

Record exact models, migration directory, endpoints, permissions, tag thresholds, privacy rules, test commands, and the explicit exclusion of local address-book tags. State that `OrderReview` is the fact source and `ReviewSummary` is derived.

- [ ] **Step 2: Run prohibited-pattern and migration checks**

Run:

```bash
rg -n "TODO|FIXME|not implemented|fake API|contactTags" backend/src src/components/admin/BackofficeOrderDetailDrawer.tsx src/api/backofficeRealData.ts
```

Expected: no prohibited implementation placeholders and no address-book tag contract.  
Run: `npx prisma validate` in `backend/`  
Expected: PASS.  
Run: `npx prisma migrate status` in `backend/` with `ENV_FILE=.env.dev` loaded by the project's established command pattern.  
Expected: database schema is up to date.

- [ ] **Step 3: Run the full backend suite**

Run: `npm run lint` in `backend/`  
Expected: PASS.  
Run: `npm test` in `backend/`  
Expected: all backend suites PASS.  
Run: `npm run build` in `backend/`  
Expected: PASS.

- [ ] **Step 4: Run the full frontend suite**

Run: `npm run lint`  
Expected: PASS.  
Run: `npm test`  
Expected: all frontend suites PASS.  
Run: `npm run build`  
Expected: PASS.  
Run: `npm run i18n:audit`  
Expected: PASS or only pre-existing findings documented separately.

- [ ] **Step 5: Run local-only simulation checks**

Run: `ENV_FILE=.env.dev npm run seed:simulation` in `backend/` only after confirming the environment guard identifies a local non-production database.  
Expected: seed completes and reports 100 customers and 100 technicians.  
Run: `ENV_FILE=.env.dev npm run check:simulation-data` in `backend/`  
Expected: every simulation profile has 2–4 active simulation tags and no duplicates.

- [ ] **Step 6: Perform real booking acceptance**

Create one formal booking through the actual frontend. Record its `ND...` order number. Verify:

1. It is the first matching row in Data Center and Order Center.
2. `下单时间` equals the creation time and `预约时间` equals the selected slot.
3. Both pages open the same formal detail.
4. The timeline shows the creation actor and status nodes in chronological order.
5. A backoffice comment persists after closing and reopening.
6. A completed-order customer review appears on the technician side; a technician review appears on the customer side.
7. `backofficeTags` appear only in platform backoffice responses.

- [ ] **Step 7: Perform visual QA**

Open the real route in the in-app Browser at the default desktop viewport and around 390px width. Confirm node line continuity, real avatars, rounded bubbles, green normal nodes, red cancellation nodes, circular comment marker, stacked narrow cards, green/red backoffice tags, and no horizontal overflow.

- [ ] **Step 8: Commit documentation and evidence**

```bash
git add docs/backoffice-real-data.md docs/order-state-machine.md
git commit -m "docs: record formal order detail acceptance"
```

## Completion Criteria

- A newly created formal booking is visible on the first backoffice page without search.
- Both admin lists show distinct order-created and appointment times.
- Data Center and Order Center share one formal detail drawer.
- Timeline status nodes use the same event semantics as the formal user detail and backoffice comments persist.
- Users review technicians and technicians review users only through completed orders.
- User review tags are visible to scoped technicians, scoped shops, and backoffice; backoffice behavior tags remain platform-only.
- System tags are deterministic and evidence-backed; subjective negative tags require a manual reason and audit log.
- Local address-book personal tags are absent from the new schema and API contracts.
- Migration, lint, test, build, i18n, local seed checks, desktop QA, and narrow-width QA all pass.
