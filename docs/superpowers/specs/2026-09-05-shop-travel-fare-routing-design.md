# Shop Travel Fare Routing Design

Date: 2026-09-05  
Stage: Step 10 order pricing plus Step 12 merchant/operations real data  
Status: approved product direction; implementation pending

## 1. Goal and scope

Enable each shop to publish versioned distance-band travel-fare rules for home service. A formal routing provider calculates driving distance from the shop to the customer's service address. Booking and checkout persist immutable distance, rule, and fare snapshots, and the operations dashboard aggregates only completed, payment-evidenced, unreversed travel fares.

The first hosted provider is Geoapify. The application uses a provider-neutral backend port so a self-hosted openrouteservice instance can replace it without changing booking, checkout, or dashboard contracts.

Franchisee management, supplier management, and the consumables Store remain visibly marked `TEST` and disabled. They are outside this implementation because the user explicitly deferred them.

## 2. Product rules

### 2.1 Shop rules

- Only a shop-scoped merchant owner with travel-fare write permission can create or publish rules for the current signed shop.
- A published version contains ordered inclusive maximum-distance bands. Example: up to 5,000 metres costs 0 JPY, up to 10,000 metres costs 500 JPY, and up to 20,000 metres costs 1,000 JPY.
- The first matching band where `distanceMeters <= maximumDistanceMeters` supplies the fare.
- Maximum distances must be strictly increasing. Amounts must be non-negative integers. A version must contain at least one band and no more than 50 bands.
- A rule version has an explicit effective time, publisher, reason, and immutable ordered bands. Later versions never rewrite an existing booking or checkout.
- A home-service booking outside the greatest configured distance is rejected as outside the shop's service area.
- Store-service bookings always have a zero travel fare and do not call the route provider.

### 2.2 Address and route estimation

- Home checkout captures a structured Japanese service address instead of embedding it in the free-text note. The address contains postal code, prefecture/city, address lines, and an optional building line.
- The backend obtains the shop address from the current formal Shop record. The client cannot submit a shop origin or fare.
- The backend sends the normalized origin and destination to the configured route provider using the driving profile.
- A route estimate records provider code, provider request ID when returned, distance metres, duration seconds, origin/destination hashes, policy version, calculated fare, creation time, and expiry time. Raw provider responses and API keys are never stored.
- Preview returns a short-lived public estimate ID. Booking creation accepts that ID, rechecks customer, shop, service, address hash, policy, expiry, and route status, and persists the immutable snapshot in the same booking transaction.
- The client cannot submit distance, duration, fare, policy version, or provider response fields.

### 2.3 Checkout and financial recognition

The order checkout formula is:

```text
checkout amount JPY = base service amount
                    + accepted add-on amount
                    + travel fare amount
                    - discount amount
```

- `OrderCheckout` stores `travelFareAmountJpy`; the calculation snapshot identifies the booking travel snapshot used.
- Existing orders and store-service orders migrate with `travelFareAmountJpy = 0`.
- NDP conversion uses the final checkout amount after travel fare and discount.
- Travel fare is recognized by the dashboard only when the order is completed, checkout payment has formal NDP ledger evidence or technician receipt confirmation, and neither payment nor order has been refunded or reversed.
- A refund or reversal excludes the complete original travel fare from recognized current/previous period totals. Partial travel-fare refunds are not introduced in this microstep.
- Dashboard detail rows expose order number, shop, completion time, distance, policy version, fare, payment evidence, and reversal state without exposing a customer's complete address.

## 3. Architecture and persistence

### 3.1 Provider boundary

`RouteDistanceProvider` is the only application dependency on a routing vendor. It consumes normalized origin/destination addresses and returns a validated driving distance, duration, provider request ID, and provider code.

`GeoapifyRouteDistanceProvider` calls the Geoapify geocoding and routing endpoints through a bounded HTTP client. The base URLs, API key, connect/read timeout, and enabled state come from validated environment configuration. The API key is never returned, logged, audited, or committed.

The adapter enforces:

- finite positive coordinates and route values;
- one driving route leg between exactly two resolved points;
- request timeout and abort;
- bounded retry only for transient provider/server failures;
- stable classification for unconfigured, rate-limited, timeout, no-route, invalid-response, and unavailable outcomes.

### 3.2 New persisted authorities

- `ShopTravelFarePolicyVersion`: immutable published policy header scoped to one shop.
- `ShopTravelFareBand`: ordered maximum-distance and fare rows belonging to one policy version.
- `RouteEstimate`: short-lived provider result bound to customer, shop, service, address hash, and policy version.
- `BookingTravelFareSnapshot`: one-to-one booking record containing normalized non-secret address snapshot, distance, duration, provider, policy version, and fare.

All tables contain `id`, `createdAt`, `updatedAt`, and `deletedAt`; business relationships have indexes and Restrict foreign keys. Active-version uniqueness is enforced through database-safe keys and service transactions. Existing applied migrations are not edited.

## 4. APIs and permissions

### 4.1 Merchant policy administration

- `GET /api/v1/merchant-admin/travel-fare-policy`
- `POST /api/v1/merchant-admin/travel-fare-policy/versions`
- `GET /api/v1/merchant-admin/travel-fare-policy/versions?page=&pageSize=`

Reads require `merchant-admin:travel-fare:read`; publication requires `merchant-admin:travel-fare:write`. The shop always comes from the signed merchant context. Publishing writes one immutable audit entry containing the previous and new public version IDs, bands, effective time, and reason.

### 4.2 Customer estimate and booking

- `POST /api/v1/bookings/travel-estimates`
- Existing `POST /api/v1/bookings` adds `travelEstimatePublicId` for home service and a structured `fulfillmentAddress`.

The estimate endpoint requires a customer-compatible active identity and a formally bookable home service/schedule slot. It is rate-limited by user and IP. Store bookings reject travel estimate fields; home bookings require them.

### 4.3 Operations visibility

- `GET /api/v1/backoffice/travel/providers/status`
- `GET /api/v1/backoffice/travel/fare-policies?page=&pageSize=&city=&shopKeyword=`
- Existing dashboard metric and detail endpoints make `travel_fare` ready when the schema is available.

Operations reads require explicit travel read permissions and write read-audit evidence. API-key values and complete customer addresses never appear in operations responses.

All inputs use strict Zod schemas. OpenAPI documents the success contract, pagination, RBAC, stable errors, and provider-data states.

## 5. User interfaces

### 5.1 Merchant admin

Add a formal travel-fare settings page under store settings. It shows the current/next policy, immutable history, and an editor for ordered distance bands. Publication requires a reason and a final confirmation screen. The page never displays sample policy rows when no rule exists.

### 5.2 Customer checkout

For home service, replace the note-embedded address with structured address fields. After address entry, show loading, exact calculated driving distance, fare, rule band, estimate expiry, outside-area state, and retry. Submission stays disabled without a valid unexpired estimate. Store service does not show this section.

### 5.3 Operations admin and dashboard

Replace the travel capability gate with provider status and read-only policy visibility once formal APIs exist. The dashboard travel-fare card uses ready current/previous values, comparison, information formula, and an enabled detail action. Provider unavailability affects new estimates but does not erase or change persisted historical metrics.

All new user-visible copy is added to the existing five-language i18n registry.

## 6. Failure and privacy behavior

- Missing provider configuration returns `error.travel.provider_unconfigured` before any order write.
- Quota exhaustion returns `error.travel.provider_rate_limited`; timeouts return `error.travel.provider_timeout`; no route returns `error.travel.route_not_found`; malformed responses return `error.travel.provider_invalid_response`.
- Policy absence, out-of-range distance, estimate expiry, estimate mismatch, and changed schedule/service return distinct stable conflicts without partial booking or wallet writes.
- Provider calls occur outside the booking database transaction. The transaction consumes only a validated persisted estimate and locks/rechecks its binding.
- Logs use hashes and public IDs, not complete customer addresses. Audit metadata contains only the minimum distance/policy/fare facts needed for financial reconstruction.
- Route estimates expire and are soft-deleted by a bounded worker. Booking snapshots remain for financial/audit retention.

## 7. Caching and cost control

- Cache keys use provider, normalized origin/destination hashes, driving profile, and provider-config version.
- Successful route results have a bounded configurable TTL; failures have a shorter bounded negative TTL.
- Exact booking snapshots are never recalculated after order creation.
- Per-user/IP rate limiting, request coalescing, and one preview per unchanged address reduce free-plan consumption.
- The provider status endpoint reports configured/healthy/rate-limited/unavailable without exposing quota secrets.

Geoapify registration and the real API key are manual external steps. Implementation and deterministic adapter tests can finish without a key; live-provider acceptance remains explicitly unproven until a key is supplied through the local environment.

## 8. Verification

Automated tests cover:

- distance-band boundaries, free band, out-of-range behavior, version selection, and validation;
- provider adapter success, timeout, rate limit, no route, invalid response, retries, and secret redaction;
- estimate ownership, expiry, binding, concurrency, and one-time booking consumption;
- home/store booking validation, rollback, policy change, and immutable snapshots;
- checkout arithmetic, NDP conversion, refund/reversal exclusion, and dashboard current/previous aggregation;
- RBAC, shop isolation, audit, pagination, OpenAPI, i18n, frontend states, and no browser-supplied fare authority.

A guarded local-MySQL checker creates a shop policy, customer, home booking, checkout/payment evidence, completion and reversal scenarios inside rollback-contained fixtures. It proves metric and ledger baselines are unchanged after cleanup.

Browser acceptance covers merchant rule publication, customer estimate and booking, checkout amount, operations detail, provider failure states, desktop/mobile overflow, console errors, and the exact listener PID/cwd. Without a real Geoapify key, browser acceptance uses only the provider-unconfigured state and does not claim a successful live route estimate.

## 9. Delivery boundaries

- Do not push, deploy, or mutate production data.
- Do not bundle a Geoapify key or create an account on the user's behalf.
- Do not fall back to straight-line distance or a static fare when Geoapify is unavailable.
- Do not activate franchisee, supplier, or consumables Store pages.
- Do not describe automated adapter tests as live-provider acceptance.
