# Service Taxonomy and Search Trends Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace static search chips with operations-managed service types/tags and provide formal keyword TOP10 plus city/time/multi-keyword trend comparison.

**Architecture:** Treat existing `Category` as the service-type identity, add versioned five-language presentation and tag records, and record one search-execution event per user action. Aggregate events server-side into raw counts and separately labeled 0–100 trend indices.

**Tech Stack:** Prisma/MySQL, Express, Zod, Jest/Supertest, React, Vitest

## Global Constraints

- Service projects and ranking filters use the same category/service-type IDs.
- Search page chips come only from the published taxonomy API; remove `popularCategoryTags` static data.
- Record only submitted searches, not draft keystrokes.
- Store normalized keyword, bounded original keyword, city, service type, result count and anonymized user/session reference.
- Keyword TOP10 and trends support city and time filters.
- Trend API returns both raw count and 0–100 normalized index; UI must never label index as search count.
- All taxonomy changes are versioned, five-language, permission-controlled and audited.

---

### Task 1: Add versioned taxonomy and search-event persistence

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Create: `backend/prisma/migrations/20260901110000_service_taxonomy_search_events/migration.sql`
- Create: `backend/tests/service-taxonomy-schema.test.ts`

**Interfaces:**
- Produces: `ServiceTypePublication`, `ServiceTypeTranslation`, `ServiceSearchTag`, `ServiceSearchTagTranslation`, `SearchExecutionEvent`

- [ ] **Step 1: Write the failing schema test**

```ts
for (const token of [
  "model ServiceTypePublication", "model ServiceTypeTranslation",
  "model ServiceSearchTag", "model ServiceSearchTagTranslation",
  "model SearchExecutionEvent", "normalizedKeyword", "sessionHash", "resultCount"
]) expect(schema).toContain(token);
```

- [ ] **Step 2: Run and verify failure**

Run: `cd backend && npm test -- service-taxonomy-schema.test.ts`

Expected: FAIL on missing models.

- [ ] **Step 3: Add models and indexes**

`ServiceTypePublication` references existing `Category`, owns version/status/sort/effective timestamps, and has five locale rows. Tags reference the publication and have five locale rows. `SearchExecutionEvent` is append-only with indexes on `(createdAt, city)`, `(normalizedKeyword, createdAt)`, and `(categoryId, createdAt)`.

- [ ] **Step 4: Generate Prisma and run schema test**

Run: `cd backend && npm run prisma:generate && npm test -- service-taxonomy-schema.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit persistence**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations/20260901110000_service_taxonomy_search_events/migration.sql backend/tests/service-taxonomy-schema.test.ts
git commit -m "feat: add service taxonomy and search events"
```

### Task 2: Publish operations-managed service types and tags

**Files:**
- Create: `backend/src/repositories/service-taxonomy.repository.ts`
- Create: `backend/src/services/service-taxonomy.service.ts`
- Create: `backend/src/controllers/service-taxonomy.controller.ts`
- Create: `backend/src/validators/service-taxonomy.validator.ts`
- Create: `backend/src/routes/service-taxonomy.routes.ts`
- Modify: `backend/src/app.ts`
- Modify: `backend/src/constants/permissions.constants.ts`
- Create: `backend/tests/service-taxonomy.service.test.ts`
- Create: `backend/tests/service-taxonomy-api.test.ts`

**Interfaces:**
- Produces public `GET /api/v1/service-taxonomy?locale=zh-CN`
- Produces backoffice CRUD/publish routes under `/api/v1/backoffice/service-taxonomy`
- Permission: `backoffice:service-taxonomy:write`

- [ ] **Step 1: Write failing publication tests**

```ts
expect(await service.getPublished("zh-CN")).toEqual([
  { categoryId: 3, code: "home-services", label: "家政服务", sortOrder: 1, tags: [{ publicId: "tag-housekeeping", label: "家政" }] }
]);
```

- [ ] **Step 2: Run and verify failure**

Run: `cd backend && npm test -- service-taxonomy.service.test.ts`

Expected: FAIL because taxonomy service is absent.

- [ ] **Step 3: Implement draft/publish/read flow**

Require exactly one nonblank translation for each of `ja`, `en`, `ko`, `zh-TW`, `zh-CN`; reject duplicate active tag codes and category IDs. Publishing archives the prior active version and audits the full before/after payload.

- [ ] **Step 4: Run service/API/RBAC tests**

Run: `cd backend && npm test -- service-taxonomy.service.test.ts service-taxonomy-api.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit taxonomy API**

```bash
git add backend/src/repositories/service-taxonomy.repository.ts backend/src/services/service-taxonomy.service.ts backend/src/controllers/service-taxonomy.controller.ts backend/src/validators/service-taxonomy.validator.ts backend/src/routes/service-taxonomy.routes.ts backend/src/app.ts backend/src/constants/permissions.constants.ts backend/tests/service-taxonomy.service.test.ts backend/tests/service-taxonomy-api.test.ts
git commit -m "feat: publish operations service taxonomy"
```

### Task 3: Record one formal event per submitted search

**Files:**
- Create: `backend/src/repositories/search-event.repository.ts`
- Create: `backend/src/services/search-event.service.ts`
- Create: `backend/src/controllers/search-event.controller.ts`
- Create: `backend/src/validators/search-event.validator.ts`
- Create: `backend/src/routes/search-event.routes.ts`
- Modify: `backend/src/app.ts`
- Create: `backend/tests/search-event.service.test.ts`
- Create: `backend/tests/search-event-api.test.ts`

**Interfaces:**
- Produces: `POST /api/v1/search/events`
- Body: `keyword`, `city`, `categoryId`, `tagPublicIds`, `resultCount`, `idempotencyKey`

- [ ] **Step 1: Write failing normalization/idempotency tests**

```ts
expect(normalizeSearchKeyword("  上門  按摩  ")).toBe("上門 按摩");
expect(await service.record(actor, input)).toMatchObject({ applied: true });
expect(await service.record(actor, input)).toMatchObject({ applied: false });
```

- [ ] **Step 2: Run and verify failure**

Run: `cd backend && npm test -- search-event.service.test.ts`

Expected: FAIL because event service is absent.

- [ ] **Step 3: Implement bounded event recording**

Normalize Unicode to NFKC, trim and collapse whitespace, lower-case Latin text, cap keyword at 100 characters, and hash anonymous session IDs with the configured server secret. Do not store access tokens, IP addresses or raw device identifiers in the event.

- [ ] **Step 4: Run service/API tests**

Run: `cd backend && npm test -- search-event.service.test.ts search-event-api.test.ts`

Expected: PASS including empty search, duplicate idempotency and invalid category/tag cases.

- [ ] **Step 5: Commit search-event capture**

```bash
git add backend/src/repositories/search-event.repository.ts backend/src/services/search-event.service.ts backend/src/controllers/search-event.controller.ts backend/src/validators/search-event.validator.ts backend/src/routes/search-event.routes.ts backend/src/app.ts backend/tests/search-event.service.test.ts backend/tests/search-event-api.test.ts
git commit -m "feat: record submitted search events"
```

### Task 4: Aggregate keyword TOP10 and normalized trends

**Files:**
- Create: `backend/src/repositories/search-trend.repository.ts`
- Create: `backend/src/services/search-trend.service.ts`
- Create: `backend/src/controllers/search-trend.controller.ts`
- Create: `backend/src/validators/search-trend.validator.ts`
- Create: `backend/src/routes/search-trend.routes.ts`
- Modify: `backend/src/app.ts`
- Modify: `backend/src/constants/permissions.constants.ts`
- Create: `backend/tests/search-trend.service.test.ts`
- Create: `backend/tests/search-trend-api.test.ts`

**Interfaces:**
- Produces: `GET /api/v1/backoffice/search-trends/top-keywords`
- Produces: `GET /api/v1/backoffice/search-trends/compare?keywords=按摩,家政`
- Permission: `backoffice:search-trend:read`

- [ ] **Step 1: Write failing normalization tests**

```ts
expect(normalizeTrend([0, 5, 10])).toEqual([0, 50, 100]);
expect(normalizeTrend([3, 3, 3])).toEqual([100, 100, 100]);
expect(normalizeTrend([0, 0, 0])).toEqual([0, 0, 0]);
```

- [ ] **Step 2: Run and verify failure**

Run: `cd backend && npm test -- search-trend.service.test.ts`

Expected: FAIL because trend service is absent.

- [ ] **Step 3: Implement grouped reads and response types**

```ts
export interface SearchTrendPoint {
  bucket: string;
  rawCount: number;
  normalizedIndex: number;
}
export interface SearchKeywordTrend {
  keyword: string;
  totalRawCount: number;
  points: SearchTrendPoint[];
}
```

Limit compare to five unique normalized keywords, use dashboard window/granularity logic, and apply identical city/time/category filters to each series.

- [ ] **Step 4: Run API/service tests**

Run: `cd backend && npm test -- search-trend.service.test.ts search-trend-api.test.ts dashboard-period.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit trend APIs**

```bash
git add backend/src/repositories/search-trend.repository.ts backend/src/services/search-trend.service.ts backend/src/controllers/search-trend.controller.ts backend/src/validators/search-trend.validator.ts backend/src/routes/search-trend.routes.ts backend/src/app.ts backend/src/constants/permissions.constants.ts backend/tests/search-trend.service.test.ts backend/tests/search-trend-api.test.ts
git commit -m "feat: expose formal search trends"
```

### Task 5: Replace user-search static tags and emit events

**Files:**
- Modify: `src/features/core-read/api.ts`
- Modify: `src/features/core-read/api.test.ts`
- Modify: `src/pages/user/CategoryPage.tsx`
- Modify: `src/pages/user/CategoryPage.test.ts`
- Modify: `src/pages/user/categorySearch.ts`
- Modify: `src/pages/user/categorySearch.test.ts`
- Modify: `src/i18n/translations.ts`

**Interfaces:**
- Consumes: public taxonomy and search-event endpoints
- Produces: no `popularCategoryTags` constant in `CategoryPage.tsx`

- [ ] **Step 1: Write failing source/interaction tests**

```ts
expect(categorySource).not.toContain("const popularCategoryTags");
await user.click(screen.getByRole("button", { name: "搜索" }));
expect(api.recordSearchEvent).toHaveBeenCalledWith(expect.objectContaining({ keyword: "家政", resultCount: 3 }));
```

- [ ] **Step 2: Run and verify failure**

Run: `npm test -- src/features/core-read/api.test.ts src/pages/user/CategoryPage.test.ts src/pages/user/categorySearch.test.ts`

Expected: FAIL because static tags remain and event API is absent.

- [ ] **Step 3: Implement published taxonomy loading**

Load taxonomy for the current locale, derive pinned chips by published `sortOrder`, and preserve tag IDs in URL search params. After all selected entity searches settle, send exactly one event with their summed result counts and a generated idempotency key. Search results must still render if event recording fails.

- [ ] **Step 4: Run user-search tests**

Run: `npm test -- src/features/core-read/api.test.ts src/pages/user/CategoryPage.test.ts src/pages/user/categorySearch.test.ts`

Expected: PASS and `rg -n "popularCategoryTags" src/pages/user/CategoryPage.tsx` returns no match.

- [ ] **Step 5: Commit user-search cutover**

```bash
git add src/features/core-read/api.ts src/features/core-read/api.test.ts src/pages/user/CategoryPage.tsx src/pages/user/CategoryPage.test.ts src/pages/user/categorySearch.ts src/pages/user/categorySearch.test.ts src/i18n/translations.ts
git commit -m "feat: connect search to published taxonomy"
```

### Task 6: Build operations taxonomy and search-trend pages

**Files:**
- Create: `src/api/searchOperations.ts`
- Create: `src/api/searchOperations.test.ts`
- Create: `src/pages/admin/ServiceTaxonomyPage.tsx`
- Create: `src/pages/admin/ServiceTaxonomyPage.test.tsx`
- Create: `src/pages/admin/SearchTrendsPage.tsx`
- Create: `src/pages/admin/SearchTrendsPage.test.tsx`
- Modify: `src/App.tsx`
- Modify: `src/App.test.tsx`
- Modify: `src/components/admin/AdminLayout.tsx`
- Modify: `src/components/admin/AdminLayout.test.ts`
- Modify: `src/i18n/translations.ts`

**Interfaces:**
- Produces routes `/admin/settings/service-taxonomy`, `/admin/analytics/search-trends`
- Consumes: Tasks 2 and 4 APIs

- [ ] **Step 1: Write failing page tests**

```tsx
expect(screen.getByRole("heading", { name: "搜索关键词 TOP10" })).toBeVisible();
expect(screen.getByText("原始搜索次数")).toBeVisible();
expect(screen.getByText("趋势指数（0-100）")).toBeVisible();
await user.type(screen.getByLabelText("添加对比关键词"), "宠物");
await user.click(screen.getByRole("button", { name: "添加" }));
```

- [ ] **Step 2: Run and verify failure**

Run: `npm test -- src/pages/admin/ServiceTaxonomyPage.test.tsx src/pages/admin/SearchTrendsPage.test.tsx`

Expected: FAIL because pages do not exist.

- [ ] **Step 3: Implement API-driven management and charting**

Taxonomy editor requires five locale tabs, draft reason and publish confirmation. Trends page reuses `DashboardFilterBar`, renders TOP10, accepts up to five compare keywords, and shows raw counts in cards plus normalized lines in the chart.

- [ ] **Step 4: Run frontend tests, lint and build**

Run: `npm test -- src/api/searchOperations.test.ts src/pages/admin/ServiceTaxonomyPage.test.tsx src/pages/admin/SearchTrendsPage.test.tsx src/components/admin/AdminLayout.test.ts && npm run lint && npm run build`

Expected: PASS.

- [ ] **Step 5: Commit operations UI**

```bash
git add src/api/searchOperations.ts src/api/searchOperations.test.ts src/pages/admin/ServiceTaxonomyPage.tsx src/pages/admin/ServiceTaxonomyPage.test.tsx src/pages/admin/SearchTrendsPage.tsx src/pages/admin/SearchTrendsPage.test.tsx src/App.tsx src/App.test.tsx src/components/admin/AdminLayout.tsx src/components/admin/AdminLayout.test.ts src/i18n/translations.ts
git commit -m "feat: manage taxonomy and search trends"
```

### Task 7: Publish taxonomy and search-trend OpenAPI schemas

**Files:**
- Modify: `backend/src/api/openapi.ts`
- Create: `backend/tests/service-taxonomy-search-openapi.test.ts`

**Interfaces:**
- Documents public taxonomy, search-event and backoffice trend/compare endpoints

- [ ] **Step 1: Write the failing OpenAPI test**

```ts
expect(document.paths["/api/v1/service-taxonomy"]).toBeDefined();
expect(document.paths["/api/v1/search/events"]).toBeDefined();
expect(document.paths["/api/v1/backoffice/search-trends/compare"]).toBeDefined();
```

- [ ] **Step 2: Run and verify failure**

Run: `cd backend && npm test -- service-taxonomy-search-openapi.test.ts`

Expected: FAIL on missing paths/schema.

- [ ] **Step 3: Add exact schemas and filter limits**

Document five locales, publication status, tag payloads, event idempotency, keyword/city/category filters, maximum five comparison keywords, raw counts and normalized indices.

- [ ] **Step 4: Run OpenAPI/API tests**

Run: `cd backend && npm test -- service-taxonomy-search-openapi.test.ts openapi.test.ts service-taxonomy-api.test.ts search-event-api.test.ts search-trend-api.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit API documentation**

```bash
git add backend/src/api/openapi.ts backend/tests/service-taxonomy-search-openapi.test.ts
git commit -m "docs: publish taxonomy search API contract"
```

### Task 8: Verify taxonomy/search consistency

**Files:**
- Create: `backend/scripts/check-service-taxonomy-search-flow.ts`
- Create: `backend/tests/service-taxonomy-search-flow-script.test.ts`
- Modify: `backend/package.json`

**Interfaces:**
- Produces command `npm run check:service-taxonomy-search`

- [ ] **Step 1: Write flow coverage tests**

```ts
for (const locale of ["ja", "en", "ko", "zh-TW", "zh-CN"]) expect(script).toContain(locale);
expect(script).toContain("normalizedIndex");
expect(script).toContain("rawCount");
```

- [ ] **Step 2: Run and verify failure**

Run: `cd backend && npm test -- service-taxonomy-search-flow-script.test.ts`

Expected: FAIL because the flow script is absent.

- [ ] **Step 3: Implement rollback-only consistency verification**

Publish one taxonomy version, fetch it from the public API in five languages, record city/category search events, verify TOP10 and compare series, then confirm draft text never enters event storage.

- [ ] **Step 4: Run gates and browser acceptance**

Run: `cd backend && npm test -- service-taxonomy search-event search-trend && npm run build`

Run: `npm test -- src/pages/user/CategoryPage.test.ts src/pages/admin/ServiceTaxonomyPage.test.tsx src/pages/admin/SearchTrendsPage.test.tsx && npm run lint && npm run build`

Verify published tags on user search, city/time TOP10, multi-keyword toggling, console and mobile/desktop overflow.

- [ ] **Step 5: Commit verification**

```bash
git add backend/scripts/check-service-taxonomy-search-flow.ts backend/tests/service-taxonomy-search-flow-script.test.ts backend/package.json
git commit -m "test: verify taxonomy and search trend flow"
```
