# Membership / Rankings Task 3 — Formal deterministic ranking backend

## Objective

Implement the complete backend slice for the operations-dashboard service, technician and customer rankings. The default first page is the requested TOP10 and operators can switch the primary sort between completed-checkout GMV and completed-order count. This brief supersedes the backend ambiguities in Tasks 3 and 4 of `docs/superpowers/plans/2026-09-01-membership-and-rankings.md`; it does not authorize frontend ranking panels or Membership Task 4+ work.

Rankings are derived only from formal completed checkout evidence. They never use `BookingOrder.endsAt`, claimed cash receipts, `OrderFinancial.serviceAmountJpy`, legacy manual completion, mock data or the existing technician-ranking SQL as completion authority.

## Authorized files

- Modify `backend/prisma/schema.prisma`
- Create `backend/prisma/migrations/20260901120000_analytics_ranking_identity_permission/migration.sql`
- Create `backend/src/domain/analytics-ranking.ts`
- Create `backend/src/repositories/analytics-ranking.repository.ts`
- Create `backend/src/services/analytics-ranking.service.ts`
- Create `backend/src/controllers/analytics-ranking.controller.ts`
- Create `backend/src/validators/analytics-ranking.validator.ts`
- Create `backend/src/routes/analytics-ranking.routes.ts`
- Modify `backend/src/app.ts`
- Modify `backend/src/constants/permissions.constants.ts`
- Modify `backend/src/constants/error-codes.ts`
- Modify `backend/src/api/openapi.ts`
- Create `backend/tests/analytics-ranking-schema.test.ts`
- Create `backend/tests/analytics-ranking.repository.test.ts`
- Create `backend/tests/analytics-ranking.repository.integration.test.ts`
- Create `backend/tests/analytics-ranking-integration-safety.ts`
- Create `backend/tests/analytics-ranking-integration-safety.test.ts`
- Create `backend/tests/analytics-ranking.service.test.ts`
- Create `backend/tests/analytics-ranking-api.test.ts`
- Create `backend/tests/analytics-ranking-openapi.test.ts`

Do not modify old migrations, booking/checkout writers, the existing technician-ranking implementation, membership analytics, dashboard metric readers, frontend, seeds, scripts or shared databases. Task2A/Task2B changes already present in the worktree belong to their owners and must be preserved.

## Formal identity migration

`Service` already has a formal UUID `publicId`; `TechnicianService` does not. Add:

```prisma
publicId String @unique(map: "technician_services_public_id_key") @default(uuid()) @map("public_id") @db.Char(36)
```

The new forward migration must add `technician_services.public_id` as nullable, assign a real UUID to every existing row using MySQL `UUID()` only where it is null, make the column `CHAR(36) NOT NULL`, then create the exact unique index `technician_services_public_id_key`. New Prisma creates use `@default(uuid())`. Do not derive an ID from the numeric primary key, concatenate a type prefix, reuse a technician/user ID, or collapse a technician service into `sourceShopServiceId`; every shop service and technician service remains its own ranking entity.

The same migration creates permission `backoffice:analytics-ranking:read` and grants it only to non-deleted `admin` and `operator` roles; `Role` has no active-status column. Use idempotent permission/role-permission inserts without modifying unrelated grants. The migration remains unapplied to the shared database.

## Domain contracts

```ts
export type RankingKind = "service" | "technician" | "customer";
export type RankingMetric = "gmv" | "completedCount";
export type RankingEntityType =
  | "service"
  | "technician_service"
  | "technician"
  | "customer";

export interface AnalyticsRankingInput {
  kind: RankingKind;
  metric: RankingMetric;
  window: DashboardWindow;
  evaluatedAt: Date;
  city: string | null;
  categoryId: number | null;
  page: number;
  pageSize: number;
}

export interface AnalyticsRankingItem {
  rank: number;
  entityType: RankingEntityType;
  entityPublicId: string;
  entityNumericId: number;
  displayName: string;
  avatarUrl: string | null;
  categoryId: number | null;
  gmvJpy: number;
  completedCount: number;
  registeredAt: string;
}

export interface AnalyticsRankingPage {
  list: AnalyticsRankingItem[];
  total: number;
  page: number;
  page_size: number;
}

export interface AnalyticsRankingResponse extends AnalyticsRankingPage {
  dataStatus: "ready";
  filter: {
    kind: RankingKind;
    metric: RankingMetric;
    period: DashboardPeriod;
    from: string;
    to: string;
    timeZone: "Asia/Tokyo";
    city: string | null;
    categoryId: number | null;
    evaluatedAt: string;
  };
}
```

`AnalyticsRankingRepository.listRankings(input)` returns `Promise<AnalyticsRankingPage>`. It performs bounded SQL aggregation with no N+1 queries and never invokes the existing `BackofficeRepository.listTechnicianRankings` method.

## Formal completed-checkout authority

Capture `evaluatedAt` once in the service, resolve the existing dashboard window with `resolveDashboardWindow(query, evaluatedAt)`, and pass the same timestamp/window to the repository and response. An otherwise in-scope candidate is a non-deleted booking whose `paymentConfirmedAt` is inside `[window.fromInclusive, window.toExclusive)`. Time attribution uses only `paymentConfirmedAt`.

A candidate contributes only when all of the following are coherent:

1. Booking is non-deleted, `status = completed`, `payment_status = confirmed`, has non-null confirmation actor/time, and every refund field (`payment_refunded_at`, actor, reference and reason) is null. `refund_pending`, `refunded`, cancelled, incomplete and any row with refund residue do not contribute.
2. Exactly one non-deleted checkout belongs to the booking. Booking `payment_method`, `payment_amount_jpy`, confirmation actor/time/reference/note and checkout evidence agree exactly.
3. Checkout base/add-on/discount/total/payable values are non-negative signed-INT integers and `base + addOn - discount = checkoutAmount = booking.paymentAmountJpy` without overflow. Base minus discount must also be non-negative.
4. Checkout has a non-null selected method/time and `paymentSelectedAt <= paymentConfirmedAt`.
5. For NDP, the checkout has exactly its one non-deleted applied `BOOKING_COMPLETE_SETTLEMENT` ledger transaction in currency `NDP`, reference type `order_checkout_payment`, reference ID equal to checkout ID, amount equal to `payableNdp`, actor equal to booking confirmation actor, and creation time between selection and confirmation. Booking reference is exactly `checkout:{checkoutId}:ledger:{ledgerId}`, booking note and all receipt fields are null. Exactly one non-deleted `NDP_PAYMENT_APPLIED` event links the same order/session/checkout and actor, has reason `checkout_ndp_payment_applied`, and has exact metadata `{ paymentEvidence: "ndp_ledger", ledgerTransactionId }` for that ledger.
6. For cash/other, no checkout ledger is present. Receipt actor/time/reason are non-null, trimmed reason is visible, receipt time is between selection and booking confirmation, and booking actor/note equal the receipt actor/reason. Reference is exactly `checkout:{checkoutId}:technician-receipt` or `checkout:{checkoutId}:operations-receipt`. Cash has null other-method fields; other has visible bounded method code/label. Exactly one non-deleted `RECEIPT_CONFIRMED` event links the same order/session/checkout, actor and reason and has exact metadata `{ paymentEvidence, reason }`. Technician evidence requires the exact assigned technician user and `paymentEvidence = "technician_receipt_confirmation"`. Operations evidence requires `paymentEvidence = "operations_receipt_override"` plus exactly one non-deleted audit row whose actor is the receipt actor, action is `backoffice.order.checkout.receipt_override`, target type/ID are `BookingOrder`/booking ID, and whose metadata exactly cross-checks `orderId`, `checkoutId`, `selectedMethod`, `checkoutAmountJpy` and trimmed reason.
7. Payment/receipt events occur no earlier than selection and no later than booking confirmation. A formal ended, non-deleted service session exists for the order and `endedAt <= paymentConfirmedAt`.
8. The booking shop exists and is non-deleted. Every candidate, regardless of ranking kind, resolves an active, non-test, non-deleted customer user and the booking's exact non-deleted assigned `TechnicianProfile` with its active, non-test, non-deleted owning user. A missing/mismatched assigned technician on an otherwise formally completed order is corrupt evidence, not an anonymous service/customer contribution.

These rules are the ranking copy of the accepted Task1 membership-utilizer predicate plus the Task5 stored event/audit evidence. Do not weaken them to the legacy technician-ranking predicate. If a completed/confirmed candidate within the requested time/city scope has missing, duplicate or contradictory formal evidence, the relevant ranking request fails as a whole with HTTP 409, code `ANALYTICS_RANKING_INCOMPLETE_EVIDENCE` = `40967`, message `error.analytics_ranking.incomplete_evidence`; never silently omit the corrupt candidate or return a partial leaderboard. Rows excluded solely because they are cancelled, incomplete, refunded, test accounts or outside the authoritative scope are normal exclusions, not corruption.

## Immutable line attribution

For each valid completed order build an exact line set:

- One base line. Exactly one of `booking.serviceId` or `booking.technicianServiceId` must be present. Its GMV is `checkout.baseAmountJpy - checkout.discountAmountJpy`; the affiliate discount belongs entirely to the base line because checkout authority applies it to the immutable original base service price.
- One line for every accepted, non-deleted add-on snapshotted by that checkout. Its GMV is `OrderAddOn.priceAmountJpy` and its entity is `OrderAddOn.serviceId` (`Service`). Proposed/rejected/deleted add-ons contribute nothing.
- `calculationSnapshotJson.formula` must be `base_plus_accepted_add_ons_minus_discount`. Its base, discount, add-on total, checkout total and canonical unique positive `acceptedAddOnIds` must equal the checkout columns and the exact accepted/non-deleted add-on set. Every attributed service/add-on currency must be uppercase `JPY`. The line GMV sum must equal `checkoutAmountJpy` exactly.

Service ranking aggregates these lines by the actual service entity. Every base or accepted add-on line contributes `completedCount += 1`; if one order contains the same entity as base and/or more than one accepted add-on, every occurrence counts. Its GMV is the sum of those line amounts.

Without a category filter, technician and customer rankings aggregate at order grain: each order contributes its full `checkoutAmountJpy` and `completedCount += 1` exactly once.

With a category filter, technician and customer rankings aggregate only matching line GMV and count distinct completed orders having at least one matching line. Two matching lines in one order contribute both line amounts but only one completed count. A base line in another category contributes no GMV; an accepted add-on in the selected category does. Across category filters, counts may overlap because one order can contain lines in multiple categories; this is intentional and must be documented in OpenAPI.

## City and taxonomy lens

- `city` always means the current non-deleted booking shop's exact `shop.city`; never technician city, customer city or service city. A shop city edit intentionally reclassifies historical ranking rows at query time.
- `categoryId` must resolve to one active, non-deleted `Category`; a missing/inactive/deleted ID is HTTP 404, code `ANALYTICS_RANKING_CATEGORY_NOT_FOUND` = `40419`, message `error.analytics_ranking.category_not_found`.
- Category matching is the service entity's current direct `categoryId` at the captured query time. It does not include descendants and never reads a historical snapshot because existing order/add-on snapshots do not store category authority. A catalog reassignment intentionally reclassifies historical lines on later queries.
- Every attributed service entity must resolve exactly one current non-deleted category row. Missing/duplicate/corrupt taxonomy for an otherwise valid line is the stable 409 incomplete-evidence error.
- For service items, `categoryId` is the current direct category. For technician/customer items it equals the requested category ID when filtered and is null when unfiltered.

## Entity projection and eligibility

- Shop service: `entityType = service`, `entityPublicId = Service.publicId`, numeric ID/registration/name from `Service.id/createdAt/name`. Avatar is the lowest `sortOrder`, then lowest ID, active non-deleted `MediaAsset` with `entityType = service`, matching entity ID and `usageType = cover`; otherwise null.
- Technician service: `entityType = technician_service`, formal UUID from the new column, numeric ID/registration/name from `TechnicianService.id/createdAt/name`, avatar from its current `coverImageUrl` or null.
- Technician: `entityType = technician`, public ID is the assigned technician user's immutable `needoId`, numeric ID/registration/name from `TechnicianProfile.id/createdAt/displayName`, avatar from the user.
- Customer: `entityType = customer`, public ID/numeric ID/registration from `User.needoId/id/createdAt`, display name from a current non-deleted `CustomerProfile.displayName` or else `User.username`, avatar from the user.

Service-ranking entities must be non-deleted. Technician/customer entities must satisfy the active/non-test/non-deleted rules above. Current publication, suspension, recommendation and visibility flags do not rewrite already completed formal consumption. No name/avatar/snapshot fallback may create a second entity or synthetic identifier.

## Deterministic ordering, ranking and numeric safety

Both metrics are always returned. The selected metric changes ordering only:

- `gmv`: `gmvJpy DESC`, `completedCount DESC`, `registeredAt ASC`, `entityNumericId ASC`, `entityType ASC` under binary literal order.
- `completedCount`: `completedCount DESC`, `gmvJpy DESC`, `registeredAt ASC`, `entityNumericId ASC`, `entityType ASC` under binary literal order.

`rank` is the global one-based row number before pagination. The final entity-type key resolves the otherwise possible equal numeric IDs of `Service` and `TechnicianService`; `service` sorts before `technician_service`. Return at most the requested page size.

Normalize every SQL SUM, COUNT, row number, total and numeric ID from canonical non-negative safe integers. Negative, fractional, non-canonical strings, unsafe values, duplicate entity aggregate rows, duplicate evidence rows or a row count inconsistent with the window total trigger the 409 incomplete-evidence error. Never emit `NaN`, `Infinity`, rounded money or partial rows.

## Route, validation and pagination

Expose exactly:

```text
GET /api/v1/backoffice/analytics/rankings/:kind
```

Path `kind` is strict `service | technician | customer`. Query is strict and accepts:

- `metric`: `gmv | completedCount`, default `gmv`;
- existing dashboard `period/from/to/city` semantics, default `last7days` and maximum custom range 366 inclusive Tokyo calendar days;
- optional positive integer `categoryId`;
- `page`: positive integer, default 1;
- `pageSize`: positive integer, default 10, maximum 10.

Unknown keys, empty city, non-custom dates, incomplete custom range, invalid IDs/metric/pagination and oversized ranges are 400/`VALIDATION`. Reuse/export the existing dashboard query base/refinement and `resolveDashboardWindow`; do not create a different period implementation.

The response uses the standard envelope and exact `AnalyticsRankingResponse`. `total` is the number of eligible distinct entities after filters, `page_size` echoes the validated page size, list may be empty, and `rank` remains global across later pages. The operations dashboard requests page 1/pageSize 10; later pages remain bounded formal reads, not an unbounded export.

## RBAC, audit and dependency wiring

Every route call uses the real authenticate middleware, `authorize("backoffice:analytics-ranking:read")`, strict validator and controller/service/repository layers. Admin/operator pass; unauthenticated is 401; missing permission, merchant, merchant staff, customer and technician are 403. Do not infer permission from frontend navigation or another dashboard permission.

Wire an injectable `AnalyticsRankingRepositoryPort` and clock through `AppDependencies`/route factory so API tests mount the real `createApp` chain without a database. Production defaults to the real Prisma repository. Controller only parses request/context and maps the success response.

After a successful repository read and before returning data, synchronously record one audit row. Audit failure means no response is returned. Exact values:

- action `backoffice.analytics_ranking.read`;
- target type `analytics_ranking`;
- null target ID;
- metadata keys only `kind`, `metric`, `period`, `from`, `to`, `city`, `categoryId`, `page`, `pageSize`, `resultCount`.

`resultCount` is returned list length. Do not place entity IDs, names, avatars, SQL, checkout/ledger IDs or raw evidence in audit metadata.

## OpenAPI contract

Document the single path with unique operation ID, bearer security and `x-permission: backoffice:analytics-ranking:read`. Publish exact strict path/query schemas, period cross-rules, page defaults/max, response fields/enums/nullability, global rank semantics, both sort orders, direct current-taxonomy lens, category-filtered technician/customer line-GMV versus distinct-order count behavior, and the service base/add-on counting rule.

Document examples for all three kinds and both metrics plus 400, 401, 403, 404 category and 409 incomplete-evidence responses. OpenAPI must not advertise merchant ranking routes, exports, mutable ranking settings, full card/payment/ledger evidence, synthetic IDs or page sizes over ten.

## Tests

### Unit/repository

Tests must inspect generated SQL and bound values rather than source markers alone. Cover:

- NDP, technician cash, operations cash and other-method formal success;
- missing/duplicate/wrong ledger, event, actor, reference, audit, receipt reason, time order or checkout arithmetic;
- pending/cancelled/awaiting/refund-pending/refunded and every individual refund residue;
- exact `paymentConfirmedAt` lower inclusion/upper exclusion and a misleading `endsAt`;
- current `shop.city` scope, moved city, exact direct category, inactive/missing category and no descendant expansion;
- shop base, technician-service base, accepted add-on, rejected/proposed/deleted add-on, repeated same-service add-ons and base/add-on same entity;
- affiliate base discount attribution and exact line total reconciliation;
- unfiltered technician/customer full-order GMV/count and filtered matching-line GMV/distinct-order count;
- active/test/deleted users, missing assigned technician, deleted ranking entities and standalone technician services with real public IDs;
- zero GMV, empty result, more than ten entities, later pages and global ranks;
- selected/secondary metric ties, registration tie, numeric-ID tie across service tables and final binary entity-type tie;
- malformed/duplicate/fractional/negative/unsafe aggregates and canonical numeric parsing.

Service tests prove one clock call, exact dashboard window, category validation, repository input, response filter, audit allowlist/failure and stable 404/409 mapping. Real `createApp` Supertest proves 200 for admin/operator; 400 strict validation; 401; 403 for every unauthorized role; 404 category; 409 evidence; pagination; no extra route; and response/audit secrecy. Run the existing technician-ranking suites unchanged as regression evidence.

### Rollback-only local MySQL integration

The integration suite is opt-in only with `RUN_ANALYTICS_RANKING_MYSQL_INTEGRATION=true`. Before importing/constructing Prisma or performing any write, require an explicit existing `FORMAL_BACKEND_ENV_FILE`, read `DATABASE_URL` only from that file, reject inherited-only/empty values, production/staging runtime flags, non-MySQL protocols, non-loopback hosts and every database name except exact `needo_test`. Reuse the dashboard loopback authority rules; never connect during ordinary import or default Jest runs.

Preflight the Task3 migration and every required physical table/column/index before fixture writes. Create a unique fixture cohort inside one outer interactive transaction, instantiate the repository with that transaction-bound client, and terminate only by throwing a dedicated rollback sentinel. Compare external baseline counts before and after rollback. Do not call global Prisma from inside the transaction, use `deleteMany`, commit fixtures, clean unrelated rows or apply migrations.

The real database matrix must include NDP/cash/other evidence, base plus accepted add-ons, affiliate discount, all three ranking kinds, both metrics, category/city/payment boundaries, deterministic ties, and at least one malformed-evidence request whose failure leaves the external baseline unchanged.

## Verification gates

```bash
cd backend
npm run prisma:generate
npm test -- analytics-ranking-schema.test.ts analytics-ranking.repository.test.ts analytics-ranking-integration-safety.test.ts analytics-ranking.service.test.ts analytics-ranking-api.test.ts analytics-ranking-openapi.test.ts technician-ranking-repository.test.ts technician-ranking-period.test.ts dashboard-membership.repository.test.ts openapi.test.ts
npm run lint
npm run build
git diff --check
```

Optional guarded integration, only when the explicit local `needo_test` authority is available:

```bash
cd backend
FORMAL_BACKEND_ENV_FILE=/absolute/path/to/local.env RUN_ANALYTICS_RANKING_MYSQL_INTEGRATION=true npm test -- analytics-ranking.repository.integration.test.ts
```

Commit only the authorized files with `feat: expose formal analytics rankings`. Stop before frontend ranking panels, acceptance scripts or shared-database migration application.
