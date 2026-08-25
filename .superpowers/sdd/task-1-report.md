# Task 1 Report — Formal Profile Detail Repository Aggregation

## Status

DONE

Commit: `9c953ee feat: aggregate formal profile details`

## Implementation

- Added formal profile-detail payload contracts while preserving the existing paginated technician and customer list payloads unchanged.
- Added `getTechnicianDetail(input)` and `getCustomerDetail(input)` to the backoffice repository port and implementation.
- Detail reads first verify the profile is active (not soft-deleted) and, for merchants, belongs to the caller's shop.
- Account payloads use explicit selections only and never select `passwordHash`. Merchant results restrict roles to the current shop and identities to the current shop or the selected profile's global identity.
- Technician details aggregate scoped booking status/revenue, calculate intersected UTC day/week/month schedule minutes, return no more than 12 future schedule slots, merge/deduplicate active technician and legacy services, select the active compensation profile, and return bounded scoped audit history plus real lifecycle timestamps.
- Customer details aggregate scoped booking status/completed spend, return the next booking and at most 10 recent bookings, and return the same bounded scoped account/review/audit information.
- Merchant audit reads require the selected target or profile/user metadata **and** matching `metadata.shopId`, preventing cross-shop audit exposure.

## Files

- Modified: `backend/src/services/backoffice.service.ts`
- Modified: `backend/src/repositories/backoffice.repository.ts`
- Created: `backend/tests/backoffice-profile-detail-repository.test.ts`

## TDD Evidence

### RED

Command:

```bash
cd backend && npm test -- --runTestsByPath tests/backoffice-profile-detail-repository.test.ts
```

Output:

```text
FAIL tests/backoffice-profile-detail-repository.test.ts
Property 'getTechnicianDetail' does not exist on type 'BackofficeRepository'.
Property 'getCustomerDetail' does not exist on type 'BackofficeRepository'.
Test Suites: 1 failed, 1 total
Tests:       0 total
```

This was the expected failure: the required repository methods did not yet exist.

### GREEN

Command:

```bash
cd backend && npm test -- --runTestsByPath tests/backoffice-profile-detail-repository.test.ts tests/backoffice-repository-search.test.ts
```

Output:

```text
PASS tests/backoffice-profile-detail-repository.test.ts
PASS tests/backoffice-repository-search.test.ts
Test Suites: 2 passed, 2 total
Tests:       8 passed, 8 total
Snapshots:   0 total
```

Build command:

```bash
cd backend && npm run build
```

Output:

```text
> @needo/backend@0.1.0 build
> tsc -p tsconfig.build.json
```

## Self-review

- Reviewed the exact Task 1 diff and ran `git diff --check`; no whitespace errors were reported.
- Confirmed the three-file commit contains no schema or migration changes and no modifications to the implementation plan or progress ledger.
- Confirmed each merchant query includes the derived `shopId` where applicable: profile verification, booking aggregates/lists, schedule, services, compensation, and audit records.
- Confirmed list contracts (`BackofficeTechnicianPayload` and `BackofficeCustomerPayload`) remain unchanged.
- Confirmed the focused regression suite and TypeScript build pass after the final scope-hardening changes.

## Concerns

None. This task deliberately adds repository contracts only; routes/controllers and frontend consumption are deferred to the following approved tasks.

## Review Fix Follow-up

Commit: `efc8468 fix: harden formal profile detail scope`

### Reviewer findings addressed

- Merchant account output now includes seed-compatible `technician_profile` or `customer_profile` identity and role records only when their scope ID matches the selected profile. Other profile IDs remain excluded.
- Technician audit lookup now recognizes the established `metadata.technicianId` key in addition to `technicianProfileId`, typed profile targets, user targets, and the existing customer-profile metadata key. Merchant reads still require matching `metadata.shopId`.
- Technician schedule aggregation now reads the union of the current UTC week and current UTC month, so a week crossing a month boundary cannot lose valid schedule intervals. Day/week/month totals are still computed by interval intersection.
- Customer `nextBooking` now limits future records to `PENDING`, `CONFIRMED`, and `IN_SERVICE`; completed and cancelled terminal orders are excluded.
- The focused repository test now covers merchant customer-profile verification, sensitive-field exclusion, role/identity filtering, audit mapping and scope query, week-boundary intersections, terminal next-booking exclusion, service deduplication, bounded schedule/audit reads, and formal empty sections.

### Follow-up RED

Command:

```bash
cd backend && npm test -- --runTestsByPath tests/backoffice-profile-detail-repository.test.ts
```

Output:

```text
FAIL tests/backoffice-profile-detail-repository.test.ts
4 failing regression tests:
- seed-compatible technician_profile/customer_profile identities were omitted
- metadata.technicianId was absent from the scoped audit query
- the schedule read started at 2026-09-01 rather than the current week start of 2026-08-31
- a completed future order was selected as nextBooking instead of the confirmed order
Test Suites: 1 failed, 1 total
Tests:       4 failed, 4 passed, 8 total
```

### Follow-up GREEN

Command:

```bash
cd backend && npm test -- --runTestsByPath tests/backoffice-profile-detail-repository.test.ts tests/backoffice-repository-search.test.ts
```

Output:

```text
PASS tests/backoffice-profile-detail-repository.test.ts
PASS tests/backoffice-repository-search.test.ts
Test Suites: 2 passed, 2 total
Tests:       13 passed, 13 total
Snapshots:   0 total
```

Build command:

```bash
cd backend && npm run build
```

Output:

```text
> @needo/backend@0.1.0 build
> tsc -p tsconfig.build.json
```

`git diff --check` also completed with no output.

## 2026-08-26 — Technician ranking period and query contract audit

### Scope checked

- `backend/src/validators/backoffice.validator.ts`
- `backend/src/services/backoffice.service.ts`
- `backend/tests/technician-ranking-period.test.ts`

### Changes made

- Made `technicianRankingQuerySchema` strict, so unrecognised query fields are rejected.
- Added `page: 1` and `pageSize: 20` defaults.
- Exported `TechnicianRankingPeriod`, `TechnicianRankingSort`, and `BackofficeTechnicianRankingQuery`; retained `TechnicianRankingQuery` as a compatibility alias.
- Added regression coverage for both query-contract requirements.

### TDD and verification evidence

- Baseline: the specified test command passed with 12 tests.
- RED: after adding the two contract assertions, it failed because the defaults were absent and an `unexpected` field was accepted.
- GREEN:

```text
npm --prefix backend test -- technician-ranking-period.test.ts --runInBand
PASS: 1 suite, 13 tests

npm --prefix backend run build
PASS: tsc -p tsconfig.build.json (exit 0)
```

### Remaining note

The integrated resolver deliberately returns the richer established window contract
`{ period, timeZone, fromDate, toDate, fromInclusive, toExclusive }`. The brief's
short-form `from` and `timezone` names are not literal members. Changing that shape
would require coordinated repository/caller changes outside this task's permitted files, so
the established contract and its existing tests were preserved.

