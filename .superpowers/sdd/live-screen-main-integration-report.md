# Live screen integration onto current main

## Scope and boundary

- Worktree: `/Users/eason/Documents/New project/.worktrees/operations-live-screen-current-main`.
- Branch: `codex/operations-live-screen-current-main`.
- Base: `0d9f8d7d928802c5a3d7cf6cc6c55def21af081a`.
- Approved source tip: `3c3bcf8a3b125bbd3ec8246d7cf531347ea9f7ea`.
- Exactly the 24 listed commits were cherry-picked in order. No whole-branch merge, squash, unrelated interleaved commit, push, deployment, DB/Redis access, migration, or formal checker execution occurred.
- Integration-only fixes follow in one separate commit. README, AGENTS, master micro-step plan, Step 12, User Management, systematic-debugging, TDD, and verification-before-completion instructions were read.
- Migration delta is only added `20260906120000_live_dashboard_administrative_regions/migration.sql`; no historical migration changed.

## Commit map

| # | Source | Replayed |
|---|---|---|
|1|d679f0a6|a664f68e|
|2|332e19e7|8a9107ee|
|3|4aa94c9f|6344c599|
|4|831f0d24|77a9c39f|
|5|33c50bc1|fa22ffcc|
|6|29e7f416|9ba70c9d|
|7|132d44e2|e9d935b0|
|8|d05927ec|e291403c|
|9|00831e8e|759c5e4f|
|10|c4e746e9|db1471f5|
|11|ee7a39d5|a1ed70bf|
|12|395df7bd|1e3ec6f1|
|13|744ade77|5deb46b0|
|14|152129ea|1a89cc54|
|15|18919ec3|e7823a6c|
|16|85cd349f|6a06399f|
|17|730ef7c5|45724449|
|18|9c4973d3|0b6603d5|
|19|bd615736|97dfa9f7|
|20|eddf710e|17fe5322|
|21|1aa39e76|e5470e00|
|22|f837eada|a1a0934b|
|23|207e04c0|51eddd26|
|24|3c3bcf8a|7c7635d4|

## Every conflict and semantic resolution

Each resolution was made by examining both conflict sides and surrounding current-main code, not whole-file ours/theirs selection.

1. **4aa94c9f — Prisma schema:** retained main PlatformLoginVerificationRule and all current model relationships. Added the three administrative-region enums, region models, Shop.serviceLocation, BookingOrder.serviceLocation. Kept shop notices, travel policy/estimates, and booking refund amendments.
2. **33c50bc1 — app.ts:** retained main operating-cost/settlement imports and dependencies, all route-manifest mounts, auth/maintenance/settings guards, and portal isolation. Added administrative-region dependencies and one shared reference-route mount. **backoffice.repository.ts:** retained main shop bootstrap/identity provisioning; resolved verified region inside transaction and persisted shop location after create. Update now splits ordinary fields from verified location and upserts transactionally.
3. **29e7f416 — backoffice.repository.ts createShop formatting/logic:** retained main user/customer/merchant provisioning plus source verifier/audit requirement, public shop/support pair, transactional verified-location upsert and audit.
4. **00831e8e — booking.repository.ts:** kept main route-estimate lock, freshness/binding/policy validation, consumption and immutable travel/address snapshot, then resolves and writes verified service-location snapshot in the same transaction.
5. **00831e8e — booking.validator.ts:** source strict store/home discriminated union plus main home-required structured Japanese address and route-estimate UUID. Store admits none of those home-only fields. Removed main store-property access made invalid by the strict union; kept home guards and identifier/availability checks.
6. **00831e8e — openapi.ts:** strict home/store oneOf plus current-main JapaneseRouteAddress/estimate properties and requirements. Kept main payment/travel documentation.
7. **00831e8e — booking-validator.test.ts:** retained both main availability cases and source region cases; successful home fixture must satisfy both contracts.
8. **00831e8e — src/features/booking/api.ts:** combined typed union: store region/address/estimate are never; home requires all three. Existing booking API behavior preserved.
9. **00831e8e — translations.ts:** retained every main translation/import and added five translated region selector strings.
10. **00831e8e — FormalCheckoutPage.tsx:** retained structured address, accepted route estimate, request-version invalidation, expiry, technician/date/slot freshness and main footer. Added official prefecture/municipality selectors; selector changes update Japanese address names and invalidate the estimate. Removed source free-text address state. Home admission requires addressLine1, both codes and successful estimate; submit rechecks fresh slot and estimate expiry. Payload includes codes, trimmed address, accepted estimate public ID. Store payload excludes all home-only fields.
11. **00831e8e — FormalCheckoutPage.test.ts:** kept both suites. Two old textual assertions were left RED until rendered runtime proof; their integration-only correction is below.
12. **c4e746e9 — openapi.ts:** kept required address/estimate while adding source serviceId/technicianServiceId XOR per strict fulfillment branch. 409 documents both unresolved region and current travel conflicts; 422 preserved.
13. **ee7a39d5 — backend/package.json:** kept main system-settings command and added safe booking-location backfill.
14. **152129ea — analytics-ranking.repository.ts:** exposed shared CTE builders and optional regional evidence scope, preserving newer main test/formal split columns and eligibility semantics. A later RED test proved live-only test-account exclusion needed an explicit optional predicate rather than reverting main ranking.
15. **18919ec3 — dashboard-operations-finance.repository.ts:** replaced only duplicated confirmed-payment evidence SQL with shared authority. Retained main travel-fare aggregates and all finance outputs. **formal-confirmed-payment-evidence.ts:** shared predicate includes main nonnegative travel fare and base + add-ons + travel - discount arithmetic. **finance test:** retained main arithmetic expectation and travel fixtures.
16. **85cd349f — openapi.ts schema insertion:** retained all main travel/platform/legal schemas and added all LiveDashboard schemas, repairing the insertion boundary between object members.
17. **730ef7c5 — analytics-ranking.service.ts:** uses source shared active-platform-identity assertion and removes equivalent private implementation; does not loosen platform identity authorization.
18. **bd615736 — booking.repository.ts:** kept fulfillment-address projection and notification recipient/contact/timeline queries; added live order projection. **booking.service.ts:** retained main notification flows and payment availability; appended live publisher after existing main payment-policy constructor argument, with post-commit hooks. **booking.routes.ts:** passes platform policy before gateway. Source publisher test constructor fixtures later needed that extra positional slot.
19. **eddf710e — booking.repository.ts:** retained current-main fields/methods while changing live projection to bounded batch form. **booking.service.ts:** retained main real-time notifications and availablePaymentMethods response wrapper alongside batched publisher. **openapi.ts:** all 13 formatting/delete conflicts retained main fields: test totals/composition, display/privacy, travel fare/payment availability, required home address/estimate, offline payment evidence/provider-unconfigured response, and tier/state/eKYC array filters; source event hardening retained.
20. **3c3bcf8a — backend/package.json:** retains main travel checker and adds named live checker. **scripts/i18n-audit.mjs:** preserved main operationsAnalytics and travel loader paths, promises, functions and source substitutions; source audit-loader guardrail cleanup retained.

No conflicts occurred in other replayed commits.

## Integration-only RED / GREEN repairs

- Initial Task 7 RED: 9/25 suites failed, 6/173 executable tests failed; 16 suites and 167 tests passed. Type errors prevented some suites loading. Log: `/private/tmp/live-integration-task7-red.log`.
- **Live ranking:** source test failed because shared current-main CTE deliberately includes separately labelled test business, whereas live ranking has no test channel. Added optional entityPredicate to shared CTE; only live repository and checker pass customer/technician test-account exclusion. Default main ranking is unchanged. Both live and main ranking regressions are required GREEN.
- **Checker:** initial TS2339 exposed main booking result union; added explicit order-in-result assertion. Added failing contract test (1 failed/12 passed) for current-main future-slot admission plus required bound travel estimate. Fixture slots use wall clock for admission, and existing code still rewrites booking timestamps into fixed reporting window. Added rollback-transaction-local policy/band and bound route evidence with explicit providerCode rollback_fixture, zero-fare band and hashed normalized addresses. This does not claim live provider acceptance. Added separate failing assertion (1/13) for live-only parity eligibility, then aligned direct checker SQL. Formal checker was not run.
- **Home fixtures:** frontend API, backend API, validator and service-location fixtures now include countryCode JP in structured address and accepted route estimate public ID. Invalid-hierarchy repository test supplies a valid bound estimate so region validation is actually reached; the transaction rollback assertion remains.
- **Constructor fixtures:** publisher argument now follows existing current-main platform-payment-policy position in booking, checkout and manual-payment tests; production main policy position was never removed.
- **Repository replacement fixtures:** add SHOP_LOCATION source and verified location projection to existing main replacement harness; retain customer lock identity before region lock rows. Existing Exchange-linked exclusion, race rollback and future-slot checks remain.
- **OpenAPI test harness:** register actual JapaneseRouteAddress component with existing Ajv v6 and use complete home fixture. Retain identifier XOR and unresolved-region assertions.
- **Checkout test:** old `resolves.toBe(checkout)` became `resolves.toEqual({ ...checkout, availablePaymentMethods: ["cash", "ndp"] })`, preserving main availability envelope while checking the committed live hook.
- **Finance fixture:** added required travelFareJpy: 0n to shared-authority test row; no runtime aggregate fallback.
- **Shop account identifier fixture:** supplies required verifiedById: 1; still tests legacy no-region provisioning and same-number U/B identity without changing runtime verification.
- **Rendered checkout proof before assertion edits:** expanded existing jsdom round-trip suite; 5/5 passed. Home payload proves JP/admin1/admin2 + full address + estimate UUID + selected slot; store payload explicitly lacks serviceLocation, fulfillmentAddress and travelEstimatePublicId. Existing tests retain address-edit estimate invalidation, expiry and submit-time slot freshness.
- Exact old/new frontend assertion 1: old contains `fulfillmentMode === "home" && estimateStatus !== "success"`; new contains `estimateStatus === "success"` plus `(!estimate || estimateStatus !== "success" || Date.parse(estimate.expiresAt) <= Date.now())`. Main runtime groups the extra expiry/absence checks.
- Exact old/new frontend assertion 2: old contains `Boolean(address.trim() && selectedAdmin1Code && selectedAdmin2Code)`; new contains `Boolean(homeAddress.addressLine1.trim() && selectedAdmin1Code && selectedAdmin2Code && estimateStatus === "success")`. Runtime uses structured address and additionally requires accepted estimate.
- The rendered administrative reference fixture was corrected to actual lowercase admin1/admin2 + centroid API type after TypeScript detected its initial shape mismatch. No production contract was weakened.

## Verification

All runs below are local, no DB/Redis acceptance. Tests use existing isolated test doubles; no fake production API was added.

- `npm --prefix backend run prisma:generate`: PASS, Prisma 7.8 client generated.
- From backend `npx prisma validate`: PASS. An initial root-cwd validate invocation could not locate schema; corrected cwd passed.
- `npm --prefix backend run lint`: PASS.
- `npm --prefix backend run build`: PASS.
- Task 8 exact 14-suite matrix: **14/14 suites, 149/149 tests PASS**, 19.273 s. Log `/private/tmp/live-integration-task8-green.log`.
- Task 7 matrix: **25/25 suites, 269/269 tests PASS**, 53.436 s. Log `/private/tmp/live-integration-task7-green.log`.
- Frontend booking/API/checkout + i18n guardrail final: **7/7 suites, 44/44 tests PASS**, 10.39 s, with `npm test -- --maxWorkers=1 src/features/booking src/pages/user/FormalCheckoutPage.test.ts src/pages/user/FormalCheckoutPage.round-trip.test.tsx scripts/i18n-quality-audit.test.ts`. Earlier combined guardrail runs hit 5 s timeout under parallel compilation; unchanged standalone guardrail also passed 1/1 in 0.940 s. No timeout threshold was changed. Final log: `/private/tmp/live-integration-frontend-serial-final.log`.
- `npm run i18n:audit`: exits 0; zhSourceCount 15166, nonZhSourceCount 4776, coveredCount 7693, missingCount 7473, recoverableFromIndexedCount 0. This is an inventory, not a claim that repository-wide localization is complete.
- `npm run lint`: final only failure is unchanged current-main `src/pages/mobile/MerchantOrderRoutePages.formal.test.tsx:127`, missing availablePaymentMethods in its fixture.
- `npm run build`: subject to that same current-main TypeScript baseline; no unrelated fixture change authorized.
- Baseline separately: `npm test -- src/pages/admin/masterDataPages.test.ts` yields 5 passed/1 failed; line 109 expects direct backofficeRealDataApi.customers("merchant-admin") text. Both test and MerchantAdminPeoplePage.tsx are byte-identical to base. Mobile baseline test file is also byte-identical.
- Initial sandbox Task8 attempt encountered Supertest listen EPERM; all required backend suites were rerun with permitted local ephemeral listener execution. Sandbox failure is not a product failure.
- Current-main conflict regression final: **16/16 suites, 133/133 tests PASS**, 86.804 s; includes the final checker parity assertion. Log: `/private/tmp/live-integration-main-regression-green.log`.
- Root build final fails only on the unchanged mobile fixture at line 127, identical to final root lint. No integration typing error remains.
- Initial `git diff --check 0d9f8d7d` identified two source design-document Markdown trailing-space breaks; converted those to paragraph separation in the integration fix. No executable behavior changed.
- `git log --reverse 0d9f8d7d..HEAD` before integration-fix commit matches all 24 approved subjects in order. No unrelated source commit was replayed; migration name/status proves the single new migration only. Final committed diff check and tracked-clean status are verified in the handoff.

### Exact Task 8 suite list

administrative-region-schema, administrative-region-catalog, administrative-region-validator, administrative-region-api, booking-service-location, booking-location-backfill, live-dashboard-validator, live-dashboard.repository, live-dashboard.service, live-dashboard-cache, live-dashboard-events, live-dashboard-api, live-dashboard-openapi, live-dashboard-flow-script (all `backend/tests/<name>.test.ts`, `npm test -- --runInBand <paths>` from backend).

### Exact Task 7 suite list

live-dashboard-events, redis-live-dashboard-event-stream, live-dashboard-api, live-dashboard-openapi, live-dashboard-validator, live-dashboard-cache, live-dashboard.service, live-dashboard.repository, live-dashboard-order-change.publisher, live-dashboard-order-projection, booking-service, booking-repository-scope, booking-api, booking-service-location, booking-validator, order-checkout-service, manual-payment-service, manual-payment-api, order-service-expiry.repository, order-service-expiry.service, order-service-expiry.worker, order-service-expiry-server-wiring, order-service-expiry-config, openapi, security-middleware (same command form).

### Current-main conflict regression suite list

analytics-ranking.repository, analytics-ranking.service, analytics-ranking-api, analytics-ranking-openapi, dashboard-operations-finance.repository, backoffice-api, backoffice-shop-service, backoffice-shop-account-identifiers, platform-payment-settings, platform-settings-api, platform-settings-openapi, route-estimate-api, route-estimate.service, portal-api-apps, administrative-region-seed, live-dashboard-flow-script (same command form).

## Residual and next gates

- Known current-main root TypeScript/build baseline and admin source-assertion baseline remain untouched.
- No DB/Redis run: official catalogue import/migration, real repository transaction acceptance, rollback-only formal checker, and authenticated browser/SSE acceptance remain separate gates.
- Frontend plan B, local main integration/merge, remote push, deployment and production migration are not performed by this worktree integration.
- Preserved invariants: official JP catalogue; verified service-occurrence snapshots; safe backfill; regional facts with JPY/NDP/Test NDP separated and agent commission unavailable/null; strict cached API; Redis Stream SSE and generation fencing; 16 covered post-commit transition scenarios; rollback checker; documentation and i18n loader guardrail.
