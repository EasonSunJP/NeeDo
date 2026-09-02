# Exchange Matched Booking Conversion — Task 1 Report

## DONE

The forward schema and immutable snapshot foundation is complete. This task adds the
`BOOKINGS_CREATED` match-event enum value; the one-to-one Participant-to-BookingOrder
relation; participant booking state, service snapshots, and reservation-key transition
columns; the BookingOrder fulfillment-address snapshot; deterministic existing-data
backfill; database constraints; and physical RBAC permission/role mappings.

No migration was applied to a database.

## Files changed

- `backend/prisma/schema.prisma`
- `backend/prisma/migrations/20260903100000_exchange_matched_booking_conversion/migration.sql`
- `backend/tests/exchange-booking-conversion-schema.test.ts`
- `backend/tests/exchange-matching-schema.test.ts`

## RED evidence

Command:

```bash
cd backend && npm test -- --runInBand tests/exchange-booking-conversion-schema.test.ts
```

Result: failed as expected before implementation. Jest reported `ENOENT` for the
missing `prisma/migrations/20260903100000_exchange_matched_booking_conversion/migration.sql`.

## GREEN evidence

Command:

```bash
cd backend && npx prisma validate --schema prisma/schema.prisma && npm run prisma:generate && npm test -- --runInBand tests/exchange-booking-conversion-schema.test.ts tests/exchange-matching-schema.test.ts
```

Result: passed. Prisma schema validation and client generation succeeded; both focused
test suites passed (6 tests total).

`git diff --check` also completed without output.

## Scope notes

- The migration is forward-only and deterministic; it backfills snapshots from the
  Restrict-protected formal Service or TechnicianService records before making them
  required.
- It adds the Participant booking-state CHECK, booking-order unique/indexed FK with
  Restrict behavior, and SQL-backed `exchange:matching:book-own` role mappings.
- It does not add routes, services, order creation, slot mutations, cancellation,
  financial writes, frontend changes, database migration application, push, or deploy.

## BLOCKED

None for Task 1.

## Commit SHA

`d0fcf034` — `feat(exchange): add matched booking schema`
