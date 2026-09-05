# Exchange matched booking conversion — Task 2 report

## Status

DONE

## Implementation commit

`c4865e171a1848657b3a6e42b597fb104a3169d6` — `feat(exchange): project matched booking state`

## Files

- `backend/src/types/exchange-matching.types.ts`
- `backend/src/types/exchange.types.ts`
- `backend/src/repositories/exchange-matching.repository.ts`
- `backend/src/repositories/exchange-claim.repository.ts`
- `backend/src/repositories/exchange.repository.ts`
- `backend/tests/exchange-matching.repository.test.ts`
- `backend/tests/exchange-claim.repository.test.ts`
- `backend/tests/exchange.repository.test.ts`

## RED evidence

Before production edits, ran:

```sh
cd backend && npm test -- --runInBand tests/exchange-matching.repository.test.ts tests/exchange-claim.repository.test.ts tests/exchange.repository.test.ts
```

The added focused tests failed for the intended missing contracts: no immutable snapshot/linked-order projection, no selected-provider-only payload protection in the mapper, no `activeReservationKey IS NOT NULL` filtering in matching or claim overlap queries, and no `viewer.canViewMatching`. The initial type-only failure for `canCreateBookings` was changed to a runtime assertion before implementation so the recorded RED run was behavior-level rather than a test compilation failure.

## GREEN evidence

After the smallest repository/type changes, ran:

```sh
cd backend && npm test -- --runInBand tests/exchange-matching.repository.test.ts tests/exchange-claim.repository.test.ts tests/exchange.repository.test.ts
cd backend && npm run build
```

Result: 3 suites / 32 tests passed; `tsc -p tsconfig.build.json` passed. `git diff --check` passed before staging.

## Scope notes

- Reused the Task 1 persisted `serviceNameSnapshot` and `serviceDurationSnapshot`; no snapshot schema, migration, or write-path rewrite was added.
- Matching reads now project immutable service snapshots and a linked booking status through an exhaustive enum mapping.
- A non-owner with no selected participant gets no matching payload; a selected provider is filtered to their own participant; only an eligible owner sees `canCreateBookings`.
- Converted participant locks are excluded from claim and matching conflicts through `activeReservationKey: { not: null }`.
- No route, controller, OpenAPI, database migration, frontend, payment, booking-creation command, deployment, or migration application was changed.

## Residual risks / deferred scope

- Formal batch `BookingOrder` creation, idempotency, capacity transfer, cancellation protection, route/RBAC/OpenAPI wiring, real-MySQL checker, and browser acceptance remain later tasks.
- This Task 2 verification is repository-unit plus TypeScript build only; no database mutation was run.

## Review follow-up: RBAC reconciliation and characterization coverage

Implementation commit: `2b540637c17f0a379f12ef66011aa57bebea3ae4` — `fix(exchange): grant matched providers read access`

### RED evidence

The matching validator/RBAC contract was changed first to require `merchant_staff` and `technician` to receive `exchange:matching:read-own`, while continuing to deny `exchange:matching:select-own` and the deferred `exchange:matching:book-own`. The focused run failed exactly because both provider role assignments lacked the read permission.

The requested positive `canCreateBookings` and complete BookingOrder-status tests were also added. They passed immediately against the existing repository behavior, documenting previously uncharacterized behavior rather than a new defect.

### GREEN evidence

`buildRolePermissionAssignments` now adds only the existing `matchingReadOwn` permission to the two provider roles. It does not add selection or booking permissions.

```sh
cd backend && npm test -- --runInBand tests/exchange-matching.repository.test.ts tests/exchange-claim.repository.test.ts tests/exchange.repository.test.ts tests/exchange-matching.validators.test.ts
cd backend && npm test -- --runInBand tests/exchange-permissions.test.ts tests/exchange-matching.validators.test.ts
cd backend && npm run build
```

Result: the first focused run passed 4 suites / 40 tests; the Exchange RBAC run passed 2 suites / 14 tests; backend TypeScript build passed. No migration, route, validator implementation, OpenAPI, deployment, or database mutation was performed.
