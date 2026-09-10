# Conversation Batch Stability Completion Plan

> **Scope:** Verify and, only where necessary, repair the non-affiliate work completed in the current conversation against the latest local `main`.

**Goal:** Preserve the previously completed authentication recovery, formal booking/order, technician/profile card, checkout time selection, scheduling, operations data, IM/Social, and related regressions while confirming that later local-main changes have not destabilized them.

**Constraints:**

- Work only on `codex/conversation-batch-stability-20260910` until final local integration.
- Treat the latest local `main` as the source baseline; do not fetch, pull, push, open a PR, deploy, or modify any remote environment.
- Keep affiliate marketing development out of this batch. A separately owned Affiliate task may advance concurrently, but none of its commits or worktree changes may enter this branch.
- Do not inspect, start, stop, restart, or otherwise operate port 5180.
- Do not modify or merge other active task worktrees or their branches.
- Add a failing regression test before any production bug fix.

## Task 1: Baseline and conflict audit

- [x] Confirm the branch starts at the latest local `main`.
- [x] Confirm the isolated worktree is clean.
- [x] Map the current conversation's completed plans and representative tests to the current source tree.
- [x] Confirm unrelated active branches remain excluded.

## Task 2: Targeted stability and security regression

- [x] Run authentication/session supersession and authorization regression tests.
- [x] Run formal booking/order, availability, checkout-time, and technician-card regression tests.
- [x] Run representative operations, IM, Social, and merchant scheduling regression tests.
- [x] If a current-conversation regression appears, reproduce it with a focused failing test before repair. No production regression was found, so no repair was required.

## Task 3: Repository validation

- [x] Run frontend lint, tests, and formal build.
- [x] Run backend lint, tests, and build.
- [x] Run `git diff --check` and confirm no uncommitted production artifacts.
- [x] If runtime validation is needed, prove a non-5180 port is free before starting a local service and stop only the process started by this batch. No runtime was needed because the batch changed no production code.

## Task 4: Local integration and cleanup

- [x] Commit the completed batch.
- [x] Refresh against the latest local `main` and resolve only verified in-scope conflicts.
- [ ] Merge into local `main` only after pre-merge validation passes.
- [ ] Re-run proportional verification on merged `main`.
- [ ] Remove only the merged branch/worktree proven safe to delete.

## Pre-merge verification record

- Full-suite baseline local `main`: `396aa186` after safely incorporating the completed personal-display-name synchronization work.
- Final pre-merge local `main`: `47326d29`, including separately completed merchant drilldown and guided legal-catalog work.
- Focused frontend regression: 17 files / 174 tests on the initial baseline, then 8 files / 222 tests after the latest-main refresh.
- Focused backend regression: 16 suites / 283 tests on the initial baseline, then 8 suites / 145 tests after the latest-main refresh.
- Full frontend regression: 532 files / 3,529 tests passed.
- Full backend regression: 12 shards, 786 passed suites / 5,764 passed tests; 20 suites / 78 tests were skipped by their existing test configuration.
- Frontend TypeScript lint, backend ESLint, frontend formal build, and backend TypeScript build passed both before and after the latest-main refresh.
- Final-main cross-impact regression: 13 frontend files / 213 tests and 8 backend suites / 111 tests passed on `47326d29`; both lints and both builds passed again.
- Formal frontend build emitted existing third-party annotation and bundle-size warnings only; it completed successfully.
- The separate production-bundle budget audit reports `i18n-OPAilibi.js` at 3,705,956 bytes versus a 3,704,096-byte limit (1,860 bytes over). This was introduced by separately merged mainline work and is recorded as an unrelated known issue rather than hidden or fixed by changing the budget.
- No production source, database schema, migration, API, or data-structure change was required by this batch.
- No fixed application port was started. Backend API tests used only operating-system-assigned ephemeral local ports.
- The separately owned Affiliate branch advanced during this verification window; this batch did not open, edit, merge, or commit in its worktree, and no Affiliate branch commit is present in this candidate's ancestry.

## Reproduction commands

All commands were run from this worktree at the stated baseline. Backend commands were run from `backend/`; API tests required permission to bind only operating-system-assigned ephemeral local ports.

```bash
# Full repository gates
npm run lint
npm test
npm run build -- --mode formal

(
  cd backend
  npm run lint
  npm test # the repository runner defaults to 12 shards
  npm run build
)

# Initial frontend focus set: 17 files / 174 tests
npm test -- \
  src/auth/authCredentialCoordinator.test.ts \
  src/auth/AuthProvider.test.ts \
  src/auth/authPersistenceScope.test.ts \
  src/auth/portalAuthorization.test.ts \
  src/pages/user/formal-checkout/checkoutTimeSlots.test.ts \
  src/pages/user/formal-checkout/CheckoutTimeRow.test.tsx \
  src/pages/user/TechnicianInfoCardRoutePage.test.tsx \
  src/pages/user/ProfileDetailPage.routing.test.tsx \
  src/pages/user/ProfileDetailPage.test.ts \
  src/shared/profile-card/SocialProfileMiniCard.test.ts \
  src/features/booking/api.test.ts \
  src/features/booking/formal-technician-availability.test.ts \
  src/components/scheduling/UnifiedCalendarDayTimeline.availability.test.tsx \
  src/pages/mobile/MerchantPortalPage.test.tsx \
  src/features/realtime/useRealtimeUnreadCounts.test.ts \
  src/features/social/formal-provider.identity-switch.runtime.test.tsx \
  src/features/social/pages/SocialPostDetailPage.runtime.test.tsx

# Initial backend focus set: 16 suites / 283 tests
(
  cd backend
  npm test -- \
    tests/auth.test.ts tests/auth-permissions.test.ts \
    tests/auth-session-generation.store.test.ts tests/auth-session.store.test.ts \
    tests/booking-api.test.ts tests/booking-service.test.ts \
    tests/booking-repository-scope.test.ts tests/order-checkout-api.test.ts \
    tests/order-checkout-service.test.ts tests/order-checkout-ledger.test.ts \
    tests/realtime-api.test.ts tests/realtime-service.test.ts \
    tests/realtime-social-replies.repository.test.ts \
    tests/social-media-api.test.ts tests/social-media.service.test.ts \
    tests/calendar-participant-availability.test.ts
)

# Latest-main cross-impact frontend set: 8 files / 222 tests
npm test -- \
  src/features/im/formal-api.test.ts src/features/im/pages.test.tsx \
  src/features/im/store.test.ts src/features/social/pages/SocialTimelinePage.test.tsx \
  src/pages/mobile/MerchantPortalPage.test.tsx src/auth/authCredentialCoordinator.test.ts \
  src/pages/user/TechnicianInfoCardRoutePage.test.tsx \
  src/pages/user/formal-checkout/checkoutTimeSlots.test.ts

# Latest-main cross-impact backend set: 8 suites / 145 tests
(
  cd backend
  npm test -- \
    tests/customer-profile.repository.test.ts tests/personal-display-name-schema.test.ts \
    tests/realtime-repository-identity.test.ts tests/technician-profile.repository.test.ts \
    tests/friend-request-lifecycle.repository.test.ts tests/auth.test.ts \
    tests/booking-api.test.ts tests/order-checkout-service.test.ts
)

# Final-main cross-impact frontend set: 13 files / 213 tests
npm test -- \
  src/App.test.tsx src/features/admin-system-settings/LegalDocumentsTab.test.tsx \
  src/features/admin-system-settings/legalDocumentGuidance.test.ts \
  src/features/booking/api.test.ts src/features/settings/UnifiedSettingsPages.test.ts \
  src/features/shop-analytics/ShopAnalyticsDashboard.test.tsx \
  src/i18n/translations.test.ts src/pages/mobile/MerchantPortalPage.test.tsx \
  src/pages/mobile/MerchantRevenueDrilldown.test.tsx \
  src/pages/mobile/MerchantTodayAppointmentsTimeline.test.tsx \
  src/auth/authCredentialCoordinator.test.ts \
  src/pages/user/TechnicianInfoCardRoutePage.test.tsx \
  src/pages/user/formal-checkout/checkoutTimeSlots.test.ts

# Final-main cross-impact backend set: 8 suites / 111 tests
(
  cd backend
  npm test -- \
    tests/system-settings-flow-script.test.ts tests/legal-document.repository.test.ts \
    tests/legal-document.service.test.ts tests/legal-document-api.test.ts \
    tests/legal-document-openapi.test.ts tests/auth.test.ts \
    tests/booking-api.test.ts tests/order-checkout-service.test.ts
)

# Known independent budget gate (expected current failure documented above)
npm run audit:production-bundle
```
