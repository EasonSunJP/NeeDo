# Live screen current-main integration review fixes

Date: 2026-09-06. Worktree: `/Users/eason/Documents/New project/.worktrees/operations-live-screen-current-main`. Branch: `codex/operations-live-screen-current-main`.

Reviewed starting point: `7d7a8f398a1c94c7b02c647a09b714ef7ef4f1c0`; original current-main base: `0d9f8d7d928802c5a3d7cf6cc6c55def21af081a`. This report belongs to the fix commit containing it. The original 24 replay commits and integration repair are unchanged.

## Scope and outcome

Implemented all three Important findings from `live-screen-main-integration-review.md` sequentially, with failing regression tests before production changes. Also implemented the expressly authorized independent checker travel-fare arithmetic correction. Receiving-code-review, systematic-debugging, test-driven-development and verification-before-completion guided reproduction, minimal repairs and fresh gates. No main merge, remote push, deployment, database/Redis connection, migration application, seed, backfill or formal checker execution was performed. No product mock, fake API or placeholder was added.

### Important 1: actual split-runtime wiring and shared live Redis domain

- Both `server.ts` and actual `ops-server.ts`/`merchant-server.ts` → `startApiServer` use `createLiveDashboardRuntime`. The actual API startup injects cache and gateway into the same application dependency boundary used by the operations reader and mutation routes.
- `LIVE_DASHBOARD_REDIS_URL` owns the shared snapshot, generation and Stream keys. Split API startup rejects a missing shared target. Portal `REDIS_URL` remains unchanged and isolated for auth/session state; the monolith retains its previous Redis fallback when no shared setting is provided.
- The formal launcher passes one resolved shared target to all three processes, via `FORMAL_LIVE_DASHBOARD_REDIS_URL`, defaulting to the existing shared route-health target. Environment examples and runtime documentation explain that operators must configure the same target.
- Dedicated cache/stream/bus clients have error handlers and close through the runtime shutdown lifecycle; close is idempotent. No portal session pool is repurposed.
- The startup regression executes the real `startApiServer` twice with isolated portal targets and a shared live target. It exercises the real cache, gateway, Stream and event bus over a low-level Redis I/O seam: operations snapshot population, merchant publication/generation invalidation, operations cache refill and event replay, plus shutdown. An inert listen seam avoids starting a server or worker.

RED evidence: initial startup test failed because the live gateway was undefined (1 failed). The missing-shared-target regression failed (1 failed / 1 passed); launcher default/override assertions failed (2 failed / 1 passed). A final lifecycle check reproduced the unhandled stream-client error boundary (1 failed / 1 passed, expected every shared client to have an error handler, received false). GREEN: startup plus existing notice-startup tests 4/4; launcher 3/3. Final combined checker/runtime/notice group 3 suites / 18 tests passed.

### Important 2: canonical home address/administrative identity binding

- Booking resolves the official administrative hierarchy before estimate consumption or capacity reservation. Official Japanese prefecture/municipality names are normalized with the same address normalizer as the accepted fulfillment address; a mismatch is rejected with `400 error.administrative_region.address_mismatch`.
- The canonical normalized address continues through the existing estimate destination hash check and persistence. Current-main owner, shop, service, slot, active policy/version, expiry, lock and atomic consumption checks remain intact.
- Regression uses a valid Tokyo address and its valid estimate while changing only the valid codes to Osaka `27/27128`. It asserts no booking/location snapshot, no capacity reservation, no estimate consumption and no travel snapshot write. The positive test accepts whitespace-normalized matching official names and consumes exactly one estimate.
- The current-main booking-travel-fare service test fixture was brought into the already-required home service-location contract: home calls formerly spread `base`; they now spread `home = {...base, serviceLocation: {countryCode: "JP", admin1Code: "13", admin2Code: "13104"}}`. Existing estimate-required/failure and store-injection assertions are unchanged. No production travel-fare behavior was relaxed.

RED evidence: the mismatch test resolved an order instead of rejecting (1 failed / 9 passed), persisting the unrelated region. GREEN: booking location/validator/repository-scope/travel-fare-service group 4 suites / 47 tests passed. Final Task 7 includes both new location regressions.

### Important 3: Exchange snapshot invariant and national unresolved visibility

- Exchange conversion now creates `BookingServiceLocation` nested in each order creation inside its existing transaction. A live, matching official store assignment yields a verified immutable snapshot. Free-text home demands and absent/unverified store assignments produce explicit unresolved snapshots; no region is inferred from address text, residence or current technician location.
- Store resolution failures caused by invalid hierarchy become unresolved; infrastructure failures still propagate for rollback. The unresolved provenance marker is `exchange-unresolved-v1`, not a claim of official catalogue verification.
- Conversion returns internal committed order IDs for both new and superseded orders. The service publishes only after the repository transaction returns committed creation; idempotent replays do not publish. A transport error after commit is logged without undoing the committed booking response. The IDs are not added to the public response payload.
- The Exchange route injects the same live publisher. An adapter preserves the existing optional test/repository projection port while actual runtime falls back to `BookingRepository` for authoritative event projections.
- National live queries use a left snapshot join and allow a genuinely missing snapshot through the scope predicate. The active-shop, eligible-order, payment, date and deletion predicates are retained. Missing snapshots count as unresolved in the national denominator. Narrow scopes and regional child metrics still require verified attribution. Ranking's default current-main contract remains untouched; only the live-specific candidate scope changes.
- Missing historical snapshots can project a Japan-only event (null admin codes). Existing deleted or non-Japan snapshots remain excluded. The independent checker mirrors the national/missing/child-region semantics, without executing the checker.

RED evidence: first snapshot/projection/SQL group 3 failed / 41 passed; publication regression 1 failed / 13 passed; verified/unverified store snapshot regressions 2 failed / 30 passed; checker/child-region guardrails 2 failed / 21 passed. GREEN: final focused Exchange repository/service, live repository/projection and checker group 5 suites / 72 tests passed. Final typed-constructor cleanup was separately rerun: Exchange service 14/14 passed.

### Authorized checker oracle alignment

The independent confirmed-payment oracle omitted current-main travel fares. A source-level SQL contract regression first failed with missing `AND checkout.travel_fare_amount_jpy >= 0` (1 failed / 13 passed). The minimal correction adds that nonnegative predicate and changes arithmetic from `base + add_on - discount = checkout` to `base + add_on + travel_fare - discount = checkout`. The oracle remains independent of the production confirmed-payment implementation. GREEN: checker 14/14, included in both final Task 8 and current-main matrices.

## Fresh verification after implementation

| Gate | Result |
| --- | --- |
| Task 7 exact matrix | 25 suites / 273 tests passed; 146.538 s |
| Task 8 exact matrix | 14 suites / 153 tests passed; 10.327 s |
| Current-main matrix plus review-specific regressions | 22 suites / 196 tests passed; 76.627 s |
| Checker + actual split-runtime + notice-startup | 3 suites / 18 tests passed; 20.323 s |
| Exchange service after typed test cleanup | 1 suite / 14 tests passed; 4.979 s |
| Frontend booking/checkout/login, i18n and launcher tests | 9 files / 69 tests passed; 31.64 s |
| Backend lint | Passed |
| Backend TypeScript build | Passed |
| Prisma generate | Passed; Prisma Client 7.8.0 generated locally |
| Prisma validate | Passed; `npx prisma validate` |
| Root lint and build | Both fail only at unchanged `MerchantOrderRoutePages.formal.test.tsx:127`, missing `availablePaymentMethods` |
| Separate admin baseline | `masterDataPages.test.ts`: 5 passed / 1 failed at line 109, unchanged source assertion |
| i18n audit | Exit 0: 15166 Chinese sources, 4776 other sources, 7693 covered, 7473 missing, 0 recoverable |
| Whitespace and scope | `git diff --check` and original-base diff check passed; no review-fix Prisma/migration delta |

Task 7 and Task 8 suite lists are unchanged from the exact named lists in `live-screen-main-integration-report.md`, using `npm test -- --runInBand <paths>` from `backend/`. Test counts grew because of the new regressions.

The current-main matrix retains its original 16 suites and appends: `live-dashboard-api-runtime`, `official-notice-api-runtime`, `exchange-booking-conversion.repository`, `exchange-booking-conversion.service`, `exchange-booking-conversion.routes`, `booking-travel-fare.service` (all `backend/tests/<name>.test.ts`).

Frontend command: `npm test -- --maxWorkers=1 src/features/booking src/pages/user/FormalCheckoutPage.test.ts src/pages/user/FormalCheckoutPage.round-trip.test.tsx scripts/i18n-quality-audit.test.ts scripts/dev-formal-config.test.mjs src/pages/auth/LoginPage.test.ts`.

Other commands: backend `npm run lint`, `npm run build`, `npm run prisma:generate`, `npx prisma validate`; root `npm run lint`, `npm run build`, `npm run i18n:audit`, and `npm test -- --maxWorkers=1 src/pages/admin/masterDataPages.test.ts`.

## Intermediate failures and evidence boundaries

- An initial full-matrix run exposed the Exchange route's optional `findLiveDashboardOrderEvents` port typing mismatch. It was repaired with the narrow adapter; fresh final matrices/build above pass. Initial counts were Task 7: 21 suites passed / 4 failed to compile, 222 tests passed; Task 8: 12 passed / 2 compile failures, 134 tests passed; expanded main: 15 passed / 7 compile failures, 140 tests passed. These were not product assertion failures and were not hidden by weakening tests.
- A combined gate command mistakenly attempted nonexistent `npm run prisma:validate` after successful lint/build/generation. The correct `npx prisma validate` was then run and passed. No migration command was used.
- Supertest runs used the permitted local ephemeral-listener execution path. They are application integration tests, not DB/Redis acceptance. Earlier sandbox listener failures remain infrastructure evidence separate from product results.
- The real runtime/cache/gateway classes and repository transaction logic run in tests, with test-only I/O seams instead of external Redis/MySQL. National SQL and checker regressions verify emitted query structure and mapping contracts; they do not execute those queries against MySQL. No assertion here certifies real Redis pub/sub/Stream connectivity or SQL-engine parity.
- Temporary logs/process handles from the earlier verification phase were unavailable after session recovery; final completion counts above were rerun and read directly from fresh completed commands rather than inferred from those logs.

## Residuals and handoff

The two documented frontend baseline failures are intentionally unchanged. Their files and `src/pages/merchant-admin/MerchantAdminPeoplePage.tsx` were verified byte-identical to `0d9f8d7d` with an empty `git diff --exit-code` result. No unrelated dirty files were taken into this fix.

This is local implementation-integration evidence, ready for a fresh review of the three remedies. It is not approval of migration application, catalogue import/regeneration, backfill, real MySQL/Redis rollback checker execution, authenticated browser/SSE acceptance, frontend live-screen plan B, main merge, remote push, staging/production deployment or production migration. Those actions remain unperformed and need their own authority and evidence. A deployment must explicitly provision one shared live Redis target for all processes while preserving portal auth/session isolation.
