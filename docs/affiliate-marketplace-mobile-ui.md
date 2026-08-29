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

Affiliate task authoring:

- `POST /api/v1/merchant-admin/affiliate/tasks` accepts an optional source locale.
- `PUT /api/v1/merchant-admin/affiliate/tasks/:taskId/locales/:locale` edits one language with an optimistic lock; `syncToAll=true` is the only operation that copies the selected version to every language.
- `POST /api/v1/merchant-admin/affiliate/tasks/:taskId/submit` requires publishable task content in at least one active language before it can freeze NDP or enter review.

Affiliate platform fee policy:

- `GET /api/v1/backoffice/affiliate/fee-rules` returns paginated global/shop rule history.
- `POST /api/v1/backoffice/affiliate/fee-rules` creates the next optimistic, immutable rule version with a required reason and effective time.

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

Claim creation does not pay or allocate a reward. Booking attribution performs the authoritative commission allocation, and service completion atomically captures the promoter reward plus the task's immutable platform-fee allocation. The promoter receives the full advertised reward; the platform fee is an additional publisher cost and never reduces that reward.

At the default 1,000 bps rate, a 2,000,000 NDP commission budget freezes 2,200,000 NDP: 2,000,000 commission plus 200,000 fee reserve. A completed 10,000 NDP reward captures 11,000 frozen NDP, credits 10,000 to the claimant, and credits 1,000 to the canonical platform wallet. Allocation capacity remains commission-only, so the fee reserve cannot create extra Claims or completed-order capacity.

## Languages

Marketplace chrome and status text have independent Simplified Chinese, Traditional Chinese, Japanese, English, and Korean values. AffiliateTask names/descriptions are stored as independent database rows and returned as an available translation map. Creating from any source language initially copies the same value to all five versions; later versions remain independent unless the publisher explicitly uses synchronize-all. Recommended cards and task detail select the authored value for the current application language, fall back to the task's formal compatibility snapshot when that language is absent, never machine-translate it, and search can match any active language.

All five languages remain independently editable, but they are not all mandatory for submission. At least one active language must have a non-blank task name within the supported length; a missing or blank set returns `error.affiliate.task_content_required` before the Wallet/Ledger freeze. Each locale edit reuses publisher scope, draft status, optimistic locking, RBAC and `affiliate.task.translation_updated` audit evidence.

## Verification

Fresh verification on 2026-08-29:

- focused frontend task-localization/marketplace regression: 5 files and 17 tests passed;
- frontend TypeScript lint: passed;
- full frontend regression after merging the latest `main`: 215 files and 1,273 tests passed;
- formal production build and bundle audit: passed; the existing dynamic-import and chunk-size warnings remain non-blocking;
- backend ESLint and TypeScript production build: passed;
- focused backend task-localization/marketplace/OpenAPI regression: 6 suites and 40 tests passed;
- full backend regression: 260 suites and 1,780 tests passed, with the repository-configured 9 suites / 37 tests skipped;
- migration `20260829223000_affiliate_task_translations` applied successfully to local `needo_dev`; Prisma reports all 59 migrations up to date;
- the guarded real-database AffiliateTask localization flow passed initial five-language copy, independent edit, explicit synchronize-all, all-content-missing rejection with no freeze, one-language submission with one exact NDP freeze, translation audit evidence, and exact temporary-row cleanup with zero residue;
- the existing guarded Affiliate task-publishing flow passed again after the schema change, including shop and merchant-account freezes, scope isolation, approval/rejection, reconciliation, idempotency, and cleanup;
- isolated formal runtime on backend `3003` and frontend `5183`: `/health`, `/ready`, and frontend HTTP returned healthy/ready/200 with real local MySQL and Redis;
- the existing formal `affiliate@example.com` account passed password-login, 25-permission, RBAC, and Affiliate-portal checks against the isolated backend;
- the guarded real-database Affiliate Claim flow passed marketplace filtering, concurrent/repeated idempotency, stable credentials, signed-link tamper rejection, current-user isolation, unchanged wallet balance at Claim time, token-free audit evidence, and exact temporary-row cleanup;
- authenticated browser acceptance passed for the operations dashboard, Affiliate operations task page, the independent user-home carousel editor, and the independent Affiliate announcement-carousel editor;
- the operations header rendered the Chinese `联盟营销` label with the `TEST` badge; the Affiliate operations page loaded real database aggregates and an honest zero-task state;
- the Affiliate identity switch rendered user, technician, store, and Affiliate foreground identities plus the three authorized backend entry points;
- the Affiliate home rendered the authenticated avatar, NeeDo ID, current Affiliate identity, identity-switch entry, task search, the published Affiliate announcement carousel, and the real zero-task recommendation state;
- the recommendation page and announcement-detail page loaded without browser warnings or errors;
- both carousel administration routes exposed independent published versions and shared language tabs in the required Japanese, English, Korean, Traditional Chinese, and Simplified Chinese display order while preserving Simplified Chinese as the selected draft source; the browser emitted no warning or error logs;
- the display-order change passed a RED/GREEN cycle: the focused regression first failed only on the old tab order, then 3 focused files / 67 tests, frontend TypeScript lint, 214 full frontend files / 1,258 tests, and the formal production build with 8-entry bundle audit all passed.

Additional fee-reserve verification on 2026-08-30:

- migrations `20260830010000_affiliate_platform_fee_reserve_settlement` and `20260830013000_affiliate_platform_fee_budget_constraint` applied to local `needo_dev`;
- the guarded real-MySQL check passed exact 2,200,000 gross freeze, 11,000 gross capture, 10,000 claimant credit, 1,000 platform credit, immutable shop override snapshots, mixed-rate pre-wallet rejection, rejection/expiry split release, idempotent retries, reconciliation/audit evidence, and exact transactional cleanup baseline;
- the OpenAPI contract exposes the protected paginated fee-rule history/version endpoint without internal numeric actor IDs.

No saved password, refresh token, browser storage, existing carousel content, or persisted user data was read or overwritten during browser acceptance. The guarded localized-carousel publication check also refused to mutate the non-empty local carousel scenes and left its captured temporary rows/files at zero; carousel scene separation remains covered by the passing integration suites. Because the formal database currently contains no eligible published Affiliate task, task-card, task-detail, and browser-click Claim acceptance remain data-blocked; their API, service, route, and component paths are covered by the passing automated and guarded real-database suites without seeding fake marketplace data.

## Remaining Formal Microsteps

This is not the complete Affiliate platform. The following remain separately capability-gated:

- merchant task publishing and management UI;
- completed-order reversal and reward recovery;
- formal Affiliate metrics, rankings, fraud aggregates, and exports;
- operations monitoring and platform fee-policy UI;
- eKYC-gated withdrawal and a real payment/bank-provider completion flow.
