# Exchange Booking Task 4 Report

## Status

DONE

Implementation commits:

- `b01b40d1` — initial atomic matched-result conversion repository
- `b13a897a` — reviewer-fix hardening and behavior coverage

## Files

- `backend/src/repositories/exchange-booking-conversion.repository.ts`
- `backend/tests/exchange-booking-conversion.repository.test.ts`
- `.superpowers/sdd/exchange-booking-task-4-report.md`

No route, service, controller, frontend, migration, wallet, hold, ledger, payment, settlement, deployment, or remote change was added.

## RED evidence

The initial repository RED was:

```text
cd backend && npm test -- --runInBand tests/exchange-booking-conversion.repository.test.ts
FAIL tests/exchange-booking-conversion.repository.test.ts
TS2307: Cannot find module '../src/repositories/exchange-booking-conversion.repository'
Test Suites: 1 failed, 1 total
```

For the six reviewer findings, behavior tests were added before the fixes. The focused run produced:

```text
FAIL tests/exchange-booking-conversion.repository.test.ts
Test Suites: 1 failed, 1 total
Tests: 16 failed, 10 passed, 26 total
```

The failures demonstrated owner/identity replay disclosure, corrupted persisted actor replay, swallowed externally-owned `TransactionClient` aborts, stale/split replacement-slot locking, five revoked live-eligibility states being accepted, two Booking plus two Participant overlap queries, ignored deterministic suffix injection, no targeted order-number collision retry, and unstable collision exhaustion.

## GREEN evidence

Final exact focused suite:

```text
cd backend && npm test -- --runInBand tests/exchange-booking-conversion.repository.test.ts
PASS tests/exchange-booking-conversion.repository.test.ts
Test Suites: 1 passed, 1 total
Tests: 28 passed, 28 total
```

Task 1–3 focused regression evidence:

```text
cd backend && npm test -- --runInBand \
  tests/exchange-matching.repository.test.ts \
  tests/exchange-booking-conversion.validators.test.ts \
  tests/exchange-booking-conversion-schema.test.ts \
  tests/transaction-conflict-retry.test.ts
Test Suites: 4 passed, 4 total
Tests: 19 passed, 19 total
```

The first restricted regression attempt hit Supertest's sandbox-only `listen EPERM: operation not permitted 0.0.0.0`; the exact command was rerun with local-listener permission and passed 19/19.

Backend build and focused quality checks:

```text
cd backend && npm run build
> tsc -p tsconfig.build.json
exit 0

cd backend && npx eslint \
  src/repositories/exchange-booking-conversion.repository.ts \
  tests/exchange-booking-conversion.repository.test.ts
exit 0

cd backend && npx prettier --check \
  src/repositories/exchange-booking-conversion.repository.ts \
  tests/exchange-booking-conversion.repository.test.ts
All matched files use Prettier code style!

git diff --check
exit 0
```

## Reviewer-fix evidence

1. Replay authorization/privacy: customer, post, and matching locks plus current owner user/identity validation now precede idempotency lookup. Both key replay and different-key committed-event paths validate the persisted event actor before fingerprint comparison or payload reconstruction. Wrong user, wrong identity, combined mismatch, and corrupted event-actor tests return only `not_allowed` and commit zero writes.
2. External transaction rollback safety: an externally supplied `Prisma.TransactionClient` no longer translates `ConversionAbort`; the abort escapes to its owner. A late second-slot failure test proves no normal result can be committed by an outer transaction.
3. Replacement slot union/counts: ordinary unlinked PENDING orders are discovered after the customer lock and before slot locks. Participant and replacement slot ids are locked once as a sorted union, and authoritative slot rows are reloaded after releases. Same-target capacity-two and opposite ordering tests prove final count/status and ascending union order.
4. Live eligibility: locked slot projections and validation now recheck active shop suspension, compatible shop pricing mode, published/active technician, active shop affiliation at `occurredAt`, and APPROVED plus active/bookable technician service. Each revoked state has a zero-write negative test.
5. Order numbers: one batch-level used-number set prevents duplicate inserts, and each order has five bounded attempts. Only `P2002` targets for `booking_orders.order_no` are retried; unrelated unique conflicts escape immediately. Tests cover intra-batch duplicate suffixes, one database collision then success, bounded exhaustion with rollback/stable error, and unrelated P2002 passthrough.
6. Lock-scoped N+1 removal: multi-participant external overlap checks now use one Booking `OR` query and one active Participant `OR` query. Tests assert the exact query counts and preserve both rejection semantics.

## Transaction, rollback, and idempotency evidence

- A repository-owned call has one `ReadCommitted` Prisma transaction wrapped by the established transaction-conflict retry helper. An externally owned transaction stays owned by its caller.
- Parameterized `Prisma.sql` locking reads preserve customer → post → matching → sorted participants → sorted unique technicians → sorted union slots. There is no unsafe raw SQL.
- State, version, immutable Participant authority, claim relations, live formal refs/times/status/capacity, technician uniqueness, external overlaps, and customer overlaps are revalidated under the locks.
- Customer overlap is queried once before this conversion creates orders, so participants in the same batch are never rejected against one another.
- Ordinary replacement uses conditional order updates/count checks, exact capacity release, cancellation history, and in-transaction Affiliate invalidation; locked slots are authoritatively reloaded before creation.
- Forced late failures and order-number exhaustion prove zero committed cancellation, capacity, order, Participant, event, notification, audit, or finance writes.
- Same key/fingerprint reconstructs `replayed` with zero writes; same key/different fingerprint returns `idempotency_conflict`; a different key after success returns `already_created`; stale version returns the locked current version.

## Privacy and finance boundary evidence

- Home orders alone receive the address snapshot; store orders use database null.
- Event and audit metadata contain only Exchange, Participant, Booking, count, quote-total, and version identifiers/numbers. Tests reject address, phone, email, and token keys.
- Provider notifications contain only Exchange post/claim/order identifiers, order number, and pending status.
- The production repository has no wallet, hold, ledger, reconciliation, external-payment, or settlement dependency/call. Finance write probes remain untouched on success and rollback.
- `quoteAmountJpy` is copied only into Booking JPY price/payment snapshots; no payment is collected or confirmed.

## Scope notes and residual risks

- This remains repository-only and uses a rollback-aware stateful Prisma harness. A real MySQL rollback-contained concurrency race remains a later implementation-plan verification task and is not claimed here.
- No migration was applied, no listener/browser acceptance was performed, and nothing was pushed or deployed.
- Task 5 was not started.
