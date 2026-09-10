# Live-screen synchronization with final review-detail main 783439dd

Date: 2026-09-06. Isolated worktree: `/Users/eason/Documents/New project/.worktrees/operations-live-screen-current-main`; branch: `codex/operations-live-screen-current-main`.

The initial request named `fd03470b`. Before any merge began, the parent explicitly superseded the target with final closure `783439dd86a4a3d0a005c211ef7a1b91568a37e1`. Both exact deltas, `44bfaceb..fd03470b` and `fd03470b..783439dd`, were inspected before the normal `--no-ff --no-commit` merge. First parent is clean `12705353a58053f157a3cb721fa31c5226b62f1d`; second parent is exact `783439dd86a4a3d0a005c211ef7a1b91568a37e1`. The merge commit containing this report records those parents. No intermediate fd merge, rebase, or merge into main occurred.

## Incoming scope and reconciliation

The incoming changes are notification-composer localization (`a574a6c3`), formal received-review details (`fd03470b`), and final review-card labels/layout/QA documentation (`783439dd`). Fifteen incoming files changed, 772 insertions and 97 deletions. The merge was automatic and conflict-free; only README and OpenAPI required automatic content merging. No manual source edit, integration behavior gap, or new RED/GREEN repair was needed. Upstream's test-first evidence is documented in its QA report; this synchronization does not claim a new RED phase.

The review repository preserves authenticated merchant scope, completed-order restriction and pagination, and now selects formal payment method/status, non-deleted checkout/ledger currency, explicit OTHER payment label, accepted non-deleted add-ons, shop/service duration and booking notes. No missing currency is invented; NDP and TEST_NDP remain distinct. The strict frontend decoder and OpenAPI retain the corresponding facts and payment enums.

ReceivedReviewFacts keeps actual payment facts separate from special/custom/ordinary tags, omits the subjective `支付顺利` tag from the main card, and keeps review and booking notes separate. Existing amendment history remains intact. Tokyo timestamps, five-language labels, accepted extension totals, capsule tabs, and notification source-language/identity-label controls are preserved. All affected frontend source/tests and the review repository match exact `783439dd` byte-for-byte. The OpenAPI delta introduced by this merge is only the upstream received-review schema expansion; all prior live schemas/routes remain.

Live runtime and actual split-role fail-closed entrypoints, shared Redis target/cache/generation/stream contracts, booking and Exchange transactional location snapshots, canonical home-address binding, all post-commit publication/invalidation hooks, expiry/work-status integration, national unresolved coverage, financial currency separation, and checker deterministic aliases are unchanged from `12705353`. Prisma schema/migrations are unchanged. No Affiliate-specific changes were made. No file in the main checkout was edited or incorporated from uncommitted state.

## Fresh verification

| Gate | Result |
| --- | --- |
| Affected review/list/notice/XP backend | 12 suites / 38 tests passed; 20.671 s |
| Expanded frontend/config | 55 files / 428 tests passed; 24.80 s |
| Task 7 exact matrix | 25 suites / 274 tests passed; 21.008 s |
| Task 8 exact matrix | 14 suites / 154 tests passed; 21.135 s |
| Expanded current-main matrix | 23 suites / 201 tests passed; 60.631 s |
| Backend lint/build | Passed |
| Prisma generate/validate | Passed; generated local Prisma Client 7.8.0 |
| Root lint/build | Passed; Vite built in 18.94 s |
| Separate known admin baseline | 5 passed / 1 failed at `masterDataPages.test.ts:109` |
| Whitespace | Working/staged, original base and target diff checks passed |

Backend matrices use `npm test -- --runInBand <paths>` in `backend/`. Task 7 (25), Task 8 (14), and expanded current-main (23) selections are unchanged from the preceding integration reports. All use isolated test seams and, where needed, local ephemeral Supertest listeners, not real DB/Redis.

Affected backend paths are `tests/<name>.test.ts` for: `backoffice-user-review.repository`, `backoffice-user-review.service`, `backoffice-user-review-api`, `backoffice-user-review-openapi`, `backoffice-user-review-schema`, `official-notice-api`, `official-notice-openapi`, `backoffice-user-list-openapi`, `backoffice-user-list.repository`, `backoffice-user-list.api`, `user-experience-levels`, `user-experience.repository`.

Frontend command: `npm test -- --maxWorkers=1 src/features/platform-user-management src/components/admin/FormalProfileDetailPanels.test.tsx src/features/booking src/pages/user/FormalCheckoutPage.test.ts src/pages/user/FormalCheckoutPage.round-trip.test.tsx scripts/i18n-quality-audit.test.ts scripts/dev-formal-config.test.mjs src/pages/auth/LoginPage.test.ts src/features/official-notices src/features/sos src/features/technician-work-status src/features/admin-system-settings src/components/admin/AdminLayout.test.ts src/components/merchant-admin/MerchantAdminLayout.test.ts src/components/ui/OfficialNoticeBell.test.tsx src/api/officialNotices.test.ts src/api/httpClient.test.ts src/features/realtime/api.test.ts src/pages/mobile/TechnicianPortalPage.test.tsx src/pages/mobile/MerchantPortalPage.test.tsx src/features/settings/UnifiedSettingsPages.test.ts src/pages/admin/AdminCapabilityRoutes.test.ts`.

Gates: backend `npm run prisma:generate && npx --no-install prisma validate && npm run lint && npm run build`; root `npm run lint && npm run build`. Baseline reproduction: root `npm test -- --maxWorkers=1 src/pages/admin/masterDataPages.test.ts`.

## Residuals and authority boundary

The known baseline expects a direct `backofficeRealDataApi.customers("merchant-admin"...)` source call at line 109. Its test and inspected `MerchantAdminPeoplePage.tsx` match target main exactly and were not edited. The old checkout typing baseline was already repaired upstream; it is not a current residual. Existing Vite mixed-import/large-chunk warnings are not product failures.

No real DB/Redis access, formal checker execution, migrations/seed/backfill, browser acceptance, push, deployment, or final main merge was performed. Upstream QA documentation describes its owner's earlier local acceptance; it is not fresh external acceptance of this merged tree. The parent owns review and any subsequent external acceptance.
