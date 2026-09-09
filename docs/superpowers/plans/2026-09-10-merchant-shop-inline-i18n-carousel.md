# Merchant Shop Inline Multilingual Editing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist five-language shop display content, keep carousel and service-menu editing inside the existing merchant shop page, and expose the same editor in merchant settings.

**Architecture:** A shop-scoped presentation service owns five locale rows and validates referenced media and services. The merchant workspace loads, saves, and atomically synchronizes this contract, while `StoreDetailExperience` renders controlled inline editing and a fixed language rail from both merchant entries. Public shop reads select the requested locale with real-data fallback.

**Tech Stack:** React 18, TypeScript, Vite, Express, Zod, Prisma, MySQL, Jest, Vitest.

## Global Constraints

- Work only on `codex/merchant-shop-inline-i18n-carousel` until local verification passes.
- Do not operate port 5180, remote Git, staging, or production.
- Do not introduce browser mock data, fake APIs, static prices, or client-supplied shop scope.
- Keep price, duration, currency, service ownership, RBAC, and audit server-authoritative.

---

### Task 1: Formal shop presentation contract

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Create: `backend/prisma/migrations/20260910120000_shop_presentation_locales/migration.sql`
- Create: `backend/src/validators/shop-presentation.validator.ts`
- Create: `backend/src/services/shop-presentation.service.ts`
- Create: `backend/src/repositories/shop-presentation.repository.ts`
- Create: `backend/src/controllers/shop-presentation.controller.ts`
- Create: `backend/src/routes/shop-presentation.routes.ts`
- Modify: `backend/src/app.ts`
- Modify: `backend/src/constants/permissions.constants.ts`
- Test: `backend/tests/shop-presentation-validator.test.ts`
- Test: `backend/tests/shop-presentation.service.test.ts`
- Test: `backend/tests/shop-presentation-api.test.ts`

**Interfaces:**
- Consumes: `requireMerchantShopId(actor)`, `ContentLocale`, content media storage, `AuditLogService`.
- Produces: `GET /api/v1/merchant-admin/shop/presentation`, `PUT /api/v1/merchant-admin/shop/presentation/locales/:locale`, `POST /api/v1/merchant-admin/shop/presentation/locales/:locale/sync`, `POST /api/v1/merchant-admin/shop/presentation/media`.

- [ ] Write validator and service tests that require exactly five supported locales, one-to-five carousel items, at most five real service-menu references, safe text limits, matching lock versions, merchant shop scope, same-shop media/service ownership, and audit metadata.
- [ ] Run the focused Jest tests and confirm failures are caused by missing presentation code.
- [ ] Add `ShopPresentationLocale` with `id`, `shopId`, `locale`, `content`, `lockVersion`, `updatedById`, `createdAt`, `updatedAt`, and `deletedAt`; add unique and lookup indexes and Restrict foreign keys.
- [ ] Implement repository reads/upserts and upload association using a single transaction for locale validation and update.
- [ ] Implement Zod, controller, RBAC routes, OpenAPI-visible route constants, app wiring, and audit actions `merchant_admin.shop_presentation.read`, `.locale.update`, and `.media.upload`.
- [ ] Run focused backend tests and confirm they pass.

The sync request carries all five expected lock versions. The repository validates references and versions before writing all five independent locale rows and one audit record in a single transaction.

### Task 2: Frontend contract and inline editor

**Files:**
- Create: `src/api/shopPresentation.ts`
- Create: `src/features/shop-presentation/MerchantShopPresentationWorkspace.tsx`
- Create: `src/features/shop-presentation/ShopPresentationLanguageRail.tsx`
- Modify: `src/pages/mobile/MerchantPortalPage.tsx`
- Modify: `src/pages/user/StoreDetailPage.tsx`
- Modify: `src/types/domain.ts`
- Modify: `src/i18n/translations.ts`
- Test: `src/api/shopPresentation.test.ts`
- Test: `src/features/shop-presentation/MerchantShopPresentationWorkspace.test.tsx`
- Test: `src/pages/user/StoreDetailPage.test.ts`
- Test: `src/pages/mobile/MerchantPortalPage.test.tsx`

**Interfaces:**
- Consumes: the three Task 1 merchant endpoints and `ContentLocaleCode`.
- Produces: controlled `StoreDetailExperience` edit mode, per-locale drafts, formal media uploads, inline save/cancel, and language rail.

- [ ] Write frontend tests asserting no `StoreDisplayFullscreenEditor` mount, the rail order `ja/en/ko/zh-CN/zh-TW`, isolated locale drafts, real upload before carousel reference, formal save with `expectedLockVersion`, and cancel restore.
- [ ] Run focused Vitest files and confirm the expected failures.
- [ ] Implement strict frontend payload parsing and API calls with raw image bodies.
- [ ] Implement the merchant workspace and language rail, map selected locale payload onto the shared Store model, and retain independent unsaved drafts.
- [ ] Replace fullscreen merchant editing with current-page inline controls; show inline gallery append/replace and menu content fields while edit mode is active.
- [ ] Save only the selected locale, reload its returned lock version, surface upload/save errors, and keep draft input after failures.
- [ ] Run focused frontend tests and confirm they pass.

The language rail also provides a sync action. It opens the shared `DangerConfirmDialog` with the required overwrite warning. `MerchantAdminSettingsPage` embeds the same editor, rather than owning a second presentation state or API contract.

### Task 3: Localized public projection and full verification

**Files:**
- Modify: `backend/src/validators/core-read.validator.ts`
- Modify: `backend/src/controllers/core-read.controller.ts`
- Modify: `backend/src/services/core-read.service.ts`
- Modify: `backend/src/repositories/core-read.repository.ts`
- Modify: `src/features/core-read/api.ts`
- Modify: `docs/backoffice-real-data.md`
- Test: `backend/tests/core-read-shop-presentation.test.ts`
- Test: `src/features/core-read/api.test.ts`

**Interfaces:**
- Consumes: persisted `ShopPresentationLocale` rows.
- Produces: localized public shop detail selected by `locale`, with real base-data fallback.

- [ ] Write failing backend and frontend tests for locale query mapping and fallback behavior.
- [ ] Run focused tests and confirm expected failures.
- [ ] Add locale query validation and repository projection of localized shop, carousel, and service menu content.
- [ ] Pass the active UI language to public shop detail reads and map the returned presentation without synthesizing missing localized records.
- [ ] Update Step 12 documentation with API, schema, RBAC, audit, and fallback behavior.
- [ ] Run focused tests, frontend/backend typecheck and lint, production builds, and the relevant integration suite; use only a verified non-5180 port for any browser run.
- [ ] Review the diff for unrelated changes, commit the complete batch, merge to local `main`, repeat focused tests and build on `main`, then delete only the confirmed merged development branch/worktree.
