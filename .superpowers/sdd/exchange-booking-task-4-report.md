# Exchange Booking Task 4 Report

## Status

DONE

Implementation commit: `b01b40d1`

## Files

- `backend/src/repositories/exchange-booking-conversion.repository.ts`
- `backend/tests/exchange-booking-conversion.repository.test.ts`
- `.superpowers/sdd/exchange-booking-task-4-report.md`

No route, service, controller, frontend, migration, wallet, ledger, payment, settlement, deployment, or remote change was added.

## RED evidence

Command:

```text
cd backend && npm test -- --runInBand tests/exchange-booking-conversion.repository.test.ts
```

Observed before production code existed:

```text
FAIL tests/exchange-booking-conversion.repository.test.ts
TS2307: Cannot find module '../src/repositories/exchange-booking-conversion.repository'
Test Suites: 1 failed, 1 total
```

A later focused behavior test also reproduced the store-address persistence distinction: it failed while store mode used `Prisma.JsonNull`, then passed after the repository used database `Prisma.DbNull`.

## GREEN evidence

Final exact focused suite:

```text
cd backend && npm test -- --runInBand tests/exchange-booking-conversion.repository.test.ts
PASS tests/exchange-booking-conversion.repository.test.ts
Test Suites: 1 passed, 1 total
Tests: 9 passed, 9 total
```

Backend build:

```text
cd backend && npm run build
> tsc -p tsconfig.build.json
exit 0
```

Task 1-3 focused regression evidence:

```text
cd backend && npm test -- --runInBand \
  tests/exchange-matching.repository.test.ts \
  tests/exchange-booking-conversion.validators.test.ts \
  tests/exchange-booking-conversion-schema.test.ts \
  tests/transaction-conflict-retry.test.ts
Test Suites: 4 passed, 4 total
Tests: 19 passed, 19 total
```

Focused quality checks:

```text
cd backend && ./node_modules/.bin/eslint \
  src/repositories/exchange-booking-conversion.repository.ts \
  tests/exchange-booking-conversion.repository.test.ts
exit 0

cd backend && ./node_modules/.bin/prettier --check \
  src/repositories/exchange-booking-conversion.repository.ts \
  tests/exchange-booking-conversion.repository.test.ts
exit 0 after formatting
```

## Transaction, rollback, and idempotency evidence

- One `ReadCommitted` Prisma transaction is wrapped by `runWithTransactionConflictRetry`.
- Parameterized `Prisma.sql` locking reads use the deterministic order customer, post, matching, sorted participants, sorted unique technicians, then sorted unique slots.
- Owner, Demand/matching matched state, exact version, Participant authority, live formal relations, future slot state/capacity, unique technicians, external hard-lock bookings, external active Participant reservations, and pre-existing customer overlaps are revalidated after locks.
- Same-batch orders are not considered customer conflicts because customer overlap is checked once before any batch order is created.
- Ordinary PENDING replacement selects and conditionally updates only unlinked orders, releases exact slot counts, writes cancellation history, and invokes Affiliate invalidation with the transaction client.
- A forced failure on the second slot proved zero committed cancellation, capacity, order, Participant, event, notification, audit, or finance writes and restoration of the old PENDING baseline.
- Same key and fingerprint returns reconstructed `replayed` data with zero writes; same key and different fingerprint returns `idempotency_conflict`; a different key after success returns `already_created`; stale version returns the locked current version with zero writes.

## Privacy and finance boundary evidence

- Home orders alone receive `line1/line2/line3`; store orders use database null.
- Event and audit metadata contain only Exchange, Participant, Booking, count, quote-total, and version identifiers/numbers. Tests reject address, phone, email, and token keys.
- Provider notifications contain only Exchange post/claim/order identifiers, order number, and pending status.
- The repository has no wallet, hold, ledger, reconciliation, order-financial, external-payment, or settlement dependency/call. Focused tests install finance write probes and assert that every probe remains untouched on success and rollback.
- `quoteAmountJpy` is copied only into Booking JPY price/payment snapshots; no service payment is collected or confirmed.

## Scope notes and residual risks

- This task is repository-only and uses a stateful rollback-aware Prisma transaction harness. A real MySQL rollback-contained flow and guarded concurrency race remain later implementation-plan tasks, not evidence claimed here.
- Order numbers retain the established `ND<UTC timestamp><4 digits>` random suffix shape; database uniqueness remains the final collision guard.
- No migration was applied, no listener/browser acceptance was performed, and nothing was pushed or deployed.
