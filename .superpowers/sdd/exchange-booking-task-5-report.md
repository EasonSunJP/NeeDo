# Exchange Booking Task 5 Report

## Scope

Task 5 exposes the reviewed Task 4 Exchange booking conversion through the formal service, controller, authenticated route, OpenAPI contract, and post-commit realtime gateway.

Implementation commit: `4b3d77112504137cc85dfce677a35ac0e394b7db`

Review-fix commit: `b2a304b01ebfefe45a29c6516fa7d5136d153495`

Included:

- owner user and active owner identity enforcement;
- formal service-mode eKYC enforcement before repository mutation;
- stable SHA-256 command fingerprinting;
- formal audit input and Task 4 transaction-scoped Affiliate invalidation callback;
- exact repository-outcome to public-error mapping;
- committed-notification realtime publishing after repository commit;
- authenticated `POST /api/v1/exchange/posts/:id/matching/bookings` with exact RBAC, Zod request validation, and the shared Exchange idempotency middleware;
- complete OpenAPI request, response, permission, matching booking, and `canCreateBookings` projections.

Explicitly excluded:

- schema, migration, or repository rewrites;
- frontend work;
- payment, wallet, ledger, publication-fee, or settlement changes;
- deployment, push, or production migration.

## TDD RED

The first focused run was:

```text
cd backend && npm test -- --runInBand tests/exchange-booking-conversion.service.test.ts tests/exchange-booking-conversion.routes.test.ts tests/exchange-booking-conversion.openapi.test.ts tests/realtime-service.test.ts
```

Expected RED evidence:

- `exchange-booking-conversion.service.ts` did not exist;
- `RealtimeService.publishCommittedNotifications` did not exist;
- the formal booking-conversion route and dependency-injection entry did not exist;
- the OpenAPI path and conversion schemas were absent;
- all four suites failed for those missing Task 5 capabilities.

## GREEN and regression evidence

Final focused Task 5 run:

```text
cd backend && npm test -- --runInBand tests/exchange-booking-conversion.service.test.ts tests/exchange-booking-conversion.routes.test.ts tests/exchange-booking-conversion.openapi.test.ts tests/realtime-service.test.ts
```

Result after review fixes: 4 suites passed, 71 tests passed, 0 failed.

Task 4 repository regression:

```text
cd backend && npm test -- --runInBand tests/exchange-booking-conversion.repository.test.ts
```

Result: 1 suite passed, 31 tests passed, 0 failed.

Matching projection regression:

```text
cd backend && npm test -- --runInBand tests/exchange-matching.openapi.test.ts tests/exchange-matching.routes.test.ts tests/exchange-matching.service.test.ts
```

Result: 3 suites passed, 19 tests passed, 0 failed.

Build:

```text
cd backend && npm run build
```

Result: TypeScript build completed successfully.

Additional checks:

- targeted ESLint over every changed source/test file: 0 errors;
- `git diff --check`: 0 errors;
- no `TODO`, `FIXME`, or `not implemented` marker in the new Task 5 files.

## Stable error mapping

| Repository outcome | Code | Message | HTTP | Data |
|---|---:|---|---:|---|
| `not_found` | `40429` | `error.exchange.match_booking_not_found` | 404 | `null` |
| `not_allowed` | `40313` | `error.exchange.match_booking_not_allowed` | 403 | `null` |
| `invalid_state` | `41009` | `error.exchange.match_booking_invalid_state` | 409 | `null` |
| `version_conflict` | `41010` | `error.exchange.match_booking_version_conflict` | 409 | `{ currentVersion }` |
| `already_created` | `41011` | `error.exchange.match_booking_already_created` | 409 | `null` |
| `slot_unavailable` | `41012` | `error.exchange.match_booking_slot_unavailable` | 409 | `null` |
| `idempotency_conflict` | `41013` | `error.exchange.match_booking_idempotency_conflict` | 409 | `null` |

The fingerprint is `sha256StableJson` over authenticated user ID, active identity ID, Exchange post ID, and expected matching version. The client cannot submit provider, price, service, slot, address, payment, or actor fields.

## Realtime-after-commit evidence

- The service calls the Task 4 repository exactly once.
- `created` publishes only the committed notification rows returned by that repository.
- `RealtimeService.publishCommittedNotifications` calls only the event gateway; it does not call a notification insert method.
- A realtime gateway failure is logged as an after-commit transport failure and the committed creation payload is still returned.
- `replayed` returns the stored payload and publishes no realtime event.

## Route, RBAC, validation, and OpenAPI evidence

- Exact route: `POST /api/v1/exchange/posts/:id/matching/bookings`.
- Middleware order: authenticate, `exchange:matching:book-own`, strict Zod params/body validation, shared `Idempotency-Key` validation, controller.
- Body is exactly `{ expectedVersion: positive integer }`; additional fields are rejected.
- `Idempotency-Key` is required and constrained to 16–191 characters.
- App dependency injection accepts `exchangeBookingConversionService` for route tests and mounts the route after matching routes.
- Service verifies both `ownerIdentityId` and `ownerUserId`; a selected provider cannot create bookings even if the matching is readable.
- OpenAPI documents Bearer security, exact permission, header/body, success schema, 400/401/403/404/409 classes, matching participant `booking`, and viewer `canCreateBookings`.

## Reviewer-fix RED/GREEN evidence

Review RED command:

```text
cd backend && npm test -- --runInBand tests/exchange-booking-conversion.openapi.test.ts tests/exchange-source-policy.test.ts
```

Observed RED:

- the OpenAPI error responses had no machine-readable examples for the seven stable outcomes;
- the OpenAPI 3.1 participant booking schema had only an object `oneOf` branch, so the real `booking: null` matching projection failed JSON Schema type characterization;
- the strengthened source-policy characterization passed immediately because the formal runtime route was already mounted, exposing that the defect was the stale single-file policy test rather than application routing.

Review GREEN:

- `ExchangeMatchParticipant.booking` now uses explicit `oneOf: [object, { type: "null" }]` with no OpenAPI 3.0-only `nullable` keyword;
- a typed full `ExchangeMatchingPayload` containing `booking: null` is validated against the generated matching schema with component references resolved;
- 403, 404, and 409 response media expose named examples for all seven exact codes/messages; `version_conflict` alone contains `{ currentVersion: 8 }`, while the other six contain `data: null`;
- source policy inventories every split Exchange route file, proves exactly one permitted formal booking-conversion POST, exercises the actual mounted app route, reconciles the OpenAPI operation, and continues to reject offer/order/payment/quick/close/cancel mutations.

Final review verification:

```text
cd backend && npm test -- --runInBand tests/exchange-booking-conversion.service.test.ts tests/exchange-booking-conversion.routes.test.ts tests/exchange-booking-conversion.openapi.test.ts tests/realtime-service.test.ts
cd backend && npm test -- --runInBand tests/exchange-source-policy.test.ts
cd backend && npm test -- --runInBand tests/exchange-booking-conversion.repository.test.ts
cd backend && npm test -- --runInBand tests/exchange-matching.openapi.test.ts tests/exchange-matching.routes.test.ts tests/exchange-matching.service.test.ts
cd backend && npm run build
```

Results: Task 5 `71/71`; source policy `2/2`; Task 4 repository `31/31`; matching projection `19/19`; backend build exit `0`; targeted ESLint and `git diff --check` exit `0`.

## Residual risks and deferred acceptance

- This task proves the HTTP/service/realtime exposure over the already reviewed Task 4 transaction boundary; it does not add or rerun a real-MySQL browser acceptance flow.
- Realtime transport remains best-effort after commit by design; failure is logged and does not automatically retry in this microstep.
- No frontend create action is exposed in this task.
