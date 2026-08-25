# Technician Ranking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the operations-admin technician ranking route usable with server-computed, paginated, exportable rankings for completed service revenue, completed orders, and working days.

**Architecture:** Add a Step 12 read-only ranking contract to the existing backoffice Route -> Controller -> Service -> Repository stack. The repository aggregates only persisted completed bookings and their `OrderFinancial.serviceAmountJpy`, then the React ranking workspace consumes the result without mapping through the legacy `Technician` mock-shaped model.

**Tech Stack:** React 19, TypeScript strict mode, Vite, Vitest, Node.js 22, Express, Zod, Prisma/MySQL, Jest, Supertest.

## Global Constraints

- Default period is the current calendar month in `Asia/Tokyo`.
- Period choices are today, last 7 days, last 30 days, current month, custom inclusive dates, and all history.
- Revenue includes the persisted final completed-service amount, including confirmed extension amounts recorded in `OrderFinancial.serviceAmountJpy`.
- One completed booking counts once regardless of extension count.
- A technician with at least one completed booking on a Tokyo calendar date receives one working day for that date.
- Refunded bookings are excluded from revenue, completed-order count, and working-day count.
- No mock, demo, placeholder, localStorage, or browser-side ranking calculation may be added.
- The list and export routes require `backoffice:technicians:list`; reads produce an audit event.
- Preserve the existing React/Vite admin shell, themes, technician management route, and concentrated technician detail drawer.
- The worktree contains unrelated user changes. Do not reset, discard, stage, or commit unrelated files; commits are omitted unless the user asks for them.

---

### Task 1: Ranking period and contract

**Files:**
- Modify: `backend/src/validators/backoffice.validator.ts`
- Modify: `backend/src/services/backoffice.service.ts`
- Test: `backend/tests/technician-ranking-period.test.ts`

**Interfaces:**
- Produces: `TechnicianRankingPeriod`, `TechnicianRankingSort`, `BackofficeTechnicianRankingQuery`, `resolveTechnicianRankingWindow(query, now)`.
- The resolved window contains at least `{ from: Date | null; toExclusive: Date | null; timezone: "Asia/Tokyo" }`; richer fields are retained for repository/API metadata.

- [ ] **Step 1: Write failing period tests**

```ts
expect(resolveTechnicianRankingWindow({ period: "month" }, new Date("2026-08-25T15:30:00Z"))).toMatchObject({
  from: new Date("2026-07-31T15:00:00.000Z"),
  toExclusive: new Date("2026-08-31T15:00:00.000Z"),
  timezone: "Asia/Tokyo"
});
expect(resolveTechnicianRankingWindow({ period: "custom", from: "2026-08-01", to: "2026-08-03" }, now)).toMatchObject({
  from: new Date("2026-07-31T15:00:00.000Z"),
  toExclusive: new Date("2026-08-03T15:00:00.000Z")
});
```

- [ ] **Step 2: Run the test and confirm it fails because the resolver is absent**

Run: `npm --prefix backend test -- technician-ranking-period.test.ts --runInBand`

- [ ] **Step 3: Implement strict Zod query validation and Tokyo date resolution**

```ts
export const technicianRankingQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
  period: z.enum(["month", "today", "last7days", "last30days", "custom", "all"]).default("month"),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  sortBy: z.enum(["revenue", "completedOrders", "workingDays"]).default("revenue"),
  keyword: z.string().trim().max(100).optional(),
  shopId: z.coerce.number().int().positive().optional(),
  city: z.string().trim().max(100).optional()
}).superRefine((value, context) => {
  if (value.period === "custom" && (!value.from || !value.to)) {
    context.addIssue({ code: "custom", message: "Custom period requires from and to", path: ["from"] });
  }
});
```

- [ ] **Step 4: Run the period tests and backend typecheck**

Run: `npm --prefix backend test -- technician-ranking-period.test.ts --runInBand && npm --prefix backend run build`

### Task 2: Prisma-backed ranking aggregation

**Files:**
- Modify: `backend/src/repositories/backoffice.repository.ts`
- Test: `backend/tests/technician-ranking-repository.test.ts`

**Interfaces:**
- Consumes: a resolved Tokyo UTC window plus validated filters.
- Produces: `BackofficeTechnicianRankingPayload` with `summary`, `list`, `total`, `page`, `page_size`, and `period`.

- [ ] **Step 1: Write failing repository tests for extension-inclusive revenue and distinct counts**

```ts
expect(result.list[0]).toMatchObject({
  rank: 1,
  technicianId: 21,
  completedServiceRevenueJpy: 25000,
  completedOrders: 2,
  workingDays: 1,
  averageOrderValueJpy: 12500
});
expect(result.summary).toMatchObject({
  completedServiceRevenueJpy: 25000,
  completedOrders: 2,
  workingDays: 1
});
```

The fixture has two completed bookings on the same Tokyo date. Their financial records are `12000` and `13000`; the second amount includes an extension. A refunded completed booking and an incomplete booking must not contribute.

- [ ] **Step 2: Run the repository test and confirm the missing method failure**

Run: `npm --prefix backend test -- technician-ranking-repository.test.ts --runInBand`

- [ ] **Step 3: Implement the minimal scoped aggregation**

```ts
const bookings = await this.client.bookingOrder.findMany({
  where: {
    deletedAt: null,
    status: "COMPLETED",
    paymentStatus: { not: "REFUNDED" },
    technicianProfileId: { in: technicianIds },
    ...(from || toExclusive ? { endsAt: { ...(from ? { gte: from } : {}), ...(toExclusive ? { lt: toExclusive } : {}) } } : {})
  },
  select: {
    id: true,
    technicianProfileId: true,
    endsAt: true,
    financial: { select: { serviceAmountJpy: true } }
  }
});
```

Accumulate revenue from `financial.serviceAmountJpy`, count unique booking IDs, and count unique `YYYY-MM-DD` Tokyo service dates per technician. Sort on the server, assign the absolute rank before slicing the requested page, and use deterministic tie-breakers: selected metric, revenue, completed orders, working days, technician ID.

- [ ] **Step 4: Run repository tests**

Run: `npm --prefix backend test -- technician-ranking-repository.test.ts --runInBand`

### Task 3: Protected ranking and CSV endpoints

**Files:**
- Modify: `backend/src/controllers/backoffice.controller.ts`
- Modify: `backend/src/routes/backoffice.routes.ts`
- Modify: `backend/src/services/backoffice.service.ts`
- Modify: `backend/src/api/openapi.ts`
- Modify: `backend/tests/backoffice-api.test.ts`
- Modify: `backend/tests/openapi.test.ts`

**Interfaces:**
- Produces: `GET /api/v1/backoffice/technician-rankings`.
- Produces: `GET /api/v1/backoffice/technician-rankings/export`.

- [ ] **Step 1: Add failing API tests**

```ts
await request(app)
  .get("/api/v1/backoffice/technician-rankings?period=month&sortBy=revenue")
  .set("Authorization", `Bearer ${adminToken}`)
  .expect(200);
await request(app)
  .get("/api/v1/backoffice/technician-rankings")
  .set("Authorization", `Bearer ${viewerToken}`)
  .expect(403);
```

Also assert invalid custom dates return the normalized validation error and that export returns the same ordering and period label as the list.

- [ ] **Step 2: Run the failing API tests**

Run: `npm --prefix backend test -- backoffice-api.test.ts openapi.test.ts --runInBand`

- [ ] **Step 3: Wire controller, service, routes, audit, CSV, and OpenAPI**

```ts
router.get(
  "/backoffice/technician-rankings/export",
  authenticate(),
  authorize(BACKOFFICE_ROUTE_PERMISSIONS.technicians),
  validateRequest({ query: technicianRankingQuerySchema }),
  controller.platformTechnicianRankingsExport
);
router.get(
  "/backoffice/technician-rankings",
  authenticate(),
  authorize(BACKOFFICE_ROUTE_PERMISSIONS.technicians),
  validateRequest({ query: technicianRankingQuerySchema }),
  controller.platformTechnicianRankings
);
```

The service records `backoffice.technician_rankings.list` and `backoffice.technician_rankings.export`. CSV columns are rank, technician ID, name, shop, city, completed service revenue JPY, completed orders, working days, and average order value JPY.

- [ ] **Step 4: Run focused backend API and OpenAPI tests**

Run: `npm --prefix backend test -- backoffice-api.test.ts openapi.test.ts --runInBand`

### Task 4: Frontend API adapter

**Files:**
- Modify: `src/api/backofficeRealData.ts`
- Modify: `src/api/backofficeRealData.test.ts`

**Interfaces:**
- Produces: `BackofficeTechnicianRankingPayload`, `TechnicianRankingQuery`, `backofficeRealDataApi.technicianRankings(query)`, and `backofficeRealDataApi.exportTechnicianRankings(query)`.

- [ ] **Step 1: Write failing adapter path tests**

```ts
await backofficeRealDataApi.technicianRankings({ period: "month", sortBy: "revenue", page: 1, pageSize: 20 });
await backofficeRealDataApi.exportTechnicianRankings({ period: "month", sortBy: "revenue" });
expect(httpClient.request).toHaveBeenNthCalledWith(1, "/backoffice/technician-rankings", { query: expect.any(Object) });
expect(httpClient.request).toHaveBeenNthCalledWith(2, "/backoffice/technician-rankings/export", { query: expect.any(Object) });
```

- [ ] **Step 2: Run the adapter test and confirm it fails**

Run: `npm test -- src/api/backofficeRealData.test.ts`

- [ ] **Step 3: Add typed adapter methods**

Use the existing `httpClient` and `CsvExportPayload`; do not introduce fetch, local storage, or a second API layer.

- [ ] **Step 4: Run adapter tests**

Run: `npm test -- src/api/backofficeRealData.test.ts`

### Task 5: Complete operations ranking workspace

**Files:**
- Create: `src/pages/admin/TechnicianRankingPage.tsx`
- Create: `src/pages/admin/TechnicianRankingPage.test.tsx`
- Modify: `src/pages/admin/TechniciansPage.tsx`
- Modify: `src/pages/admin/masterDataPages.test.ts`

**Interfaces:**
- Consumes: the ranking adapter and existing `FormalTechnicianDetailPanel`.
- Produces: the functional `/admin/technicians?module=ranking` workspace.

- [ ] **Step 1: Write failing page-contract tests**

Assert the source uses `useSearchParams`, `technicianRankings`, `exportTechnicianRankings`, `downloadCsvExport`, controlled period/sort/search/shop/city filters, retry, pagination, empty state, and `FormalTechnicianDetailPanel`. Assert it does not import `data/mock`, `mapBackofficeTechnician`, `TechnicianListModule`, or localStorage.

- [ ] **Step 2: Run the page tests and confirm they fail**

Run: `npm test -- src/pages/admin/TechnicianRankingPage.test.tsx src/pages/admin/masterDataPages.test.ts`

- [ ] **Step 3: Build the recommended visual system**

```text
Palette: Ink #16171A, Paper #F7F7F2, Line #E3E1D8, Moss #3F6B4E,
Mint #7AB893, Lemon #F3C84C.
Type: existing Inter/Noto Sans for UI; tabular numerals and heavy weight for ranking data.
Layout: period controls -> summary strip -> server-ranked performance table -> pagination.
Signature: a quiet vertical rank spine and proportional moss revenue bar; only the top three receive restrained medal tones.
```

The summary strip contains completed-service revenue, completed orders, working days, and average order value. Each row shows absolute rank, technician identity, shop/city, revenue bar and exact JPY, completed orders, working days, average order value, and a detail action. Custom dates use native date inputs; selecting another preset clears custom dates. Search is debounced and every filter resets to page 1.

- [ ] **Step 4: Reuse the concentrated detail drawer**

On row selection, show the selected period's ranking metrics above `FormalTechnicianDetailPanel`, then load the persisted technician detail from `/backoffice/technicians/:id`. Preserve independent loading, retry, stale-response protection, and close behavior.

- [ ] **Step 5: Run the page tests**

Run: `npm test -- src/pages/admin/TechnicianRankingPage.test.tsx src/pages/admin/masterDataPages.test.ts`

### Task 6: Documentation, i18n, and full verification

**Files:**
- Modify: `src/i18n/translations.ts`
- Modify: `src/i18n/translations.test.ts`
- Modify: `docs/backoffice-real-data.md`
- Modify: `README.md`

- [ ] **Step 1: Add complete Chinese, Japanese, English, and Traditional Chinese copy for all new visible labels**

Include period names, metric labels, filter labels, loading, empty, error, retry, export, custom-date validation, data-quality warning, and ranking-detail labels.

- [ ] **Step 2: Run i18n and focused feature tests**

Run: `npm test -- src/i18n/translations.test.ts src/api/backofficeRealData.test.ts src/pages/admin/TechnicianRankingPage.test.tsx src/pages/admin/masterDataPages.test.ts`

- [ ] **Step 3: Run full backend verification**

Run: `npm --prefix backend run lint && npm --prefix backend test -- --runInBand && npm --prefix backend run build`

- [ ] **Step 4: Run full frontend verification**

Run: `npm run lint && npm test && npm run build`

- [ ] **Step 5: Run local acceptance**

Start or reuse the formal local services, sign in through the operations entry, open `/admin/technicians?module=ranking`, exercise each period, all three sorts, search, shop/city filters, pagination, CSV export, error retry, empty state, and row detail. Capture and inspect desktop and narrow screenshots; verify the request path and response data in the running page.
