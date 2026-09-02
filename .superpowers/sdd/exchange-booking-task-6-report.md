# Task 6 — Generic Booking protection for Exchange-linked orders

## Scope delivered

- Generic pending replacement now selects only `PENDING`, non-deleted orders with no
  `exchangeMatchParticipant`, and repeats that relation predicate in its conditional
  `updateMany`. A concurrent Exchange link therefore causes the transaction to abort
  rather than silently cancel the linked order.
- Exchange participant overlap checks now require a non-null `activeReservationKey`,
  so a participant converted to a formal BookingOrder cannot keep blocking later
  confirmation or booking-conflict checks.
- Generic cancellation is routed through the guarded repository transition. A linked
  order returns `exchange_cancellation_required` before any order, schedule-slot,
  status-history, affiliate, finance, or settlement write. The service maps it to
  `41014`, `error.exchange.match_cancellation_required`, HTTP 409. The legacy
  `transitionOrder` fallback remains available only when an injected repository has
  no guarded transition implementation.
- A structurally valid `fulfillmentAddressSnapshot` is normalized only in the full
  BookingOrder projection. Order lists force it to `null`; the established service
  owner/provider scope permits the full detail read and returns 404 to an unrelated
  actor. No matching, event, audit, or notification payload was changed.

## RED evidence

Initial focused Booking run failed as expected with six failures across the three
suites: missing replacement relation guards, missing active-reservation predicate,
unprotected cancellation, absent address projection, and the service falling back to
the ordinary cancellation transition. A subsequent privacy-list regression failed
because the address was exposed in a non-detail order list.

## GREEN evidence

```text
npm test -- --runInBand \
  tests/booking-pending-replacement-contract.test.ts \
  tests/booking-repository-scope.test.ts \
  tests/booking-service.test.ts

3 suites passed, 65 tests passed.

npm test -- --runInBand [Task 4 matching and Task 5 conversion focused suites]

13 suites passed, 97 tests passed.

npm run build

tsc -p tsconfig.build.json passed.
```

`git diff --check` passed before commit.

## Zero-write and privacy evidence

The repository guard test uses a linked `exchangeMatchParticipant` and asserts that
`bookingOrder.updateMany`, `scheduleSlot.updateMany`, and `orderStatusHistory.create`
are never called. The service guard test also asserts that the legacy transition and
ledger release are not called. Address tests prove sanitization (`line1` required,
non-string line fields become `null`), detail visibility to the owner and provider,
404 for an unrelated customer, and `null` on a list projection.

## Deliberately deferred

No Exchange cancellation workflow, schema/migration, frontend, payment, wallet,
deployment, or push was added. The remaining product risk is intentional: actual
matched-order cancellation stays blocked until the separately designed bilateral
Exchange cancellation protocol exists.

## Commit

Implementation commit: `a58d012797131a18f8abcbbb3a5a9c1ab942e490`

## Review follow-up: behavior-level replacement and race proof

This follow-up adds two stateful, rollback-aware `BookingRepository.createBooking`
tests. They use a committed state plus a transaction-local working copy: successful
callbacks commit the working copy, while a thrown callback discards it. The race
fixture commits the new Exchange relation independently after the selection read and
before conditional replacement, matching the relevant `ReadCommitted` visibility
boundary.

- Mixed state proof: an ordinary and an Exchange-linked `PENDING` share a customer.
  The real repository transaction cancels only the ordinary order, writes its
  `CANCELLED` history, releases only its slot, retains the linked order and its slot
  capacity, and creates the new ordinary order.
- Concurrent-link proof: the selected ordinary candidate gains an Exchange relation
  before `updateMany`; the count mismatch aborts. The committed state retains that
  external link but has no cancellation, slot release, cancellation history, new
  order, affiliate invalidation, affiliate preparation, or affiliate persistence.

The first execution was RED with both tests failing because the new harness omitted
the required `deletedAt: null` fixture baseline and therefore selected no candidate.
After correcting that fixture (without production edits), both behavior tests were
GREEN. This exposed no production defect.

The real-MySQL, rollback-contained end-to-end checker remains Task 8 scope: it must
exercise the formal migration/runtime configuration and verify physical financial
tables. This Task 6 harness proves repository transaction semantics without adding a
second production checker or broadening schema/financial scope.

Follow-up verification:

```text
Booking focused suites: 3 suites, 67 tests passed.
Task 4/5 focused regressions: 13 suites, 97 tests passed.
backend build: passed.
Touched test targeted ESLint: passed.
git diff --check: passed.
```

Full backend lint remains blocked by a pre-existing, unrelated
`tests/exchange-booking-conversion.validators.test.ts:31` unused `_next` error.
Full formatting check also reports pre-existing style drift across 520 files; neither
was modified for this focused follow-up.
