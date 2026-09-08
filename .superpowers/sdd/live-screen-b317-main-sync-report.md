# Live-screen synchronization with local main b3173885

Date: 2026-09-06. Isolated worktree: `/Users/eason/Documents/New project/.worktrees/operations-live-screen-current-main`; branch: `codex/operations-live-screen-current-main`.

Normal merge, not rebase. First parent: `577ade8066075bea1b336697bcee86f54f4ff036`. Requested second parent: `b31738858af5c30c3996528aa83e58e0312184a7`. The merge was paused with `--no-ff --no-commit` for inspection/testing; the merge commit containing this report records both parents. All prior live-screen commits and review/checker repairs remain in history.

## Conflict reconciliation

Four files conflicted. No whole-file side selection was used.

| File | Resolution and rationale |
| --- | --- |
| `backend/src/services/booking.service.ts` | Preserve newer main's work-status notifier as constructor argument 11; append the live event publisher as argument 12. Keep both post-commit start/end work-status notifications and all live booking/transition/add-on/checkout/manual-payment publications. |
| `backend/src/routes/booking.routes.ts` | Pass the main work-status service/fallback in its original position, followed by the shared live gateway. Both receive the existing resolved runtime dependencies. |
| `backend/src/repositories/order-service-expiry.repository.ts` | Retain the live contract returning committed order IDs and append each ID before main's post-commit work-status callback. Existing transactional work-status transition and rollback behavior stay intact. The service layer still returns a numeric count and uses IDs for live invalidation/publication. |
| `backend/src/server.ts` | Construct both shared live runtime and work-status service; retain main's work-status worker start/stop and notice worker lifecycle. Expiry repository gets main's `notifyOrder` callback while expiry service retains the live publisher. Shared live Redis shutdown remains unchanged. |

No new production behavior repair beyond semantic conflict reconciliation was necessary. Verification was extended to assert both work-status and live events after applied start/end, and neither after failed mutation.

## Overlap inspection and preservation

- Booking repository auto-merge retains main's in-transaction `recordBookingWorkTransition` for start/end and all live immutable-location, canonical home-address/accepted-estimate, capacity/consumption, projection and national-unresolved behavior.
- Actual split entrypoints and `api-server.ts` retain the earlier explicit service identity/shared Redis target guard and cache/gateway/notice injection. Portal auth/session Redis remains isolated.
- Main's official-notice repository/service, SOS repository/service, work-status repository/service/worker and realtime service are byte-identical to `b3173885`. Official-notice creation/read delivery remains post-commit. SOS/work-status events keep their recipient identity scope and do not fabricate booking state changes; formal order mutations are covered by Booking/expiry live hooks.
- `app.ts` retains all shared SOS/work-status routes, main's membership resolver/realtime dependencies, and live/administrative routes. Backoffice routes/controller/service/repository retain new query pagination/work-status projections and existing live route RBAC, audit and strict query handling.
- Schema is additive: main's SOS/work-status/attendance relations coexist with live administrative/snapshot relations. Relative to `577ade80`, exactly five incoming migrations are added: `20260906100000_booking_sos`, `20260906123000_user_management_operations_permissions`, `20260906190000_technician_work_status`, `20260906200000_work_status_affected_orders`, `20260906210000_work_status_epoch_utc_bootstrap`. Relative to `b3173885`, only the existing `20260906120000_live_dashboard_administrative_regions` migration is added. No historical migration modified.
- Frontend `App.tsx`, `AdminLayout.tsx`, login source, system-settings, SOS and technician-work-status feature sources are byte-identical to main. The translation merge retains all main loaders/content and adds only the five existing live booking labels. The existing live audit-loader test assertions remain alongside main's login guardrails.
- No Affiliate-specific edit or external-state action was made. Package changes from main only add its existing checker commands; none was executed.

## RED and reconciliation evidence

1. Initial focused tests started before Prisma generation completed and reported missing new work-status generated types. Generation then completed successfully; no product code was changed for these transient type errors.
2. Preserving main's constructor position exposed ten live publisher test fixtures at the old position: seven in `booking-service.test.ts`, two in `order-checkout-service.test.ts`, one in `manual-payment-service.test.ts`. They failed TypeScript because `publish` is not `notifyTechnician`. Each fixture now adds exactly one `undefined` before its publisher; assertions and production behavior are not weakened.
3. The new main expiry callback test failed with expected `1`, received `[41]`. Its repository assertion now expects `[41]`; the callback/committed-state/rollback assertions are unchanged, and service count tests still assert numeric counts. Focused combined group: **4 suites / 98 tests passed**, 16.365 s.
4. Initial Task 7: 22 suites passed / 3 failed; 244 tests passed / 1 timed out, with two suites blocked by the remaining constructor fixtures. The unchanged booking API case exceeded the default five-second limit during concurrent builds/tests. After fixture reconciliation, the isolated booking API/checkout/manual-payment rerun passed **3 suites / 38 tests**, 22.039 s, without timeout changes or product edits. The full final matrix below also passes.

## Fresh final gates

| Gate | Result |
| --- | --- |
| Task 7 exact matrix | 25 suites / 274 tests passed; 30.715 s |
| Task 8 exact matrix | 14 suites / 154 tests passed; 27.333 s |
| Expanded current-main matrix | 23 suites / 201 tests passed; 81.794 s |
| Official notices / merchant notices / realtime | 11 suites / 130 tests passed; 48.325 s |
| SOS / work-status / related compatibility | 15 suites / 120 tests passed; 40.149 s |
| Relevant frontend/config matrix | 35 files / 329 tests passed; 30.09 s |
| Backend lint/build | Passed, including final rerun after fixture edits |
| Prisma generate/validate | Passed; Prisma Client 7.8.0 generated locally, schema valid |
| Root lint/build | Passed; Vite built in 18.61 s |
| Separate known admin baseline | 5 passed / 1 failed at `masterDataPages.test.ts:109` |
| Whitespace and history | `git diff --check HEAD` passed; only additive migration union |

Backend matrices use `npm test -- --runInBand <paths>` from `backend/`, with the permitted local ephemeral Supertest listener path and no DB/Redis connection. Task 7/8 exact lists and expanded current-main 23-suite list are those recorded in `live-screen-main-integration-report.md` and the `live-screen-main-integration-fix-report.md` follow-up, unchanged.

Notification matrix names (all `backend/tests/<name>.test.ts`): `official-notice-api`, `official-notice-flow-checker`, `official-notice-openapi`, `official-notice-transactions`, `official-notice-validator`, `official-notice.repository`, `official-notice.service`, `merchant-notice-api`, `merchant-notice-contract`, `realtime-api`, `realtime-service`.

SOS/work-status compatibility matrix names: `sos-api`, `sos.service`, `work-status.domain`, `work-status.repository`, `work-status.service`, `work-status-epoch-utc-migration`, `order-fulfillment-service`, `backoffice-user-list.api`, `backoffice-user-list.repository`, `backoffice-user-usage.repository`, `customer-profile-api`, `technician-profile-api`, `user-management-operations-permissions`, `current-membership-benefits.service`, `im-standard-recall.repository`.

Frontend command: `npm test -- --maxWorkers=1 src/features/booking src/pages/user/FormalCheckoutPage.test.ts src/pages/user/FormalCheckoutPage.round-trip.test.tsx scripts/i18n-quality-audit.test.ts scripts/dev-formal-config.test.mjs src/pages/auth/LoginPage.test.ts src/features/official-notices src/features/sos src/features/technician-work-status src/features/admin-system-settings src/components/admin/AdminLayout.test.ts src/components/merchant-admin/MerchantAdminLayout.test.ts src/components/ui/OfficialNoticeBell.test.tsx src/api/officialNotices.test.ts src/api/httpClient.test.ts src/features/realtime/api.test.ts src/pages/mobile/TechnicianPortalPage.test.tsx src/pages/mobile/MerchantPortalPage.test.tsx src/features/settings/UnifiedSettingsPages.test.ts src/pages/admin/AdminCapabilityRoutes.test.ts`.

Other commands: backend `npm run prisma:generate && npx --no-install prisma validate`, `npm run lint && npm run build`; root `npm run build`, `npm run lint`, and `npm test -- --maxWorkers=1 src/pages/admin/masterDataPages.test.ts`.

## Baselines and handoff boundaries

The admin source-assertion baseline remains unchanged: both its test and `MerchantAdminPeoplePage.tsx` are byte-identical to `b3173885`. It was not repaired. The older root checkout typing failure is no longer a residual: main commit `63da44dd` fixed that fixture before this merge, and the merged root lint/build now pass. Vite reports the existing mixed static/dynamic SocialProfilePage import and large-chunk warnings; the work-status migration unit test reports Node's experimental SQLite warning. These are warnings, not failed gates.

This merge synchronizes the feature branch only; it does not merge into main. No real MySQL/Redis/checker/migration/seed/backfill/browser acceptance, push or deployment was performed. Static/contract and in-process tests do not replace the parent's planned external acceptance after review. While completing this checkpoint the parent reported newer main `44bfaceb`; that will be a separate normal merge after this verified merge commit, not silently folded into this checkpoint. Other-owner dirty state in the main checkout is out of scope and untouched.
