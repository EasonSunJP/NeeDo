# Shop Travel Fare Routing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Do not parallelize tasks that touch the shared Prisma schema, booking repository, or checkout contract.

**Goal:** Let each shop publish auditable driving-distance fare bands, obtain a provider-backed route estimate for a home-service booking, freeze that estimate into the booking and checkout, and expose recognized travel-fare revenue in operations.

**Architecture:** A vendor-neutral route-distance provider sits behind a travel-fare service. Merchant policy versions and route estimates are persisted through dedicated repositories. Booking creation consumes an unexpired customer-bound estimate in the same transaction as the order, while checkout copies the immutable booking travel snapshot into its calculation. The frontend consumes only formal APIs; no static distance or fare fallback is allowed.

**Tech Stack:** Node.js 22, Express, TypeScript strict, Prisma/MySQL 8, Zod, Jest/Supertest, React/TSX/Vite, Vitest.

**Global Constraints:** One commit per microstep; RED before GREEN; all protected routes use JWT/RBAC; all writes create audit evidence; list routes paginate; all customer-visible copy uses the existing i18n system; Geoapify credentials are environment-only; no straight-line fallback, static fare fallback, mock application data, push, deployment, franchisee implementation, supplier implementation, or consumables Store implementation.

---

### Task 1: Persist immutable fare policies, estimates, booking snapshots, and checkout fare

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Create: `backend/prisma/migrations/20260905150000_shop_travel_fare_routing/migration.sql`
- Create: `backend/tests/shop-travel-fare-schema.test.ts`

**Steps:**
1. Add a schema test that requires `ShopTravelFarePolicyVersion`, `ShopTravelFareBand`, `RouteEstimate`, `BookingTravelFareSnapshot`, `OrderCheckout.travelFareAmountJpy`, required relations/indexes/checks, and the four travel-fare permissions.
2. Run `npm --prefix backend test -- --runInBand shop-travel-fare-schema.test.ts` and confirm the missing-model failure.
3. Add the Prisma models, shop/customer/booking/user relations, additive migration, constraints, indexes, and grants for `merchant-admin:travel-fare-policy:read`, `merchant-admin:travel-fare-policy:write`, `backoffice:travel-fare:read`, and `booking:travel-estimate:create`.
4. Run `npm --prefix backend run prisma:generate` and the focused test; expect PASS.
5. Commit as `feat(travel): add fare policy and estimate persistence`.

### Task 2: Implement fare-band rules and the Geoapify provider boundary

**Files:**
- Create: `backend/src/domain/shop-travel-fare.ts`
- Create: `backend/src/services/route-distance.provider.ts`
- Create: `backend/src/services/geoapify-route-distance.provider.ts`
- Modify: `backend/src/config/env.ts`
- Modify: `backend/.env.example`
- Create: `backend/tests/shop-travel-fare-domain.test.ts`
- Create: `backend/tests/geoapify-route-distance.provider.test.ts`
- Create: `backend/tests/shop-travel-fare-config.test.ts`

**Steps:**
1. Write failing domain tests for strictly ascending positive band limits, non-negative integer JPY fares, deterministic boundary matching, and outside-area rejection.
2. Write failing adapter tests with an injected HTTP client for Japanese-address geocoding, driving-route distance/duration normalization, bounded timeout, redacted errors, rate-limit mapping, route-not-found mapping, and malformed-response rejection.
3. Write failing configuration tests for disabled/unconfigured status and validated key/base URL/timeout/cache TTL values.
4. Implement the pure domain functions, `RouteDistanceProvider` interface, Geoapify adapter, typed provider errors, and environment parsing.
5. Run all three focused suites; expect PASS.
6. Commit as `feat(travel): add fare rules and Geoapify adapter`.

### Task 3: Add merchant policy version APIs

**Files:**
- Create: `backend/src/validators/shop-travel-fare-policy.validator.ts`
- Create: `backend/src/repositories/shop-travel-fare-policy.repository.ts`
- Create: `backend/src/services/shop-travel-fare-policy.service.ts`
- Create: `backend/src/controllers/shop-travel-fare-policy.controller.ts`
- Create: `backend/src/routes/shop-travel-fare-policy.routes.ts`
- Modify: `backend/src/app.ts`
- Modify: `backend/src/api/openapi.ts`
- Create: `backend/tests/shop-travel-fare-policy.service.test.ts`
- Create: `backend/tests/shop-travel-fare-policy-api.test.ts`
- Create: `backend/tests/shop-travel-fare-policy-openapi.test.ts`

**Steps:**
1. Write service tests for current-shop scoping, immutable version publication, gap/overlap rejection, maximum-distance handling, and audit metadata.
2. Write API tests for authentication, read/write permission separation, strict Zod bodies, stable envelopes, and paginated history.
3. Implement repository transaction methods, service rules, controller, routes, dependency injection, and OpenAPI contracts.
4. Run the three focused suites; expect PASS.
5. Commit as `feat(travel): add merchant fare policy APIs`.

### Task 4: Add customer route-estimate API with cache and rate limiting

**Files:**
- Create: `backend/src/validators/route-estimate.validator.ts`
- Create: `backend/src/repositories/route-estimate.repository.ts`
- Create: `backend/src/services/route-estimate.service.ts`
- Create: `backend/src/controllers/route-estimate.controller.ts`
- Create: `backend/src/routes/route-estimate.routes.ts`
- Modify: `backend/src/app.ts`
- Modify: `backend/src/api/openapi.ts`
- Create: `backend/tests/route-estimate.service.test.ts`
- Create: `backend/tests/route-estimate-api.test.ts`

**Steps:**
1. Write failing tests for structured Japanese addresses, server-owned shop origin, home-service eligibility, customer/shop/service/address/policy binding, TTL, same-address cache reuse, rate limiting, and every provider failure code.
2. Implement normalized address hashing, shop-origin lookup, provider invocation outside the write transaction, persisted estimate creation, redacted audit metadata, and paginated operational lookup support.
3. Mount `POST /api/v1/bookings/travel-estimates`, add OpenAPI schemas, and ensure the API never returns credentials or the unredacted normalized address hash input.
4. Run the focused suites; expect PASS.
5. Commit as `feat(travel): add formal route estimate API`.

### Task 5: Consume the estimate during booking and include fare in checkout

**Files:**
- Modify: `backend/src/validators/booking.validator.ts`
- Modify: `backend/src/repositories/booking.repository.ts`
- Modify: `backend/src/services/booking.service.ts`
- Modify: `backend/src/repositories/order-checkout-calculation.ts`
- Modify: `backend/src/repositories/order-service-expiry.repository.ts`
- Modify: `backend/src/api/openapi.ts`
- Modify: `backend/tests/order-fulfillment-schema.test.ts`
- Modify: `backend/tests/order-checkout-service.test.ts`
- Create: `backend/tests/booking-travel-fare.service.test.ts`

**Steps:**
1. Write failing tests proving home bookings require a valid estimate, store bookings reject estimate injection, reused/expired/mismatched estimates fail without partial writes, and accepted estimates create one immutable booking snapshot.
2. Add structured `fulfillmentAddress`, `travelEstimatePublicId`, and transactional estimate consumption to booking creation.
3. Write failing checkout tests for `base + accepted add-ons + travel fare - discount`, non-negative safe-integer guards, exact 1:1 NDP conversion, idempotency, and legacy/store fare zero.
4. Add `travelFareAmountJpy` to checkout calculation, persistence, payload, events, audits, expiry checkout, and OpenAPI.
5. Run the focused booking/checkout suites; expect PASS.
6. Commit as `feat(travel): bind route fare to booking checkout`.

### Task 6: Recognize completed travel fare in the operations dashboard

**Files:**
- Modify: `backend/src/repositories/dashboard-operations-finance.repository.ts`
- Modify: `backend/src/services/backoffice.service.ts`
- Modify: `backend/src/api/openapi.ts`
- Modify: `backend/tests/dashboard-operations-finance.repository.test.ts`
- Modify: `backend/tests/dashboard-metric-detail-api.test.ts`

**Steps:**
1. Replace the existing `not_connected` expectations with failing tests that count only completed, payment-evidenced, non-refunded, non-reversed checkouts in the selected city/period.
2. Add current/previous travel-fare aggregation and redacted detail rows that expose distance, policy version, band, and amount without a full customer address.
3. Mark `travel_fare` as ready in overview and detail metadata and update OpenAPI examples.
4. Run the focused dashboard suites; expect PASS.
5. Commit as `feat(travel): connect dashboard travel fare revenue`.

### Task 7: Replace the operations capability gate with provider and policy visibility

**Files:**
- Create: `backend/src/controllers/travel-operations.controller.ts`
- Create: `backend/src/routes/travel-operations.routes.ts`
- Modify: `backend/src/app.ts`
- Modify: `backend/src/api/openapi.ts`
- Create: `backend/tests/travel-operations-api.test.ts`
- Create: `src/api/travelFare.ts`
- Create: `src/api/travelFare.test.ts`
- Modify: `src/pages/admin/TravelSettingsPage.tsx`
- Modify: `src/pages/admin/AdminCapabilityRoutes.test.ts`

**Steps:**
1. Write failing backend tests for redacted provider status and paginated policy visibility scoped by city/shop.
2. Implement `GET /api/v1/backoffice/travel/providers/status` and `GET /api/v1/backoffice/travel/fare-policies` with read permission and OpenAPI.
3. Write failing frontend API/page tests for loading, configured, unconfigured, provider-error, empty-policy, and pagination states.
4. Replace the static gate with the formal provider-status and policy table; show TEST/unavailable truthfully while Geoapify is unconfigured.
5. Run the focused backend/frontend suites; expect PASS.
6. Commit as `feat(travel): expose operations route status`.

### Task 8: Add merchant policy UI and customer checkout estimate UI

**Files:**
- Create: `src/pages/merchant-admin/ShopTravelFarePolicyPage.tsx`
- Create: `src/pages/merchant-admin/ShopTravelFarePolicyPage.test.tsx`
- Modify: `src/components/merchant-admin/MerchantAdminLayout.tsx`
- Modify: `src/App.tsx`
- Modify: `src/pages/user/FormalCheckoutPage.tsx`
- Modify: `src/pages/user/FormalCheckoutPage.test.ts`
- Modify: `src/pages/user/FormalCheckoutPage.round-trip.test.tsx`
- Modify: `src/i18n/translations.ts`

**Steps:**
1. Write failing merchant UI tests for loading current policy, adding/removing validated distance bands, publishing a new immutable version, permission denial, and API error states.
2. Add the merchant route and navigation entry and implement the policy editor against the formal API.
3. Write failing checkout tests for structured address entry, estimate loading/success/expiry/outside-area/unconfigured/retry states, displayed distance/fare/band, and disabled submission without a valid estimate.
4. Implement the home-only estimate flow and submit the estimate ID with the booking; store-service checkout remains unchanged.
5. Add complete Simplified Chinese, Traditional Chinese, Japanese, English, and Korean translations through the existing translation mechanism.
6. Run the focused frontend suites and `npm run build`; expect PASS.
7. Commit as `feat(travel): add merchant and checkout fare UI`.

### Task 9: Formal verification, migration evidence, and documentation

**Files:**
- Create: `backend/scripts/check-shop-travel-fare-flow.ts`
- Modify: `backend/package.json`
- Modify: `docs/order-state-machine.md`
- Modify: `docs/ledger.md`
- Modify: `README.md`

**Steps:**
1. Add a rollback-safe formal MySQL checker covering policy publication, route-estimate persistence through a deterministic test seam, concurrent single consumption, booking snapshot, checkout arithmetic, completion recognition, refund exclusion, audit rows, and full baseline restoration.
2. Run `ENV_FILE=.env.dev npm --prefix backend run prisma:status`, `ENV_FILE=.env.dev npm --prefix backend run prisma:migrate:deploy`, and `ENV_FILE=.env.dev npm --prefix backend run check:shop-travel-fare-flow`; expect migration current and checker PASS with rollback evidence.
3. Run focused suites, then `npm --prefix backend test -- --runInBand`, `npm --prefix backend run lint`, `npm --prefix backend run build`, `npm test -- --run`, and `npm run build`.
4. Start the formal backend and frontend, prove listener PID/cwd/branch/proxy origin, and perform desktop/mobile browser acceptance for merchant policy publication, unconfigured provider behavior, operations visibility, route overflow, and console errors. Do not claim live Geoapify success without a real key.
5. Document the API, formulas, provider environment variables, privacy boundary, failure behavior, rollback procedure, and the remaining external Geoapify-key gate.
6. Confirm `git status --short --branch` is clean and local `main` contains every travel-fare commit; do not push or deploy.
7. Commit as `docs(travel): record formal fare verification`.

---

## Plan self-review

- The plan covers every approved design requirement: shop-owned bands, driving distance, Geoapify adapter, immutable snapshots, formal booking/checkout integration, 1:1 NDP conversion, dashboard recognition, merchant/customer/operations UI, RBAC, audit, pagination, OpenAPI, i18n, migration, and browser acceptance.
- Geoapify registration/key provisioning is the only allowed external gate. The implementation must expose `provider_unconfigured` and remain usable for policy administration without fabricating a route result.
- Franchisee and supplier remain TEST + disabled; consumables Store remains deferred and is not modified by this plan.
