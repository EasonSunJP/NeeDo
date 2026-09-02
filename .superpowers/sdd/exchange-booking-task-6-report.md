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
