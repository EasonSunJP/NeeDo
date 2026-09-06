# MySQL ranking alias compatibility fix

Date: 2026-09-06. Base: `d20f593c1809d4bfd2b50c2b284b0a417d7ebe77`. Worktree: `/Users/eason/Documents/New project/.worktrees/operations-live-screen-current-main`; branch: `codex/operations-live-screen-current-main`.

## Evidence and diagnosis

The parent reported isolated MySQL 8.0.46 acceptance had applied all 146 migrations and full seed, then the exact checker failed with SQL syntax error 1064 near `rank, entity_public_id AS entityPublicId` (SQL line 464). The parent verified DB/Redis cleanup and removed the scratch database and temporary server. This report does not claim those operations were performed or repeated by this agent.

Source inspection traced the reserved, unquoted alias to both production ranking SELECTs in `live-dashboard.repository.ts` and the independent ranking SELECT in `check-live-dashboard-flow.ts`. The existing `AnalyticsRankingRepository` uses `rankingPosition`, avoiding the reserved alias. Prior unit SQL harnesses returned `rank` rows without validating this MySQL syntax boundary, so they could not catch the driver failure.

## Minimal change and RED/GREEN

All three SELECT aliases now use `ranking_position AS rankingPosition`. The two raw row types and their mappers consume `rankingPosition`. The external API/domain field remains `rank`; no ordering, rank calculation, ranking eligibility, financial arithmetic, scope filter, snapshot/cache/SSE contract, or checker oracle predicate changed.

Tests were changed first, before implementation:

1. Production query regression captures both real Prisma SQL ranking queries and rejects unquoted `AS rank`, requiring `ranking_position AS rankingPosition`.
2. Existing raw-row harness now supplies bigint `rankingPosition`; a behavior regression requires public ranks 1 through 10 in both service and technician rankings and no leaked internal alias. The existing top-ten assertion is retained.
3. Checker source regression rejects unquoted `AS rank`, requires the explicit alias and raw type, and verifies mapping to `rank: numeric(row.rankingPosition)` without the old `row.rank` access.

RED command in `backend/`: `npm test -- --runInBand tests/live-dashboard.repository.test.ts tests/live-dashboard-flow-script.test.ts`.

Observed RED: 2 suites failed, 4 tests failed / 24 passed / 28 total, 5.473 s. Both alias guards failed; the new mapping assertion received ten zeroes instead of 1–10, and the existing final-rank assertion received 0 instead of 10. These were assertion failures, not compilation failures.

After the minimal implementation, the identical command passed 2 suites / 28 tests, 7.442 s. Systematic-debugging and TDD constrained this repair to the failing SQL/row boundary; verification-before-completion required fresh matrix and build output before commit.

## Final verification

| Gate | Result |
| --- | --- |
| Focused repository/checker | 2 suites / 28 tests passed |
| Task 8 exact matrix | 14 suites / 157 tests passed; 16.174 s |
| Expanded current-main matrix | 23 suites / 202 tests passed; 44.532 s |
| Backend lint/build | Passed |
| Prisma validate | Passed |
| Diff check | Passed |

Task 8 and expanded current-main selections are the unchanged 14-suite and 23-suite matrices documented in the preceding synchronization reports. They use `npm test -- --runInBand <paths>` with isolated test seams and permitted local ephemeral Supertest listeners. No actual data-service connection or formal checker command is involved. Other gates: `npm run lint && npm run build && npx --no-install prisma validate` in `backend/`.

No frontend source, schema/migration, or Affiliate-specific change was made. The unchanged frontend `masterDataPages.test.ts:109` baseline is still out of scope and was not rerun for this backend-only alias repair. No main synchronization, push, deployment, database/Redis/browser access, migration/seed/backfill, or formal checker execution occurred. Real MySQL acceptance of the corrected SQL remains the parent's next gate; isolated tests do not substitute for it.
