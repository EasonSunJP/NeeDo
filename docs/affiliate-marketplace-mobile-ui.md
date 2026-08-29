# Affiliate Marketplace Mobile UI

## Scope

This microstep activates the formal mobile Affiliate task-discovery and participation path without replacing the existing Affiliate identity header, identity switch, profile, alliance organization, or independently configured notice carousel.

Protected routes:

- `/afirieito` — Affiliate home with the existing `affiliate-home-notice` carousel above a real recommended-task summary.
- `/afirieito/plan` — searchable, server-paginated task marketplace.
- `/afirieito/tasks/:taskId` — task gallery, terms, public store navigation, consultation, and participation.

The list and detail UI expose only NeeDo-verifiable fields: the persisted task/shop snapshots, task window, eligible scope, fixed reward, customer discount, total and remaining task budget, and server-created Claim code/link. They do not invent follower counts, external-platform performance, GMV, ROI, or ranking data.

## Formal API Contracts

Affiliate marketplace:

- `GET /api/v1/affiliate/tasks`
- `GET /api/v1/affiliate/tasks/:taskId`
- `POST /api/v1/affiliate/tasks/:taskId/claims`
- `GET /api/v1/affiliate/claims`

Store navigation:

- `GET /api/v1/shops/:shopId`, where `shopId` may be the public `shop##########` identifier returned by the marketplace task view.

All protected requests use the existing access-token and RBAC pipeline. Task participation remains server-authoritative and idempotent per task/user; the browser neither creates promotion codes nor calculates eligibility or moves wallet funds.

## User Flow

- The home carousel is still the Affiliate announcement scene and remains separate from the ordinary user-home carousel.
- Task cards use task cover media first and public shop media as a fallback.
- Search terms and page number are URL-backed; list reads remain server-paginated.
- Task detail shows task/shop images, total budget, remaining percentage, dates, instructions, and reward per completed order.
- “跳转到店铺” uses the public shop ID rather than an internal database ID.
- “聊天咨询” opens the formal IM contact directory with the real shop name prefilled.
- “立即参加” calls the formal Claim endpoint once while pending and renders the persisted promotion code and signed URL returned by the server.

## Privacy and Finance Boundary

The public marketplace response intentionally excludes wallet balances, reservation internals, ledger links, token hashes, claimant private data, and signing material. Remaining budget is a non-negative aggregate derived by the backend from the approved task reservation; it is presentation data, not an authorization for browser-side settlement.

Claim creation does not pay or allocate a reward. Booking attribution performs the authoritative allocation, and service completion performs the authoritative NDP settlement in their existing database transactions.

## Languages

Marketplace chrome and status text have independent Simplified Chinese, Traditional Chinese, Japanese, English, and Korean values. Merchant-authored task names/descriptions are rendered exactly as returned by the formal API; the browser never machine-translates or duplicates authored content.

Five-language AffiliateTask authoring, draft synchronization, and publish-all-language-version controls are intentionally left for a separate schema/editor microstep so that authored legal and commercial content is versioned and audited rather than synthesized in the client.

## Verification

Fresh verification on 2026-08-29:

- focused frontend marketplace/routes/i18n regression: 11 files and 117 tests passed;
- frontend TypeScript lint: passed;
- full frontend regression: 214 files and 1,258 tests passed;
- formal production build and bundle audit: passed; the existing dynamic-import and chunk-size warnings remain non-blocking;
- backend ESLint and TypeScript production build: passed;
- focused backend marketplace/public-shop/OpenAPI regression: 6 suites and 43 tests passed;
- full backend regression: 258 suites and 1,766 tests passed, with the repository-configured 9 suites / 37 tests skipped;
- isolated formal runtime on backend `3003` and frontend `5183`: `/health`, `/ready`, and frontend HTTP returned healthy/ready/200 with real local MySQL and Redis;
- the existing formal `affiliate@example.com` account passed password-login, 25-permission, RBAC, and Affiliate-portal checks against the isolated backend;
- the guarded real-database Affiliate Claim flow passed marketplace filtering, concurrent/repeated idempotency, stable credentials, signed-link tamper rejection, current-user isolation, unchanged wallet balance at Claim time, token-free audit evidence, and exact temporary-row cleanup;
- the mobile login screen rendered at the isolated Affiliate URL without console errors or the previous recovery page.

The authenticated browser interaction checklist is still pending user-performed credential entry in the isolated local tab. No saved password, refresh token, browser storage, existing carousel content, or persisted user data was read or overwritten to bypass that boundary. The guarded localized-carousel publication check also refused to mutate the non-empty local carousel scenes and left its captured temporary rows/files at zero; carousel scene separation remains covered by the passing integration suites.

## Remaining Formal Microsteps

This is not the complete Affiliate platform. The following remain separately capability-gated:

- five-language AffiliateTask authoring and coordinated publication;
- merchant task publishing and management UI;
- completed-order reversal and reward recovery;
- formal Affiliate metrics, rankings, fraud aggregates, and exports;
- operations monitoring and platform fee-policy UI;
- eKYC-gated withdrawal and a real payment/bank-provider completion flow.
