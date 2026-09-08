# Final staffing/order main synchronization

Date: 2026-09-06. Worktree: `/Users/eason/Documents/New project/.worktrees/operations-live-screen-current-main`; branch: `codex/operations-live-screen-current-main`.

Normal merge first parent: `e6c14d577d121cd633af8a84233215f04065d469`. Exact requested second parent: `9651714a4e76fa7a35af3a6a266660fa14961367`. The merge commit containing this report records both histories; no rebase or merge into main occurred.

## Incoming history and conflict

Before merging, inspection covered `94685eec..9651714a`, the additional directory delta from the prior shared ancestor `783439dd`, and target merge parents. Target `9651714a` has parents `be10893bbbab71f82a3e6fc8ecd338e6fbd79e36` (exact EXP display) and `4c742a05fe06e0ac8cfeb0a9e7234e66819dc2d7` (staffing/order final QA). Incoming ancestry also includes directory follow-up `94685eec`, staffing/order implementation `53757569`, durable-logout navigation `ac39247e`, formal staff cards `92a8b76b`, and their normal main synchronizations.

The only conflict was an additive block in `src/i18n/translations.ts`: the feature's five administrative-region booking labels and main's two formal scheduling labels occupied the same insertion point. Both blocks were retained verbatim. Relative to target main, the translation delta remains only those five approved live labels. No whole-file side selection, test assertion weakening, or manual production behavior repair occurred. No new integration behavior gap was found, so no new RED/GREEN repair was required; the existing test-first upstream and live-alias regressions were rerun unchanged.

## Semantic preservation

- Booking repository's incoming read-only `dateMode: overlaps` applies `startsAt < to && endsAt > from`; omitted mode retains starts-within behavior. Validator requires both bounds and retains the existing 93-day limit. Existing route/controller/service pass the validated query while enforcing actor scope. The merge preserves all booking writes, home accepted-address/location binding, transactional capacity and estimate invariants, and post-commit live/work-status hooks.
- Backoffice repository/service/OpenAPI retain numeric NDP-balance/booking-count page sorting with the same filters and merchant scope; exact decimal `totalExp` is added without losing legacy units or changing level thresholds. Personal merchant identities are deduplicated while preserving names/application status and independent NDP/Test NDP balances. Live shop-region verification, dashboard schemas/routes and permissions remain.
- Core shop detail includes valid active affiliated technicians, de-duplicated with direct technicians. Formal merchant appointment view reads complete paginated actual orders (not availability slots), clips overnight intervals, preserves historical technician lanes and uses real order detail IDs. Detailed staffing remains formal schedule data with empty/loading/error states. Existing shared calendar/grid components remain; the schedule-grid skill guided inspection, not a redesign. Browser layout acceptance is deferred per the explicit no-browser boundary.
- Incoming scheduling, merchant-order/cards/home, directory frontend, core-read, numeric-sort and experience domain/service sources are byte-identical to exact target main. The booking frontend API auto-merge adds only the new optional dateMode while preserving home-location inputs. Capsule/review facts and durable logout navigation remain.
- `e6c14d57` production/checker `rankingPosition` aliases and mappings are unchanged, as are live runtime/shared Redis configuration, actual split-role fail-closed startup, Exchange snapshot/publication fixes, expiry callbacks, national unresolved coverage and financial predicates. These files were compared directly against the first parent. Prisma schema and migrations are unchanged by this merge.
- No Affiliate-specific edit or main-checkout/uncommitted-other-owner edit occurred. Incoming maintenance tools were compiled only, never executed against data.

## Fresh verification

| Gate | Result |
| --- | --- |
| Focused staffing/order/directory/EXP/live overlap | 16 suites / 150 tests passed; 39.077 s |
| Expanded relevant frontend/config | 70 files / 530 tests passed; 30.87 s |
| Task 7 exact matrix | 25 suites / 279 tests passed; 22.099 s |
| Task 8 exact matrix | 14 suites / 157 tests passed; 8.05 s |
| Expanded current-main exact matrix | 23 suites / 202 tests passed; 39.366 s |
| Backend lint/build | Passed |
| Prisma generate/validate | Passed; local Prisma Client 7.8.0 generated |
| Root lint/build | Passed; Vite built in 8.37 s |
| Admin maintenance compilation | Passed; both CommonJS bundles compiled, not executed |
| Separate known admin baseline | 5 passed / 1 failed at `masterDataPages.test.ts:109` |
| Diff checks | Working/staged and original-base/target diffs passed; no unresolved paths |

All backend suites use `npm test -- --runInBand <paths>` in `backend/`, with isolated test seams and permitted local ephemeral Supertest listeners. No real MySQL/Redis connection or formal checker execution is involved. Task 7 (25), Task 8 (14), and expanded current-main (23) file selections are unchanged from preceding integration reports.

Focused backend names (`tests/<name>.test.ts`): `admin-six-month-plan`, `core-read.repository`, `core-read-api`, `booking-api`, `booking-repository-scope`, `booking-validator`, `backoffice-user-list-openapi`, `backoffice-user-list.api`, `backoffice-user-list.repository`, `managed-user-numeric-sort`, `user-experience-levels`, `user-experience.service`, `user-experience-api`, `user-experience.repository`, `live-dashboard.repository`, `live-dashboard-flow-script`.

Frontend uses `npm test -- --maxWorkers=1` with the preceding 55-file selection, plus `src/components/scheduling`, `src/features/scheduling`, `src/features/dispatch-center/components/OverviewWorkspaceHeader.test.tsx`, `src/features/shop-analytics`, and `src/pages/mobile/MerchantOrderRoutePages.formal.test.tsx`. The resulting 70-file matrix includes all incoming frontend tests, live booking forms, and notification/SOS/work-status/settings compatibility.

Other commands: backend `npm run prisma:generate && npx --no-install prisma validate && npm run lint && npm run build`; root `npm run lint && npm run build && node scripts/build-admin-maintenance.mjs`; separate baseline `npm test -- --maxWorkers=1 src/pages/admin/masterDataPages.test.ts`.

## Residuals and handoff

The unchanged baseline source assertion expects a direct merchant `backofficeRealDataApi.customers` call. Both its test and `MerchantAdminPeoplePage.tsx` match target main exactly; neither was edited. Existing Vite large-chunk/mixed-import warnings and the numeric-sort test's experimental SQLite warning are non-fatal. No other failure occurred in the completed gates.

This checkpoint is local feature-branch integration only, not review approval or real runtime acceptance. No database/Redis access, migration/seed/backfill or formal checker/staffing checker execution, browser operation, push, deployment or final main merge was performed. Upstream QA documents refer to their owners' earlier acceptance; the parent owns final review and fresh external acceptance of this merged tree.
