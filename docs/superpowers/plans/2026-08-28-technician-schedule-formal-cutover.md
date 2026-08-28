# Technician Schedule Formal Cutover Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the remaining authenticated technician schedule and order-detail browser workflows with identity-scoped `/api/v1/` data and persisted MySQL mutations.

**Architecture:** Add one technician-owned single-slot read endpoint to the existing Booking route/service/repository stack. Build a small frontend formal-resource layer and shared 15-minute range editor, then replace the legacy technician route module with numeric slot/order pages that use the existing formal schedule and Booking APIs. Keep shift transfer as an explicit capability gate until its own server-side state machine exists.

**Tech Stack:** React 19, TypeScript, Vite, Express, Prisma/MySQL, Zod, Swagger/OpenAPI, Jest, Vitest, Testing Library, formal local browser acceptance.

## Global Constraints

- Work only in `codex/technician-schedule-formal-cutover` at `/Users/eason/Documents/New project/.worktrees/technician-schedule-formal-cutover`.
- Execute one task at a time with red-green-refactor TDD and a reviewable commit after each task.
- Do not add a database migration, mock dataset, localStorage key, fallback identity, temporary technician, generated slot, or browser-only success state.
- Active `technician_profile` identity is the only schedule ownership source; clients never select their own technician ID.
- Preserve existing schedule overlap, duration, capacity, suspension, booked-count, audit, and soft-delete rules.
- Preserve the existing formal order state machine and status history; do not add new order transitions.
- Merchant schedule/dispatch, scheduling feedback/templates, smart scheduling, and shift transfer persistence are out of scope.
- All loading, empty, not-found, permission, conflict, in-use, and retry states must be explicit and must not fall back to legacy records.
- User-visible copy must use the existing translation helper or existing translated primitives.
- Every list remains paginated; bounded frontend aggregation may load all pages only within the existing maximum 93-day window.

---

## File Structure

- Modify `backend/src/repositories/booking.repository.ts`: add an identity-scoped single-slot repository read.
- Modify `backend/src/services/booking.service.ts`: derive technician scope and map a missing owned slot to safe not-found.
- Modify `backend/src/controllers/booking.controller.ts`: expose the read-only controller method.
- Modify `backend/src/routes/booking.routes.ts`: register the protected numeric detail route.
- Modify `backend/src/api/openapi.ts`: document the endpoint, path parameter, security, and responses.
- Modify `backend/tests/booking-repository-scope.test.ts`, `backend/tests/booking-service.test.ts`, `backend/tests/schedule-api.test.ts`, and `backend/tests/openapi.test.ts`: prove ownership, errors, and contract.
- Modify `src/features/scheduling/api.ts` and `src/features/scheduling/api.test.ts`: add formal single-slot loading.
- Create `src/features/technician-schedule/formal-resource.tsx`: validate route IDs, resolve the active technician/shop, exhaust technician services, and expose retryable slot/order resources.
- Create `src/features/technician-schedule/formal-resource.test.tsx`: verify success/failure/retry and no fallback.
- Create `src/features/technician-schedule/FormalScheduleRangeEditor.tsx`: shared 15-minute timeline draft editor using `ScheduleDraftRangeBlock`.
- Create `src/features/technician-schedule/FormalScheduleRangeEditor.test.tsx`: verify snapping, handles, movement, and validation.
- Replace `src/features/technician-schedule/route-pages.tsx`: formal schedule detail/editor, transfer capability gate, and formal technician order detail.
- Create `src/features/technician-schedule/route-pages.formal.test.tsx`: route loading, persistence, transitions, and errors.
- Modify `src/components/scheduling/FormalScheduleInventoryPanel.tsx` and its test: exhaust pagination and link numeric rows.
- Modify `src/components/technician/FormalTechnicianOrdersPanel.tsx` and add a focused test: exhaust pagination and link numeric orders.
- Modify `src/data/mockRetirement.test.ts` and `docs/MOCK_RETIREMENT_MAP.md`: make this accepted boundary permanent.

---

### Task 1: Identity-Scoped Technician Schedule Slot Read

**Files:**
- Modify: `backend/src/repositories/booking.repository.ts`
- Modify: `backend/src/services/booking.service.ts`
- Modify: `backend/src/controllers/booking.controller.ts`
- Modify: `backend/src/routes/booking.routes.ts`
- Modify: `backend/src/api/openapi.ts`
- Test: `backend/tests/booking-repository-scope.test.ts`
- Test: `backend/tests/booking-service.test.ts`
- Test: `backend/tests/schedule-api.test.ts`
- Test: `backend/tests/openapi.test.ts`

**Interfaces:**
- Consumes: authenticated `currentIdentity.scopeType` / `scopeId`, existing `ScheduleSlotPayload`, `orderIdParamSchema`, and `schedule:slots:list` permission.
- Produces: `BookingRepositoryPort.findScheduleSlotById(input: ScheduleSlotReadInput)` and `GET /api/v1/technician/schedule/slots/:id`.

- [ ] **Step 1: Write failing repository and service tests**

Add the repository expectation:

```ts
it("reads only a schedule slot owned by the active technician scope", async () => {
  scheduleSlot.findFirst.mockResolvedValue(slotRecord);

  await repository.findScheduleSlotById({
    scope: "technician",
    technicianProfileId: 31,
    id: 10
  });

  expect(scheduleSlot.findFirst).toHaveBeenCalledWith({
    where: { id: 10, technicianProfileId: 31, deletedAt: null },
    include: expect.any(Object)
  });
});
```

Add service cases:

```ts
it("derives technician scope for a single schedule slot", async () => {
  repository.findScheduleSlotById.mockResolvedValue(slot);

  await expect(service.getScheduleSlot(technicianActor, 10)).resolves.toEqual(slot);
  expect(repository.findScheduleSlotById).toHaveBeenCalledWith({
    scope: "technician",
    technicianProfileId: 31,
    id: 10
  });
});

it("returns the safe not-found error for an inaccessible schedule slot", async () => {
  repository.findScheduleSlotById.mockResolvedValue(null);

  await expect(service.getScheduleSlot(technicianActor, 99)).rejects.toMatchObject({
    statusCode: 404,
    message: "error.schedule.slot_not_found"
  });
});
```

- [ ] **Step 2: Run the focused tests and verify RED**

Run:

```bash
cd backend
npm test -- booking-repository-scope.test.ts booking-service.test.ts
```

Expected: FAIL because `ScheduleSlotReadInput`, `findScheduleSlotById`, and `getScheduleSlot` do not exist.

- [ ] **Step 3: Implement repository and service ownership**

Add the exact repository contract:

```ts
export type ScheduleSlotReadInput = ScheduleScope & { id: number };

export interface BookingRepositoryPort {
  findScheduleSlotById: (input: ScheduleSlotReadInput) => Promise<ScheduleSlotPayload | null>;
}
```

Implement the query:

```ts
public async findScheduleSlotById(input: ScheduleSlotReadInput): Promise<ScheduleSlotPayload | null> {
  const slot = await this.client.scheduleSlot.findFirst({
    where: {
      id: input.id,
      deletedAt: null,
      ...this.scheduleScopeWhere(input)
    },
    include: this.slotInclude()
  });
  return slot ? this.mapSlot(slot) : null;
}
```

Add the service method:

```ts
public async getScheduleSlot(
  actor: AuthenticatedAccessContext,
  id: number
): Promise<ScheduleSlotPayload> {
  const slot = await this.repository.findScheduleSlotById({
    ...this.getScheduleScope(actor),
    id
  });
  if (!slot) {
    throw new AppError({
      code: ERROR_CODES.NOT_FOUND,
      message: "error.schedule.slot_not_found",
      statusCode: 404
    });
  }
  return slot;
}
```

- [ ] **Step 4: Write failing API and OpenAPI tests**

Extend the schedule API fixture with `findScheduleSlotById` and add:

```ts
it("reads a numeric technician schedule slot through authenticated scope", async () => {
  const fixture = await createFixture();
  const token = await fixture.login("technician@example.com");

  await request(fixture.app)
    .get("/api/v1/technician/schedule/slots/10")
    .set("Authorization", `Bearer ${token}`)
    .expect(200)
    .expect((response) => expect(response.body.data.id).toBe(10));

  expect(fixture.bookingRepository.findScheduleSlotById).toHaveBeenCalledWith({
    scope: "technician",
    technicianProfileId: 31,
    id: 10
  });
});
```

Also assert malformed ID returns 400, a repository `null` returns 404, and a token without `schedule:slots:list` returns 403. In `openapi.test.ts`, assert `/api/v1/technician/schedule/slots/{id}` has `get.security`, numeric path parameter, `200`, `400`, `401`, `403`, and `404` responses.

- [ ] **Step 5: Run API tests and verify RED**

Run:

```bash
cd backend
npm test -- schedule-api.test.ts openapi.test.ts
```

Expected: FAIL because the GET route and OpenAPI operation are absent.

- [ ] **Step 6: Implement controller, route, and OpenAPI**

Add:

```ts
public getScheduleSlot = async (request: Request, response: Response, next: NextFunction): Promise<void> => {
  try {
    response.status(200).json(successResponse(
      await this.bookingService.getScheduleSlot(
        getAuthenticatedAccess(response),
        this.getOrderId(request)
      )
    ));
  } catch (error) {
    next(error);
  }
};
```

Register only the technician read route before the shared mutation loop:

```ts
router.get(
  "/technician/schedule/slots/:id",
  authenticate(),
  authorize(BOOKING_ROUTE_PERMISSIONS.scheduleList),
  validateRequest({ params: orderIdParamSchema }),
  controller.getScheduleSlot
);
```

Document it in the existing `/technician/schedule/slots/{id}` path object without changing PATCH/DELETE semantics.

- [ ] **Step 7: Verify backend task**

Run:

```bash
cd backend
npm test -- booking-repository-scope.test.ts booking-service.test.ts schedule-api.test.ts openapi.test.ts
npm run lint
npm run build
```

Expected: all commands PASS.

- [ ] **Step 8: Commit**

```bash
git add backend/src/repositories/booking.repository.ts backend/src/services/booking.service.ts backend/src/controllers/booking.controller.ts backend/src/routes/booking.routes.ts backend/src/api/openapi.ts backend/tests/booking-repository-scope.test.ts backend/tests/booking-service.test.ts backend/tests/schedule-api.test.ts backend/tests/openapi.test.ts
git commit -m "feat: read technician-owned schedule slots"
```

---

### Task 2: Formal Technician Schedule Resources

**Files:**
- Modify: `src/features/scheduling/api.ts`
- Modify: `src/features/scheduling/api.test.ts`
- Create: `src/features/technician-schedule/formal-resource.tsx`
- Create: `src/features/technician-schedule/formal-resource.test.tsx`

**Interfaces:**
- Consumes: `AuthSession`, `coreReadApi.getTechnicianDetail`, `pricingModeApi.listTechnicianServices`, `schedulingApi.getSlot`, and `bookingApi.getOrder`.
- Produces: `schedulingApi.getTechnicianSlot`, `parsePositiveRouteId`, `getActiveTechnicianProfileId`, `loadAllTechnicianServices`, `useFormalTechnicianScheduleResource`, and `useFormalTechnicianOrderResource`.

- [ ] **Step 1: Write failing API serialization test**

```ts
it("loads one technician-owned schedule slot", async () => {
  await schedulingApi.getTechnicianSlot(17);

  expect(httpClient.request).toHaveBeenCalledWith(
    "/technician/schedule/slots/17"
  );
});
```

- [ ] **Step 2: Run the API test and verify RED**

Run:

```bash
npm test -- src/features/scheduling/api.test.ts
```

Expected: FAIL because `getTechnicianSlot` is absent.

- [ ] **Step 3: Add the formal API method**

```ts
getTechnicianSlot(id: number) {
  return httpClient.request<BookingScheduleSlot>(`/technician/schedule/slots/${id}`);
},
```

- [ ] **Step 4: Write failing resource tests**

Cover these exact behaviors:

```ts
expect(parsePositiveRouteId("17")).toBe(17);
expect(parsePositiveRouteId("slot-17")).toBeNull();
expect(getActiveTechnicianProfileId(technicianSession)).toBe(31);
expect(getActiveTechnicianProfileId(customerSession)).toBeNull();
```

Mock two pages of technician services and assert `loadAllTechnicianServices(shopId)` requests page 1 and page 2 exactly once, returns only active/bookable services, and sorts by `sortOrder`, then `id`. Render each hook and verify:

- loading becomes success with the formal slot/order;
- a rejected API call yields error with no data;
- calling `retry()` repeats the formal request;
- missing technician identity does not call Core Read, pricing, slot, or order APIs.

- [ ] **Step 5: Run resource tests and verify RED**

Run:

```bash
npm test -- src/features/technician-schedule/formal-resource.test.tsx
```

Expected: FAIL because the formal resource module does not exist.

- [ ] **Step 6: Implement resource functions and hooks**

Use these exact public types:

```ts
export type FormalTechnicianScheduleContext = {
  profile: CoreTechnicianDetail;
  shopId: number;
  services: TechnicianServicePayload[];
  slot: BookingScheduleSlot | null;
};

export type FormalResourceState<T> = {
  data: T | null;
  error: string | null;
  loading: boolean;
  retry: () => void;
};
```

Implement pagination with `pageSize=100` and `Math.ceil(total / page_size)`. `getActiveTechnicianProfileId` must require `session.portal === "technician"`, `currentIdentity.type === "technician"`, `scopeType === "technician_profile"`, and a positive integer `scopeId`.

`useFormalTechnicianScheduleResource(session, slotId)` loads profile, rejects a missing `profile.shop`, loads all active/bookable services, and optionally loads `schedulingApi.getTechnicianSlot(slotId)`. `useFormalTechnicianOrderResource(session, orderId)` validates the same identity then calls `bookingApi.getOrder(orderId)`. Both hooks use an incrementing revision for retry, cancel state updates after unmount, and normalize `ApiClientError` into stable UI messages.

- [ ] **Step 7: Verify frontend resource task**

Run:

```bash
npm test -- src/features/scheduling/api.test.ts src/features/technician-schedule/formal-resource.test.tsx
npm run lint
```

Expected: all commands PASS.

- [ ] **Step 8: Commit**

```bash
git add src/features/scheduling/api.ts src/features/scheduling/api.test.ts src/features/technician-schedule/formal-resource.tsx src/features/technician-schedule/formal-resource.test.tsx
git commit -m "feat: load formal technician schedule resources"
```

---

### Task 3: Shared 15-Minute Formal Schedule Range Editor

**Files:**
- Create: `src/features/technician-schedule/FormalScheduleRangeEditor.tsx`
- Create: `src/features/technician-schedule/FormalScheduleRangeEditor.test.tsx`

**Interfaces:**
- Consumes: `ScheduleDraftRangeBlock`, a selected service duration, and controlled start/end `Date` values.
- Produces: `FormalScheduleRangeEditor({ startsAt, endsAt, durationMinutes, onChange, disabled })` and pure 15-minute snapping helpers.

- [ ] **Step 1: Write failing pure-helper and interaction tests**

```ts
expect(snapScheduleMinute(7)).toBe(0);
expect(snapScheduleMinute(8)).toBe(15);
expect(clampScheduleRange({ startMinute: -15, endMinute: 30 })).toEqual({
  startMinute: 0,
  endMinute: 30
});
```

Render the editor and assert:

- it has 96 quarter-hour timeline cells;
- the draft block exposes start and end handle labels from `ScheduleDraftRangeBlock`;
- pointer selection snaps to 15 minutes;
- moving the block preserves duration;
- resizing either handle enforces a 15-minute minimum;
- `onChange` receives new `Date` values on the same local date;
- `disabled` prevents every change.

- [ ] **Step 2: Run tests and verify RED**

Run:

```bash
npm test -- src/features/technician-schedule/FormalScheduleRangeEditor.test.tsx
```

Expected: FAIL because the component is absent.

- [ ] **Step 3: Implement snapping and timeline geometry**

Export:

```ts
export const SCHEDULE_INCREMENT_MINUTES = 15;
export const SCHEDULE_DAY_MINUTES = 24 * 60;

export function snapScheduleMinute(value: number): number {
  return Math.max(0, Math.min(
    SCHEDULE_DAY_MINUTES,
    Math.round(value / SCHEDULE_INCREMENT_MINUTES) * SCHEDULE_INCREMENT_MINUTES
  ));
}

export function clampScheduleRange(range: { startMinute: number; endMinute: number }) {
  const startMinute = snapScheduleMinute(range.startMinute);
  const endMinute = Math.max(
    startMinute + SCHEDULE_INCREMENT_MINUTES,
    snapScheduleMinute(range.endMinute)
  );
  return {
    startMinute: Math.min(startMinute, SCHEDULE_DAY_MINUTES - SCHEDULE_INCREMENT_MINUTES),
    endMinute: Math.min(endMinute, SCHEDULE_DAY_MINUTES)
  };
}
```

Render one vertical day timeline, derive pointer minutes from its bounding rectangle, and use pointer capture for selection, block movement, and both resize handles. Position the shared draft block with percentage `top` and `height`. Show the selected time range and the selected service duration; show a validation message when the selected range duration differs from `durationMinutes`.

- [ ] **Step 4: Verify the range editor**

Run:

```bash
npm test -- src/features/technician-schedule/FormalScheduleRangeEditor.test.tsx
npm run lint
```

Expected: all commands PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/technician-schedule/FormalScheduleRangeEditor.tsx src/features/technician-schedule/FormalScheduleRangeEditor.test.tsx
git commit -m "feat: add formal schedule range editor"
```

---

### Task 4: Replace Technician Schedule and Order Detail Routes

**Files:**
- Replace: `src/features/technician-schedule/route-pages.tsx`
- Create: `src/features/technician-schedule/route-pages.formal.test.tsx`

**Interfaces:**
- Consumes: the Task 2 resource hooks, Task 3 range editor, `schedulingApi` mutations, and existing `bookingApi` order mutations.
- Produces: the existing four App exports `TechnicianScheduleEditorRoutePage`, `TechnicianScheduleDetailRoutePage`, `TechnicianScheduleTransferRoutePage`, and `TechnicianOrderDetailRoutePage`, now with formal-only data.

- [ ] **Step 1: Write failing schedule route tests**

Mount the routes with `MemoryRouter` and mocked formal APIs. Verify:

```ts
expect(screen.getByText("正式排班详情")).toBeInTheDocument();
expect(screen.getByText("Aroma 60")).toBeInTheDocument();
expect(screen.getByText("10:00–11:00")).toBeInTheDocument();
```

Add tests for:

- invalid nonnumeric `eventId` shows the safe unavailable state without API calls;
- API failure shows a retry button and no fallback schedule;
- block/restore calls `schedulingApi.updateSlot("technician", id, { status })`;
- delete requires two clicks and then calls `deleteSlot`;
- new mode loads real services and `createSlot`, then navigates to the returned numeric ID;
- edit mode loads the slot and calls `updateSlot` with changed time/capacity;
- conflict and in-use errors remain visible and do not navigate;
- transfer route contains no mutation action and links back to `/technician/schedule`.

- [ ] **Step 2: Write failing formal order-detail tests**

Mock `bookingApi.getOrder` with a complete `statusHistory` and assert the route renders the order number, service, shop, time, payment state, note, and every history row. Add tests that:

- pending order calls `confirmOrder`;
- confirmed order calls `startOrder`;
- in-service order calls `completeOrder`;
- cancel requires two clicks and calls `cancelOrder`;
- returned persisted order replaces the visible state;
- 404 and API failure show safe not-found/retry without imported domain orders.

- [ ] **Step 3: Run route tests and verify RED**

Run:

```bash
npm test -- src/features/technician-schedule/route-pages.formal.test.tsx
```

Expected: FAIL because the current route module still uses browser stores and legacy records.

- [ ] **Step 4: Replace the route module with formal-only pages**

Delete the legacy route implementation in this file. The replacement may keep small local presentation helpers, but its imports must be limited to Auth, router, formal resource/API modules, shared schedule UI, i18n, and UI primitives.

Use positive numeric route IDs:

```ts
const slotId = parsePositiveRouteId(eventId);
const orderIdValue = parsePositiveRouteId(orderId);
```

Editor save payload:

```ts
const payload = {
  technicianServiceId: selectedService.id,
  startsAt,
  endsAt,
  capacity
};

const saved = slotId
  ? await schedulingApi.updateSlot("technician", slotId, { startsAt, endsAt, capacity })
  : await schedulingApi.createSlot("technician", payload);

navigate(`/technician/schedule/events/${saved.id}`);
```

In new mode the service selector contains only active/bookable technician services. In edit mode the persisted slot service is read-only; the route must not convert an existing slot to another service. Disable save unless the range duration exactly equals the persisted or selected service duration, capacity is `1..100`, the start is in the future for new slots, and no mutation is running.

Detail actions must use returned API values. Order actions must use the same transition rules as `FormalTechnicianOrdersPanel`; do not duplicate or invent status transitions.

- [ ] **Step 5: Verify route task**

Run:

```bash
npm test -- src/features/technician-schedule/route-pages.formal.test.tsx src/features/technician-schedule/formal-resource.test.tsx src/features/technician-schedule/FormalScheduleRangeEditor.test.tsx
npm run lint
```

Expected: all commands PASS.

- [ ] **Step 6: Commit**

```bash
git add src/features/technician-schedule/route-pages.tsx src/features/technician-schedule/route-pages.formal.test.tsx
git commit -m "feat: cut technician schedule routes to formal data"
```

---

### Task 5: Exhaust Formal Inventories and Link Numeric Details

**Files:**
- Modify: `src/components/scheduling/FormalScheduleInventoryPanel.tsx`
- Modify: `src/components/scheduling/FormalScheduleInventoryPanel.test.ts`
- Modify: `src/components/technician/FormalTechnicianOrdersPanel.tsx`
- Create: `src/components/technician/FormalTechnicianOrdersPanel.test.tsx`
- Create: `src/features/scheduling/window-loader.ts`
- Create: `src/features/scheduling/window-loader.test.ts`

**Interfaces:**
- Consumes: paginated `schedulingApi.listSlots` and `bookingApi.listOrders`.
- Produces: `loadManagedScheduleWindow(scope, input)` and `loadEveryTechnicianOrder()` with stable ordering and complete pagination.

- [ ] **Step 1: Write failing pagination tests**

For schedule slots, mock 101 total rows and verify page 1 and page 2 are loaded once and returned in `startsAt`, then `id` order. For technician orders, mock 101 total rows and verify stable descending `startsAt`, then `id` order. Reject inconsistent `page_size <= 0` or a response that stops making page progress.

Add component assertions that technician schedule rows link to `/technician/schedule/events/:id` and order rows link to `/technician/orders/:id`.

- [ ] **Step 2: Run tests and verify RED**

Run:

```bash
npm test -- src/features/scheduling/window-loader.test.ts src/components/scheduling/FormalScheduleInventoryPanel.test.ts src/components/technician/FormalTechnicianOrdersPanel.test.tsx
```

Expected: FAIL because both components currently read only page 1 and do not expose numeric detail links.

- [ ] **Step 3: Implement bounded pagination helpers**

Use `pageSize=100`, stop when accumulated length reaches `total`, and guard against repeated page numbers. The schedule helper requires the existing validated `from/to` window. The order helper uses the authenticated actor-scoped `/orders` endpoint and no client-side technician ID.

Replace direct first-page calls in both panels with these helpers. Wrap technician-only detail actions in route links; merchant rendering must not show technician routes.

- [ ] **Step 4: Verify component task**

Run:

```bash
npm test -- src/features/scheduling/window-loader.test.ts src/components/scheduling/FormalScheduleInventoryPanel.test.ts src/components/technician/FormalTechnicianOrdersPanel.test.tsx src/pages/mobile/TechnicianPortalPage.test.tsx
npm run lint
```

Expected: all commands PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/scheduling/window-loader.ts src/features/scheduling/window-loader.test.ts src/components/scheduling/FormalScheduleInventoryPanel.tsx src/components/scheduling/FormalScheduleInventoryPanel.test.ts src/components/technician/FormalTechnicianOrdersPanel.tsx src/components/technician/FormalTechnicianOrdersPanel.test.tsx
git commit -m "feat: link complete technician schedule inventories"
```

---

### Task 6: Permanent Mock-Retirement Guard and Documentation

**Files:**
- Modify: `src/data/mockRetirement.test.ts`
- Modify: `docs/MOCK_RETIREMENT_MAP.md`

**Interfaces:**
- Consumes: the final formal route and panel sources.
- Produces: a permanent build-time failure if browser business stores or fallback records return to the accepted technician slice.

- [ ] **Step 1: Write the failing retirement guard**

Import raw sources for:

- `src/features/technician-schedule/route-pages.tsx`
- `src/features/technician-schedule/formal-resource.tsx`
- `src/components/scheduling/FormalScheduleInventoryPanel.tsx`
- `src/components/technician/FormalTechnicianOrdersPanel.tsx`

Assert none contains:

```ts
/entityStore|scheduleStore|technicianScheduleStore|shiftPlanningStore|dispatch-center\/store|localStorage|customers\[0\]|technicians\[0\]|emptyOrders|formalRuntimeFallbacks/
```

Also assert the route module contains `schedulingApi`, `bookingApi`, numeric route parsing, retry states, and the transfer capability message.

- [ ] **Step 2: Run the guard and verify RED**

Run:

```bash
npm test -- src/data/mockRetirement.test.ts
```

Expected: FAIL until every accepted source is free of the legacy imports and markers.

- [ ] **Step 3: Remove any remaining forbidden imports and update documentation**

Do not weaken the regular expression. Remove forbidden production paths and record:

- the new technician slot GET endpoint;
- numeric schedule and order routes;
- formal create/update/block/restore/delete and order transitions;
- the non-persistent transfer capability gate;
- database, automated, and browser acceptance commands;
- the explicit merchant schedule/dispatch pending boundary.

- [ ] **Step 4: Verify retirement and focused regression**

Run:

```bash
npm test -- src/data/mockRetirement.test.ts src/features/technician-schedule/route-pages.formal.test.tsx src/components/scheduling/FormalScheduleInventoryPanel.test.ts src/components/technician/FormalTechnicianOrdersPanel.test.tsx
git diff --check
```

Expected: all commands PASS.

- [ ] **Step 5: Commit**

```bash
git add src/data/mockRetirement.test.ts docs/MOCK_RETIREMENT_MAP.md
git commit -m "test: retire technician schedule browser data"
```

---

### Task 7: Real Database, Browser, and Merged-Quality Acceptance

**Files:**
- Modify only if acceptance exposes a reproducible defect; every defect requires a failing test before its fix.
- Update `docs/MOCK_RETIREMENT_MAP.md` with exact accepted evidence before the final acceptance commit if evidence text was not already complete.

**Interfaces:**
- Consumes: existing `needo_dev`, seeded technician test accounts, formal backend 3000, and formal frontend 5180 or isolated alternate ports.
- Produces: acceptance evidence for persisted IDs/times, cross-technician isolation, restart behavior, and failure behavior.

- [x] **Step 1: Reconcile both real database datasets**

Run:

```bash
cd backend
ENV_FILE=.env.dev npm run check:future-operations
ENV_FILE=.env.dev npm run check:lifedance-operations
```

Expected: both return `status: "ok"`; future overlap, duplicate, invalid relationship, terminal-state, finance, hold, and review counts remain zero.

- [x] **Step 2: Run focused backend and frontend suites**

Run:

```bash
cd backend
npm test -- booking-repository-scope.test.ts booking-service.test.ts schedule-api.test.ts openapi.test.ts
cd ..
npm test -- src/features/scheduling/api.test.ts src/features/scheduling/window-loader.test.ts src/features/technician-schedule/formal-resource.test.tsx src/features/technician-schedule/FormalScheduleRangeEditor.test.tsx src/features/technician-schedule/route-pages.formal.test.tsx src/components/scheduling/FormalScheduleInventoryPanel.test.ts src/components/technician/FormalTechnicianOrdersPanel.test.tsx src/data/mockRetirement.test.ts
```

Expected: all commands PASS.

- [x] **Step 3: Run complete quality gates**

Run:

```bash
npm test
npm run lint
npm run verify:production-build
cd backend
npm test
npm run lint
npm run build
```

Expected: all commands PASS; production bundle audit passes all formal HTML entries and assets.

- [x] **Step 4: Start isolated formal services and verify readiness**

Use an isolated frontend/backend port pair if 5180/3000 belongs to another task. Verify listeners, `/api/v1/health`, `/api/v1/ready`, frontend HTTP 200, and frontend proxy health before browser interaction. Do not use the root legacy backend script.

- [x] **Step 5: Browser-accept a real technician schedule**

Sign in with an existing seeded technician account. Record the active `s##########` identity and one existing future `ScheduleSlot.id` from the formal API without exposing credentials or tokens.

Verify:

1. `/technician/schedule` lists that exact slot.
2. `/technician/schedule/events/:id` shows the same service, date, start/end time, capacity, booked count, and status.
3. The edit route loads the same values.
4. Create one uniquely timed unbooked test slot through the UI and record its returned numeric ID.
5. Refresh and re-login; the same ID and time remain.
6. Edit, block, restore, and refresh; each server result remains stable.
7. Delete the uniquely created slot through the two-step UI and verify it is no longer readable.

- [ ] **Step 6: Browser-accept formal order detail and isolation**

Order detail, cross-technician isolation, and backend stop/retry/recovery passed. The required successful state transition remains open because the selected test shop has no NDP wallet while the active Booking hold rule requires 500 NDP; the failed confirm rolled back without changing the seeded order or creating finance rows. Do not mark this step complete until a formally funded test-shop order can transition and persist its history.

Open one numeric order from the formal technician order list. Verify the route matches the formal API order number, status, appointment time, payment state, and complete status history. Use only a state transition valid for the selected test order and verify the returned history persists after refresh.

Attempt another technician's numeric slot and order IDs; both must show safe not-found. Stop the isolated backend and verify schedule/detail/order pages show retryable errors with no fallback schedules or orders. Restart, retry, and confirm the same persisted records return.

- [x] **Step 7: Verify transfer capability boundary**

Open `/technician/schedule/shifts/1/transfer`. Confirm the page explains that server-backed transfer is unavailable, performs no request mutation, writes no localStorage, and returns safely to the technician schedule.

- [x] **Step 8: Clean acceptance-only data and record evidence**

Remove only the uniquely created unbooked slot through the formal delete API if it still exists. Do not delete seeded six-month data. Update `docs/MOCK_RETIREMENT_MAP.md` with exact test totals, checker counts, browser account label, slot/order IDs, persisted timestamps, failure/recovery results, and remaining merchant boundary.

- [ ] **Step 9: Final verification and commit**

Run:

```bash
git status --short
git diff --check
git log --oneline --decorate -12
```

Commit any final evidence-only documentation change:

```bash
git add docs/MOCK_RETIREMENT_MAP.md
git commit -m "docs: record technician schedule formal acceptance"
```

Do not push, deploy, merge, or remove the worktree until the user selects a finishing option.
