# Order State Machine

Step 10 implements the first formal Booking / Schedule / Order chain for free reservations only.

## Scope

Implemented:

- Public schedule availability read API.
- Authenticated Booking creation from a concrete available slot.
- Booking order state transitions: pending, confirmed, inService, completed, cancelled.
- Slot capacity and active-order conflict checks to prevent oversell.
- Order status history records for every creation and transition.
- Frontend checkout/orders API lane for numeric backend ids, with legacy local demo ids left intact.

Reserved only:

- `OrderType.REQUEST` exists in Prisma/database for compatibility, but the API only accepts `booking`.

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

Protected endpoints require the Step 10 RBAC permissions seeded through `SYSTEM_PERMISSIONS`, such as `booking:create`, `order:list`, `order:read`, `order:confirm`, `order:cancel`, `order:start`, and `order:complete`.

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
- An active order cannot already occupy the same slot.
- A technician cannot have another active overlapping order.
- On successful booking, the slot `booked_count` increments and the slot becomes `booked` when capacity is reached.

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

This keeps Step 10 focused on the transaction chain without opening Request, wallet, IM, Social, or subscription flows.
