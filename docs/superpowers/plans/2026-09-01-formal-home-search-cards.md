# Formal Home Search Cards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace compact homepage search identity rows with formal two-column technician photo cards and single-column horizontal shop cards backed entirely by enriched formal search DTOs and persisted interaction/ranking data.

**Architecture:** Keep `GET /api/v1/search` and its entity discriminator. Add dedicated enriched search-card payloads while retaining compact home/detail types for existing callers. The repository batch-loads performance, primary service, engagement counts, taxonomy, media, and ranking projections for each page. `CategoryPage` owns independent shop/technician/service states, batches favorite status once per visible result set, and composes presentational cards whose nested actions do not trigger card navigation.

**Tech Stack:** React 19, TypeScript 5.9, Vite 7, Vitest 4, Tailwind CSS 4, Express 4, Zod 3, Prisma 7, MySQL 8, Jest 29, Supertest 7.

## Global Constraints

- Start only after microsteps 1–4 are merged, migrated, and verified; use an isolated worktree containing approved design commit `f33e7e99`.
- This plan consumes order performance, entity engagement, nearby ranking, technician service, and shop taxonomy contracts. Do not reimplement those rules in page code.
- Technician names remain fuzzy substring search; all selected category/keyword/tag branches retain match-any OR semantics.
- Do not reuse `TechnicianShowcaseCard` or `SocialProfileMiniCard`; both have legacy/generated derivations unsuitable for formal search.
- Do not convert formal search DTOs through legacy domain mappers that insert generated images, availability, booking rates, prices, ages, or tags.
- A missing image renders a themed initial/neutral surface. A missing primary service renders an explicit empty state with no price.
- Never display availability because the formal payload does not contain it.
- Medal/rank data is rendered only when returned by the backend. No page-index or array-index ranking is allowed.
- Favorite count is persisted entity favorites; share count is persisted successful entity shares; review count remains separate.
- Search pages batch favorite status for visible public IDs. Per-card status requests are forbidden.
- Nested favorite/share controls stop propagation and never navigate to entity detail.
- Keep independent loading, error, retry, pagination, empty, and no-location states by entity section.
- All new user-visible copy is present in `zh-CN`, `zh-TW`, `ja`, `en`, and `ko`.
- Verify 390x844 and 440x956, long text, no horizontal overflow, bottom navigation clearance, keyboard access, console, and formal network data.
- Keep the current formal API, no-new-mock rule, bundle budget, and unrelated dirty files untouched.
- Every task follows RED → verify RED → GREEN → verify GREEN → commit.

---

## File map

### Backend enriched projections

- Modify `backend/src/repositories/core-read.repository.ts`: dedicated enriched shop/technician search payloads and batched reads.
- Modify `backend/src/services/core-read.service.ts`: retain entity dispatch and typed responses.
- Modify `backend/tests/core-read.repository.test.ts`: source filters, OR branches, aggregate batching, ordering, and no-invented-data assertions.
- Modify `backend/tests/core-read-api.test.ts`: response shape, coordinate pair/ranking, pagination, and compatibility.
- Modify `backend/src/api/openapi.ts`, `backend/tests/openapi.test.ts`, and `docs/api.md`.

### Frontend contracts and shared interactions

- Modify `src/features/core-read/api.ts`: add `CoreShopSearchCard` and `CoreTechnicianSearchCard` types; keep compact types for existing calls.
- Modify `src/features/core-read/api.test.ts`.
- Modify `src/features/entity-engagement/api.ts` and `src/features/entity-engagement/api.test.ts`: visible-target status batching and action results.
- Create `src/shared/profile-card/EntitySearchCardActions.tsx` and `src/shared/profile-card/EntitySearchCardActions.test.tsx`.
- Reuse `src/shared/engagement/formatCompactCount.ts` from microstep 2.

### Formal cards and search page

- Create `src/shared/profile-card/FormalTechnicianSearchCard.tsx`.
- Create `src/shared/profile-card/FormalTechnicianSearchCard.test.tsx`.
- Create `src/shared/profile-card/FormalShopSearchCard.tsx`.
- Create `src/shared/profile-card/FormalShopSearchCard.test.tsx`.
- Modify `src/shared/profile-card/index.ts`.
- Modify `src/pages/user/CategoryPage.tsx`: replace `DirectSearchProfileCard`, compose actions, and retain independent sections.
- Modify `src/pages/user/CategoryPage.test.ts`.
- Modify `src/pages/user/CategoryPage.render.test.ts`.
- Modify `src/i18n/translations.ts` and its coverage test.

---

### Task 1: Define enriched backend search-card contracts

**Files:**
- Modify: `backend/src/repositories/core-read.repository.ts`
- Modify: `backend/src/services/core-read.service.ts`
- Modify: `backend/tests/core-read.repository.test.ts`
- Modify: `backend/tests/core-read-api.test.ts`

**Technician payload:**

```ts
export type TechnicianSearchCardPayload = TechnicianCardPayload & {
  age: number | null;
  serviceArea: string | null;
  completedOrderCount: number;
  acceptanceRateBps: number;
  favoriteCount: number;
  shareCount: number;
  distanceKm?: number;
  nearbyRank?: 1 | 2 | 3;
  resolvedRadiusKm?: number;
  primaryService: {
    id: number;
    name: string;
    priceAmount: number;
    currency: string;
    durationMinutes: number;
    taxIncluded: true;
  } | null;
};
```

**Shop payload:**

```ts
export type ShopSearchCardPayload = ShopCardPayload & {
  favoriteCount: number;
  shareCount: number;
  serviceCategories: Array<{ id: number; code: string; label: string }>;
  businessKeywords: Array<{ id: number; code: string; label: string; categoryId: number }>;
};
```

- [ ] **Step 1: Write failing repository mapping tests**

Technician tests cover stored age, public service area, performance summary with zero-summary fallback `0 completed/10000 bps`, exact favorite/share aggregates, first eligible ordered service, integer tax-inclusive JPY, optional rank fields, and null primary service. Shop tests cover exact counts, real media or null, selected localized categories, selected keywords only, and maximum deterministic keyword ordering.

- [ ] **Step 2: Write failing query-efficiency tests**

For a page of multiple results, assert summaries/services/engagement/taxonomy are loaded by bounded includes or page-ID batch queries, not one repository call per card. Preserve published/non-deleted/S-identifier outer filters and ranked pagination from microstep 2.

- [ ] **Step 3: Verify RED**

```bash
npm --prefix backend test -- --runInBand tests/core-read.repository.test.ts tests/core-read-api.test.ts
```

- [ ] **Step 4: Implement dedicated enriched search mapping**

Keep `getHome`, shop detail, and technician detail compact payloads compatible. Only `searchShops` and `searchTechnicians` return enriched search-card payloads.

- [ ] **Step 5: Lock fuzzy-name and any-label regressions**

Add tests showing a partial name substring matches; one selected category/keyword/tag branch is enough; unmatched branches do not turn the query into AND; category labels can match shops but never appear in `businessKeywords`.

- [ ] **Step 6: Verify GREEN and commit**

```bash
npm --prefix backend test -- --runInBand tests/core-read.repository.test.ts tests/core-read-api.test.ts
git add backend/src/repositories/core-read.repository.ts backend/src/services/core-read.service.ts backend/tests/core-read.repository.test.ts backend/tests/core-read-api.test.ts
git commit -m "feat: enrich formal search card payloads"
```

---

### Task 2: Type and document enriched frontend/API contracts

**Files:**
- Modify: `src/features/core-read/api.ts`
- Modify: `src/features/core-read/api.test.ts`
- Modify: `backend/src/api/openapi.ts`
- Modify: `backend/tests/openapi.test.ts`
- Modify: `docs/api.md`

**Frontend types:**

```ts
export type CoreTechnicianSearchCard = CoreTechnicianCard & {
  age: number | null;
  serviceArea: string | null;
  completedOrderCount: number;
  acceptanceRateBps: number;
  favoriteCount: number;
  shareCount: number;
  distanceKm?: number;
  nearbyRank?: 1 | 2 | 3;
  resolvedRadiusKm?: number;
  primaryService: CorePrimaryTechnicianService | null;
};

export type CoreShopSearchCard = CoreShopCard & {
  favoriteCount: number;
  shareCount: number;
  serviceCategories: CoreLocalizedCategory[];
  businessKeywords: CoreLocalizedBusinessKeyword[];
};
```

- [ ] **Step 1: Write failing adapter/OpenAPI tests**

Assert `searchTechnicians` and `searchShops` return enriched types while home/detail callers retain compact types. Guard all required/optional fields, rank enum, basis-point range, non-negative counts, nullable service, `taxIncluded: true`, and separate category/keyword arrays.

- [ ] **Step 2: Verify RED**

```bash
npm test -- --run src/features/core-read/api.test.ts
npm --prefix backend test -- --runInBand tests/openapi.test.ts
```

- [ ] **Step 3: Implement and document contracts**

Do not map search results through `mapCoreShopToStore` or `mapCoreTechnicianToTechnician`; those legacy adapters add fallback media and are not the card source.

- [ ] **Step 4: Verify GREEN and commit**

```bash
npm test -- --run src/features/core-read/api.test.ts
npm --prefix backend test -- --runInBand tests/openapi.test.ts
git add src/features/core-read/api.ts src/features/core-read/api.test.ts backend/src/api/openapi.ts backend/tests/openapi.test.ts docs/api.md
git commit -m "docs: type enriched home search results"
```

---

### Task 3: Build shared favorite/share card controls

**Files:**
- Modify: `src/features/entity-engagement/api.ts`
- Modify: `src/features/entity-engagement/api.test.ts`
- Create: `src/shared/profile-card/EntitySearchCardActions.tsx`
- Create: `src/shared/profile-card/EntitySearchCardActions.test.tsx`

**Props:**

```ts
export type EntitySearchCardActionsProps = {
  targetType: "shop" | "technician";
  publicId: string;
  favoriteCount: number;
  shareCount: number;
  isFavorited: boolean;
  onFavoriteChange: (state: EntityFavoriteState) => void;
  onNeedoShare: () => void;
  onSystemShare: () => Promise<void>;
};
```

- [ ] **Step 1: Write failing interaction tests**

Assert accessible names include target action; exact compact counts; optimistic favorite toggles and authoritative rollback; rapid double-click is serialized; button clicks call `preventDefault` and `stopPropagation`; system success records once; system cancel/failure records zero; NeeDo share opens the formal recipient/conversation flow and does not increment until API success.

- [ ] **Step 2: Verify RED**

```bash
npm test -- --run src/features/entity-engagement/api.test.ts src/shared/profile-card/EntitySearchCardActions.test.tsx
```

- [ ] **Step 3: Implement the shared controls**

Render separate outlined favorite and share icon buttons with counts. Disable only the active operation. Keep counts from server mutation/share results and never substitute review count.

- [ ] **Step 4: Verify GREEN and commit**

```bash
npm test -- --run src/features/entity-engagement/api.test.ts src/shared/profile-card/EntitySearchCardActions.test.tsx
git add src/features/entity-engagement/api.ts src/features/entity-engagement/api.test.ts src/shared/profile-card/EntitySearchCardActions.tsx src/shared/profile-card/EntitySearchCardActions.test.tsx
git commit -m "feat: add formal entity card actions"
```

---

### Task 4: Build the formal two-column technician card

**Files:**
- Create: `src/shared/profile-card/FormalTechnicianSearchCard.tsx`
- Create: `src/shared/profile-card/FormalTechnicianSearchCard.test.tsx`
- Modify: `src/shared/profile-card/index.ts`

**Props:**

```ts
export type FormalTechnicianSearchCardProps = {
  technician: CoreTechnicianSearchCard;
  isFavorited: boolean;
  onFavoriteChange: (state: EntityFavoriteState) => void;
  onNeedoShare: () => void;
  onSystemShare: () => Promise<void>;
  onOpen: () => void;
};
```

- [ ] **Step 1: Write failing complete-data render test**

Assert rating pill at top left; favorite/share top right; gold/silver/bronze badge only for ranks 1/2/3 with accessible rank text; name, age and area, review count, calculated acceptance percent, optional distance; bottom primary-service panel with label, name, tax-inclusive JPY, and duration.

- [ ] **Step 2: Write failing missing/edge-data tests**

Cover null avatar (initial surface), null age, null service area, null primary service (translated no-service and no price), no location (no rank/distance/radius), zero counts, long name/service clamps, and nested action isolation.

- [ ] **Step 3: Verify RED**

```bash
npm test -- --run src/shared/profile-card/FormalTechnicianSearchCard.test.tsx
```

- [ ] **Step 4: Implement approved visual structure**

Use a photo-dominant aspect ratio suited to two columns, dark readable gradient over the lower image, minimum 44px action targets, and a distinct bottom service panel. Format acceptance as `acceptanceRateBps / 100` with at most two meaningful decimal digits; `10000` is `100%`.

- [ ] **Step 5: Verify GREEN and commit**

```bash
npm test -- --run src/shared/profile-card/FormalTechnicianSearchCard.test.tsx
git add src/shared/profile-card/FormalTechnicianSearchCard.tsx src/shared/profile-card/FormalTechnicianSearchCard.test.tsx src/shared/profile-card/index.ts
git commit -m "feat: add formal technician search card"
```

---

### Task 5: Build the formal horizontal shop card

**Files:**
- Create: `src/shared/profile-card/FormalShopSearchCard.tsx`
- Create: `src/shared/profile-card/FormalShopSearchCard.test.tsx`
- Modify: `src/shared/profile-card/index.ts`

**Props:**

```ts
export type FormalShopSearchCardProps = {
  shop: CoreShopSearchCard;
  isFavorited: boolean;
  onFavoriteChange: (state: EntityFavoriteState) => void;
  onNeedoShare: () => void;
  onSystemShare: () => Promise<void>;
  onOpen: () => void;
};
```

- [ ] **Step 1: Write failing complete-data render test**

Assert a single-column card, rating top left, favorite/share top right, real cover on the left, name plus translated shop badge on the right, address, and at most five `businessKeywords` chips in server order.

- [ ] **Step 2: Write failing missing/edge-data tests**

Cover null cover (themed initial only), zero counts, no keywords, long name/address clamps, more than five keyword records, category labels absent from chip rendering, and nested action isolation.

- [ ] **Step 3: Verify RED**

```bash
npm test -- --run src/shared/profile-card/FormalShopSearchCard.test.tsx
```

- [ ] **Step 4: Implement approved horizontal structure**

Use one card per row at mobile widths. Do not use a generated shop photo or show categories as chips. Preserve enough right-side space so controls do not cover the name.

- [ ] **Step 5: Verify GREEN and commit**

```bash
npm test -- --run src/shared/profile-card/FormalShopSearchCard.test.tsx
git add src/shared/profile-card/FormalShopSearchCard.tsx src/shared/profile-card/FormalShopSearchCard.test.tsx src/shared/profile-card/index.ts
git commit -m "feat: add formal shop search card"
```

---

### Task 6: Replace compact search rows and batch favorite status

**Files:**
- Modify: `src/pages/user/CategoryPage.tsx`
- Modify: `src/pages/user/CategoryPage.test.ts`
- Modify: `src/pages/user/CategoryPage.render.test.ts`

- [ ] **Step 1: Write failing source/render tests**

Assert `DirectSearchProfileCard` is removed; technician section uses a two-column grid; shop section uses one-column cards; one status batch request includes all visible shop/technician public IDs; all mode keeps independent results; entity mode calls only its type; navigation uses existing formal detail routes.

- [ ] **Step 2: Lock section-state behavior**

Write tests for independent skeletons matching card shapes, independent error/retry, empty results, no-location guidance distinct from no-match, server pagination after ranked results, partial all-mode failure preserving successful sections, and bottom navigation clearance.

- [ ] **Step 3: Verify RED**

```bash
npm test -- --run src/pages/user/CategoryPage.test.ts src/pages/user/CategoryPage.render.test.ts
```

- [ ] **Step 4: Add a page-level favorite-state map**

Key by `${targetType}:${publicId}`. Load statuses once after visible target IDs change, ignore stale requests, merge mutation responses, and clear only targets no longer visible. Do not trigger calls from each card.

- [ ] **Step 5: Compose formal cards and share flows**

The card body opens detail. Favorite stops navigation. Share opens the existing formal share chooser/capability path and records through entity engagement only after success.

- [ ] **Step 6: Verify GREEN and commit**

```bash
npm test -- --run src/pages/user/CategoryPage.test.ts src/pages/user/CategoryPage.render.test.ts
git add src/pages/user/CategoryPage.tsx src/pages/user/CategoryPage.test.ts src/pages/user/CategoryPage.render.test.ts
git commit -m "feat: render formal shop and technician search cards"
```

---

### Task 7: Complete five-language and accessibility coverage

**Files:**
- Modify: `src/i18n/translations.ts`
- Modify: `src/i18n/translations.test.ts`
- Modify: card/page tests from Tasks 3–6 where accessible assertions belong.

**Required concepts:**

```text
technician rank 1/2/3
favorite / remove favorite / share
primary service / no public service
tax included / minutes
acceptance rate / reviews / completed orders
shop
choose service location / no location ranking
shop results / technician results / service results
loading / retry / no matching results
```

- [ ] **Step 1: Write failing translation/accessibility tests**

Assert every concept exists in five locales, medals expose rank text, icon buttons have target-specific labels, cards are keyboard activatable, skeletons are hidden from assistive text, and loading/error status uses appropriate live regions.

- [ ] **Step 2: Verify RED**

```bash
npm test -- --run src/i18n/translations.test.ts src/shared/profile-card/EntitySearchCardActions.test.tsx src/shared/profile-card/FormalTechnicianSearchCard.test.tsx src/shared/profile-card/FormalShopSearchCard.test.tsx src/pages/user/CategoryPage.render.test.ts
```

- [ ] **Step 3: Add translations and semantic fixes, then verify GREEN**

```bash
npm test -- --run src/i18n/translations.test.ts src/shared/profile-card/EntitySearchCardActions.test.tsx src/shared/profile-card/FormalTechnicianSearchCard.test.tsx src/shared/profile-card/FormalShopSearchCard.test.tsx src/pages/user/CategoryPage.render.test.ts
git add src/i18n/translations.ts src/i18n/translations.test.ts src/shared/profile-card/EntitySearchCardActions.test.tsx src/shared/profile-card/FormalTechnicianSearchCard.test.tsx src/shared/profile-card/FormalShopSearchCard.test.tsx src/pages/user/CategoryPage.render.test.ts
git commit -m "feat: localize formal search card states"
```

---

### Task 8: Run the final formal search gate

- [ ] **Step 1: Run backend focused/full gates**

```bash
npm --prefix backend test -- --runInBand tests/core-read.repository.test.ts tests/core-read-api.test.ts tests/openapi.test.ts tests/entity-engagement-api.test.ts tests/nearby-technician-ranking.service.test.ts tests/pricing-mode-api.test.ts tests/shop-taxonomy-api.test.ts
npm --prefix backend run lint
npm --prefix backend run build
```

- [ ] **Step 2: Run frontend focused/full gates**

```bash
npm test -- --run src/features/core-read/api.test.ts src/features/entity-engagement/api.test.ts src/shared/profile-card/EntitySearchCardActions.test.tsx src/shared/profile-card/FormalTechnicianSearchCard.test.tsx src/shared/profile-card/FormalShopSearchCard.test.tsx src/pages/user/CategoryPage.test.ts src/pages/user/CategoryPage.render.test.ts src/i18n/translations.test.ts
npm run lint
npm run verify:production-build
```

- [ ] **Step 3: Prove the formal runtime before visual conclusions**

Record the frontend/backend listener PIDs, each PID's cwd, current branch/HEAD, frontend proxy destination, backend origin/CORS allowlist, authenticated identity, and database target. Stop if the standard ports belong to another worktree.

- [ ] **Step 4: Perform 390x844 visual acceptance**

Search a partial technician name and a partial shop name; select multiple labels where only one matches; verify technicians are two-column photo cards and shops are one-column horizontal cards; inspect rank/distance/age/performance/service/counts/tax data against API responses; test missing images/services; click favorite/share without navigation; check long Japanese/Chinese/English strings, bottom navigation, horizontal overflow, console, and failed requests.

- [ ] **Step 5: Perform 440x956 visual acceptance**

Repeat all-mode and entity-specific modes, loading/error/retry/empty/no-location states, pagination, gold/silver/bronze ordering, favorite rollback on forced API failure, and share retry idempotency. Capture before/after screenshots for both viewport sizes.

- [ ] **Step 6: Inspect privacy and no-invention boundaries**

Network responses must not contain technician base coordinates or contact-only budget/payment/full-service data. UI must not claim availability, booking rate, generated photos, category chips in the keyword box, or medals when rank metadata is absent.

- [ ] **Step 7: Commit acceptance-only fixes and report the boundary**

This completes the fifth local microstep only after all gates and browser checks pass. It does not authorize push, deployment, Seed against production, production data mutation, or live acceptance.
