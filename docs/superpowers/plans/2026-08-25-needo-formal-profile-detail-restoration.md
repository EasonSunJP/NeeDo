# NeeDo Formal Profile Detail Restoration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore the complete customer, employee, and technician detail drawers from the approved design while sourcing every displayed value from scoped, audited production APIs.

**Architecture:** Keep paginated list APIs lightweight, add one detail read per selected record, and aggregate existing Prisma records in the backoffice repository behind the current Route → Controller → Service → Repository layers. Platform and merchant pages share typed React detail panels; merchant reads are always constrained to the authenticated shop. Metrics without a formal data contract render an explicit unavailable state instead of a computed or persisted mock.

**Tech Stack:** Node.js 22, Express, TypeScript strict, Prisma/MySQL, Zod, Jest/Supertest, React 19, Vite 7, Vitest, existing NeeDo Tailwind utilities, Drawer/Tabs/DetailGrid, and the approved contact event timeline.

## Global constraints

- Execute only this Step 12 restoration; do not change Prisma schema, generate a migration, add mock/demo data, or refactor unrelated navigation.
- Preserve all unrelated dirty-worktree changes. Stage and commit only files listed by each task.
- Never expose `passwordHash`, token, OTP, cross-shop booking data, or a role/identity outside the authenticated scope.
- Keep list endpoints paginated. Detail endpoints are fetched only after the user opens a row.
- Controllers only validate and translate HTTP; business rules stay in the service and Prisma access stays in the repository.
- All detail reads use the existing positive-ID Zod validator, JWT, granular read permission, OpenAPI, uniform envelopes, and audit logging.
- Use only existing formal records. Missing acceptance-rate, lateness, and shift-preference contracts render `尚未接入正式数据`.
- Keep existing update, approval, and soft-delete actions on their current pages; successful writes reload both the list and the open detail.
- Use test-driven development for every task and run the focused RED test before production code.

---

### Task 1: Define formal detail payloads and repository aggregation

**Files:**
- Modify: `backend/src/services/backoffice.service.ts`
- Modify: `backend/src/repositories/backoffice.repository.ts`
- Create: `backend/tests/backoffice-profile-detail-repository.test.ts`

**Interfaces:**
- Produces: `BackofficeAccountPayload`, `BackofficeRolePayload`, `BackofficeIdentityPayload`, `BackofficeReviewSummaryPayload`, `BackofficeAuditEventPayload`, `BackofficeTechnicianDetailPayload`, and `BackofficeCustomerDetailPayload`.
- Produces repository methods: `getTechnicianDetail(input: ScopedEntityInput)` and `getCustomerDetail(input: ScopedEntityInput)`.
- Keeps `BackofficeTechnicianPayload` and `BackofficeCustomerPayload` unchanged for list responses.

- [ ] **Step 1: Write a failing repository contract test for technician details**

Create a typed Prisma test double covering `technicianProfile.findFirst`, `bookingOrder.groupBy`/`aggregate`, `scheduleSlot.findMany`, `technicianService.findMany`, `service.findMany`, `technicianCompensationProfile.findFirst`, and `auditLog.findMany`.

```ts
it("maps only formal technician detail records inside merchant scope", async () => {
  const detail = await repository.getTechnicianDetail({
    scope: "merchant",
    shopId: 11,
    id: 31
  });

  expect(client.technicianProfile.findFirst).toHaveBeenCalledWith(
    expect.objectContaining({ where: { id: 31, shopId: 11, deletedAt: null } })
  );
  expect(detail).toMatchObject({
    id: 31,
    account: { email: "technician@example.com", isActive: true },
    statistics: { bookingCount: 3, completedCount: 2, completedRevenueJpy: 18000 },
    reviewSummary: { ratingAverage: 4.8, reviewCount: 12 },
    unavailableMetrics: ["acceptanceRate", "lateness", "shiftPreferences"]
  });
});
```

- [ ] **Step 2: Write failing customer scope and empty-state tests**

```ts
it("limits merchant customer bookings, totals, roles, identities, and timeline to its shop", async () => {
  const detail = await repository.getCustomerDetail({ scope: "merchant", shopId: 11, id: 41 });

  expect(client.bookingOrder.findMany).toHaveBeenCalledWith(
    expect.objectContaining({ where: expect.objectContaining({ customerUserId: 51, shopId: 11 }) })
  );
  expect(detail?.recentBookings).toHaveLength(2);
  expect(detail?.account.roles).toEqual([
    expect.objectContaining({ scopeType: "shop", scopeId: 11 })
  ]);
});

it("returns null formal sections without inventing compensation, reviews, or schedule", async () => {
  expect(detail).toMatchObject({
    compensationProfile: null,
    reviewSummary: null,
    upcomingSchedule: []
  });
});
```

- [ ] **Step 3: Run the focused repository test and verify RED**

Run: `cd backend && npm test -- --runTestsByPath tests/backoffice-profile-detail-repository.test.ts`

Expected: FAIL because the detail payloads and repository methods do not exist.

- [ ] **Step 4: Add exact response contracts without changing list contracts**

Use these public shapes as the source of truth:

```ts
export interface BackofficeAccountPayload {
  username: string;
  email: string;
  phone: string | null;
  avatarUrl: string | null;
  isActive: boolean;
  lastLoginAt: string | null;
  roles: BackofficeRolePayload[];
  identities: BackofficeIdentityPayload[];
}

export interface BackofficeAuditEventPayload {
  id: string;
  action: string;
  actorName: string;
  actorAvatarUrl: string | null;
  createdAt: string;
  metadata: Record<string, unknown> | null;
}

export interface BackofficeTechnicianDetailPayload extends BackofficeTechnicianPayload {
  bio: string | null;
  yearsExperience: number;
  isRecommended: boolean;
  updatedAt: string;
  account: BackofficeAccountPayload;
  statistics: {
    bookingCount: number;
    completedCount: number;
    cancelledCount: number;
    completedRevenueJpy: number;
    todayScheduleMinutes: number;
    weekScheduleMinutes: number;
    monthScheduleMinutes: number;
  };
  reviewSummary: BackofficeReviewSummaryPayload | null;
  services: BackofficeTechnicianServiceDetailPayload[];
  upcomingSchedule: BackofficeScheduleSlotPayload[];
  compensationProfile: BackofficeCompensationProfilePayload | null;
  timeline: BackofficeAuditEventPayload[];
  unavailableMetrics: Array<"acceptanceRate" | "lateness" | "shiftPreferences">;
}
```

`BackofficeCustomerDetailPayload` extends the list item with `bio`, `updatedAt`, `account`, booking status totals, completed spend, next booking, ten most recent bookings, optional review summary, and scoped timeline.

- [ ] **Step 5: Implement bounded, scoped repository reads**

Implementation rules:

- Verify the profile first with `deletedAt: null` and merchant `shopId` when applicable.
- Select account fields explicitly; never select `passwordHash`.
- Filter `UserRole` and `UserIdentity` to active, non-deleted records. Platform may return all scopes; merchant returns the current shop scope plus the identity required to represent that selected profile.
- Aggregate `BookingOrder` by status and completed amount using `deletedAt: null`; merchant queries include `shopId`.
- Read schedule slots overlapping the current UTC month, then calculate day/week/month minutes from actual interval intersections. Return at most twelve future slots.
- Read active, non-deleted `TechnicianService` plus directly assigned legacy `Service`, normalize and deduplicate by source/record ID, and return bounded fields only.
- Select the current active, non-deleted compensation profile or `null`.
- Read at most thirty audit rows addressed to the profile/user through real `targetType`/`targetId` or existing metadata IDs, include the actor display name/avatar, and merge real created/verified timestamps only when they add a distinct event.
- Return optional `ReviewSummary` data exactly as stored; no individual reviews exist in the current schema.

- [ ] **Step 6: Verify repository GREEN and typecheck**

Run: `cd backend && npm test -- --runTestsByPath tests/backoffice-profile-detail-repository.test.ts tests/backoffice-repository-search.test.ts`

Expected: PASS.

Run: `cd backend && npm run build`

Expected: TypeScript build succeeds.

- [ ] **Step 7: Commit Task 1 only**

```bash
git add backend/src/services/backoffice.service.ts backend/src/repositories/backoffice.repository.ts backend/tests/backoffice-profile-detail-repository.test.ts
git commit -m "feat: aggregate formal profile details"
```

### Task 2: Expose audited technician and customer detail APIs

**Files:**
- Modify: `backend/src/services/backoffice.service.ts`
- Modify: `backend/src/controllers/backoffice.controller.ts`
- Modify: `backend/src/routes/backoffice.routes.ts`
- Modify carefully: `backend/src/api/openapi.ts`
- Modify: `backend/tests/master-data-api.test.ts`
- Modify carefully: `backend/tests/openapi.test.ts`

**Interfaces:**
- Produces `GET /api/v1/backoffice/technicians/:id`.
- Produces `GET /api/v1/merchant-admin/technicians/:id`.
- Enriches the existing platform and merchant customer detail GET responses.
- Reuses existing read permissions and `backofficeEntityIdParamSchema`.

- [ ] **Step 1: Add failing Supertest cases for four detail paths**

```ts
it("reads platform and authenticated-shop profile details", async () => {
  await request(app)
    .get("/api/v1/backoffice/technicians/31")
    .set("Authorization", `Bearer ${adminToken}`)
    .expect(200)
    .expect((response) => expect(response.body.data.account.email).toBe("technician@example.com"));

  await request(app)
    .get("/api/v1/merchant-admin/customers/41")
    .set("Authorization", `Bearer ${merchantToken}`)
    .expect(200);

  expect(repository.getCustomerDetail).toHaveBeenCalledWith({
    scope: "merchant",
    shopId: 11,
    id: 41
  });
});
```

Also assert missing records return the uniform not-found code and insufficient permission returns `403` before the repository call.

- [ ] **Step 2: Run the API test and verify RED**

Run: `cd backend && npm test -- --runTestsByPath tests/master-data-api.test.ts`

Expected: FAIL because technician GET routes and detail repository methods are not wired.

- [ ] **Step 3: Implement service, controller, and route wiring**

Add `getPlatformTechnician` and `getMerchantTechnician`. Each method records a read audit action and calls `requireResult`. Update both customer methods to call `getCustomerDetail` and retain their existing audit behavior.

Register GET before PATCH on both technician paths:

```ts
router.get(
  "/backoffice/technicians/:id",
  authenticate(),
  authorize(BACKOFFICE_ROUTE_PERMISSIONS.technicians),
  validateRequest({ params: backofficeEntityIdParamSchema }),
  controller.platformTechnician
);
```

Use the equivalent authenticated-shop route and permission for merchant admin.

- [ ] **Step 4: Document schemas and GET operations in OpenAPI**

Add reusable component schemas for account, role, identity, audit event, technician detail, customer detail, service detail, schedule summary, compensation, and booking summary. Add GET operations alongside the existing PATCH/DELETE operations without overwriting them.

Because `backend/src/api/openapi.ts` and `backend/tests/openapi.test.ts` already contain unrelated user changes, inspect `git diff --` before and after editing and preserve every pre-existing hunk.

- [ ] **Step 5: Verify API/OpenAPI GREEN**

Run: `cd backend && npm test -- --runTestsByPath tests/master-data-api.test.ts tests/openapi.test.ts`

Expected: PASS and both technician paths expose GET plus the existing writes.

- [ ] **Step 6: Commit Task 2 only**

```bash
git add backend/src/services/backoffice.service.ts backend/src/controllers/backoffice.controller.ts backend/src/routes/backoffice.routes.ts backend/src/api/openapi.ts backend/tests/master-data-api.test.ts backend/tests/openapi.test.ts
git commit -m "feat: expose formal profile detail APIs"
```

### Task 3: Add typed frontend detail adapters

**Files:**
- Modify: `src/api/backofficeRealData.ts`
- Modify: `src/api/backofficeRealData.test.ts`

**Interfaces:**
- Mirrors backend detail response types without importing backend modules.
- Produces `technician(scope, id)` and `customer(scope, id)` methods.
- Keeps `technicians(scope, query)` and `customers(scope, query)` as paginated list methods.

- [ ] **Step 1: Write failing adapter tests for all four URLs**

```ts
it("loads selected technician and customer detail by API scope", async () => {
  await api.technician("backoffice", 31);
  await api.technician("merchant-admin", 31);
  await api.customer("backoffice", 41);
  await api.customer("merchant-admin", 41);

  expect(httpClient.request).toHaveBeenNthCalledWith(1, "/backoffice/technicians/31");
  expect(httpClient.request).toHaveBeenNthCalledWith(2, "/merchant-admin/technicians/31");
  expect(httpClient.request).toHaveBeenNthCalledWith(3, "/backoffice/customers/41");
  expect(httpClient.request).toHaveBeenNthCalledWith(4, "/merchant-admin/customers/41");
});
```

- [ ] **Step 2: Run the focused frontend test and verify RED**

Run: `npm test -- src/api/backofficeRealData.test.ts`

Expected: FAIL because `technician` and `customer` are absent.

- [ ] **Step 3: Add exact types and request methods**

Do not transform missing fields, infer values from IDs, import demo entities, or read local storage. Return the formal response as typed by the API contract.

- [ ] **Step 4: Verify adapter GREEN**

Run: `npm test -- src/api/backofficeRealData.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit Task 3 only**

```bash
git add src/api/backofficeRealData.ts src/api/backofficeRealData.test.ts
git commit -m "feat: add formal profile detail adapters"
```

### Task 4: Build shared formal detail panels

**Files:**
- Create: `src/components/admin/FormalProfileDetailPanels.tsx`
- Create: `src/components/admin/FormalProfileDetailPanels.test.tsx`
- Modify: `src/components/mobile/ContactEventTimeline.tsx`
- Create or modify: `src/components/mobile/ContactEventTimeline.test.tsx`

**Interfaces:**
- Produces `FormalTechnicianDetailPanel` with seven approved tabs.
- Produces `FormalCustomerDetailPanel` with four approved tabs.
- Adds `showCommentComposer?: boolean` to `ContactEventTimeline`, defaulting to `true` for existing consumers.
- Accepts `editContent?: ReactNode` and `actionContent?: ReactNode` so page-owned writes remain on the page.

- [ ] **Step 1: Write failing render tests for the approved information architecture**

```tsx
it("renders all seven formal technician tabs without inferred metrics", async () => {
  render(<FormalTechnicianDetailPanel detail={technicianDetail} />);
  for (const label of [
    "基础资料",
    "状态与数据",
    "技能与服务",
    "排班偏好",
    "薪酬设置",
    "权限与账号",
    "时间线"
  ]) {
    expect(screen.getByRole("tab", { name: label })).toBeInTheDocument();
  }
  expect(screen.getByText("尚未接入正式数据")).toBeInTheDocument();
});

it("renders four formal customer tabs", () => {
  render(<FormalCustomerDetailPanel detail={customerDetail} />);
  for (const label of ["基础资料", "预约与消费", "权限与账号", "时间线"]) {
    expect(screen.getByRole("tab", { name: label })).toBeInTheDocument();
  }
});
```

- [ ] **Step 2: Write a failing timeline test for audit-only mode**

Assert `showCommentComposer={false}` renders existing events and no comment button or local comment form. Also keep a regression assertion that the default mode still shows the composer.

- [ ] **Step 3: Run the component tests and verify RED**

Run: `npm test -- src/components/admin/FormalProfileDetailPanels.test.tsx src/components/mobile/ContactEventTimeline.test.tsx`

Expected: FAIL because the panels and audit-only prop do not exist.

- [ ] **Step 4: Implement the shared panels**

Visual contract:

- Header: avatar, status badges, display name, profile/account ID, shop/city, rating summary.
- Tabs: horizontally scrollable at narrow widths, keyboard-accessible through the existing Tabs component.
- Body: existing paper/line/moss tokens, section cards, `DetailGrid`, concise table/list rows, and no fixed viewport width.
- Technician tabs show formal schedule totals, booking totals, review summary, active services, upcoming schedule, optional compensation, scoped account/role/identity data, and audit events.
- Customer tabs show formal profile editing slot, booking/spend summary, recent/next booking, scoped account/role/identity data, and audit events.
- Explicit unavailable cards replace acceptance rate, lateness, and shift preferences.
- Timeline maps formal audit actions to `ContactEventTimelineEntry` and passes `showCommentComposer={false}`.

- [ ] **Step 5: Verify component GREEN and no fake dependency**

Run: `npm test -- src/components/admin/FormalProfileDetailPanels.test.tsx src/components/mobile/ContactEventTimeline.test.tsx`

Expected: PASS.

Run: `rg -n "mock|Math\\.random|localStorage|sessionStorage" src/components/admin/FormalProfileDetailPanels.tsx`

Expected: no matches.

- [ ] **Step 6: Commit Task 4 only**

```bash
git add src/components/admin/FormalProfileDetailPanels.tsx src/components/admin/FormalProfileDetailPanels.test.tsx src/components/mobile/ContactEventTimeline.tsx src/components/mobile/ContactEventTimeline.test.tsx
git commit -m "feat: add formal profile detail panels"
```

### Task 5: Wire merchant and platform pages with loading, retry, and refresh

**Files:**
- Modify: `src/pages/merchant-admin/MerchantAdminPeoplePage.tsx`
- Modify: `src/pages/merchant-admin/MerchantAdminPeoplePage.test.ts`
- Modify: `src/pages/admin/TechniciansPage.tsx`
- Modify: `src/pages/admin/UsersPage.tsx`
- Modify carefully: `src/pages/admin/masterDataPages.test.ts`

**Behavior:**
- Row selection opens the drawer immediately and requests the selected formal detail.
- The drawer never renders list data as a fake fallback.
- Loading, error, retry, and stale-request protection are shared in behavior even if page state remains local.
- Successful update/approval reloads the list and current detail; delete closes the drawer.

- [ ] **Step 1: Add failing page contract tests**

Assert each page calls the new detail adapter and renders the shared panel. Preserve the existing assertions that prevent merchant demo data and supported write endpoints.

```ts
expect(merchantSource).toContain('backofficeRealDataApi.technician("merchant-admin"');
expect(merchantSource).toContain('backofficeRealDataApi.customer("merchant-admin"');
expect(technicianSource).toContain('backofficeRealDataApi.technician("backoffice"');
expect(userSource).toContain('backofficeRealDataApi.customer("backoffice"');
expect(merchantSource).toContain("FormalTechnicianDetailPanel");
expect(merchantSource).toContain("FormalCustomerDetailPanel");
```

Add an interactive component/page test if source contracts cannot prove that retry calls the same selected ID and stale requests cannot replace a newer selection.

- [ ] **Step 2: Run page tests and verify RED**

Run: `npm test -- src/pages/merchant-admin/MerchantAdminPeoplePage.test.ts src/pages/admin/masterDataPages.test.ts`

Expected: FAIL because pages still render `DetailGrid`-only drawers.

- [ ] **Step 3: Wire merchant employee and customer drawers**

Maintain separate `selectedTechnicianId`/`selectedCustomerId`, detail, loading, and detail-error state. Scope calls with `merchant-admin`. Preserve the current update/approve/delete buttons by passing page-owned form/action nodes into the corresponding panel.

- [ ] **Step 4: Wire operations technician and customer drawers**

Use the same panels with `backoffice` detail calls. Keep the existing list, search, metrics, store selection, and write APIs unchanged.

- [ ] **Step 5: Add robust request lifecycle behavior**

- Clear old detail before each selected-ID fetch.
- Keep the drawer open on error and render error text plus `重试`.
- Ignore a response if the selected ID changed or the component unmounted.
- On successful writes, await list reload and then detail reload.
- On `404`/`403`, do not fall back to the lightweight list row.

- [ ] **Step 6: Verify page GREEN**

Run: `npm test -- src/pages/merchant-admin/MerchantAdminPeoplePage.test.ts src/pages/admin/masterDataPages.test.ts src/api/backofficeRealData.test.ts src/components/admin/FormalProfileDetailPanels.test.tsx`

Expected: PASS.

- [ ] **Step 7: Commit Task 5 only**

```bash
git add src/pages/merchant-admin/MerchantAdminPeoplePage.tsx src/pages/merchant-admin/MerchantAdminPeoplePage.test.ts src/pages/admin/TechniciansPage.tsx src/pages/admin/UsersPage.tsx src/pages/admin/masterDataPages.test.ts
git commit -m "feat: restore complete people detail drawers"
```

### Task 6: Documentation, regression verification, and visual QA

**Files:**
- Modify carefully: `docs/backoffice-real-data.md`
- No production file changes unless a failing check reveals an in-scope defect.

- [ ] **Step 1: Document the formal detail contracts**

Add all four detail URLs, list-vs-detail loading behavior, merchant scope rule, available formal fields, unavailable-field handling, and the prohibition on list-row/mock fallback. Preserve the unrelated in-progress documentation changes already present in this file.

- [ ] **Step 2: Run backend focused and full checks**

Run: `cd backend && npm test -- --runTestsByPath tests/backoffice-profile-detail-repository.test.ts tests/master-data-api.test.ts tests/openapi.test.ts`

Expected: PASS.

Run: `cd backend && npm run lint && npm test && npm run build`

Expected: all commands exit `0`.

- [ ] **Step 3: Run frontend focused and full checks**

Run: `npm test -- src/api/backofficeRealData.test.ts src/components/admin/FormalProfileDetailPanels.test.tsx src/components/mobile/ContactEventTimeline.test.tsx src/pages/merchant-admin/MerchantAdminPeoplePage.test.ts src/pages/admin/masterDataPages.test.ts`

Expected: PASS.

Run: `npm run lint && npm test && npm run build`

Expected: all commands exit `0`.

- [ ] **Step 4: Inspect for forbidden implementation patterns**

Run:

```bash
rg -n "TODO|FIXME|not implemented|Math\\.random|localStorage|sessionStorage" \
  backend/src/services/backoffice.service.ts \
  backend/src/repositories/backoffice.repository.ts \
  src/api/backofficeRealData.ts \
  src/components/admin/FormalProfileDetailPanels.tsx \
  src/pages/merchant-admin/MerchantAdminPeoplePage.tsx \
  src/pages/admin/TechniciansPage.tsx \
  src/pages/admin/UsersPage.tsx
```

Expected: no newly introduced forbidden matches.

- [ ] **Step 5: Perform real browser QA**

Follow the `webapp-testing` skill and use the running formal frontend/backend or the skill's server helper. Verify with real authenticated records:

1. Merchant employee list opens one technician with all seven tabs.
2. Merchant user management opens one customer with all four tabs.
3. Operations technician and customer lists show the same shared structure.
4. Every displayed metric corresponds to the network detail response.
5. Missing formal contracts display `尚未接入正式数据`.
6. At desktop width and approximately 390px, tabs scroll, content does not overflow, close works, and retry remains usable.
7. Save/approve reloads the open detail; merchant responses contain no other-shop bookings, roles, or identities.

Capture screenshots for desktop and narrow views and inspect them visually before completion.

- [ ] **Step 6: Review the exact diff and worktree isolation**

Run: `git diff --check`

Run: `git status --short`

Run `git diff -- <file>` for every pre-dirty file touched (`backend/src/api/openapi.ts`, `backend/tests/openapi.test.ts`, `src/pages/admin/masterDataPages.test.ts`, `docs/backoffice-real-data.md`) and confirm unrelated hunks remain intact.

- [ ] **Step 7: Commit Task 6 only**

```bash
git add docs/backoffice-real-data.md
git commit -m "docs: document formal profile detail APIs"
```

- [ ] **Step 8: Final self-review before reporting completion**

Confirm that the original issue is solved by inspected runtime evidence, not only source tests: both customer and technician drawers must show the approved information architecture, formal data must be fetched after selection, and unavailable formal fields must never be represented as real statistics.
