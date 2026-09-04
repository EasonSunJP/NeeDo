# Exchange booking conversion — Task 3 report

## DONE

- Defined the booking-conversion API and repository boundary types only; no endpoint, controller command, repository implementation, schema, migration, database, payment, or frontend behavior was added.
- Added strict `expectedVersion` and post-id Zod schemas.
- Extracted matching selection's header parsing into `validateExchangeIdempotencyKey`; the existing select route keeps the same header validation and forwards the common response-local key.
- Added the eight stable booking/cancellation error constants and the `exchange:matching:book-own` permission. Customer and merchant-owner receive it; technician and merchant-staff keep the pre-existing reader-only grant and remain denied select/book.

## BLOCKED

None.

## Files

- `backend/src/types/exchange-booking-conversion.types.ts`
- `backend/src/validators/exchange-booking-conversion.validators.ts`
- `backend/src/middlewares/exchange-idempotency-key.middleware.ts`
- `backend/src/routes/exchange-matching.routes.ts`
- `backend/src/controllers/exchange-matching.controller.ts`
- `backend/src/constants/error-codes.ts`
- `backend/src/constants/permissions.constants.ts`
- `backend/tests/exchange-booking-conversion.validators.test.ts`
- `backend/tests/exchange-matching.validators.test.ts`
- `backend/tests/exchange-matching.routes.test.ts`
- `backend/tests/exchange-permissions.test.ts`

## RED evidence

Before implementation, the exact focused suite failed because the conversion validator and shared middleware modules were absent, `matchingBookOwn` did not exist, and the new error constants were unregistered. The existing route fixture also surfaced its already-required `viewer.canCreateBookings` field and was corrected to match the current contract.

## GREEN evidence

- `cd backend && npm test -- --runInBand tests/exchange-booking-conversion.validators.test.ts tests/exchange-matching.validators.test.ts tests/exchange-matching.routes.test.ts tests/exchange-permissions.test.ts`
  - PASS: 4 suites, 20 tests.
- `cd backend && npm run build`
  - PASS: `tsc -p tsconfig.build.json` exit code 0.
- `git diff --check`
  - PASS.

## Error-code collision evidence

- Before the change, `git show HEAD:backend/src/constants/error-codes.ts | rg -n "40313|40429|4100[9-9]|4101[0-6]"` returned no matches.
- The new values are `40313`, `40429`, and `41009` through `41014`.

## Scope notes

- The Task 2 `EXCHANGE_MATCHED_PROVIDER_PERMISSION_CODES` bundle was reused rather than duplicated or weakened.
- The booking endpoint, execution service, persistence, booking-order creation, schedule capacity changes, financial changes, OpenAPI route, and cancellation implementation remain deferred to subsequent microsteps.

## Implementation commit

`0e226a0e feat(exchange): define booking conversion contract`
