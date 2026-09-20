# Order State Machine

Step 10 implements the first formal Booking / Schedule / Order chain for free reservations only.
Step 12E extends the same backend order table/API lane to accept `orderType = request` for finance adaptation only.

## Scope

Implemented:

- Public schedule availability read API.
- Identity-scoped merchant and technician schedule inventory list/create/update/delete APIs.
- Authenticated Booking creation from a concrete available slot.
- Booking order state transitions: pending, confirmed, inService, completed, cancelled.
- Slot capacity and active-order conflict checks to prevent oversell.
- Order status history records for every creation and transition.
- Operations order detail projects persisted add-on proposal, acceptance, and rejection events into the auditable order timeline with immutable service name, price, and duration snapshots.
- Order list/detail/transition access is scoped from the active authenticated identity: customers by `customer_user_id`, merchants by `shop_id`, technicians by `technician_profile_id`, and platform identities by their global operations role. Client-supplied filters cannot widen this scope. Out-of-scope detail or transition attempts return `error.order.not_found`.
- Frontend checkout/orders API lane for numeric backend ids, with legacy local demo ids left intact.
- Merchant and technician schedule portals create, block, restore, and soft-delete formal slots; the shared calendar reads the same backend records.
- Booking orders persist `onsite` or `bank_transfer` payment selection and the formal manual-payment lifecycle.
- Home-service Booking creation requires a short-lived, unconsumed route estimate bound to the authenticated customer, shop, service, selected schedule slot, normalized destination hash, active fare-policy version, and selected distance band. Changing the slot requires a new estimate. Store bookings reject travel-estimate injection.
- Estimate consumption, the Booking row, normalized fulfillment-address snapshot, and immutable `booking_travel_fare_snapshots` row share the same transaction. Concurrent reuse has exactly one winner; expired, consumed, or mismatched estimates leave no partial Booking.

Reserved only:

- `OrderType.REQUEST` exists in Prisma/database.
- Since Step 12E, `/api/v1/bookings` accepts `orderType = request` so backend finance can calculate and settle the C-side Request dispatch fee.
- This does not open a Request lobby, marketplace, or new frontend entry.

Not implemented in Step 10:

- Request lobby, Request frontend entry, full NDP wallet debit, IM, Social, membership/subscription.

## Tables

Migration:

```text
backend/prisma/migrations/20260525090000_step10_booking_schedule_order/migration.sql
```

Tables:

- `availabilities`: shop/technician availability windows.
- `schedule_slots`: concrete service slots with capacity, booked count, and available/booked/blocked status.
- `booking_orders`: formal Booking order records, including reserved `order_type`.
- `order_status_histories`: append-only status audit trail.
- `shops.technician_pricing_rate_percent`: store-facing technician pricing rate. The default is `100`; public technician service quotes use `technician_service.price_amount * technician_pricing_rate_percent / 100` when the shop is in technician pricing mode.

All Step 10 tables include `id`, `created_at`, `updated_at`, and `deleted_at`.

Additional pricing-mode migration:

```text
backend/prisma/migrations/20260602103000_shop_technician_pricing_rate/migration.sql
```

Manual-payment migration:

```text
backend/prisma/migrations/20260825014000_manual_payment_flow/migration.sql
```

`booking_orders` now also stores payment method/status, exact JPY amount, confirmation and refund actors/timestamps, references, notes and refund reason. Existing rows are backfilled from the immutable order price snapshot.

Backoffice and merchant-admin order list payloads expose the persisted manual-payment state as `pending`, `confirmed`, `refundPending`, or `refunded`. The frontend adapter maps these values to its existing unpaid/paid/refunded display vocabulary; it no longer hard-codes every order as unpaid.

## APIs

Public:

- `GET /api/v1/schedule/availability`
- `GET /api/v1/shops/:shopId/booking-navigation`
- `GET /api/v1/shops/:shopId/technicians/:technicianId/services`

Authenticated:

- `POST /api/v1/bookings`
- `POST /api/v1/bookings/travel-estimates`
- `GET /api/v1/merchant-admin/travel-fare-policy`
- `GET|POST /api/v1/merchant-admin/travel-fare-policy/versions`
- `GET /api/v1/backoffice/travel/providers/status`
- `GET /api/v1/backoffice/travel/fare-policies`
- `GET /api/v1/orders`
- `GET /api/v1/orders/:id`
- `POST /api/v1/orders/:id/confirm`
- `POST /api/v1/orders/:id/cancel`
- `POST /api/v1/orders/:id/service/start`
- `POST /api/v1/orders/:id/service/end`
- `GET /api/v1/shops/:shopId/pricing-mode`
- `PUT /api/v1/shops/:shopId/pricing-mode`
- `GET|POST /api/v1/merchant-admin/schedule/slots`
- `PATCH|DELETE /api/v1/merchant-admin/schedule/slots/:id`
- `GET|POST /api/v1/technician/schedule/slots`
- `PATCH|DELETE /api/v1/technician/schedule/slots/:id`
- `POST /api/v1/merchant-admin/orders/:id/payment/confirm`
- `POST /api/v1/merchant-admin/orders/:id/payment/refund`
- `POST /api/v1/backoffice/orders/:id/payment/confirm`
- `POST /api/v1/backoffice/orders/:id/payment/refund`

Protected endpoints require the Step 10 RBAC permissions seeded through `SYSTEM_PERMISSIONS`, such as `booking:create`, `order:list`, `order:read`, `order:confirm`, `order:cancel`, `order:service:start`, `order:service:end`, `schedule:slots:list`, and `schedule:slots:write`.

Access boundary:

- Customer actors are limited to their own `booking_orders.customer_user_id`.
- Merchant actors are limited to the `booking_orders.shop_id` derived from the active `scopeType=shop` identity.
- Technician actors are limited to the `booking_orders.technician_profile_id` derived from the active `scopeType=technician_profile` identity.
- Only platform identities with global operations roles can list or operate across shops.
- Merchant schedule mutations derive `shop_id` from the authenticated shop identity and ignore client-supplied shop scope.
- Technician schedule mutations derive `technician_profile_id` from the authenticated technician identity and ignore client-supplied technician scope.

Merchant and technician fulfillment share the formal service-transition endpoints. A merchant start request uses
`actor=merchant`, the six-digit customer-visible verification code, and an idempotency key; a merchant end request
uses `actor=merchant`, a business reason, and an idempotency key. The merchant API resolves the active signed shop
server-side and returns `error.order.not_found` for another shop's order. The retired `/orders/:id/start` and
`/orders/:id/complete` routes are not restored.

Migration `20260913103000_merchant_order_service_transitions` grants the already-existing service start/end
permissions to `merchant_owner` and `merchant_staff` idempotently. Its targeted rollback soft-deletes only those
four role-permission grants.

## State Machine

Allowed transitions:

```text
pending -> confirmed
pending -> cancelled
confirmed -> inService
confirmed -> cancelled
inService -> completed
```

Blocked examples:

- `pending -> completed`
- `completed -> cancelled`
- `cancelled -> confirmed`

Invalid transitions return:

```json
{
  "code": 40906,
  "message": "error.order.invalid_transition",
  "data": null
}
```

## Conflict Rules

公开 availability 在分页前应用同一套时间、占用和当前服务资格规则，并依据已认证顾客处理 pending 替换及会员差异；列表与总数使用一个数据库快照。返回值不预留容量，Booking 仍在原有锁定事务中重新校验。读取投影、回归证据与验收边界见 [2026-09-20 一致性修复](verification/2026-09-20-booking-availability-consistency.md)。

Booking creation uses a transaction:

- The selected slot must be active, available, not soft-deleted, and tied to a published service and shop.
- `booked_count` must be lower than `capacity`.
- The same customer cannot hold another active overlapping order.
- A technician cannot have another active overlapping order.
- A slot may accept multiple distinct customers up to capacity. An assigned technician remains protected from active orders on other overlapping slots, while the same capacity-enabled slot can host a group booking.
- On successful booking, the slot `booked_count` increments and the slot becomes `booked` when capacity is reached.
- Schedule creation locks the owning technician or shop inside the transaction before overlap checks, and booking uses the same owner lock plus a conditional slot increment.

Oversell or conflict returns:

```json
{
  "code": 40905,
  "message": "error.booking.slot_unavailable",
  "data": null
}
```

店铺到店服务还要求当前 `SHOP_LOCATION` assignment 为未删除的 JP 正式地区，且 assignment、
ADMIN1、ADMIN2 使用同一当前 dataset version，ADMIN2 必须直属 assignment 的 ADMIN1，两个层级
都必须保留日文官方名称。公开 availability 与店铺页只会为满足该合同的店铺返回可到店时段；
纯上门服务仍按客户正式地址合同返回。Booking 事务会再次锁定并验证，不能用放宽行政区校验绕过。

创建预约的冲突语义保持区分：

- `40905 error.booking.slot_unavailable`：时段、服务、店铺或身份范围已经失效。
- `41045 error.booking.slot_concurrent_occupancy`：容量在创建事务期间已被其他预约占用。
- `41044 error.booking.service_location_unresolved`：到店服务的正式店铺地址无法解析；事务不创建
  订单、不增加 `booked_count`，也不写部分历史。

## Home-service route fare

- The route origin is always the persisted shop address. The customer submits a structured Japanese destination (`countryCode=JP`, postal code, prefecture, city, street, and optional building fields); a client cannot submit distance, duration, fare, shop origin, policy, or band.
- Geoapify is the first routing provider and uses the driving profile. `TRAVEL_ROUTE_PROVIDER=geoapify` plus `GEOAPIFY_API_KEY` enables it. `GEOAPIFY_API_BASE_URL`, timeout, retry count, estimate TTL, and positive/negative cache TTL are environment-configured and validated.
- Provider credentials, raw provider payloads, normalized address inputs, and address-hash inputs never appear in route-estimate/provider/operations responses or audit metadata. Operations receives only redacted readiness and policy visibility; the authenticated customer's own order detail may return its fulfillment-address snapshot.
- An unconfigured provider returns `error.travel.provider_unconfigured`. The redacted operations status is `configured` before the first observed request, then records `healthy`, `rate_limited`, or `unavailable` with its observation time. Rate limits, timeouts, missing routes, malformed responses, provider failures, outside-area distances, and missing policies keep distinct stable errors. There is no static-distance or fabricated-fare fallback.
- Fare policies are shop-owned immutable versions. Bands must have strictly increasing positive maximum driving distances and non-negative integer JPY fares. The first inclusive matching upper bound owns the fare; a distance beyond the greatest band is outside the service area.
- Checkout arithmetic is `base JPY + accepted add-ons JPY + snapshotted travel fare JPY - discount JPY`. The immutable result is converted with the effective NDP rate using the existing ceiling rule.
- Operations `travel_fare` recognizes only completed, payment-evidenced, non-refunded, non-reversed checkouts whose arithmetic and booking travel snapshot agree. Detail rows expose distance, policy version, band limit, and fare, never the full customer address.

## Manual Payment Rules

- Initial methods are limited to `onsite` and `bank_transfer`; no external gateway can create a paid transaction.
- A payment can be confirmed only after the order is confirmed and before/after service completion. The confirmed amount must equal the order price snapshot.
- Merchant mutations are restricted to the authenticated shop. Operations/finance mutations require a platform identity and the backoffice payment-write permission.
- Repeating the exact same confirmation or refund returns the existing order without another mutation or audit event. A different retry returns a stable conflict.
- Cancelling a confirmed paid order changes payment status to `refundPending`; the direct merchant/backoffice payment-refund endpoints may finalize only that cancelled `refundPending` pre-completion path. A `COMPLETED` + `CONFIRMED` order must use the formal `OrderRefundCase` workflow and becomes `REFUNDED` only when its customer confirms receipt.
- A confirmed cancellation cannot be rejected solely because historical platform-fee hold data is absent, the recorded hold exceeds the wallet's currently frozen balance, or the provider shop lacks available NDP for the cancellation compensation. The ledger releases only verifiable frozen NDP, records any release shortfall, and books the provider compensation as an exact shop debit/customer credit; a funding shortfall becomes a visible negative shop-wallet balance and audited debt rather than a partial compensation.
- Order status, payment transition, slot release, status history, technician cancellation classification, wallet/hold changes, order financial timeline, reconciliation, and audit writes share the repository transaction. Any genuine mutation failure rolls back the entire cancellation; no partial order state is returned.
- Customer, merchant, technician, and operations order surfaces preserve stable API error meanings. Known `409` errors distinguish invalid order state, Exchange bilateral-cancellation requirements, payment conflicts, schedule conflicts, acceptance pauses, and wallet inconsistencies instead of presenting every conflict as an order-state race.
- Confirmation and refund update the order plus `order_financials` money timeline in one database transaction. Each applied action also writes an audit log.

## Frontend Integration

The frontend is connected incrementally:

- Numeric `/checkout/:serviceId` routes read availability from `/api/v1/schedule/availability`.
- Numeric checkout submissions create real Booking orders through `/api/v1/bookings`.
- `/orders` loads API orders for authenticated users and falls back to legacy local orders if unavailable.
- `/orders/:orderId` fetches API detail for numeric ids and keeps legacy local detail behavior for existing demo ids.
- Merchant and technician schedule pages use `FormalScheduleInventoryPanel` for formal slot mutations and `UnifiedUserCalendar` for the shared backend projection.
- Personal, non-bookable calendar notes remain in the legacy local calendar lane; they are not presented as customer-bookable inventory.

This keeps Step 10 focused on the transaction chain without opening Request, wallet, IM, Social, or subscription flows.

### Order timeline display boundary

The append-only order histories, service events, performance revisions, audit logs, and their original reason fields remain the internal source of truth. Portal and operations timelines do not render those raw reason values directly.

- Customer timelines show localized order-state semantics and explicitly submitted participant timeline comments. Cancellation events additionally show the persisted actor name/source, appointment time, service, shop, and participant-facing cancellation reason; an explicit localized default is used when no reason was submitted. Technician-performance revisions are not customer-visible.
- Technician timelines additionally show localized business descriptions for technician-performance revisions. A performance revision's dedicated `publicReason` may be shown when it is non-empty business prose; internal-code, QA, debug, payload, fixture, and numeric-only values fall back to the localized fixed description.
- Operations and merchant timelines show localized event kinds and approved business snapshots such as add-on service name, duration, and amount. Apart from the cancellation details above, status-history and service-event reasons are never rendered as public copy. Generic timeline bubbles do not render `internalNote`, numeric actor identifiers, event enums, QA references, or raw payloads.
- A status transition stores an immutable actor identity snapshot in the existing status-history metadata. New rows use the authenticated customer, merchant, technician, or platform identity; legacy rows fall back to the persisted user and order-participant relationship. This attribution is presentation data only and does not replace authorization, transition, refund, audit, or idempotency checks.
- Explicit `ORDER_COMMENT_ADDED` records are the participant-visible business-note channel. Internal review evidence and debugging notes remain in protected audit/API data and require a purpose-built authorized audit surface rather than the generic order timeline.
- Unknown status values fail closed to a localized generic “order status updated” label instead of exposing the raw value.

### Service-window test override

Operations administrators can change the audited `anytimeServiceTestEnabled` platform setting from System Settings. During the current test stage, the default is `true`.

- When disabled, service start is rejected before `startsAt - 30 minutes`, and service completion is rejected before `expectedEndsAt`.
- The exact start boundary (`startsAt - 30 minutes`) and exact completion boundary (`expectedEndsAt`) are allowed.
- When enabled, those two time-window checks are bypassed for testing; authorization, order state, service code, add-on, idempotency, and audit requirements remain unchanged.
- The override applies identically to customer, technician, and owning-merchant service transitions; it does not broaden a merchant's shop scope.
- Fulfillment reads the active persisted setting inside the same transaction as the order mutation. A missing setting row uses the current test-stage default and is treated as enabled.
- Before production release, operations must explicitly disable the setting and verify the active persisted version is off.

## Real database acceptance

Run only against a local, non-production MySQL database:

```text
ENV_FILE=.env.dev npm run check:schedule-flow
```

The check creates isolated temporary identities and verifies merchant/technician scope, exact UTC storage for a `+09:00` source time, overlap rejection, slot mutation lifecycle, capacity-one concurrent booking, capacity-two pooled booking, and exact cleanup. The script refuses production environment flags and non-local database hosts.

Manual payment acceptance uses the same local-only boundary:

```text
ENV_FILE=.env.dev npm run check:manual-payment-flow
```

It verifies amount matching, cross-shop hiding, confirmation/refund idempotency, `refundPending` cancellation behavior and order-finance synchronization before exact cleanup.

## Unified calendar and multi-participant scheduling

The user, technician, merchant, and participant-confirmation surfaces share the existing `UnifiedUserCalendar` timeline and draft-range renderer. Technician availability is not rendered as a normal event card: adjacent or overlapping availability rows are merged per technician lane and displayed as one narrow continuous strip on the left edge of that lane. Booking and personal-event cards keep the normal content area to the right. Availability may overlap a real booking and is never itself treated as a conflict.

The shared event editor opens a two-step participant flow:

- The contact step searches real active contacts and filters them by common, contact-tag, or group membership.
- The confirmation step displays the current identity and selected contacts as parallel lanes, with one controlled draft range spanning every lane.
- Moving or resizing that single range updates the original editor draft in 15-minute increments.
- Strict overlap is `candidateStart < existingEnd && candidateEnd > existingStart`; adjacent ranges do not conflict.
- Conflict is a red visual warning only. It does not disable “完成选择” or the final event save action.

The authenticated privacy endpoint is:

```text
GET /api/v1/calendar-events/participant-busy
  ?from=<ISO-8601>
  &to=<ISO-8601>
  &participant_identity_ids=<comma-separated identity ids>
  &page=1
  &page_size=100
```

It requires `calendar-events:read`, validates a maximum of 20 distinct positive identities and a maximum 24-hour query window, and authorizes every requested identity as an active, unblocked, non-deleted contact of the current personal identity. Any unauthorized identity rejects the whole request with `403`; partial disclosure is not allowed. The paginated result merges formal calendar events, projected recurring occurrences, and confirmed/in-service booking occupancy before sorting. Repetition keeps the same Asia/Tokyo time each day, the same weekday each week, the same day of month each month, or the same month and day each year; months or years without that calendar date are skipped. Successful rows contain only `participantIdentityId`, `startsAt`, `endsAt`, and `status: "locked"`. Event IDs, titles, services, locations, customers, notes, prices, and source identifiers never leave the repository projection.

## Historical order rebooking

Order responses preserve the immutable service identifiers and service snapshots captured when the booking was created. They additionally expose a read-only `rebook` decision derived from the current catalog, pricing mode, shop publication/suspension state, technician publication and affiliation, and service bookability state.

- `checkout` keeps fast rebooking for a currently valid service and returns the current shop and technician context.
- `select_service` means the historical service is no longer directly bookable while the original shop remains valid; clients must open that shop's current service list and show `原服务已停止，请重新选择服务`.
- `unavailable` means the original shop is no longer a safe navigation target; clients must disable direct checkout and show the same explicit notice.

The decision is projected while reading the order and never updates `serviceId`, `technicianServiceId`, snapshot JSON, status history, or audit records.
