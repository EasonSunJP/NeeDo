# Shop Service Taxonomy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give each shop a formal localized service-category and business-keyword selection, enforce default limits of five categories and five total keywords on the server, seed the approved 18-category/180-keyword catalog, and expose transactional editing from the merchant service-display page.

**Architecture:** Preserve existing `Category` IDs/codes and add authoritative translation rows. Add platform-owned business keywords, soft-deleted shop joins, a versioned taxonomy state, idempotent command records, and explicit qualification records. Public catalog reads are localized and paginated; the merchant submits the complete desired category/keyword set, and one transaction validates active catalog membership, qualification, server-resolved quotas, expected revision, dependent removals, audit, and replay.

**Tech Stack:** React 19, TypeScript 5.9, Vite 7, Vitest 4, Express 4, Zod 3, Prisma 7, MySQL 8, Jest 29, Supertest 7.

## Global Constraints

- Start after the first three approved microsteps are merged and verified; use an isolated worktree containing design commit `f33e7e99`.
- Preserve all current `Category.id`, `Category.code`, service foreign keys, compatibility fields `name`, `nameJa`, and `nameEn`, and existing category consumers.
- The authoritative new catalog has exactly 18 category codes and 180 keyword codes, each with `zh-CN`, `zh-TW`, `ja`, `en`, and `ko` translations from the approved design sections 13–14.
- Category labels are searchable but never duplicated into or returned as shop `businessKeywords`.
- Default shop limits are five selected service categories and five selected business keywords total, not five per category.
- Limits come from a server policy port. The frontend displays returned limits and never decides paid entitlement.
- A keyword may be selected only when its category is selected and both records are active/non-deleted.
- Removing a category soft-deletes its dependent shop keyword joins in the same transaction and returns their IDs.
- Non-open categories/keywords require an active platform qualification record; do not infer qualification from UI state or merchant claims.
- The merchant write is a full replacement with `expectedRevision` and idempotency. Partial patch semantics are not supported.
- No free-text keyword creation, browser-local keyword store, duplicate legacy tag editor, or new mock catalog is allowed.
- Keep merchant shop scope, RBAC, audit, Zod, OpenAPI, pagination, i18n, standard envelopes, and additive migration rules.
- Every task follows RED → verify RED → GREEN → verify GREEN → commit.

---

## File map

### Catalog and persistence

- Modify `backend/prisma/schema.prisma`: category translations, keyword catalog/translations, shop joins, taxonomy state/commands, and qualification records.
- Create `backend/prisma/migrations/20260901040000_shop_service_taxonomy/migration.sql`.
- Create `backend/tests/shop-service-taxonomy-schema.test.ts`.
- Create `backend/prisma/catalogs/shop-service-taxonomy.ts`: exact 18/180/five-locale data.
- Create `backend/tests/shop-service-taxonomy-catalog.test.ts`.
- Modify `backend/prisma/seed.ts`: idempotent upsert of categories, translations, keywords, and translations.
- Modify `backend/tests/core-read-demo-seed.test.ts` only where existing eight-category expectations need compatibility coverage.

### Backend APIs and policy

- Create `backend/src/validators/shop-taxonomy.validator.ts`.
- Create `backend/src/repositories/shop-taxonomy.repository.ts`.
- Create `backend/src/services/shop-taxonomy-quota.service.ts`.
- Create `backend/src/services/shop-taxonomy.service.ts`.
- Create `backend/src/controllers/shop-taxonomy.controller.ts`.
- Create `backend/src/routes/shop-taxonomy.routes.ts`.
- Modify `backend/src/app.ts`.
- Modify `backend/src/constants/permissions.constants.ts` and `backend/prisma/seed.ts`.
- Modify `backend/src/constants/error-codes.ts`.
- Create `backend/tests/shop-taxonomy-quota.service.test.ts`.
- Create `backend/tests/shop-taxonomy.repository.test.ts`.
- Create `backend/tests/shop-taxonomy.service.test.ts`.
- Create `backend/tests/shop-taxonomy-api.test.ts`.
- Create `backend/tests/shop-taxonomy-permissions.test.ts`.
- Modify `backend/src/api/openapi.ts`, `backend/tests/openapi.test.ts`, and `docs/api.md`.

### Merchant registration integration

- Modify `backend/src/validators/identity-application.validator.ts`: require initial merchant category/keyword selections.
- Modify `backend/src/repositories/identity-application.repository.ts`: persist normalized draft selections.
- Modify `backend/src/services/identity-application.service.ts`: validate catalog membership and registration quotas.
- Modify `backend/tests/identity-application-repository.test.ts`, `backend/tests/identity-application.service.test.ts`, and `backend/tests/identity-application-api.test.ts`.
- Modify `backend/src/repositories/merchant-application-review.repository.ts`: create shop selections/qualification records during approval.
- Modify `backend/src/services/merchant-application-review.service.ts`: expose selections to review and approval input.
- Modify `backend/tests/merchant-application-review.repository.test.ts`, `backend/tests/merchant-application-review.service.test.ts`, and `backend/tests/operations-merchant-application-api.test.ts`.
- Modify `src/features/identity-applications/api.ts`, `src/features/identity-applications/api.test.ts`, and `src/features/identity-applications/formModel.ts`.
- Modify `src/features/identity-applications/MerchantApplicationPage.tsx` and `src/features/identity-applications/ApplicationPages.test.ts`.
- Modify `src/features/identity-applications/ReviewPages.tsx` and `src/features/identity-applications/ReviewPages.test.ts`.

### Search integration

- Modify `backend/src/repositories/core-read.repository.ts`: OR branches for selected category translations and selected keyword translations; batch taxonomy projections.
- Modify `backend/tests/core-read.repository.test.ts` and `backend/tests/core-read-api.test.ts`.
- Modify `src/features/core-read/api.ts` and `src/features/core-read/api.test.ts`: taxonomy types on formal shop detail/card responses.

### Merchant service-display UI

- Create `src/features/shop-taxonomy/api.ts` and `src/features/shop-taxonomy/api.test.ts`.
- Create `src/features/shop-taxonomy/model.ts` and `src/features/shop-taxonomy/model.test.ts`.
- Create `src/features/shop-taxonomy/ShopServiceTaxonomyEditor.tsx` and `src/features/shop-taxonomy/ShopServiceTaxonomyEditor.test.tsx`.
- Modify `src/pages/user/StoreDetailPage.tsx`: merchant-only pencil edit mode and browse chips.
- Modify `src/pages/user/StoreDetailPage.test.ts`.
- Modify `src/pages/mobile/MerchantPortalPage.tsx` only if the existing service-display entry needs the current shop context forwarded.
- Modify `src/i18n/translations.ts` and its coverage test.

---

### Task 1: Add normalized localized taxonomy schema

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Create: `backend/prisma/migrations/20260901040000_shop_service_taxonomy/migration.sql`
- Create: `backend/tests/shop-service-taxonomy-schema.test.ts`

**Enums and models:**

```prisma
enum TaxonomyLocale {
  ZH_CN
  ZH_TW
  JA
  EN
  KO
}

enum BusinessQualificationPolicy {
  OPEN
  PLATFORM_REVIEW
  CONDITIONAL
  QUALIFICATION_REVIEW
}

enum ShopServiceQualificationStatus {
  APPROVED
  REVOKED
}
```

Add:

```text
CategoryTranslation(categoryId, locale, name, standard timestamps/soft delete)
BusinessKeyword(code, categoryId, qualificationPolicy, sortOrder, isActive, standard timestamps/soft delete)
BusinessKeywordTranslation(businessKeywordId, locale, label, standard timestamps/soft delete)
ShopServiceCategory(shopId, categoryId, selectedByUserId, activeKey, standard timestamps/soft delete)
ShopBusinessKeyword(shopId, businessKeywordId, selectedByUserId, activeKey, standard timestamps/soft delete)
ShopServiceTaxonomyState(shopId unique, version, standard timestamps/soft delete)
ShopServiceTaxonomyCommand(shopId, actorUserId, idempotencyKey, requestFingerprint, resultingVersion, resultJson, standard timestamps/soft delete)
ShopServiceQualification(shopId, categoryId?, businessKeywordId?, status, expiresAt?, approvedByUserId, reason, standard timestamps/soft delete)
MerchantApplicationServiceCategory(applicationId, categoryId, selectedByUserId, activeKey, standard timestamps/soft delete)
MerchantApplicationBusinessKeyword(applicationId, businessKeywordId, selectedByUserId, activeKey, standard timestamps/soft delete)
```

Also add `qualificationPolicy BusinessQualificationPolicy @default(OPEN)` to `Category` so category-level policy from the approved catalog is persisted.

- [ ] **Step 1: Write the failing schema/migration guard**

Assert standard columns, unique `(categoryId, locale)` and `(businessKeywordId, locale)`, unique keyword code, exactly-one qualification target, active shop/application join uniqueness, state version check, command `(shopId, idempotencyKey)` uniqueness, all foreign keys, and indexes used by catalog/search/shop/application reads.

- [ ] **Step 2: Verify RED**

```bash
npm --prefix backend test -- --runInBand tests/shop-service-taxonomy-schema.test.ts
```

- [ ] **Step 3: Add Prisma relations and additive migration**

Do not remove compatibility fields or rewrite existing category IDs. Use generated nullable active keys or equivalent database-enforced active uniqueness consistent with existing project migrations.

- [ ] **Step 4: Generate and verify GREEN**

```bash
npm --prefix backend run prisma:generate
npm --prefix backend test -- --runInBand tests/shop-service-taxonomy-schema.test.ts
```

- [ ] **Step 5: Commit Task 1**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations/20260901040000_shop_service_taxonomy/migration.sql backend/tests/shop-service-taxonomy-schema.test.ts
git commit -m "feat: add localized shop taxonomy schema"
```

---

### Task 2: Encode and validate the approved initial catalog

**Files:**
- Create: `backend/prisma/catalogs/shop-service-taxonomy.ts`
- Create: `backend/tests/shop-service-taxonomy-catalog.test.ts`

**Catalog types:**

```ts
export const TAXONOMY_LOCALES = ["zh-CN", "zh-TW", "ja", "en", "ko"] as const;
export type TaxonomyLocaleCode = (typeof TAXONOMY_LOCALES)[number];

export type ShopServiceCategorySeed = {
  code: string;
  labels: Record<TaxonomyLocaleCode, string>;
  qualificationPolicy: "OPEN" | "PLATFORM_REVIEW" | "CONDITIONAL" | "QUALIFICATION_REVIEW";
  sortOrder: number;
  keywords: Array<{
    code: string;
    labels: Record<TaxonomyLocaleCode, string>;
    qualificationPolicy: "OPEN" | "PLATFORM_REVIEW" | "CONDITIONAL" | "QUALIFICATION_REVIEW";
    sortOrder: number;
  }>;
};
```

The category code order is exactly:

```ts
[
  "massage", "wellness", "business", "pet", "cleaning", "dining",
  "repair", "medical_beauty", "photography", "secondhand_recycling",
  "luxury_goods", "moving_delivery", "beauty", "maternity_childcare",
  "care", "education_coaching", "legal_professional", "events_conferences"
]
```

- [ ] **Step 1: Write failing catalog invariants**

Assert 18 unique category codes; 10 unique keyword codes per category and 180 total; every record has exactly five non-empty locales; existing eight codes retain their approved values; category labels are not duplicated as keyword labels within the same locale/category; all sort orders are deterministic; regulated policy values match approved design section 13.

- [ ] **Step 2: Verify RED**

```bash
npm --prefix backend test -- --runInBand tests/shop-service-taxonomy-catalog.test.ts
```

- [ ] **Step 3: Transcribe the exact approved catalog**

Use sections 13 and 14 of `docs/superpowers/specs/2026-09-01-formal-home-search-ranking-engagement-and-taxonomy-design.md` as the authoritative stable code/label list. Add the remaining four translations for every one of the 180 keyword codes; do not machine-translate at runtime or omit a locale.

- [ ] **Step 4: Verify GREEN and commit**

```bash
npm --prefix backend test -- --runInBand tests/shop-service-taxonomy-catalog.test.ts
git add backend/prisma/catalogs/shop-service-taxonomy.ts backend/tests/shop-service-taxonomy-catalog.test.ts
git commit -m "feat: define initial shop taxonomy catalog"
```

---

### Task 3: Seed catalog idempotently while preserving category IDs

**Files:**
- Modify: `backend/prisma/seed.ts`
- Modify: `backend/tests/core-read-demo-seed.test.ts`
- Modify: `backend/tests/shop-service-taxonomy-catalog.test.ts`

- [ ] **Step 1: Write failing seed source tests**

Assert categories are upserted by code, never deleted/recreated; translations are upserted by composite key; keywords are upserted by code; compatibility `name/nameJa/nameEn` are updated from approved locales; no shop selection or qualification approval is seeded.

- [ ] **Step 2: Verify RED**

```bash
npm --prefix backend test -- --runInBand tests/shop-service-taxonomy-catalog.test.ts tests/core-read-demo-seed.test.ts
```

- [ ] **Step 3: Add deterministic upsert loops**

Wrap catalog Seed writes in the existing Seed transaction/style. Running Seed twice must retain IDs and produce exactly 18 active categories, 90 active category translations, 180 active keywords, and 900 active keyword translations for this catalog.

- [ ] **Step 4: Verify GREEN and commit**

```bash
npm --prefix backend test -- --runInBand tests/shop-service-taxonomy-catalog.test.ts tests/core-read-demo-seed.test.ts
git add backend/prisma/seed.ts backend/tests/shop-service-taxonomy-catalog.test.ts backend/tests/core-read-demo-seed.test.ts
git commit -m "feat: seed localized shop taxonomy"
```

---

### Task 4: Implement server-owned quota and qualification policies

**Files:**
- Create: `backend/src/services/shop-taxonomy-quota.service.ts`
- Create: `backend/tests/shop-taxonomy-quota.service.test.ts`
- Create: `backend/src/services/shop-taxonomy.service.ts`
- Create: `backend/tests/shop-taxonomy.service.test.ts`

**Interfaces:**

```ts
export type ShopTaxonomyQuota = {
  categoryLimit: number;
  keywordLimit: number;
  source: "default" | "option";
};

export interface ShopTaxonomyQuotaPolicyPort {
  resolve(shopId: number): Promise<ShopTaxonomyQuota>;
}

export interface ShopTaxonomyQualificationPort {
  assertSelectable(input: {
    shopId: number;
    categoryIds: number[];
    keywordIds: number[];
    at: Date;
  }): Promise<void>;
}
```

- [ ] **Step 1: Write failing policy tests**

Prove default `5/5`; injected option quota such as `8/12` works without UI changes; six categories under default fails; six total keywords under default fails even across categories; non-open selection without active matching qualification fails; expired/revoked qualification fails; active exact qualification succeeds.

- [ ] **Step 2: Verify RED**

```bash
npm --prefix backend test -- --runInBand tests/shop-taxonomy-quota.service.test.ts tests/shop-taxonomy.service.test.ts
```

- [ ] **Step 3: Implement default policy and injection seam**

The production default provider returns `5/5` with source `default`. It does not read a browser flag. Future paid Option integration replaces/injects this port.

- [ ] **Step 4: Implement qualification rule**

`OPEN` needs no record. All other policies require an active, non-deleted, non-expired `ShopServiceQualification` for the exact category/keyword. Seed no approvals and make no legal claims in UI text.

- [ ] **Step 5: Verify GREEN and commit**

```bash
npm --prefix backend test -- --runInBand tests/shop-taxonomy-quota.service.test.ts tests/shop-taxonomy.service.test.ts
git add backend/src/services/shop-taxonomy-quota.service.ts backend/src/services/shop-taxonomy.service.ts backend/tests/shop-taxonomy-quota.service.test.ts backend/tests/shop-taxonomy.service.test.ts
git commit -m "feat: enforce shop taxonomy quotas and qualification"
```

---

### Task 5: Add paginated public catalog APIs

**Files:**
- Create: `backend/src/validators/shop-taxonomy.validator.ts`
- Create: `backend/src/repositories/shop-taxonomy.repository.ts`
- Create: `backend/src/controllers/shop-taxonomy.controller.ts`
- Create: `backend/src/routes/shop-taxonomy.routes.ts`
- Modify: `backend/src/app.ts`
- Create: `backend/tests/shop-taxonomy.repository.test.ts`
- Create: `backend/tests/shop-taxonomy-api.test.ts`
- Modify: `backend/src/constants/error-codes.ts`

**Routes:**

```text
GET /api/v1/service-categories?locale=ja&page=1&pageSize=20
GET /api/v1/service-categories/:id/keywords?locale=ja&page=1&pageSize=20
```

**Payloads:**

```ts
type LocalizedServiceCategory = {
  id: number;
  code: string;
  label: string;
  qualificationPolicy: string;
};

type LocalizedBusinessKeyword = {
  id: number;
  code: string;
  categoryId: number;
  label: string;
  qualificationPolicy: string;
};
```

- [ ] **Step 1: Write failing repository/API tests**

Cover five accepted locales, `ja` default, active/non-deleted filters, stable sort, pagination envelope, inactive parent hiding keywords, no compatibility-field fallback when authoritative translation is missing, and category labels absent from keyword lists.

- [ ] **Step 2: Verify RED**

```bash
npm --prefix backend test -- --runInBand tests/shop-taxonomy.repository.test.ts tests/shop-taxonomy-api.test.ts
```

- [ ] **Step 3: Implement public reads and verify GREEN**

```bash
npm --prefix backend test -- --runInBand tests/shop-taxonomy.repository.test.ts tests/shop-taxonomy-api.test.ts
git add backend/src/validators/shop-taxonomy.validator.ts backend/src/repositories/shop-taxonomy.repository.ts backend/src/controllers/shop-taxonomy.controller.ts backend/src/routes/shop-taxonomy.routes.ts backend/src/app.ts backend/src/constants/error-codes.ts backend/tests/shop-taxonomy.repository.test.ts backend/tests/shop-taxonomy-api.test.ts
git commit -m "feat: expose localized service taxonomy catalog"
```

---

### Task 6: Add merchant scoped full-replacement read/write API

**Files:**
- Modify: `backend/src/validators/shop-taxonomy.validator.ts`
- Modify: `backend/src/repositories/shop-taxonomy.repository.ts`
- Modify: `backend/src/services/shop-taxonomy.service.ts`
- Modify: `backend/src/controllers/shop-taxonomy.controller.ts`
- Modify: `backend/src/routes/shop-taxonomy.routes.ts`
- Modify: `backend/src/constants/permissions.constants.ts`
- Modify: `backend/prisma/seed.ts`
- Modify: `backend/tests/shop-taxonomy.repository.test.ts`
- Modify: `backend/tests/shop-taxonomy.service.test.ts`
- Modify: `backend/tests/shop-taxonomy-api.test.ts`
- Create: `backend/tests/shop-taxonomy-permissions.test.ts`

**Routes:**

```text
GET /api/v1/merchant-admin/shop/service-taxonomy?locale=ja
PUT /api/v1/merchant-admin/shop/service-taxonomy
```

**Write body:**

```ts
export const shopTaxonomyReplaceBodySchema = z.object({
  categoryIds: z.array(z.number().int().positive()).max(100),
  keywordIds: z.array(z.number().int().positive()).max(100),
  expectedRevision: z.number().int().min(0),
  idempotencyKey: z.string().trim().min(16).max(160)
}).strict();
```

**Response:**

```ts
type ShopServiceTaxonomyPayload = {
  revision: number;
  categoryLimit: number;
  keywordLimit: number;
  selectedCategories: LocalizedServiceCategory[];
  selectedKeywords: LocalizedBusinessKeyword[];
  removedKeywordIds: number[];
};
```

- [ ] **Step 1: Write failing transaction/concurrency/RBAC tests**

Prove current merchant shop scope is mandatory; read/write permissions differ; duplicate IDs reject; inactive/foreign-category keyword rejects; quotas/qualification apply; category removal soft-deletes dependent keyword joins; expected revision uses compare-and-swap; same key/same fingerprint replays; same key/different payload conflicts; audit stores before/after and removed IDs.

- [ ] **Step 2: Verify RED**

```bash
npm --prefix backend test -- --runInBand tests/shop-taxonomy.repository.test.ts tests/shop-taxonomy.service.test.ts tests/shop-taxonomy-api.test.ts tests/shop-taxonomy-permissions.test.ts
```

- [ ] **Step 3: Implement one replacement transaction**

Lock/create `ShopServiceTaxonomyState`, assert version, resolve quota, validate full selection, compute additions/removals, soft-delete removed joins, restore/create selected joins, write command replay + audit, increment revision, and return authoritative localized state.

- [ ] **Step 4: Register permissions**

Use `merchant-admin:shop:service-taxonomy:read` and `merchant-admin:shop:service-taxonomy:write`; grant write only to current shop owner/admin roles consistent with existing merchant scope rules.

- [ ] **Step 5: Verify GREEN and commit**

```bash
npm --prefix backend test -- --runInBand tests/shop-taxonomy.repository.test.ts tests/shop-taxonomy.service.test.ts tests/shop-taxonomy-api.test.ts tests/shop-taxonomy-permissions.test.ts
git add backend/src/validators/shop-taxonomy.validator.ts backend/src/repositories/shop-taxonomy.repository.ts backend/src/services/shop-taxonomy.service.ts backend/src/controllers/shop-taxonomy.controller.ts backend/src/routes/shop-taxonomy.routes.ts backend/src/constants/permissions.constants.ts backend/prisma/seed.ts backend/tests/shop-taxonomy.repository.test.ts backend/tests/shop-taxonomy.service.test.ts backend/tests/shop-taxonomy-api.test.ts backend/tests/shop-taxonomy-permissions.test.ts
git commit -m "feat: manage shop service taxonomy"
```

---

### Task 7: Add taxonomy branches to formal shop search

**Files:**
- Modify: `backend/src/repositories/core-read.repository.ts`
- Modify: `backend/tests/core-read.repository.test.ts`
- Modify: `backend/tests/core-read-api.test.ts`
- Modify: `src/features/core-read/api.ts`
- Modify: `src/features/core-read/api.test.ts`

**Shop additions:**

```ts
serviceCategories: Array<{ id: number; code: string; label: string }>;
businessKeywords: Array<{ id: number; code: string; label: string; categoryId: number }>;
```

- [ ] **Step 1: Write failing OR-search and mapping tests**

One query may match shop fuzzy name, address/city/description, any selected category translation, any selected active keyword translation, or existing published service. Assert the outer published/non-deleted/public-ID filter remains mandatory. Category matches populate `serviceCategories` only; `businessKeywords` contains selected keyword records only.

- [ ] **Step 2: Verify RED**

```bash
npm --prefix backend test -- --runInBand tests/core-read.repository.test.ts tests/core-read-api.test.ts
npm test -- --run src/features/core-read/api.test.ts
```

- [ ] **Step 3: Implement batch taxonomy projection**

Load categories/keywords for all page shop IDs in bounded relation queries or includes. Do not perform one query per shop.

- [ ] **Step 4: Verify GREEN and commit**

```bash
npm --prefix backend test -- --runInBand tests/core-read.repository.test.ts tests/core-read-api.test.ts
npm test -- --run src/features/core-read/api.test.ts
git add backend/src/repositories/core-read.repository.ts backend/tests/core-read.repository.test.ts backend/tests/core-read-api.test.ts src/features/core-read/api.ts src/features/core-read/api.test.ts
git commit -m "feat: search shops by formal taxonomy"
```

---

### Task 8: Build the merchant taxonomy editor

**Files:**
- Create: `src/features/shop-taxonomy/api.ts`
- Create: `src/features/shop-taxonomy/api.test.ts`
- Create: `src/features/shop-taxonomy/model.ts`
- Create: `src/features/shop-taxonomy/model.test.ts`
- Create: `src/features/shop-taxonomy/ShopServiceTaxonomyEditor.tsx`
- Create: `src/features/shop-taxonomy/ShopServiceTaxonomyEditor.test.tsx`
- Modify: `src/pages/user/StoreDetailPage.tsx`
- Modify: `src/pages/user/StoreDetailPage.test.ts`
- Modify: `src/pages/mobile/MerchantPortalPage.tsx` if required for shop context
- Modify: `src/i18n/translations.ts`

- [ ] **Step 1: Write failing model/adapter tests**

Prove selected category/keyword usage, keyword groups limited to selected categories, deselect preview computes dependent removals, local UI disables over-limit selection but server errors remain authoritative, full replacement sends revision/key, `409` preserves draft and reloads current state.

- [ ] **Step 2: Write failing render tests**

In merchant service-display scope, pencil opens edit mode; browse mode shows business keywords only; edit mode shows category quota, total keyword quota, grouped keywords, removal preview, cancel, and confirm; user/public scope has no editor; category labels are not mixed into the keyword chip box.

- [ ] **Step 3: Verify RED**

```bash
npm test -- --run src/features/shop-taxonomy/api.test.ts src/features/shop-taxonomy/model.test.ts src/features/shop-taxonomy/ShopServiceTaxonomyEditor.test.tsx src/pages/user/StoreDetailPage.test.ts
```

- [ ] **Step 4: Implement formal API/model and editor**

Generate one idempotency key per save intent. On success, replace browse state from the authoritative response. On error, do not fall back to `store.tags` or a hard-coded category array.

- [ ] **Step 5: Integrate with existing service-display edit control**

Reuse the existing merchant pencil/edit-mode pattern in `StoreDetailExperience`. Do not create a parallel settings page or leave the legacy free-text tag editor active for this business-keyword field.

- [ ] **Step 6: Verify five-language copy, GREEN, and commit**

```bash
npm test -- --run src/features/shop-taxonomy/api.test.ts src/features/shop-taxonomy/model.test.ts src/features/shop-taxonomy/ShopServiceTaxonomyEditor.test.tsx src/pages/user/StoreDetailPage.test.ts src/i18n/translations.test.ts
git add src/features/shop-taxonomy/api.ts src/features/shop-taxonomy/api.test.ts src/features/shop-taxonomy/model.ts src/features/shop-taxonomy/model.test.ts src/features/shop-taxonomy/ShopServiceTaxonomyEditor.tsx src/features/shop-taxonomy/ShopServiceTaxonomyEditor.test.tsx src/pages/user/StoreDetailPage.tsx src/pages/user/StoreDetailPage.test.ts src/pages/mobile/MerchantPortalPage.tsx src/i18n/translations.ts
git commit -m "feat: edit shop taxonomy from service display"
```

---

### Task 9: Require service taxonomy during merchant registration

**Files:**
- Modify: `backend/src/validators/identity-application.validator.ts`
- Modify: `backend/src/repositories/identity-application.repository.ts`
- Modify: `backend/src/services/identity-application.service.ts`
- Modify: `backend/tests/identity-application-repository.test.ts`
- Modify: `backend/tests/identity-application.service.test.ts`
- Modify: `backend/tests/identity-application-api.test.ts`
- Modify: `backend/src/repositories/merchant-application-review.repository.ts`
- Modify: `backend/src/services/merchant-application-review.service.ts`
- Modify: `backend/tests/merchant-application-review.repository.test.ts`
- Modify: `backend/tests/merchant-application-review.service.test.ts`
- Modify: `backend/tests/operations-merchant-application-api.test.ts`
- Modify: `src/features/identity-applications/api.ts`
- Modify: `src/features/identity-applications/api.test.ts`
- Modify: `src/features/identity-applications/formModel.ts`
- Modify: `src/features/identity-applications/MerchantApplicationPage.tsx`
- Modify: `src/features/identity-applications/ApplicationPages.test.ts`
- Modify: `src/features/identity-applications/ReviewPages.tsx`
- Modify: `src/features/identity-applications/ReviewPages.test.ts`

**Merchant application additions:**

```ts
type MerchantApplicationTaxonomyInput = {
  serviceCategoryIds: number[];
  businessKeywordIds: number[];
};
```

- [ ] **Step 1: Write failing application validation/persistence tests**

Require at least one and at most five active categories before merchant application submission. Allow zero to five total keywords, but every keyword must belong to a selected category. Draft create/update stores normalized application joins transactionally, restores prior soft-deleted choices, removes deselected choices, and never creates shop joins before approval.

- [ ] **Step 2: Write failing review/approval tests**

The operations review detail lists localized selected categories/keywords. Approval creates the shop, initial `ShopServiceCategory`/`ShopBusinessKeyword` rows, and `ShopServiceTaxonomyState(version = 1)` in the existing approval transaction. For selected non-open records, the approval transaction also creates exact `ShopServiceQualification(APPROVED)` records tied to the reviewing operator and merchant application; rejected applications create none.

- [ ] **Step 3: Verify backend RED**

```bash
npm --prefix backend test -- --runInBand tests/identity-application-repository.test.ts tests/identity-application.service.test.ts tests/identity-application-api.test.ts tests/merchant-application-review.repository.test.ts tests/merchant-application-review.service.test.ts tests/operations-merchant-application-api.test.ts
```

- [ ] **Step 4: Implement backend draft and approval integration**

Reuse catalog validation and the default `5/5` registration quota policy. Registration has no shop yet, so it does not pretend an existing shop qualification: non-open choices remain pending platform review until an authorized operator approves the entire merchant application. The approval audit records selected codes and every qualification created.

- [ ] **Step 5: Write failing merchant application UI tests**

The application flow loads the public localized catalog, requires service category selection before later service keywords, shows keyword groups only under selected categories, enforces displayed `5/5` limits, previews/removes dependent keywords when a category is deselected, persists draft/reload, and sends no free-text business keywords.

- [ ] **Step 6: Verify frontend RED**

```bash
npm test -- --run src/features/identity-applications/api.test.ts src/features/identity-applications/ApplicationPages.test.ts src/features/identity-applications/ReviewPages.test.ts
```

- [ ] **Step 7: Implement application and review UI**

Reuse `src/features/shop-taxonomy/model.ts` selection rules and public catalog adapter. Do not require an active merchant/shop identity during application. Operations review must display policy labels and selected taxonomy before approve/reject controls.

- [ ] **Step 8: Verify GREEN and commit**

```bash
npm --prefix backend test -- --runInBand tests/identity-application-repository.test.ts tests/identity-application.service.test.ts tests/identity-application-api.test.ts tests/merchant-application-review.repository.test.ts tests/merchant-application-review.service.test.ts tests/operations-merchant-application-api.test.ts
npm test -- --run src/features/identity-applications/api.test.ts src/features/identity-applications/ApplicationPages.test.ts src/features/identity-applications/ReviewPages.test.ts
git add backend/src/validators/identity-application.validator.ts backend/src/repositories/identity-application.repository.ts backend/src/services/identity-application.service.ts backend/tests/identity-application-repository.test.ts backend/tests/identity-application.service.test.ts backend/tests/identity-application-api.test.ts backend/src/repositories/merchant-application-review.repository.ts backend/src/services/merchant-application-review.service.ts backend/tests/merchant-application-review.repository.test.ts backend/tests/merchant-application-review.service.test.ts backend/tests/operations-merchant-application-api.test.ts src/features/identity-applications/api.ts src/features/identity-applications/api.test.ts src/features/identity-applications/formModel.ts src/features/identity-applications/MerchantApplicationPage.tsx src/features/identity-applications/ApplicationPages.test.ts src/features/identity-applications/ReviewPages.tsx src/features/identity-applications/ReviewPages.test.ts
git commit -m "feat: select shop taxonomy during registration"
```

---

### Task 10: Document and verify the complete taxonomy slice

**Files:**
- Modify: `backend/src/api/openapi.ts`
- Modify: `backend/tests/openapi.test.ts`
- Modify: `docs/api.md`

- [ ] **Step 1: Add failing OpenAPI guards, implement, and verify**

Guard five locales, pagination, merchant permissions, full-replacement body, version/idempotency conflicts, quota fields, removed keyword IDs, qualification errors, and separate category/keyword response arrays.

```bash
npm --prefix backend test -- --runInBand tests/openapi.test.ts
```

- [ ] **Step 2: Run backend gates**

```bash
npm --prefix backend run prisma:generate
npm --prefix backend test -- --runInBand tests/shop-service-taxonomy-schema.test.ts tests/shop-service-taxonomy-catalog.test.ts tests/shop-taxonomy-quota.service.test.ts tests/shop-taxonomy.repository.test.ts tests/shop-taxonomy.service.test.ts tests/shop-taxonomy-api.test.ts tests/shop-taxonomy-permissions.test.ts tests/core-read.repository.test.ts tests/core-read-api.test.ts tests/identity-application-repository.test.ts tests/identity-application.service.test.ts tests/identity-application-api.test.ts tests/merchant-application-review.repository.test.ts tests/merchant-application-review.service.test.ts tests/operations-merchant-application-api.test.ts tests/openapi.test.ts
npm --prefix backend run lint
npm --prefix backend run build
```

- [ ] **Step 3: Verify physical MySQL schema and idempotent Seed**

On a disposable database, apply migration, run Seed twice, inspect physical constraints/indexes, and assert IDs remain stable with exact active counts `18/90/180/900`. Do not seed shop selections or qualifications.

- [ ] **Step 4: Run frontend gates**

```bash
npm test -- --run src/features/core-read/api.test.ts src/features/shop-taxonomy/api.test.ts src/features/shop-taxonomy/model.test.ts src/features/shop-taxonomy/ShopServiceTaxonomyEditor.test.tsx src/pages/user/StoreDetailPage.test.ts src/features/identity-applications/api.test.ts src/features/identity-applications/ApplicationPages.test.ts src/features/identity-applications/ReviewPages.test.ts src/i18n/translations.test.ts
npm run lint
npm run verify:production-build
```

- [ ] **Step 5: Perform authenticated browser acceptance**

Verify listeners/cwd/branch/proxy/origin first. In a new merchant application, select the service category before its keywords, save/reload the draft, confirm operations review shows the selection, and verify approval creates the same initial shop taxonomy. Then, in merchant service display, select multiple categories and up to five total keywords, preview dependent removal, save/reload persistence, confirm category-name search returns the shop while browse chips contain only business keywords, and verify a larger injected server quota works without frontend change. Check 390x844 and 440x956 for overflow, keyboard access, bottom navigation, console, and request errors.

- [ ] **Step 6: Commit documentation and stop**

```bash
git add backend/src/api/openapi.ts backend/tests/openapi.test.ts docs/api.md
git commit -m "docs: define formal shop taxonomy contracts"
```

Do not start final search-card styling in this branch. Local completion is not push, deployment, or production acceptance.
