# Live Screen A — Task 7 Report

Date: 2026-09-06
Scope: Task 7 only — shared SSE invalidation and compact regional order events

## Outcome

- Added protected Bearer-only `GET /api/v1/backoffice/dashboard/live-events` with existing dashboard permission, platform identity enforcement, strict Zod query/header validation, hierarchy validation, connection audit, and OpenAPI documentation.
- Added one process-wide Redis pub/sub subscription on `needo:dashboard:live:v1` plus Redis Stream authority on `needo:dashboard:live:stream:v1`. Pub/Sub envelopes are wakeups only. One serialized/coalescing process drain reads exclusively after its last Redis Stream cursor until caught up, runs after subscription/re-subscription and from one gateway-owned 30-second recovery timer while clients exist, and provides ordered, duplicate-free gap recovery even when wakeups are reversed or lost. Per-response timers only write heartbeat comments and never read Redis. Redis-assigned stream IDs provide one global order and shared replay across app processes, bounded to 100 events/five minutes. The gateway retains compact strict event allowlists, a 32 KiB limit, `retry: 5000`, connected event, `Last-Event-ID`, and immediate slow-client disconnect.
- Cursor retention classification and the bounded initial replay read are one atomic Redis Lua operation, preventing exact stream trimming from racing a separate cursor check. Future, trimmed, unknown, and empty/recreated-stream cursors return pre-header `40900 error.live_dashboard.cursor_reset_required`; retained cursors and the exact current head remain valid. Rejected cursors are not recorded as successful connection audits. Replay/drain failure before connection establishment ends the response without a false `connected` frame or cursor advancement, allowing EventSource to retry the same `Last-Event-ID` and recover the gap exactly once.
- Added strict country/ancestor regional fanout and targeted deletion of only the matching country/ancestor dashboard cache keys for all three supported periods. Every cache fill reads its per-key generation before factory execution and writes with an atomic Lua compare-and-set only when unchanged. Authoritative invalidation atomically increments all exact country/ancestor-period generations and deletes those cache keys before appending `metrics.invalidate`; remote gateways only fan out the cleared-cache signal. Failed fencing/deletion is contained and suppresses the misleading invalidation frame.
- Added post-commit `order.changed` and `metrics.invalidate` publication for successful booking, superseded cancellation, add-on, manual and automatic service-status, payment-method selection, checkout-completion, manual-payment confirmation/refund, and normal order transitions. Projection and publish failures are logged and cannot roll back a committed mutation.
- Batched compact projections into one repository query and publishes them with concurrency capped at four, removing the superseded-order sequential N+1 while retaining one event pair per changed order.
- Graceful shutdown closes the live gateway and its dedicated Redis publisher/subscriber clients.
- Gateway shutdown is cancellation-safe: it marks closed before awaiting in-progress subscription/cursor/replay work, invokes a late transport unsubscribe exactly once, removes response listeners, ends pending responses exactly once, and leaves no client heartbeat, recovery timer, retry timer, or stream listener after close. Repeated close calls share the same completion.

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

Fix-loop shared-stream RED:

```text
npm test -- --runInBand tests/live-dashboard-events.test.ts
FAIL (compile): missing LiveDashboardEventStreamPort/eventStream contract for the two-gateway shared replay test.
```

Fix-loop checkout isolation RED:

```text
npm test -- --runInBand tests/order-checkout-service.test.ts
FAIL: a committed NDP completion with a null notification lookup produced 0 live frames; expected 2.
```

Second fix-loop race RED:

```text
npm test -- --runInBand tests/live-dashboard-events.test.ts -t "reversed Pub/Sub|subscription outage|unestablished response"
FAIL: reverse Pub/Sub order omitted 1000-0; an outage append was not drained after retry; replay failure still emitted connected and left the response open.

npm test -- --runInBand tests/live-dashboard-cache.test.ts -t "fences a delayed"
FAIL: a post-invalidation request joined the old in-flight generation and never started its fresh factory.
```

Final lifecycle fix-loop RED:

```text
npm test -- --runInBand tests/live-dashboard-events.test.ts -t "one process recovery|rejects future|accepts a retained|late transport|close wins"
FAIL: staggered clients caused two periodic Redis reads; future/trimmed/unknown/empty cursors connected; close completed before a deferred subscription and emitted connected after close-during-replay.

npm test -- --runInBand tests/live-dashboard-api.test.ts tests/openapi.test.ts tests/redis-live-dashboard-event-stream.test.ts
FAIL (initial contract compile): missing 40900 cursor-reset code, atomic retained replay port, gateway preparation method, and OpenAPI 409 response.
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

Fix-loop combined regression:

```text
npm test -- --runInBand \
  tests/live-dashboard-events.test.ts \
  tests/redis-live-dashboard-event-stream.test.ts \
  tests/live-dashboard-api.test.ts \
  tests/live-dashboard-openapi.test.ts \
  tests/live-dashboard-validator.test.ts \
  tests/live-dashboard-cache.test.ts \
  tests/live-dashboard.service.test.ts \
  tests/live-dashboard.repository.test.ts \
  tests/live-dashboard-order-change.publisher.test.ts \
  tests/live-dashboard-order-projection.test.ts \
  tests/booking-service.test.ts \
  tests/booking-repository-scope.test.ts \
  tests/booking-api.test.ts \
  tests/booking-service-location.test.ts \
  tests/booking-validator.test.ts \
  tests/order-checkout-service.test.ts \
  tests/manual-payment-service.test.ts \
  tests/manual-payment-api.test.ts \
  tests/order-service-expiry.repository.test.ts \
  tests/order-service-expiry.service.test.ts \
  tests/order-service-expiry.worker.test.ts \
  tests/order-service-expiry-server-wiring.test.ts \
  tests/order-service-expiry-config.test.ts \
  tests/openapi.test.ts \
  tests/security-middleware.test.ts
PASS: 25 suites, 237/237 tests

npm run build
PASS

npm run lint
PASS

./node_modules/.bin/prettier --check <all 29 Task 7 changed TypeScript files>
PASS

git diff --check 9c4973d3955f631bd8a40b35de851f66c2bbeb29
PASS
```

Second fix-loop focused GREEN:

```text
npm test -- --runInBand tests/live-dashboard-cache.test.ts tests/live-dashboard-events.test.ts
PASS: 2 suites, 36/36 tests

npm test -- --runInBand <the 25 Task 7/booking/payment/expiry/OpenAPI/security suites listed above>
PASS: 25 suites, 243/243 tests

npm run build
PASS

npm run lint
PASS

./node_modules/.bin/prettier --check <all 31 Task 7 changed TypeScript files>
PASS

git diff --check 9c4973d3955f631bd8a40b35de851f66c2bbeb29
PASS
```

Final lifecycle fix-loop GREEN:

```text
npm test -- --runInBand tests/live-dashboard-events.test.ts tests/redis-live-dashboard-event-stream.test.ts tests/live-dashboard-api.test.ts tests/openapi.test.ts
PASS: 4 suites, 66/66 tests

npm test -- --runInBand <the 25 Task 7/booking/payment/expiry/OpenAPI/security suites listed above>
PASS: 25 suites, 252/252 tests

npm run build
PASS

npm run lint
PASS

./node_modules/.bin/prettier --check <all 32 Task 7 changed TypeScript files>
PASS

git diff --check
git diff --check 9c4973d3955f631bd8a40b35de851f66c2bbeb29
PASS
```

## Narrow architecture adaptations

The existing booking payload intentionally does not expose immutable service-location data. With approval, Task 7 adds one repository-layer projection in `booking.repository.ts`. It is a single bounded read after the committed mutation returns, selects only order number/status/service snapshot/amount and immutable `BookingServiceLocation` region codes, and never adds address, note, identity, shop, technician, or customer fields to the booking API. Unresolved locations fall back to country-only scope. Projection and publisher failures have explicit post-commit regression coverage.

The existing dashboard cache gained an exact-key invalidation method; it does not scan or flush unrelated scopes. Booking route composition passes the shared publisher dependency without changing public request/response contracts.

The cache's formal Redis port now uses `sendCommand` for two atomic Lua operations: generation-checked cache fill and generation-increment-plus-delete invalidation. In-flight entries are tagged with the observed shared generation, so a new generation starts at most one fresh local factory while an older factory may finish for its original caller but cannot repopulate Redis. No automatic CAS retry or retry storm is introduced.

The production gateway now uses `redis-live-dashboard-event-stream.ts` as its global ID/replay transport. The in-memory stream exists only inside `live-dashboard-events.test.ts` as the injectable transport test double; production has no in-memory fallback. `live-dashboard-order-change.publisher.ts` centralizes one-query compact projection and bounded publication for booking and expiry paths.

The final lifecycle adaptation adds a formal atomic retained-replay result to the Redis stream port. Its single-key Lua operation reads Redis server time, rejects a supplied cursor unless that exact stream ID is still inside the five-minute retained window, and returns at most 100 exclusive successors in the same atomic execution. The service performs this preparation after authentication, authorization, platform identity, and hierarchy checks but before the successful-connection audit and before SSE headers. A rejected client is expected to discard its cursor, fetch a full snapshot, and reconnect without `Last-Event-ID`. This preserves the current standalone Redis topology; multi-key Redis Cluster support remains outside Task 7.

The recovery cadence is owned once by the gateway rather than once by each browser. It starts when the first SSE client is established, stops when the last client leaves, and reuses the existing serialized drain. Shutdown now awaits pending client setup and the process subscription before closing the dedicated stream transport.

Automatic expiry now returns the exact IDs actually advanced by the committed repository transactions. `OrderServiceExpiryService` passes that applied set to the same best-effort compact publisher after the repository returns and preserves the worker's numeric count contract. Checkout completion publication is independent of the notification-recipient lookup, so notification projection absence cannot suppress the dashboard event.

Task 7 verification also found a stale test-only store-booking fixture missing the already-required Task 3 `serviceLocation`. It was closed with `serviceLocation: { source: "SHOP_LOCATION" }`; no production behavior was broadened.

## Commit

Commit message: `feat: stream regional dashboard changes`

Fix-loop commits: `eddf710e fix: harden regional dashboard event stream`, `1aa39e76 fix: fence dashboard stream races`, and the final lifecycle-hardening commit recorded in the handoff.

## Residuals / exclusions

- No schema or migration changes.
- No UI or Task 8 work.
- No real database or Redis access; transport/repository behavior was verified with isolated ports and fixtures.
- The progress ledger was not updated.
- The review-recorded unrelated membership failures and broad-suite heap exhaustion were not changed or reclassified. Task 7 verification used serial focused groups and the 243-test relevant regression matrix above.
