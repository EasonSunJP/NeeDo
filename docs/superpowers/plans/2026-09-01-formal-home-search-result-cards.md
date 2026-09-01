# Formal Home Search Result Cards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render formal technician and shop search results in the user-approved entity-specific card layouts using only persisted public API data.

**Architecture:** Extend the existing additive `ShopCardPayload` and `TechnicianCardPayload` contracts in `CoreReadRepository`; keep nearby ranking in `CoreReadService` unchanged. Add focused React cards under `features/core-read` and let `CategoryPage` compose them without legacy domain mappers.

**Tech Stack:** React 19, TypeScript, Tailwind CSS, Vite/Vitest, Express, Prisma 7, MySQL 8, Jest/OpenAPI.

## Global Constraints

- Selected labels keep OR search semantics and entity names keep fuzzy `contains` matching.
- The first active, bookable, approved technician service by `sortOrder`, then `id`, is the primary business.
- Acceptance rate comes from `TechnicianPerformanceSummary`; no-result technicians default to 100 percent.
- Favorite count is the number of active `EntityFavorite` rows; share count is the number of non-deleted `EntityShareEvent` rows.
- Category names stay searchable but never appear in the shop business-keyword chip row.
- Missing optional public data is hidden; no mock, placeholder metric, or inferred capability is introduced.
- Existing i18n, dark NeeDo tokens, formal detail routes, loading/error/empty states, and production bundle budgets remain intact.

---

### Task 1: Formal public search-card data

**Files:**
- Modify: `backend/src/repositories/core-read.repository.ts`
- Test: `backend/tests/core-read.repository.test.ts`

**Interfaces:**
- Produces: `PrimaryTechnicianServicePayload` and additive `favoriteCount`, `shareCount`, `age`, `completedOrderCount`, `acceptanceRatePercent`, `primaryService` fields.
- Consumes: Prisma `EntityFavorite`, `EntityShareEvent`, `TechnicianPerformanceSummary`, and `TechnicianService` relations.

- [ ] **Step 1: Write the failing repository expectations**

```ts
expect(result.list[0]).toMatchObject({
  favoriteCount: 154,
  shareCount: 8,
  age: 25,
  completedOrderCount: 1280,
  acceptanceRatePercent: 98,
  primaryService: { name: "肩颈调理", priceAmount: "8800.00", durationMinutes: 60 }
});
```

Also assert the Prisma include filters favorites/shares by `deletedAt: null`, filters primary services by `deletedAt: null`, `isActive: true`, `isBookable: true`, `reviewStatus: "APPROVED"`, orders by `sortOrder` then `id`, and takes one record.

- [ ] **Step 2: Run the repository test and confirm failure**

Run: `cd backend && npm test -- --runInBand tests/core-read.repository.test.ts`

Expected: FAIL because card payloads do not contain the new formal fields.

- [ ] **Step 3: Implement the additive repository contract**

```ts
export interface PrimaryTechnicianServicePayload {
  id: number;
  name: string;
  priceAmount: string;
  currency: string;
  durationMinutes: number;
}

export interface TechnicianCardPayload {
  // existing fields
  age: number | null;
  favoriteCount: number;
  shareCount: number;
  completedOrderCount: number;
  acceptanceRatePercent: number;
  primaryService: PrimaryTechnicianServicePayload | null;
}
```

Use filtered relation `_count` values, map `acceptanceRateBps / 100`, default a missing active performance summary to 100 percent and zero completed orders, and map only the first filtered technician service. Add `favoriteCount` and `shareCount` to `ShopCardPayload` through the same filtered-count approach.

- [ ] **Step 4: Run the repository and nearby-ranking tests**

Run: `cd backend && npm test -- --runInBand tests/core-read.repository.test.ts tests/core-read.service.test.ts tests/nearby-technician-ranking.service.test.ts`

Expected: all suites PASS; distance expansion and tie-break ordering are unchanged.

- [ ] **Step 5: Commit**

```bash
git add backend/src/repositories/core-read.repository.ts backend/tests/core-read.repository.test.ts
git commit -m "feat: expose formal search card data"
```

### Task 2: Public contract and client types

**Files:**
- Modify: `backend/src/api/openapi.ts`
- Modify: `backend/tests/openapi.test.ts`
- Modify: `src/features/core-read/api.ts`
- Modify: `src/features/core-read/api.test.ts`

**Interfaces:**
- Consumes: Task 1 payload names and nullability.
- Produces: matching browser-side `CoreShopCard`, `CoreTechnicianCard`, and `CorePrimaryTechnicianService` types.

- [ ] **Step 1: Add failing OpenAPI and client contract assertions**

```ts
expect(technicianCard.required).toEqual(expect.arrayContaining([
  "age", "favoriteCount", "shareCount", "completedOrderCount",
  "acceptanceRatePercent", "primaryService"
]));
expect(shopCard.required).toEqual(expect.arrayContaining([
  "serviceCategories", "businessKeywords", "favoriteCount", "shareCount"
]));
```

- [ ] **Step 2: Run tests and confirm failure**

Run: `cd backend && npm test -- --runInBand tests/openapi.test.ts && cd .. && npm test -- --run src/features/core-read/api.test.ts`

Expected: FAIL because the additive schema/type fields are absent.

- [ ] **Step 3: Define the exact additive schemas and TypeScript types**

```ts
export type CorePrimaryTechnicianService = {
  id: number;
  name: string;
  priceAmount: string;
  currency: string;
  durationMinutes: number;
};
```

Use non-negative integers for counts, `0..100` for acceptance rate, nullable integer age, and nullable primary service. Document service-category and business-keyword arrays on `ShopCard` without combining them.

- [ ] **Step 4: Run both contract suites**

Expected: backend OpenAPI and frontend API tests PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/api/openapi.ts backend/tests/openapi.test.ts src/features/core-read/api.ts src/features/core-read/api.test.ts
git commit -m "feat: publish formal search card contracts"
```

### Task 3: Entity-specific search result cards

**Files:**
- Create: `src/features/core-read/FormalSearchResultCards.tsx`
- Create: `src/features/core-read/FormalSearchResultCards.test.tsx`

**Interfaces:**
- Consumes: `CoreShopCard`, `CoreTechnicianCard`, `Language`, and existing thumbnail/icon helpers.
- Produces: `FormalShopSearchCard`, `FormalTechnicianSearchCard`, and `formatCompactEngagementCount`.

- [ ] **Step 1: Write failing formatter and render tests**

```ts
expect(formatCompactEngagementCount(999)).toBe("999");
expect(formatCompactEngagementCount(1000)).toBe("1k");
expect(formatCompactEngagementCount(1999)).toBe("1k");
expect(formatCompactEngagementCount(2000)).toBe("2k");
```

Render both cards and assert the technician card shows formal rating, age/city, acceptance rate, primary service, tax-inclusive price/duration, persisted favorite/share counts, and rank badge; assert the shop card shows address and only `businessKeywords` labels.

- [ ] **Step 2: Run the component test and confirm failure**

Run: `npm test -- --run src/features/core-read/FormalSearchResultCards.test.tsx`

Expected: FAIL because the component module does not exist.

- [ ] **Step 3: Implement the components**

```ts
export function formatCompactEngagementCount(value: number) {
  const count = Math.max(0, Math.floor(value));
  return count < 1000 ? String(count) : `${Math.floor(count / 1000)}k`;
}
```

Use one outer `Link` per card, responsive dark surfaces, existing `AppIcon` names `heart` and `share`, existing rank image assets, translated labels, generated-image thumbnails, and no interactive descendants inside the link.

- [ ] **Step 4: Run component tests**

Expected: formatter, nullable-data, route, keyword-only, and accessibility assertions PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/core-read/FormalSearchResultCards.tsx src/features/core-read/FormalSearchResultCards.test.tsx
git commit -m "feat: add formal search result cards"
```

### Task 4: Category-page integration

**Files:**
- Modify: `src/pages/user/CategoryPage.tsx`
- Modify: `src/pages/user/CategoryPage.test.ts`
- Modify: `src/pages/user/CategoryPage.render.test.ts`

**Interfaces:**
- Consumes: Task 3 card components.
- Produces: entity-specific rendering under the existing shop and technician result sections.

- [ ] **Step 1: Replace old source assertions with failing entity-card assertions**

```ts
expect(categoryPageSource).toContain("FormalShopSearchCard");
expect(categoryPageSource).toContain("FormalTechnicianSearchCard");
expect(categoryPageSource).not.toContain("DirectSearchProfileCard");
```

Update server-render fixtures with the additive formal fields and assert real service/metric text appears without `mapCoreShopToStore`, `mapCoreTechnicianToTechnician`, or legacy mock imports.

- [ ] **Step 2: Run CategoryPage tests and confirm failure**

Run: `npm test -- --run src/pages/user/CategoryPage.test.ts src/pages/user/CategoryPage.render.test.ts`

Expected: FAIL because the page still uses the compact generic row.

- [ ] **Step 3: Integrate the formal cards**

Use a full-width vertical stack for shop cards and a two-column narrow-screen grid for technician cards. Pass `nearbyRank` directly; keep location guidance and all scoped request states unchanged.

- [ ] **Step 4: Run focused page and API tests**

Run: `npm test -- --run src/pages/user/CategoryPage.test.ts src/pages/user/CategoryPage.render.test.ts src/features/core-read/FormalSearchResultCards.test.tsx src/features/core-read/api.test.ts`

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/pages/user/CategoryPage.tsx src/pages/user/CategoryPage.test.ts src/pages/user/CategoryPage.render.test.ts
git commit -m "feat: render formal home search cards"
```

### Task 5: Verification, browser acceptance, and integration

**Files:**
- Verify only; modify focused files only if a gate exposes a regression.

**Interfaces:**
- Consumes: Tasks 1–4 complete branch.
- Produces: locally merged `main` with evidence; no push or deployment.

- [ ] **Step 1: Run backend gates**

Run focused repository/service/OpenAPI tests, `npm run lint`, `npm run build`, and `npm run prisma:generate` in `backend`.

Expected: all PASS.

- [ ] **Step 2: Run frontend gates**

Run focused Vitest suites, `npm run lint`, and `npm run verify:production-build`.

Expected: all PASS including the production bundle audit.

- [ ] **Step 3: Prove runtime ownership before browser testing**

Inspect listener PID, cwd, branch, `/health`, `/ready`, and Vite proxy origin. Do not treat an unrelated worktree listener as acceptance evidence.

- [ ] **Step 4: Browser acceptance**

At 390x844 and 440x956, verify technician/shop filters, formal routes, no horizontal overflow, readable metrics, rank badge behavior, keyword-only shop chips, and clean console. Do not use or create credentials without authorization.

- [ ] **Step 5: Sync and merge**

Inspect `git status -sb`, `git rev-list --left-right --count main...codex/formal-home-search-cards`, merge any newer local `main` into the branch, rerun affected gates, then fast-forward merge into local `main`. Preserve unrelated dirty files and do not push or deploy.
