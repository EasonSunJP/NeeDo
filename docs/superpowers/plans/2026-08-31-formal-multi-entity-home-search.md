# Formal Multi-Entity Home Search Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the customer home search query formal shops, technicians, and services directly, with fuzzy entity-name matching and OR semantics for multiple tags/terms.

**Architecture:** Preserve `GET /api/v1/search` and its default service response, add an explicit `entityType`, and dispatch to typed repository queries for shops, technicians, or services. The frontend uses three typed adapters and three independent query states; `all` mode loads them concurrently, while entity-specific modes load only the selected type.

**Tech Stack:** React 19, TypeScript 5.9, Vite 7, Vitest 4, Express 4, Zod 3, Prisma 7, MySQL 8, Jest 29, Supertest 7.

## Global Constraints

- Execute in an isolated Git worktree created with `using-git-worktrees`; start from commit `83957a9c` or a verified descendant containing the approved design.
- Do not include the existing unrelated `ContactEventTimeline` or technician-schedule working-tree changes.
- Do not add a Prisma model, migration, mock, demo array, browser fallback, localStorage search cache, TODO, FIXME, or placeholder.
- Published status and `deletedAt IS NULL` are mandatory outer filters for shops, technicians, services, and related public identifiers.
- Multiple keywords and selected category IDs use OR; fuzzy entity-name matching is substring containment after trimming.
- Shop and technician public identifiers use exact matching.
- Keep Route → Controller → Service → Repository → Prisma layering.
- Keep the existing `{ code, message, data }` envelope and paginated `{ list, total, page, page_size }` response.
- Preserve callers that omit `entityType`: they continue receiving paginated service cards.
- Do not push, deploy, publish, seed, or mutate acceptance data.
- Each implementation task follows RED → verify RED → GREEN → verify GREEN → commit.

---

## File map

### Frontend

- Modify `src/api/httpClient.ts`: support repeated scalar query values without changing scalar serialization.
- Modify `src/api/httpClient.test.ts`: lock repeated-value and scalar URL behavior.
- Modify `src/features/core-read/api.ts`: add typed entity search queries and adapters.
- Modify `src/features/core-read/api.test.ts`: prove adapter URL/response typing.
- Create `src/pages/user/categorySearch.ts`: own multi-word draft parsing and selected-category-ID resolution.
- Create `src/pages/user/categorySearch.test.ts`: prove multi-word, comma-separated, unique-term, and category mapping behavior.
- Modify `src/pages/user/CategoryPage.tsx`: orchestrate independent shop/technician/service queries and scoped states.
- Modify `src/pages/user/CategoryPage.test.ts`: retain source-policy guards for formal typed adapters and removal of the joined keyword path.
- Modify `src/pages/user/CategoryPage.render.test.ts`: verify direct entity results, OR-result visibility, partial failures, and entity-specific loading.

### Backend

- Modify `backend/src/validators/core-read.validator.ts`: validate entity type plus bounded repeated keywords/category IDs.
- Modify `backend/src/repositories/core-read.repository.ts`: define search input/result types and direct paginated entity queries.
- Modify `backend/src/services/core-read.service.ts`: dispatch the validated entity type.
- Keep `backend/src/controllers/core-read.controller.ts` and `backend/src/routes/core-read.routes.ts` structurally unchanged; they continue validation and response wrapping only.
- Modify `backend/tests/core-read-api.test.ts`: prove dispatch, validation, response shape, legacy compatibility, and OR inputs.
- Create `backend/tests/core-read.repository.test.ts`: prove Prisma where clauses and direct entity mapping without a service prerequisite.
- Modify `backend/src/api/openapi.ts`: document parameters and conditional paginated payloads.
- Modify `backend/tests/openapi.test.ts`: guard the machine-readable search contract.
- Modify `docs/api.md`: document multi-entity search semantics and examples.

---

### Task 1: Repeated query-value serialization

**Files:**
- Modify: `src/api/httpClient.ts:23-33,112-133`
- Modify: `src/api/httpClient.test.ts`

**Interfaces:**
- Consumes: existing `buildApiUrl(path, query, baseUrl)` and `HttpClientRequestOptions.query`.
- Produces: `ApiQueryScalar` and `ApiQueryValue`; arrays serialize as repeated keys in original order.

- [ ] **Step 1: Write the failing serializer tests**

Add `buildApiUrl` to the existing import and add this describe block:

```ts
describe("httpClient query serialization", () => {
  it("serializes repeated scalar values as repeated query keys", () => {
    expect(buildApiUrl("/search", {
      entityType: "shop",
      keywords: ["LifeDance", "家政"],
      categoryIds: [3, 9],
      page: 1
    })).toBe(
      "/api/v1/search?entityType=shop&keywords=LifeDance&keywords=%E5%AE%B6%E6%94%BF&categoryIds=3&categoryIds=9&page=1"
    );
  });

  it("keeps existing scalar and omitted query behavior unchanged", () => {
    expect(buildApiUrl("/search", {
      keyword: "Wellness 渋谷",
      page: 2,
      enabled: false,
      empty: "",
      missing: undefined
    })).toBe(
      "/api/v1/search?keyword=Wellness+%E6%B8%8B%E8%B0%B7&page=2&enabled=false"
    );
  });
});
```

- [ ] **Step 2: Run the tests and verify RED**

Run:

```bash
npm test -- --run src/api/httpClient.test.ts
```

Expected: FAIL because array query values are not accepted/are serialized as one comma-separated string.

- [ ] **Step 3: Add the minimal repeated-value implementation**

Replace the query type with:

```ts
export type ApiQueryScalar = boolean | number | string;
export type ApiQueryValue = ApiQueryScalar | readonly ApiQueryScalar[] | null | undefined;

export type HttpClientRequestOptions = {
  // existing fields unchanged
  query?: Record<string, ApiQueryValue>;
  // existing fields unchanged
};
```

Update `appendQuery`:

```ts
function appendQuery(url: string, query?: HttpClientRequestOptions["query"]) {
  if (!query) {
    return url;
  }

  const params = new URLSearchParams();
  Object.entries(query).forEach(([key, value]) => {
    const values = Array.isArray(value) ? value : [value];

    values.forEach((item) => {
      if (item === undefined || item === null || item === "") {
        return;
      }

      params.append(key, String(item));
    });
  });
  const queryString = params.toString();

  return queryString ? `${url}?${queryString}` : url;
}
```

- [ ] **Step 4: Verify GREEN and scalar regression coverage**

Run:

```bash
npm test -- --run src/api/httpClient.test.ts
```

Expected: PASS with no warnings.

- [ ] **Step 5: Commit Task 1**

```bash
git add src/api/httpClient.ts src/api/httpClient.test.ts
git commit -m "feat: support repeated API query values"
```

---

### Task 2: Validated entity search dispatch

**Files:**
- Modify: `backend/src/validators/core-read.validator.ts`
- Modify: `backend/src/repositories/core-read.repository.ts` (types and port only in this task)
- Modify: `backend/src/services/core-read.service.ts`
- Modify: `backend/tests/core-read-api.test.ts`

**Interfaces:**
- Produces: `CoreSearchEntityType`, `CoreSearchInput`, `CoreSearchResponse`, `CoreReadRepositoryPort.searchShops`, and `CoreReadRepositoryPort.searchTechnicians`.
- Legacy `CoreReadRepositoryPort.search` remains the service-search method.

- [ ] **Step 1: Extend the API fixture and write failing dispatch tests**

In `createFixture`, add:

```ts
searchShops: jest.fn(async () => paginated([shopCard])),
searchTechnicians: jest.fn(async () => paginated([technicianCard])),
```

Add tests:

```ts
it("dispatches typed shop and technician searches with repeated OR inputs", async () => {
  const fixture = createFixture();

  const shopResponse = await request(fixture.app)
    .get("/api/v1/search?entityType=shop&keywords=LifeDance&keywords=%E5%AE%B6%E6%94%BF&categoryIds=3&categoryIds=9")
    .expect(200);
  expect(shopResponse.body.data).toEqual(paginated([shopCard]));
  expect(fixture.coreReadRepository.searchShops).toHaveBeenCalledWith(
    expect.objectContaining({
      entityType: "shop",
      keywords: ["LifeDance", "家政"],
      categoryIds: [3, 9]
    })
  );

  const technicianResponse = await request(fixture.app)
    .get("/api/v1/search?entityType=technician&keywords=%E3%81%B2%E3%81%8B%E3%82%8A")
    .expect(200);
  expect(technicianResponse.body.data).toEqual(paginated([technicianCard]));
  expect(fixture.coreReadRepository.searchTechnicians).toHaveBeenCalledWith(
    expect.objectContaining({ entityType: "technician", keywords: ["ひかり"] })
  );
});

it("keeps the legacy omitted entity type on service search", async () => {
  const fixture = createFixture();
  await request(fixture.app).get("/api/v1/search?keyword=shiatsu").expect(200);
  expect(fixture.coreReadRepository.search).toHaveBeenCalledWith(
    expect.objectContaining({ entityType: "service", keyword: "shiatsu" })
  );
});

it("rejects invalid or excessive multi-entity search values", async () => {
  const fixture = createFixture();
  await request(fixture.app).get("/api/v1/search?entityType=customer").expect(400);
  await request(fixture.app)
    .get(`/api/v1/search?${Array.from({ length: 21 }, (_, index) => `keywords=k${index}`).join("&")}`)
    .expect(400);
  expect(fixture.coreReadRepository.search).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run the focused backend test and verify RED**

Run:

```bash
npm --prefix backend test -- --runInBand tests/core-read-api.test.ts
```

Expected: FAIL because `entityType`, repeated keywords/category IDs, and repository dispatch do not exist.

- [ ] **Step 3: Add bounded repeated-value validation**

Add the helper and search schema:

```ts
const repeatedQueryValues = (value: unknown): unknown[] =>
  value === undefined ? [] : Array.isArray(value) ? value : [value];

const uniqueTrimmedStrings = z
  .preprocess(
    repeatedQueryValues,
    z.array(z.string().trim().min(1).max(100)).max(20)
  )
  .transform((values) => Array.from(new Set(values)));

const uniquePositiveIntegers = z
  .preprocess(
    repeatedQueryValues,
    z.array(z.coerce.number().int().positive()).max(20)
  )
  .transform((values) => Array.from(new Set(values)));

export const coreSearchQuerySchema = serviceListQueryBaseSchema
  .extend({
    entityType: z.enum(["service", "shop", "technician"]).default("service"),
    keyword: z.string().trim().min(1).max(100).optional(),
    keywords: uniqueTrimmedStrings,
    categoryIds: uniquePositiveIntegers
  })
  .refine(
    (value) => value.minPrice === undefined || value.maxPrice === undefined || value.minPrice <= value.maxPrice,
    "minPrice must be less than or equal to maxPrice"
  );
```

- [ ] **Step 4: Add exact backend types and dispatch**

In `core-read.repository.ts` add:

```ts
export type CoreSearchEntityType = "service" | "shop" | "technician";

export interface CoreSearchInput extends ServiceListInput {
  entityType: CoreSearchEntityType;
  keywords: string[];
  categoryIds: number[];
}

export type CoreSearchResponse =
  | PaginatedResponse<ServiceCardPayload>
  | PaginatedResponse<ShopCardPayload>
  | PaginatedResponse<TechnicianCardPayload>;
```

Extend the port:

```ts
search: (input: CoreSearchInput) => Promise<PaginatedResponse<ServiceCardPayload>>;
searchShops: (input: CoreSearchInput) => Promise<PaginatedResponse<ShopCardPayload>>;
searchTechnicians: (input: CoreSearchInput) => Promise<PaginatedResponse<TechnicianCardPayload>>;
```

Update `CoreReadService.search`:

```ts
public search(input: CoreSearchInput): Promise<CoreSearchResponse> {
  if (input.entityType === "shop") {
    return this.repository.searchShops(input);
  }
  if (input.entityType === "technician") {
    return this.repository.searchTechnicians(input);
  }

  return this.repository.search(input);
}
```

- [ ] **Step 5: Verify GREEN**

Run:

```bash
npm --prefix backend test -- --runInBand tests/core-read-api.test.ts
```

Expected: PASS; the legacy service test still passes.

- [ ] **Step 6: Commit Task 2**

```bash
git add backend/src/validators/core-read.validator.ts backend/src/repositories/core-read.repository.ts backend/src/services/core-read.service.ts backend/tests/core-read-api.test.ts
git commit -m "feat: dispatch typed core search requests"
```

---

### Task 3: Direct Prisma shop and technician search

**Files:**
- Create: `backend/tests/core-read.repository.test.ts`
- Modify: `backend/src/repositories/core-read.repository.ts`

**Interfaces:**
- Consumes: `CoreSearchInput` from Task 2.
- Produces: direct database-backed `searchShops`, `searchTechnicians`, and multi-keyword service `search` behavior.

- [ ] **Step 1: Write failing repository tests with a typed fake Prisma client**

Create a fixture factory whose delegates are Jest functions and instantiate:

```ts
const client = {
  shop: { findMany: jest.fn(), count: jest.fn() },
  technicianProfile: { findMany: jest.fn(), count: jest.fn() },
  service: { findMany: jest.fn(), count: jest.fn() }
} as unknown as PrismaClient;
const repository = new CoreReadRepository(client);
```

Add three focused tests:

```ts
it("searches published shops directly without requiring a service", async () => {
  shopFindMany.mockResolvedValue([publishedShopWithoutServices]);
  shopCount.mockResolvedValue(1);

  await expect(repository.searchShops({
    entityType: "shop",
    keywords: ["LifeDance"],
    categoryIds: [],
    page: 1,
    pageSize: 20
  })).resolves.toMatchObject({ list: [{ name: "LifeDance Wellness 渋谷" }], total: 1 });

  expect(shopFindMany).toHaveBeenCalledWith(expect.objectContaining({
    where: expect.objectContaining({
      deletedAt: null,
      status: "published",
      OR: expect.arrayContaining([{ name: { contains: "LifeDance" } }])
    }),
    skip: 0,
    take: 20
  }));
});

it("searches published technicians directly without requiring a service", async () => {
  technicianFindMany.mockResolvedValue([publishedTechnicianWithoutServices]);
  technicianCount.mockResolvedValue(1);

  await expect(repository.searchTechnicians({
    entityType: "technician",
    keywords: ["ひかり"],
    categoryIds: [],
    page: 1,
    pageSize: 20
  })).resolves.toMatchObject({ list: [{ displayName: "橘 ひかり" }], total: 1 });

  expect(technicianFindMany).toHaveBeenCalledWith(expect.objectContaining({
    where: expect.objectContaining({
      deletedAt: null,
      status: "published",
      OR: expect.arrayContaining([{ displayName: { contains: "ひかり" } }])
    })
  }));
});

it("combines keywords and category IDs as one OR group", async () => {
  serviceFindMany.mockResolvedValue([]);
  serviceCount.mockResolvedValue(0);
  await repository.search({
    entityType: "service",
    keywords: ["massage", "家政"],
    categoryIds: [3, 9],
    page: 1,
    pageSize: 20
  });

  expect(serviceFindMany).toHaveBeenCalledWith(expect.objectContaining({
    where: expect.objectContaining({
      OR: expect.arrayContaining([
        { name: { contains: "massage" } },
        { name: { contains: "家政" } },
        { categoryId: { in: [3, 9] } }
      ])
    })
  }));
});
```

The complete fixtures must include active formal `SHOP`/`S` public identifiers, empty media arrays, and nullable review summaries so the real mapping functions execute.

- [ ] **Step 2: Run the repository test and verify RED**

Run:

```bash
npm --prefix backend test -- --runInBand tests/core-read.repository.test.ts
```

Expected: FAIL because direct entity search methods and OR builders are absent.

- [ ] **Step 3: Add normalized search-term helpers**

Add:

```ts
private searchKeywords(input: Pick<CoreSearchInput, "keyword" | "keywords">): string[] {
  return Array.from(
    new Set([input.keyword, ...input.keywords].map((value) => value?.trim()).filter((value): value is string => Boolean(value)))
  );
}

private publicIdentifierWhere(kind: "S" | "SHOP") {
  return { kind, status: "ACTIVE" as const, deletedAt: null };
}
```

- [ ] **Step 4: Implement paginated direct shop search**

Build `Prisma.ShopWhereInput` with mandatory publication/public-ID constraints. Add one OR entry per keyword for `name`, `city`, `address`, `description`, exact public ID, and published related-service text; add one category OR entry using published related services with `categoryId: { in: input.categoryIds }`.

Use the existing `shopCardInclude()`, `mapShopCard()`, `toPrismaPagination()`, and `buildPaginatedResponse()`:

```ts
public async searchShops(input: CoreSearchInput): Promise<PaginatedResponse<ShopCardPayload>> {
  const pagination = toPrismaPagination(input);
  const where = this.buildShopSearchWhere(input);
  const [list, total] = await Promise.all([
    this.client.shop.findMany({
      where,
      include: this.shopCardInclude(),
      skip: pagination.skip,
      take: pagination.take,
      orderBy: [{ isRecommended: "desc" }, { id: "asc" }]
    }),
    this.client.shop.count({ where })
  ]);

  return buildPaginatedResponse(list.map((shop) => this.mapShopCard(shop)), total, pagination);
}
```

- [ ] **Step 5: Implement paginated direct technician search**

Build `Prisma.TechnicianProfileWhereInput` with mandatory publication and an active `S` identity/public-ID relation. Keyword OR entries cover `displayName`, `city`, `bio`, `serviceArea`, exact `S` public ID, direct published services, active approved technician services, and published services from active non-deleted shop affiliations. Category OR entries cover the same three service ownership paths.

Use the existing `technicianCardInclude()` and `mapTechnicianCard()`:

```ts
public async searchTechnicians(input: CoreSearchInput): Promise<PaginatedResponse<TechnicianCardPayload>> {
  const pagination = toPrismaPagination(input);
  const where = this.buildTechnicianSearchWhere(input);
  const [list, total] = await Promise.all([
    this.client.technicianProfile.findMany({
      where,
      include: this.technicianCardInclude(),
      skip: pagination.skip,
      take: pagination.take,
      orderBy: [{ isRecommended: "desc" }, { id: "asc" }]
    }),
    this.client.technicianProfile.count({ where })
  ]);

  return buildPaginatedResponse(
    list.map((technician) => this.mapTechnicianCard(technician)),
    total,
    pagination
  );
}
```

- [ ] **Step 6: Convert service search from joined phrase to OR branches**

Keep strict `/services` filters (`categoryId`, `shopId`, `technicianId`) unchanged. In `buildServiceWhere`, use singular `keyword` for legacy strict behavior when `keywords/categoryIds` are absent; for `CoreSearchInput`, emit one flattened OR list per keyword plus `{ categoryId: { in: categoryIds } }`.

- [ ] **Step 7: Verify GREEN and backend regression**

Run:

```bash
npm --prefix backend test -- --runInBand tests/core-read.repository.test.ts tests/core-read-api.test.ts
```

Expected: PASS; mapped cards contain active public IDs and no service prerequisite is present on direct name queries.

- [ ] **Step 8: Commit Task 3**

```bash
git add backend/src/repositories/core-read.repository.ts backend/tests/core-read.repository.test.ts
git commit -m "feat: search formal shops and technicians directly"
```

---

### Task 4: OpenAPI and human-readable contract

**Files:**
- Modify: `backend/src/api/openapi.ts`
- Modify: `backend/tests/openapi.test.ts`
- Modify: `docs/api.md`

**Interfaces:**
- Documents the conditional typed pages created by Tasks 2-3.

- [ ] **Step 1: Write the failing OpenAPI assertions**

Add assertions for `/api/v1/search`:

```ts
const search = response.body.paths["/api/v1/search"].get;
expect(search.parameters).toEqual(expect.arrayContaining([
  expect.objectContaining({ name: "entityType", schema: expect.objectContaining({ enum: ["service", "shop", "technician"] }) }),
  expect.objectContaining({ name: "keywords", schema: expect.objectContaining({ type: "array", maxItems: 20 }) }),
  expect.objectContaining({ name: "categoryIds", schema: expect.objectContaining({ type: "array", maxItems: 20 }) })
]));
expect(search.responses["200"].content["application/json"].schema.properties.data.oneOf).toHaveLength(3);
```

- [ ] **Step 2: Run and verify RED**

```bash
npm --prefix backend test -- --runInBand tests/openapi.test.ts
```

Expected: FAIL because the existing OpenAPI path has no parameters or typed response schema.

- [ ] **Step 3: Implement OpenAPI parameters and `oneOf` paginated pages**

Document repeated values with `style: "form"` and `explode: true`. Add or reuse `ShopCard`, `TechnicianCard`, and `ServiceCard` component schemas and define each paginated page with required `list`, `total`, `page`, and `page_size` fields.

- [ ] **Step 4: Update `docs/api.md`**

Change the route purpose to “Typed shop, technician, or service search.” Add exact query definitions, OR semantics, fuzzy substring boundaries, legacy default behavior, repeated-key examples, and the rule that search visibility does not guarantee bookability.

- [ ] **Step 5: Verify GREEN**

```bash
npm --prefix backend test -- --runInBand tests/openapi.test.ts tests/core-read-api.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit Task 4**

```bash
git add backend/src/api/openapi.ts backend/tests/openapi.test.ts docs/api.md
git commit -m "docs: define multi-entity search contract"
```

---

### Task 5: Typed frontend adapters and multi-word parsing

**Files:**
- Modify: `src/features/core-read/api.ts`
- Modify: `src/features/core-read/api.test.ts`
- Create: `src/pages/user/categorySearch.ts`
- Create: `src/pages/user/categorySearch.test.ts`

**Interfaces:**
- Produces: `CoreSearchListQuery`, `coreReadApi.searchServices`, `searchShops`, `searchTechnicians`, and `parseCategorySearchDraft`.

- [ ] **Step 1: Write failing adapter tests**

Add:

```ts
it("calls typed multi-entity search endpoints with repeated OR values", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse({
    code: 0,
    message: "success",
    data: { list: [], page: 1, page_size: 20, total: 0 }
  }));

  const query = { keywords: ["LifeDance", "家政"], categoryIds: [3, 9], page: 1 };
  await coreReadApi.searchShops(query);
  await coreReadApi.searchTechnicians(query);
  await coreReadApi.searchServices(query);

  expect(fetch).toHaveBeenNthCalledWith(1,
    "/api/v1/search?keywords=LifeDance&keywords=%E5%AE%B6%E6%94%BF&categoryIds=3&categoryIds=9&page=1&entityType=shop",
    expect.any(Object)
  );
  expect(fetch).toHaveBeenNthCalledWith(2, expect.stringContaining("entityType=technician"), expect.any(Object));
  expect(fetch).toHaveBeenNthCalledWith(3, expect.stringContaining("entityType=service"), expect.any(Object));
});
```

- [ ] **Step 2: Write failing pure parsing tests**

Create `categorySearch.test.ts`:

```ts
it("keeps a multi-word entity name as one fuzzy term", () => {
  expect(parseCategorySearchDraft("  LifeDance Wellness 渋谷  ", () => null)).toEqual({
    tagIds: [],
    customLabels: ["LifeDance Wellness 渋谷"]
  });
});

it("splits only explicit comma separators and de-duplicates terms", () => {
  expect(parseCategorySearchDraft("家政, 家政、ひかり", () => null)).toEqual({
    tagIds: [],
    customLabels: ["家政", "ひかり"]
  });
});

it("resolves a whole known tag without turning it into free text", () => {
  expect(parseCategorySearchDraft("上门按摩", (value) => value === "上门按摩" ? { id: "tag-massage-door" } : null)).toEqual({
    tagIds: ["tag-massage-door"],
    customLabels: []
  });
});
```

- [ ] **Step 3: Run and verify RED**

```bash
npm test -- --run src/features/core-read/api.test.ts src/pages/user/categorySearch.test.ts
```

Expected: FAIL because typed adapters and the pure parsing module do not exist.

- [ ] **Step 4: Implement typed adapters**

Add:

```ts
export type CoreSearchListQuery = Omit<CoreServiceListQuery, "keyword" | "categoryId"> & {
  keyword?: string;
  keywords?: readonly string[];
  categoryIds?: readonly number[];
};

function searchEntity<TItem>(entityType: "service" | "shop" | "technician", query: CoreSearchListQuery) {
  return httpClient.request<PaginatedCoreReadData<TItem>>("/search", {
    auth: false,
    query: { ...query, entityType }
  });
}
```

Expose:

```ts
searchServices(query: CoreSearchListQuery = {}) {
  return searchEntity<CoreServiceCard>("service", query);
},
searchShops(query: CoreSearchListQuery = {}) {
  return searchEntity<CoreShopCard>("shop", query);
},
searchTechnicians(query: CoreSearchListQuery = {}) {
  return searchEntity<CoreTechnicianCard>("technician", query);
},
search(query: CoreSearchListQuery = {}) {
  return searchEntity<CoreServiceCard>("service", query);
},
```

- [ ] **Step 5: Implement the pure parser**

```ts
export type ResolvedSearchTag = { id: string };

export function parseCategorySearchDraft(
  value: string,
  findTag: (value: string) => ResolvedSearchTag | null
) {
  const parts = value
    .trim()
    .split(/[，、,]+/)
    .map((part) => part.replace(/^[＃#]+/, "").trim())
    .filter(Boolean);
  const tagIds: string[] = [];
  const customLabels: string[] = [];

  parts.forEach((part) => {
    const tag = findTag(part);
    if (tag) {
      tagIds.push(tag.id);
    } else {
      customLabels.push(part);
    }
  });

  return {
    tagIds: Array.from(new Set(tagIds)),
    customLabels: Array.from(new Set(customLabels))
  };
}
```

- [ ] **Step 6: Verify GREEN**

```bash
npm test -- --run src/api/httpClient.test.ts src/features/core-read/api.test.ts src/pages/user/categorySearch.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit Task 5**

```bash
git add src/features/core-read/api.ts src/features/core-read/api.test.ts src/pages/user/categorySearch.ts src/pages/user/categorySearch.test.ts
git commit -m "feat: add typed frontend search adapters"
```

---

### Task 6: Category page direct-entity orchestration

**Files:**
- Modify: `src/pages/user/CategoryPage.tsx`
- Modify: `src/pages/user/CategoryPage.test.ts`
- Modify: `src/pages/user/CategoryPage.render.test.ts`

**Interfaces:**
- Consumes: Task 5 typed adapters/parser and existing `useCoreReadQuery` stale-result guard.
- Produces: independent service/shop/technician UI state and scoped retry controls.

- [ ] **Step 1: Write failing source-policy tests**

Replace assertions tied to the old joined search with guards:

```ts
it("uses direct typed entity searches instead of deriving profiles from services", () => {
  expect(categoryPageSource).toContain("coreReadApi.searchShops");
  expect(categoryPageSource).toContain("coreReadApi.searchTechnicians");
  expect(categoryPageSource).toContain("coreReadApi.searchServices");
  expect(categoryPageSource).not.toContain('buildDisplayLabels(appliedTagIds, appliedCustomLabels).join(" ")');
  expect(categoryPageSource).not.toContain("searchQuery.data.list.flatMap");
  expect(categoryPageSource).not.toContain("matchesAllSearchKeywords");
});
```

- [ ] **Step 2: Write failing render/interaction tests**

Change the core-read hook mock to return queued states keyed by adapter loader order. Mock the three adapters and assert:

```ts
it("renders a shop and technician returned without a service result", () => {
  // categories -> one formal category
  // shop page -> LifeDance Wellness 渋谷
  // technician page -> 橘 ひかり
  // service page -> empty
  const html = renderCategoryPage("/categories");
  expect(html).toContain("LifeDance Wellness 渋谷");
  expect(html).toContain("橘 ひかり");
});

it("keeps successful sections when one entity request fails", () => {
  const html = renderCategoryPage("/categories?type=store", {
    shop: { data: null, error: "error.network", loading: false }
  });
  expect(html).toContain("店铺搜索读取失败");
  expect(html).toContain("重试");
});
```

If SSR cannot model hook effects cleanly, use `createRoot`, `act`, and DOM button/input events in the same test file; do not fall back to raw-source assertions for rendered behavior.

- [ ] **Step 3: Run and verify RED**

```bash
npm test -- --run src/pages/user/CategoryPage.test.ts src/pages/user/CategoryPage.render.test.ts
```

Expected: FAIL because the page still uses one service search and derives entity cards from it.

- [ ] **Step 4: Replace joined search parameters with formal OR groups**

Use `parseCategorySearchDraft`. Derive `searchCategoryIds` from every selected home-category tag and all matching formal category records. Build:

```ts
const coreSearchQuery = {
  keywords: appliedCustomLabels,
  categoryIds: searchCategoryIds,
  pageSize: 40,
  sort: "rating_desc" as const
};
```

Do not send popular labels as text when a formal category ID is available.

- [ ] **Step 5: Add three independent query states**

```ts
const loadShops = entityFilter === "all" || entityFilter === "store";
const loadTechnicians = entityFilter === "all" || entityFilter === "technician";
const loadServices = entityFilter === "all" || entityFilter === "service";

const shopSearchQuery = useCoreReadQuery(
  () => loadShops ? coreReadApi.searchShops(coreSearchQuery) : null,
  [loadShops, searchTermsKey, shopRetryKey]
);
const technicianSearchQuery = useCoreReadQuery(
  () => loadTechnicians ? coreReadApi.searchTechnicians(coreSearchQuery) : null,
  [loadTechnicians, searchTermsKey, technicianRetryKey]
);
const serviceSearchQuery = useCoreReadQuery(
  () => loadServices ? coreReadApi.searchServices(coreSearchQuery) : null,
  [loadServices, searchTermsKey, serviceRetryKey]
);
```

Use a deterministic `searchTermsKey` built from sorted keyword/category arrays. The existing hook cleanup prevents stale promises from replacing a newer dependency set.

- [ ] **Step 6: Map entity pages directly and remove client all-terms filters**

```ts
const apiStores = useMemo(
  () => shopSearchQuery.data?.list.map(mapCoreShopToStore) ?? [],
  [shopSearchQuery.data]
);
const apiTechnicians = useMemo(
  () => technicianSearchQuery.data?.list.map(mapCoreTechnicianToTechnician) ?? [],
  [technicianSearchQuery.data]
);
const apiServices = useMemo(
  () => serviceSearchQuery.data?.list.map(mapCoreServiceToServiceItem) ?? [],
  [serviceSearchQuery.data]
);
```

Keep client scoring only for presentation order. Remove every all-keyword visibility filter and the service-derived shop/technician maps.

- [ ] **Step 7: Implement scoped loading/error/empty states**

- Global loading: every requested page is still loading and there is no data.
- Global empty: every requested page completed successfully and all lists are empty.
- Partial error: render successful sections plus a translated section error and retry button that increments only its retry key.
- Direct no-service technician card: pass `directService={undefined}` and `fallbackServices={[]}` when no formal service match exists; do not fabricate price or availability.

- [ ] **Step 8: Verify GREEN**

```bash
npm test -- --run src/pages/user/CategoryPage.test.ts src/pages/user/CategoryPage.render.test.ts src/pages/user/categorySearch.test.ts src/features/core-read/api.test.ts
```

Expected: PASS with real rendered-behavior coverage.

- [ ] **Step 9: Commit Task 6**

```bash
git add src/pages/user/CategoryPage.tsx src/pages/user/CategoryPage.test.ts src/pages/user/CategoryPage.render.test.ts
git commit -m "fix: search shops and technicians directly"
```

---

### Task 7: Full verification and formal-data browser acceptance

**Files:**
- Modify only if verification exposes an in-scope defect; any fix begins with a new failing test.

**Interfaces:**
- Verifies Tasks 1-6 as one formal Step 08/09 browsing slice.

- [ ] **Step 1: Run focused frontend verification**

```bash
npm test -- --run src/api/httpClient.test.ts src/features/core-read/api.test.ts src/pages/user/categorySearch.test.ts src/pages/user/CategoryPage.test.ts src/pages/user/CategoryPage.render.test.ts
npm run lint
```

Expected: all focused tests PASS; TypeScript exits 0.

- [ ] **Step 2: Run focused backend verification**

```bash
npm --prefix backend test -- --runInBand tests/core-read.repository.test.ts tests/core-read-api.test.ts tests/openapi.test.ts
npm --prefix backend run lint
npm --prefix backend run build
```

Expected: all focused tests PASS; lint/build exit 0.

- [ ] **Step 3: Run complete build and production-bundle gate**

```bash
npm run verify:production-build
```

Expected: TypeScript/Vite build and production bundle audit PASS.

- [ ] **Step 4: Start isolated formal runtime and prove port ownership**

From the isolated worktree, reuse the ignored main-workspace environment file without printing it:

```bash
FORMAL_BACKEND_PORT=3101 FRONTEND_PORT=5281 FORMAL_BACKEND_ENV_FILE="/Users/eason/Documents/New project/backend/.env.dev" NEEDO_API_PROXY_TARGET="http://127.0.0.1:3101" npm run dev:formal
```

Verify `lsof` cwd ownership for ports `3101` and `5281`, then check `/api/v1/health`, `/api/v1/ready`, frontend HTTP 200, and proxy health.

- [ ] **Step 5: Verify formal API data read-only**

Run read-only requests:

```bash
curl -sS --get "http://127.0.0.1:3101/api/v1/search" --data-urlencode "entityType=shop" --data-urlencode "keywords=LifeDance"
curl -sS --get "http://127.0.0.1:3101/api/v1/search" --data-urlencode "entityType=technician" --data-urlencode "keywords=ひかり"
curl -sS --get "http://127.0.0.1:3101/api/v1/search" --data-urlencode "entityType=shop" --data-urlencode "keywords=麻布十番"
```

Expected: the first returns `LifeDance Wellness 渋谷`, the second returns `橘 ひかり`, and the third returns the published no-service shop. No database write occurs.

- [ ] **Step 6: Browser acceptance at mobile and desktop widths**

Use the authenticated customer entry on `http://127.0.0.1:5281/user.html#/categories`:

- Shop mode: `LifeDance` and `Wellness 渋谷` both find `LifeDance Wellness 渋谷`.
- Technician mode: `ひかり` finds `橘 ひかり` with a working detail link despite no directly linked service.
- Shop mode: a published empty-service shop renders without a fabricated service/price.
- All mode: add several unrelated popular tags and confirm the union remains visible.
- Switch among all/store/technician/service and confirm request types and sections match.
- Reload and confirm URL-driven entity/tag filters restore formal results.
- Inspect console errors, failed requests, empty states, scoped retry, horizontal overflow, hidden panels, and bottom-navigation overlap.

- [ ] **Step 7: Run complete relevant suites**

```bash
npm test -- --run
npm --prefix backend test -- --runInBand
```

Expected: complete frontend and backend baselines PASS except repository-declared intentional skips already present before this change.

- [ ] **Step 8: Commit any verification-only test/doc adjustments**

Only if tracked in-scope files changed after a RED/GREEN cycle:

```bash
git add \
  src/api/httpClient.ts \
  src/api/httpClient.test.ts \
  src/features/core-read/api.ts \
  src/features/core-read/api.test.ts \
  src/pages/user/categorySearch.ts \
  src/pages/user/categorySearch.test.ts \
  src/pages/user/CategoryPage.tsx \
  src/pages/user/CategoryPage.test.ts \
  src/pages/user/CategoryPage.render.test.ts \
  backend/src/validators/core-read.validator.ts \
  backend/src/repositories/core-read.repository.ts \
  backend/src/services/core-read.service.ts \
  backend/tests/core-read-api.test.ts \
  backend/tests/core-read.repository.test.ts \
  backend/src/api/openapi.ts \
  backend/tests/openapi.test.ts \
  docs/api.md
git commit -m "test: verify formal multi-entity search"
```

- [ ] **Step 9: Finish the branch without push/deploy**

Use `verification-before-completion`, then `finishing-a-development-branch`. Compare commit ancestry with the current local `main`; integrate only after confirming the search commits are not already ancestors. Keep push, deployment, public release, and live-production acceptance explicitly separate.
