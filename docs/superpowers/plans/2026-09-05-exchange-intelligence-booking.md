# Exchange Intelligence Booking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Do not parallelize tasks that touch the shared Prisma schema, Booking repository, Exchange projection, or checkout contract.

**Goal:** Let a merchant or technician publish one Exchange Intelligence post bound to an authorized formal service, let a customer open the correct shop-service or technician-service checkout, and create an ordinary formal `PENDING` booking whose campaign price and source are enforced by the backend and verified in MySQL and browsers.

**Architecture:** Extend the existing Exchange and Booking systems with additive service/source relations rather than introducing a parallel order flow. Exchange owns publisher-scoped service selection and the current bookability projection; Booking owns the atomic slot, price, order, history, notification, audit, idempotency, and concurrency transaction. React reuses the approved unified profile and service cards and passes only typed service references and the Intelligence post ID.

**Tech Stack:** Node.js 22, Express, TypeScript strict, Zod, Prisma 7, MySQL 8, Jest/Supertest, React 19, Vite 7, Vitest, Tailwind CSS.

## Global constraints

- Execute only the approved Exchange Intelligence-to-booking microstep.
- Preserve React/TSX/Vite, `/api/v1`, Prisma/MySQL, JWT/RBAC, audit, notifications, five-language i18n, Booking/Schedule/Order state machines, and the existing approved shared card components.
- New Intelligence publications require exactly one service owned by the active publisher scope. The browser cannot supply the authoritative shop, technician, catalog price, address, area, mode, or booking price.
- Legacy unbound Intelligence rows remain readable and are not guessed or backfilled; they are explicitly unavailable for booking.
- The Intelligence campaign price is the booking service-price snapshot. Travel fare, taxes, membership benefits, checkout, and other current-main line items remain independent and retain their existing order of calculation.
- Do not add mocks, fake APIs, localStorage orders, placeholder cards, hard-coded public IDs, client-owned price calculations, or duplicate Exchange order tables.
- Do not implement quick matching, manual unmatched close, automatic service payment, external payment/refund, or Affiliate reward/reversal behavior.
- Use RED-GREEN-REFACTOR for every task, keep commits independently reversible, and run focused tests before each commit.
- Apply only this task's migration after reconciling the physical schema and migration history; never blanket-deploy unrelated pending migrations to make a checker pass.
- Real-data checkers must refuse production flags, remote MySQL, and production-like database names; every fixture must have a unique marker and be cleaned or rolled back with baseline evidence.
- Before modifying or integrating `backend/src/repositories/booking.repository.ts`, compare the latest local `main` and the separate travel-fare work. Preserve all unrelated dirty files and resolve semantic overlap rather than overwriting another task.
- Completion requires automatic tests, real MySQL, desktop/mobile browser acceptance, field-level card comparison, local-main merge, post-merge regression, and stopped runtimes. Push, staging migration, and deployment remain separate.

---

### Task 1: Add the additive schema and migration contract

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Create: `backend/prisma/migrations/20260905180000_exchange_intelligence_booking/migration.sql`
- Create: `backend/tests/exchange-intelligence-booking-schema.test.ts`
- Modify: `backend/tests/exchange-schema.test.ts`

**Interfaces:**
- `ExchangeIntelligence.serviceId -> Service.id`
- `ExchangeIntelligence.technicianServiceId -> TechnicianService.id`
- `ExchangeIntelligence.serviceNameSnapshot`
- `ExchangeIntelligence.serviceDurationSnapshot`
- `BookingOrder.exchangeIntelligencePostId -> ExchangeIntelligence.postId`

- [ ] Write a failing schema test that requires the four Intelligence columns, optional Prisma relations, the Booking source relation, both service indexes, `[exchangeIntelligencePostId, createdAt]`, Restrict foreign keys, and the legacy-or-exactly-one-service CHECK.
- [ ] Run `npm --prefix backend test -- --runInBand tests/exchange-intelligence-booking-schema.test.ts tests/exchange-schema.test.ts`; expect failure because the migration and fields do not exist.
- [ ] Add the nullable relations and snapshots to Prisma without modifying any applied migration. Keep internal numeric relation keys private and retain existing `postId` ownership.
- [ ] Add forward SQL that allows either all four new Intelligence fields to be null for legacy rows or exactly one service FK plus a non-empty name and positive duration. Add Restrict FKs and indexes without data backfill.
- [ ] Add `BookingOrder.exchangeIntelligencePostId` with a Restrict FK directly to `exchange_intelligences.post_id`; do not make it unique.
- [ ] Run `npm --prefix backend run prisma:generate`, `npm --prefix backend exec prisma validate -- --schema prisma/schema.prisma`, and the two focused schema suites; expect PASS.
- [ ] Commit as `feat(exchange): add intelligence booking schema`.

---

### Task 2: Expose publisher-scoped formal service options

**Files:**
- Modify: `backend/src/constants/permissions.constants.ts`
- Create: `backend/src/types/exchange-intelligence-booking.types.ts`
- Create: `backend/src/validators/exchange-intelligence-service.validators.ts`
- Create: `backend/src/repositories/exchange-intelligence-service.repository.ts`
- Create: `backend/src/services/exchange-intelligence-service.service.ts`
- Create: `backend/src/controllers/exchange-intelligence-service.controller.ts`
- Create: `backend/src/routes/exchange-intelligence-service.routes.ts`
- Modify: `backend/src/app.ts`
- Modify: `backend/src/api/openapi.ts`
- Create: `backend/tests/exchange-intelligence-service.repository.test.ts`
- Create: `backend/tests/exchange-intelligence-service.service.test.ts`
- Create: `backend/tests/exchange-intelligence-service.routes.test.ts`
- Create: `backend/tests/exchange-intelligence-service.openapi.test.ts`

**Endpoint:** `GET /api/v1/exchange/intelligence/service-options?page=1&page_size=20`

- [ ] Write failing repository tests for merchant current-shop scoping, technician active-affiliation scoping, approved/active/bookable/soft-delete filters, deterministic pagination, canonical technician `s##########` ID, and bounded eager loading without N+1 queries.
- [ ] Write failing service and route tests for unauthenticated 401, non-publisher 403, merchant/technician/admin authorization, strict positive pagination, stable envelopes, and public-field-only responses.
- [ ] Add a dedicated read permission to the permission registry and the additive migration grants for technician, merchant owner, eligible merchant staff, and admin. Do not grant customer publication authority.
- [ ] Implement `serviceRef` as `shop:{id}` or `technician:{id}` and return authoritative name, duration, catalog price, mode, availability, shop summary, and optional public technician summary.
- [ ] Add controller/route/app wiring and OpenAPI request, response, pagination, auth, permission, and error schemas.
- [ ] Run the four focused suites and `npm --prefix backend run lint`; expect PASS.
- [ ] Commit as `feat(exchange): add intelligence service options`.

---

### Task 3: Bind Intelligence publication to the formal service

**Files:**
- Modify: `backend/src/types/exchange.types.ts`
- Modify: `backend/src/validators/exchange.validators.ts`
- Modify: `backend/src/services/exchange.service.ts`
- Modify: `backend/src/repositories/exchange.repository.ts`
- Modify: `backend/src/constants/error-codes.ts`
- Modify: `backend/src/api/openapi.ts`
- Modify: `backend/tests/exchange.validators.test.ts`
- Modify: `backend/tests/exchange.service.test.ts`
- Modify: `backend/tests/exchange.repository.test.ts`
- Modify: `backend/tests/exchange.routes.test.ts`
- Modify: `backend/tests/exchange.openapi.test.ts`

- [ ] Write failing validation and route tests requiring `serviceRef` for new Intelligence posts and rejecting malformed refs, decimal/negative/above-catalog campaign prices, wrong identities, and unknown services with stable error codes.
- [ ] Write failing service/repository tests proving the transaction re-reads the service, shop, technician affiliation, review/active/bookable state, catalog price, mode, address, areas, name, and duration; prove client-supplied legacy authority fields are ignored.
- [ ] Add stable errors for required/not-found/forbidden/unavailable service and invalid campaign price. Map them to intentional 400/403/404/409 envelopes rather than raw Prisma errors.
- [ ] Include `serviceRef` and campaign price in the idempotency fingerprint. Prove same-key replay returns the same post and same-key/different-service or price returns conflict.
- [ ] Persist exactly one service FK and immutable name/duration snapshots, derived public fields, audit metadata, and existing publication-fee behavior in one transaction.
- [ ] Update OpenAPI so legacy `originalPriceJpy`, `serviceMode`, `addressLabel`, and `serviceAreas` remain optional compatibility inputs but are documented as non-authoritative and absent from new frontend requests.
- [ ] Run the focused validator/service/repository/route/OpenAPI suites; expect PASS.
- [ ] Commit as `feat(exchange): bind intelligence to service`.

---

### Task 4: Project authoritative bookability and shared card data

**Files:**
- Modify: `backend/src/types/exchange.types.ts`
- Modify: `backend/src/repositories/exchange.repository.ts`
- Modify: `backend/src/services/exchange.service.ts`
- Modify: `backend/src/api/openapi.ts`
- Create: `backend/tests/exchange-intelligence-booking-projection.test.ts`
- Modify: `backend/tests/exchange.repository.test.ts`
- Modify: `backend/tests/exchange.service.test.ts`

- [ ] Write failing projection tests for current post state, validity window, service availability, shop state, technician public profile and affiliation, and exact service-ref matching.
- [ ] Require `booking.available`, stable `unavailableReason`, target type/id, catalog and campaign prices, name, duration, mode, service window, `publisherCard`, and `serviceCard` in the formal detail payload.
- [ ] Prove an unbound legacy post returns `booking.available=false` without fabricated binding, and a withdrawn/closed/expired or newly unavailable service fails closed.
- [ ] Prove shop cards expose only formal public shop ID/name/images/status/rating/review/address/mode/detail link and technician cards expose canonical `s##########` ID/name/avatar/shop/experience/acceptance/rating/reviews/areas/languages/profile link.
- [ ] Prove no internal user, identity, relation, phone, email, home address, KYC detail, or generated fallback rating is present.
- [ ] Implement one authoritative projection mapper and OpenAPI schemas that both detail and checkout can consume.
- [ ] Run focused repository/service/projection/OpenAPI suites; expect PASS.
- [ ] Commit as `feat(exchange): project intelligence booking context`.

---

### Task 5: Support formal technician-service checkout context

**Files:**
- Create: `backend/src/validators/technician-service-booking-context.validator.ts`
- Modify: `backend/src/repositories/technician-service.repository.ts`
- Modify: `backend/src/services/technician-service.service.ts`
- Modify: `backend/src/controllers/technician-service.controller.ts`
- Modify: `backend/src/routes/technician-service.routes.ts`
- Modify: `backend/src/api/openapi.ts`
- Create: `backend/tests/technician-service-booking-context.repository.test.ts`
- Create: `backend/tests/technician-service-booking-context.routes.test.ts`
- Create: `backend/tests/technician-service-booking-context.openapi.test.ts`

**Endpoint:** `GET /api/v1/technician-services/{id}/booking-context`

- [ ] Write failing repository/API tests for a public, approved, active, bookable technician service under a current active shop affiliation and the existing customer Booking read permission.
- [ ] Prove soft-deleted, inactive, unapproved, non-public-profile, detached, wrong-shop, and nonexistent services all return the same 404 boundary without leaking private state.
- [ ] Return only the public service, canonical technician, current shop, supported mode/area, duration, price, and card fields needed by checkout; do not return private affiliation or actor IDs.
- [ ] Implement validation, repository/service/controller/route wiring, permission, and OpenAPI.
- [ ] Run the three focused suites plus existing technician service tests; expect PASS.
- [ ] Commit as `feat(booking): add technician service context`.

---

### Task 6: Enforce Intelligence source and campaign price in Booking

**Files:**
- Modify: `backend/src/validators/booking.validator.ts`
- Modify: `backend/src/types/booking.types.ts`
- Modify: `backend/src/services/booking.service.ts`
- Modify: `backend/src/repositories/booking.repository.ts`
- Modify: `backend/src/api/openapi.ts`
- Modify: `backend/tests/booking-validator.test.ts`
- Create: `backend/tests/booking-exchange-intelligence.service.test.ts`
- Create: `backend/tests/booking-exchange-intelligence.repository.test.ts`
- Modify: `backend/tests/booking-api.test.ts`
- Modify: `backend/tests/order-checkout-service.test.ts`

- [ ] Before editing, fetch the latest local `main` commit and inspect the travel-fare task's changes to `booking.repository.ts`, booking validation, checkout arithmetic, and snapshot JSON. Rebase or merge only after the related working tree has committed; never copy over dirty files.
- [ ] Write failing validator/API tests allowing optional positive `exchangeIntelligencePostId` while continuing to reject client price fields.
- [ ] Write failing service/repository tests for post type/status/expiry, exact shop or technician service match, publisher scope, current catalog eligibility, slot shop/technician/service/time/capacity, and the full Intelligence service-window containment rule.
- [ ] Write failing price tests proving the persisted campaign price—not client input or changed catalog price—fills `servicePriceSnapshot`, `priceAmount`, `paymentAmountJpy`, and the non-private source fields in `serviceSnapshotJson`, while travel fare and existing checkout items remain separate.
- [ ] Extend the existing transaction lock order to cover customer/identity, Intelligence, service/shop/affiliation, slot, and conflicting booking before any write.
- [ ] Persist `exchangeIntelligencePostId`, ordinary `PENDING` state/history, slot capacity, notification, and audit evidence. Do not create payment, refund, or Affiliate records.
- [ ] Include the post ID in the existing booking idempotency fingerprint. Prove exact replay returns one order; same key with different post/service/slot/payment fields conflicts.
- [ ] Add independent-connection last-capacity concurrency and injected-transaction-failure tests proving only one success and zero partial records.
- [ ] Run all focused Booking, Exchange matched-booking, cancellation, travel-fare, and checkout suites; expect PASS.
- [ ] Commit as `feat(booking): create orders from intelligence`.

---

### Task 7: Add formal service selection to the Intelligence composer

**Files:**
- Modify: `src/features/exchange/types.ts`
- Modify: `src/features/exchange/api.ts`
- Modify: `src/features/exchange/exchange-composer-model.ts`
- Modify: `src/features/exchange/IntelligenceComposerFields.tsx`
- Modify: `src/features/exchange/ExchangePublicationReview.tsx`
- Modify: `src/features/exchange/ExchangeComposer.tsx`
- Modify: `src/features/exchange/i18n.ts`
- Modify: `src/features/exchange/api.test.ts`
- Modify: `src/features/exchange/ExchangeComposer.test.tsx`
- Create: `src/features/exchange/IntelligenceComposerFields.test.tsx`

- [ ] Write failing API/component tests for loading, paginated selection, empty scope, 403, retry, selected service review, catalog/campaign validation, and merchant versus technician option fields.
- [ ] Require selection before submission and send only `serviceRef`, campaign price, authored content, service window, validity window, language, and existing permitted content fields.
- [ ] Display the authoritative service/shop/technician summary with formal public IDs, catalog price, duration, mode, and a clear campaign-price rule. Do not accept editable client catalog price, shop, technician, address, or service-area authority.
- [ ] Preserve the existing high-fidelity composer shell and mobile behavior; add complete Simplified Chinese, Traditional Chinese, Japanese, English, and Korean copy.
- [ ] Run focused Exchange API/composer/i18n suites and `npm run lint`; expect PASS.
- [ ] Commit as `feat(exchange): select formal intelligence service`.

---

### Task 8: Replace the disabled detail CTA with shared formal cards and typed checkout

**Files:**
- Modify: `src/features/exchange/types.ts`
- Modify: `src/features/exchange/api.ts`
- Modify: `src/features/exchange/ExchangePostDetailPage.tsx`
- Modify: `src/features/exchange/ExchangePostDetailPage.test.tsx`
- Modify: `src/shared/profile-card/types.ts`
- Modify: `src/shared/profile-card/UnifiedProfileCard.tsx`
- Modify: `src/shared/service-card/model.ts`
- Modify: `src/shared/service-card/mappers.ts`
- Modify: `src/shared/service-card/mappers.test.ts`
- Modify: `src/shared/service-card/service-card-usage.test.ts`

- [ ] Write failing detail tests proving shop Intelligence uses `UnifiedProfileCard` plus `UnifiedServiceInfoCard`, technician Intelligence uses the canonical technician profile variant plus the same service card, and every required field comes from the formal API projection.
- [ ] Add dedicated mapper inputs only where the existing shared card types lack an authoritative field; do not fork or reimplement the card layout.
- [ ] Replace the disabled button with an enabled CTA only when `booking.available=true`; route shop services to `/checkout/{serviceId}?exchangePost={postId}` and technician services to `/checkout/technician-service/{technicianServiceId}?exchangePost={postId}`.
- [ ] Render explicit legacy/withdrawn/expired/unavailable reasons and a recoverable navigation state without guessing a service or price.
- [ ] Test public shop IDs, canonical technician IDs, detail links, image empty states, catalog/campaign price, duration, mode, ratings/reviews, and absence of private/internal IDs.
- [ ] Run focused detail and shared-card suites; expect PASS.
- [ ] Commit as `feat(exchange): enable intelligence booking entry`.

---

### Task 9: Make checkout work for both service types and preserve source evidence

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/pages/user/CheckoutPage.tsx`
- Modify: `src/pages/user/FormalCheckoutPage.tsx`
- Modify: `src/pages/user/TechnicianServicesPage.tsx`
- Modify: `src/features/booking/api.ts`
- Modify: `src/features/booking/api.test.ts`
- Modify: `src/pages/user/FormalCheckoutPage.test.ts`
- Modify: `src/pages/user/FormalCheckoutPage.round-trip.test.tsx`
- Modify: `src/shared/service-card/service-card-usage.test.ts`
- Modify: `src/i18n/translations.ts`

- [ ] Introduce a typed catalog reference union for shop service and technician service; write failing route tests proving direct reload works for both `/checkout/:serviceId` and `/checkout/technician-service/:technicianServiceId`.
- [ ] Write failing API/page tests for loading the correct formal context and availability, reading `exchangePost`, validating exact target match, displaying source/catalog/campaign price/cards, and filtering to slots fully inside the Intelligence service window.
- [ ] Prove missing, mismatched, expired, withdrawn, unavailable, and network-uncertain Intelligence states disable submission with localized recoverable errors.
- [ ] Submit `exchangeIntelligencePostId` and the typed service ID with the existing idempotency key; never submit price. Reuse the same key after uncertain network failure and rotate only when the input fingerprint changes.
- [ ] Preserve all existing payment-mode, travel-estimate, tax, membership, and validation behavior. Use the same unified card mappers as the detail page so card data and field order cannot drift.
- [ ] Fix `TechnicianServicesPage` to generate the explicit technician-service route instead of the currently rejected prefixed pseudo-ID.
- [ ] Add complete five-language copy and run focused checkout/booking API/technician service/card suites plus `npm run build`; expect PASS.
- [ ] Commit as `feat(booking): support intelligence checkout`.

---

### Task 10: Verify migration, real flow, cards, regressions, and local-main integration

**Files:**
- Modify: `backend/src/simulation/exchange-simulation-seed.ts`
- Modify: `backend/src/simulation/exchange-simulation-checker.ts`
- Modify: `backend/tests/exchange-simulation-plan.test.ts`
- Modify: `backend/tests/exchange-simulation-safety.test.ts`
- Create: `backend/scripts/check-exchange-intelligence-booking-flow.ts`
- Create: `backend/tests/exchange-intelligence-booking-flow-script.test.ts`
- Modify: `backend/package.json`
- Modify: `README.md`

- [ ] Update the deterministic local simulation seed to choose existing approved formal services within each publisher's real scope; never create shadow service data or fake card values.
- [ ] Add a static safety test, then implement a guarded scratch-MySQL checker that starts from an empty database, applies the full migration chain, and verifies migration table entry, physical columns, CHECK, indexes, and Restrict FKs.
- [ ] In the checker, publish one merchant-service and one technician-service Intelligence post, create customer bookings at campaign price, and prove source FK, snapshots, slot capacity, status history, notifications, audit, current travel/checkout separation, exact idempotent replay, conflict, rollback, and last-capacity concurrency.
- [ ] Add negative proofs for cross-shop and impersonated service binding, legacy unbound post, withdrawn/closed/expired post, unavailable service, inactive affiliation, time-window violation, service mismatch, price injection, and post/source deletion restriction.
- [ ] Prove the checker removes its marker fixtures, scratch database, and dedicated account and leaves the original configured database at its exact baseline.
- [ ] Reconcile the local `needo_dev` migration history and physical schema, apply only `20260905180000_exchange_intelligence_booking`, then run the formal checker. Record migration name, checksum/status, and before/after evidence in README.
- [ ] Run `npm --prefix backend run prisma:generate`, `npm --prefix backend exec prisma validate -- --schema prisma/schema.prisma`, `npm --prefix backend run lint`, `npm --prefix backend run build`, the four-shard complete backend suite, `npm run lint`, `npm test -- --run`, `npm run build`, and `git diff --check`.
- [ ] Start the formal backend on 3000 and frontend on the repository standard port. Prove each listener PID, cwd, branch, served commit, `/api/v1/health`, `/api/v1/ready`, and frontend proxy origin before browser acceptance.
- [ ] With real merchant, technician, and customer identities, verify merchant publication, technician publication, both Exchange detail views, both checkout routes, successful persisted bookings after refresh, and consistent source/price in customer, merchant, and technician order views.
- [ ] Field-check every shop/technician/service card against the exact API response and database relation: public IDs, names, images or explicit empty states, shop affiliation, status, ratings/reviews, experience/acceptance/languages/areas where applicable, detail links, catalog price, campaign price, duration, mode, and absence of private/internal values.
- [ ] Regress formal demand publication, Intelligence publication, selective claim, withdrawal, matching-to-booking, bilateral cancellation, and current travel-fare booking behavior.
- [ ] At desktop, `440x956`, and `320x956`, verify no horizontal overflow, usable keyboard focus, loading/empty/error states, correct links, console without unwaived errors, and no unexpected 4xx/5xx network responses. Save screenshots and order/API/database evidence.
- [ ] Update README with APIs, invariants, migration/checker result, browser evidence, exact exclusions, and separate local merge/push/deploy/staging states.
- [ ] Run an independent code review against the design and this plan, fix all findings through RED-GREEN, and rerun affected verification.
- [ ] Confirm the target local `main` worktree is safe, merge or fast-forward the complete branch without overwriting unrelated dirty files, verify `git merge-base --is-ancestor <feature-head> main`, rerun the focused post-merge regression from the main checkout, and stop all runtimes started by this task.
- [ ] Commit the verification documentation as `docs(exchange): record intelligence booking acceptance`. Do not push, deploy, or apply staging/production migrations.

---

## Plan self-review

- Every approved product rule has an implementation owner: Exchange validates publication scope and current bookability; Booking owns atomic order creation and price snapshots; shared card mappers own UI consistency.
- Legacy rows, current-main travel-fare work, payment/checkout arithmetic, Affiliate, migration ownership, public-ID privacy, and cross-worktree safety have explicit non-regression boundaries.
- The plan includes failing tests before implementation, additive migration and physical-schema proof, Zod/OpenAPI/RBAC/audit/idempotency/concurrency, five-language UI, two service types, real MySQL, three viewport classes, card-to-API/database comparison, local-main integration, and runtime cleanup.
- No step claims that unit tests, builds, browser rendering, migration files, or a local merge substitute for one another. Push, staging deployment, staging migration, and external payment remain separately deferred.
