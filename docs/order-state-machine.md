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
- Customer order list/detail/transition access is scoped to the authenticated customer user. If a customer passes another `customerUserId` in the order list query, the service overrides it with the token user id. Other customers' order detail/transition attempts return `error.order.not_found`.
- Frontend checkout/orders API lane for numeric backend ids, with legacy local demo ids left intact.
- Merchant and technician schedule portals create, block, restore, and soft-delete formal slots; the shared calendar reads the same backend records.

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

## APIs

Public:

- `GET /api/v1/schedule/availability`
- `GET /api/v1/shops/:shopId/booking-navigation`
- `GET /api/v1/shops/:shopId/technicians/:technicianId/services`

Authenticated:

- `POST /api/v1/bookings`
- `GET /api/v1/orders`
- `GET /api/v1/orders/:id`
- `POST /api/v1/orders/:id/confirm`
- `POST /api/v1/orders/:id/cancel`
- `POST /api/v1/orders/:id/start`
- `POST /api/v1/orders/:id/complete`
- `GET /api/v1/shops/:shopId/pricing-mode`
- `PUT /api/v1/shops/:shopId/pricing-mode`
- `GET|POST /api/v1/merchant-admin/schedule/slots`
- `PATCH|DELETE /api/v1/merchant-admin/schedule/slots/:id`
- `GET|POST /api/v1/technician/schedule/slots`
- `PATCH|DELETE /api/v1/technician/schedule/slots/:id`

Protected endpoints require the Step 10 RBAC permissions seeded through `SYSTEM_PERMISSIONS`, such as `booking:create`, `order:list`, `order:read`, `order:confirm`, `order:cancel`, `order:start`, `order:complete`, `schedule:slots:list`, and `schedule:slots:write`.

Access boundary:

- Customer actors are limited to their own `booking_orders.customer_user_id`.
- Platform and service-provider roles keep the current backend handling lane for operational order transitions.
- Merchant schedule mutations derive `shop_id` from the authenticated shop identity and ignore client-supplied shop scope.
- Technician schedule mutations derive `technician_profile_id` from the authenticated technician identity and ignore client-supplied technician scope.

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

## Frontend Integration

The frontend is connected incrementally:

- Numeric `/checkout/:serviceId` routes read availability from `/api/v1/schedule/availability`.
- Numeric checkout submissions create real Booking orders through `/api/v1/bookings`.
- `/orders` loads API orders for authenticated users and falls back to legacy local orders if unavailable.
- `/orders/:orderId` fetches API detail for numeric ids and keeps legacy local detail behavior for existing demo ids.
- Merchant and technician schedule pages use `FormalScheduleInventoryPanel` for formal slot mutations and `UnifiedUserCalendar` for the shared backend projection.
- Personal, non-bookable calendar notes remain in the legacy local calendar lane; they are not presented as customer-bookable inventory.

This keeps Step 10 focused on the transaction chain without opening Request, wallet, IM, Social, or subscription flows.

## Real database acceptance

Run only against a local, non-production MySQL database:

```text
ENV_FILE=.env.dev npm run check:schedule-flow
```

The check creates isolated temporary identities and verifies merchant/technician scope, exact UTC storage for a `+09:00` source time, overlap rejection, slot mutation lifecycle, capacity-one concurrent booking, capacity-two pooled booking, and exact cleanup. The script refuses production environment flags and non-local database hosts.
