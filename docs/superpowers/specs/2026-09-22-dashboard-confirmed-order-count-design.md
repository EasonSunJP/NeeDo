# Dashboard Confirmed Order Count Design

## Goal

Make the platform and merchant dashboard order trend count only customer bookings that have been accepted by the owning shop or assigned technician and have not been cancelled.

The service GMV definition remains unchanged.

## Metric Contract

`orderCount` is grouped by the booking's scheduled `starts_at` bucket and includes these current `BookingOrderStatus` values:

- `CONFIRMED`
- `IN_SERVICE`
- `AWAITING_CHECKOUT`
- `AWAITING_PAYMENT_CONFIRMATION`
- `COMPLETED`

It excludes:

- `PENDING`, because the shop or technician has not accepted the booking yet.
- `CANCELLED`, including bookings cancelled after acceptance, because the current contract requires the order to remain uncancelled.
- Soft-deleted orders, as today.

The count uses the current order status rather than status history. This matches the user-visible lifecycle, removes an order after cancellation, and avoids a second historical source of truth.

`serviceGmvJpy` continues to sum only completed orders whose payment is not refund-pending or refunded. Formal NDP, Test NDP, checkout, settlement, and wallet behavior are outside this change.

## Architecture and Data Flow

Keep the existing shared `DashboardRepository.queryOrderSeries` path:

```text
platform or merchant dashboard
-> dashboard API/service
-> DashboardRepository.queryOrderSeries
-> booking_orders grouped by scheduled bucket
-> existing dashboard payload and chart
```

Change only the `orderCount` SQL expression from an unconditional row count to a conditional count over the accepted, uncancelled lifecycle statuses. Keep the GMV expression independent in the same query. This preserves platform city scope, merchant shop scope, time-zone buckets, response types, caching, and frontend rendering.

No schema, migration, API contract, frontend component, label, or localization change is required. Both the operations dashboard and merchant dashboard receive the corrected count automatically because they already consume the same series.

## Error and Boundary Behavior

- A bucket containing only pending or cancelled orders returns `orderCount: 0`.
- A completed order remains counted even if its payment is refund-pending or refunded; it is still an accepted, uncancelled order, while its GMV remains excluded by the existing financial rule.
- A cancelled order never contributes to the count, even if it was previously confirmed or completed through legacy or repaired data.
- Existing deleted-order, shop, city, and date filters remain unchanged.
- No historical data is rewritten or backfilled.

## Verification

Add repository regression coverage before changing production SQL. The test must fail against the current unconditional `COUNT(booking.id)` and prove that the query contract includes exactly the five accepted lifecycle statuses while excluding `PENDING` and `CANCELLED`.

Then run:

1. Focused dashboard repository tests.
2. Dashboard service and API tests covering platform and merchant scopes.
3. Backend lint and TypeScript build.
4. Frontend dashboard tests only if the payload or rendering changes unexpectedly; no frontend change is planned.
5. Final diff and status checks.

Browser or database acceptance is separate from code verification and requires a running local database with representative status fixtures. Push and deployment remain out of scope unless separately authorized.

## Rollback

Revert the single repository query change and its regression assertion. No database rollback is needed.
