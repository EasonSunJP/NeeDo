# Formal Store Detail Real-Data Design

Date: 2026-08-25  
Scope: one micro-step for the customer-facing numeric store-detail route

## Problem

Numeric store routes already request `/api/v1/shops/:id`, but they pass the returned shop and technician records into the legacy `StoreDetailExperience`. That component continues to read bundled services, reviews, customers, orders, presentation blocks, engagement counters, and derived operating metrics from frontend compatibility data.

The result is a mixed page: technician names and avatars may come from database test accounts while recommended services, ranking badges, favorite/share counts, acceptance rate, and review rows are not backed by the formal store-detail API.

## Decision

Create an isolated `FormalStoreDetailPage` for numeric store IDs. It will render only values returned by the formal core-read API and will not import the central mock module, entity store, local order state, or Social compatibility state.

Keep `StoreDetailExperience` unchanged for explicit legacy/static-demo and merchant presentation-editor workflows. This avoids a broad rewrite and preserves existing compatibility surfaces.

## Route and Data Flow

1. `StoreDetailPage` parses the route ID.
2. A numeric ID renders `FormalStoreDetailPage` with that shop ID.
3. `FormalStoreDetailPage` calls `coreReadApi.getShopDetail(shopId)`.
4. A nonnumeric ID may use the existing legacy experience only when static-demo mode is enabled.
5. A nonnumeric ID in formal mode renders an unavailable-link state rather than selecting the first browser-local store.

## Formal Page Content

The page may render only these API-backed fields:

- Shop: name, description, city, address, phone, cover/media assets, rating summary, creation/update metadata when useful.
- Services: ID, name, description, category, price, currency, duration, cover, rating summary, and links to numeric service/checkout routes.
- Technicians: ID, display name, city, avatar, rating average, review count, and numeric technician profile link.
- Review summary: aggregate rating, aggregate count, and stored highlight tags.

The page must not invent or derive these fields without a formal contract:

- acceptance or cancellation rate;
- favorite/share counts;
- Best rankings or newcomer badges;
- technician-to-service recommendation ownership;
- individual review author, avatar, timestamp, body, or score;
- room, offer, map-guide, social-post, or availability copy from legacy presentation data.

If the API has only a review summary, show the summary and an explicit message that no public review detail records are available. Do not populate review rows from bundled data.

If an image is absent, use a neutral text/initial placeholder. Do not substitute a different generated person or store image.

## States and Navigation

- Loading: identify that the formal store record is being loaded.
- Error: show the API error and no fallback records.
- Empty/not found: show a formal unavailable state.
- Services empty: show a database-empty message.
- Technicians empty: show a database-empty message.
- Primary booking action: use the first real service ID only; hide or disable the action when no real service exists.
- Back navigation remains available for user and merchant routes.

## Compatibility Boundary

- Numeric user and merchant store routes use the formal page.
- `StoreDetailExperience` remains available to existing direct callers such as the merchant presentation workflow.
- Static-demo compatibility remains possible for nonnumeric store IDs.
- No schema, migration, seed, or API response change is required for this micro-step.

## Tests

Add regression tests that prove:

1. Numeric store routes render `FormalStoreDetailPage`.
2. Formal page source contains the shop-detail API and real service/technician collections.
3. Formal page source does not import `data/mock`, `entityStore`, local orders, or Social compatibility.
4. Formal page contains none of the unsupported synthetic metrics or individual review-row components.
5. Nonnumeric formal routes cannot fall back to the first local store.
6. Existing legacy store-detail tests continue to pass.
7. Formal production build and bundle audit pass.
8. Browser validation on a seeded store shows database services and technician accounts, with no legacy names or review rows.

## Acceptance Criteria

- The reported screenshot cannot be reproduced on a numeric store route.
- Ren Kobayashi and Yui Mori, when shown, are presented only with their database profile fields.
- Their cards do not claim a mock cleaning service, 98% acceptance, synthetic ranking, favorite/share values, or mock review authors.
- Seeded simulation shops continue to show their database-linked technicians.
- Missing formal data is visible as missing, not replaced by virtual content.
