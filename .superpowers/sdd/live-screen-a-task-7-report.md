# Live Screen A — Task 7 Report

Date: 2026-09-06
Scope: Task 7 only — shared SSE invalidation and compact regional order events

## Outcome

- Added protected Bearer-only `GET /api/v1/backoffice/dashboard/live-events` with existing dashboard permission, platform identity enforcement, strict Zod query/header validation, hierarchy validation, connection audit, and OpenAPI documentation.
- Added one process-wide Redis pub/sub subscription on `needo:dashboard:live:v1`, compact strict event allowlists, 32 KiB limit, monotonic timestamp-sequence IDs, replay bounded to 100 events received in five minutes, `retry: 5000`, connected event, 30-second heartbeats, `Last-Event-ID`, and immediate slow-client disconnect.
- Added strict country/ancestor regional fanout and targeted deletion of only the matching country/ancestor dashboard cache keys for all three supported periods.
- Added post-commit `order.changed` and `metrics.invalidate` publication for successful booking, add-on, service-status, checkout-completion, manual-payment confirmation/refund, and order transition mutations. Projection and publish failures are logged and cannot roll back a committed mutation.
- Graceful shutdown closes the live gateway and its dedicated Redis publisher/subscriber clients.

## RED / GREEN evidence

Initial RED:

```text
npm test -- --runInBand tests/live-dashboard-events.test.ts tests/live-dashboard-api.test.ts
FAIL: missing LiveDashboardEvent contract/gateway/invalidateScope and live-events route returned 404.
```

Focused mutation RED:

```text
npm test -- --runInBand tests/booking-service.test.ts -t "publishes only after an applied add-on"
FAIL: expected publisher 2 calls, received 0.
```

Replay ordering RED:

```text
npm test -- --runInBand tests/live-dashboard-events.test.ts -t "writes retry"
FAIL: connected event was written before replayed order events.
```

GREEN implementation evidence:

```text
npm test -- --runInBand tests/live-dashboard-events.test.ts
PASS: 10/10

npm test -- --runInBand tests/live-dashboard-order-projection.test.ts
PASS: 2/2

npm test -- --runInBand tests/booking-repository-scope.test.ts
PASS: 16/16
```

Final combined regression:

```text
npm test -- --runInBand tests/live-dashboard-events.test.ts tests/live-dashboard-api.test.ts tests/live-dashboard-order-projection.test.ts tests/booking-service.test.ts tests/booking-repository-scope.test.ts tests/booking-api.test.ts tests/booking-service-location.test.ts tests/booking-validator.test.ts tests/manual-payment-service.test.ts tests/manual-payment-api.test.ts tests/openapi.test.ts tests/security-middleware.test.ts
PASS: 12 suites, 137/137 tests

npm run build
PASS

npm run lint
PASS

./node_modules/.bin/prettier --check src/app.ts src/controllers/live-dashboard.controller.ts src/domain/live-dashboard.ts src/routes/backoffice.routes.ts src/services/live-dashboard-cache.service.ts src/services/live-dashboard-event.gateway.ts src/services/live-dashboard.service.ts src/validators/live-dashboard.validator.ts tests/live-dashboard-api.test.ts tests/live-dashboard-events.test.ts tests/live-dashboard-order-projection.test.ts
PASS

git diff --check
PASS
```

## Narrow architecture adaptations

The existing booking payload intentionally does not expose immutable service-location data. With approval, Task 7 adds one repository-layer projection in `booking.repository.ts`. It is a single bounded read after the committed mutation returns, selects only order number/status/service snapshot/amount and immutable `BookingServiceLocation` region codes, and never adds address, note, identity, shop, technician, or customer fields to the booking API. Unresolved locations fall back to country-only scope. Projection and publisher failures have explicit post-commit regression coverage.

The existing dashboard cache gained an exact-key invalidation method; it does not scan or flush unrelated scopes. Booking route composition passes the shared publisher dependency without changing public request/response contracts.

Task 7 verification also found a stale test-only store-booking fixture missing the already-required Task 3 `serviceLocation`. It was closed with `serviceLocation: { source: "SHOP_LOCATION" }`; no production behavior was broadened.

## Commit

Commit message: `feat: stream regional dashboard changes`

## Residuals / exclusions

- No schema or migration changes.
- No UI or Task 8 work.
- No real database or Redis access; transport/repository behavior was verified with isolated ports and fixtures.
- The progress ledger was not updated.
