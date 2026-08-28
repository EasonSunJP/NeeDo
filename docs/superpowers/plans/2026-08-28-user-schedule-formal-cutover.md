# User Schedule Formal Cutover Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the authenticated user schedule and technician-availability pages render only formal `/api/v1/` Booking, Schedule, Core Read, and Customer Profile data, with no browser-generated appointments, technician shifts, or fallback identities.

**Architecture:** Extend the existing paginated Booking API with bounded date filters and public technician-only availability queries, then add frontend helpers that exhaust all pages inside one visible calendar window. Keep the existing calendar presentation, but add an explicit formal-only mode that renders persisted customer bookings and disables browser-local business-event creation. Resolve the signed-in customer and selected technician from formal APIs, never from `entityStore`, `technicianScheduleStore`, `shiftPlanningStore`, or a fallback array item.

**Tech Stack:** React 19, TypeScript, Vite, Express, Prisma/MySQL, Zod, Swagger/OpenAPI, Jest, Vitest, Testing Library, Playwright/browser acceptance.

## Global Constraints

- Execute only after `cd backend && npm run check:future-operations` returns `status: "ok"` for `needo_dev`.
- This plan owns only the user schedule slice. Technician self-management is the next separate plan; merchant schedule and dispatch are the third plan.
- Preserve React/TSX/Vite and the current mobile visual structure.
- All list endpoints remain paginated; frontend window loaders may aggregate pages only inside a validated maximum 93-day range.
- Formal user pages must never import `entityStore`, `scheduleStore`, `technicianScheduleStore`, `shiftPlanningStore`, or `dispatch-center/store` as business data.
- API loading, empty, not-found, and failure states must be visible and must not fall back to static records.
- All new backend query fields use Zod, Swagger/OpenAPI, existing authentication/RBAC, repository scoping, and tests.
- Do not create a new browser store, localStorage key, mock dataset, fallback account, fixed technician, or generated appointment.
- User order list/detail routes already use the formal Booking API; retain them and add regression checks instead of rebuilding them.
- Every task uses red-green-refactor TDD and ends in a reviewable commit.

---

## File Structure

- Modify `backend/src/validators/booking.validator.ts`: validate bounded `from`/`to` order filters and technician-only public availability.
- Modify `backend/src/repositories/booking.repository.ts`: apply order date filters while preserving actor scope and pagination.
- Modify `backend/src/api/openapi.ts`: document the new query combinations and date bounds.
- Modify `backend/tests/booking-repository-scope.test.ts`, `backend/tests/booking-service.test.ts`, and `backend/tests/booking-api.test.ts`: prove date filtering, actor isolation, and public technician queries.
- Modify `src/features/booking/api.ts`: expose bounded order filters and technician-only availability queries.
- Create `src/features/booking/window-loaders.ts`: exhaust formal paginated results for one bounded UI window.
- Create `src/features/booking/window-loaders.test.ts`: test page aggregation, stable ordering, and failure propagation.
- Modify `src/components/scheduling/UnifiedUserCalendar.tsx`: add a formal-only user mode that consumes only persisted orders.
- Modify `src/components/scheduling/UnifiedUserCalendar.test.ts`: guard the formal-only data boundary.
- Create `src/features/core-read/useCustomerSelfProfile.ts`: reusable authenticated customer-profile resource hook.
- Create `src/features/core-read/useCustomerSelfProfile.test.tsx`: loading, success, retry, and failure tests.
- Modify `src/pages/user/UserSchedulePage.tsx`: use the formal profile and formal-only calendar.
- Create `src/pages/user/UserSchedulePage.test.tsx`: page-level loading, error, empty, and success tests.
- Create `src/features/booking/formal-technician-availability.ts`: map real ScheduleSlot rows into public calendar ranges.
- Create `src/features/booking/formal-technician-availability.test.ts`: JST grouping and slot-state tests.
- Modify `src/pages/user/UserTechnicianScheduleDetailPage.tsx`: load the real technician and real availability window.
- Modify `src/pages/user/UserTechnicianScheduleDetailPage.test.ts`: real API, route, period, empty, and failure behavior.
- Modify `src/data/mockRetirement.test.ts` and `docs/MOCK_RETIREMENT_MAP.md`: enforce and record the completed user slice.

---

### Task 1: Bounded Customer Order Windows

**Files:**
- Modify: `backend/src/validators/booking.validator.ts`
- Modify: `backend/src/repositories/booking.repository.ts`
- Modify: `backend/src/api/openapi.ts`
- Test: `backend/tests/booking-repository-scope.test.ts`
- Test: `backend/tests/booking-service.test.ts`

**Interfaces:**
- Consumes: authenticated `GET /api/v1/orders` and existing actor scoping.
- Produces: optional `from: Date` and `to: Date` on `OrderListInput`; when supplied they define `[from, to)` and may span at most 93 days.

- [ ] **Step 1: Write failing validator and repository tests**

Add this validator case to an existing booking-validator/API test and extend the repository scope test:

```ts
it("accepts a bounded order window and rejects incomplete or oversized ranges", () => {
  expect(orderListQuerySchema.parse({
    from: "2026-08-31T15:00:00.000Z",
    to: "2026-10-01T15:00:00.000Z"
  })).toEqual(expect.objectContaining({
    from: new Date("2026-08-31T15:00:00.000Z"),
    to: new Date("2026-10-01T15:00:00.000Z")
  }));
  expect(() => orderListQuerySchema.parse({ from: "2026-08-31T15:00:00.000Z" })).toThrow();
  expect(() => orderListQuerySchema.parse({
    from: "2026-08-31T15:00:00.000Z",
    to: "2027-03-01T15:00:00.000Z"
  })).toThrow();
});

it("applies the authenticated customer and bounded startsAt window together", async () => {
  await repository.listOrders({
    customerUserId: 7,
    from: new Date("2026-08-31T15:00:00.000Z"),
    to: new Date("2026-10-01T15:00:00.000Z"),
    page: 1,
    pageSize: 100
  });
  expect(bookingOrder.findMany).toHaveBeenCalledWith(expect.objectContaining({
    where: expect.objectContaining({
      customerUserId: 7,
      startsAt: {
        gte: new Date("2026-08-31T15:00:00.000Z"),
        lt: new Date("2026-10-01T15:00:00.000Z")
      }
    })
  }));
});
```

- [ ] **Step 2: Run tests and verify RED**

Run:

```bash
cd backend
npm test -- booking-repository-scope.test.ts booking-service.test.ts booking-api.test.ts
```

Expected: FAIL because `orderListQuerySchema` and `OrderListInput` do not accept or apply `from`/`to`.

- [ ] **Step 3: Implement the bounded query contract**

Extend the types and repository where clause exactly as follows:

```ts
export interface OrderListInput extends PaginationInput {
  customerUserId?: number;
  shopId?: number;
  technicianProfileId?: number;
  status?: BookingOrderStatusPayload;
  from?: Date;
  to?: Date;
}

const orderWindow = input.from && input.to
  ? { startsAt: { gte: input.from, lt: input.to } }
  : {};

const where: Prisma.BookingOrderWhereInput = {
  deletedAt: null,
  ...orderWindow,
  // retain the existing customer/shop/technician/status filters
};
```

Define `orderListQuerySchema` with a `superRefine` that requires both dates or neither, requires `from < to`, and caps the interval at `93 * 24 * 60 * 60 * 1000`. Keep `pageSize` capped at 100. Add `from` and `to` to the OpenAPI `/orders` parameters and state that `to` is exclusive.

- [ ] **Step 4: Run tests and backend quality checks**

Run:

```bash
cd backend
npm test -- booking-repository-scope.test.ts booking-service.test.ts booking-api.test.ts
npm run lint
npm run build
```

Expected: all commands PASS; actor scope assertions still force the authenticated customer, shop, or technician identity.

- [ ] **Step 5: Commit**

```bash
git add backend/src/validators/booking.validator.ts backend/src/repositories/booking.repository.ts backend/src/api/openapi.ts backend/tests/booking-repository-scope.test.ts backend/tests/booking-service.test.ts backend/tests/booking-api.test.ts
git commit -m "feat: filter formal orders by schedule window"
```

---

### Task 2: Public Technician Availability Query

**Files:**
- Modify: `backend/src/validators/booking.validator.ts`
- Modify: `backend/src/api/openapi.ts`
- Test: `backend/tests/booking-api.test.ts`
- Test: `backend/tests/booking-repository-scope.test.ts`

**Interfaces:**
- Consumes: public paginated `GET /api/v1/schedule/availability`.
- Produces: a valid query may specify exactly one service source, or `technicianId` alone; all results remain published, unsuspended, available, and capacity-safe.

- [ ] **Step 1: Write failing public-query tests**

```ts
it("allows a published technician availability query without a service filter", () => {
  expect(availabilityListQuerySchema.parse({
    technicianId: "17",
    from: "2026-08-31T15:00:00.000Z",
    to: "2026-10-01T15:00:00.000Z",
    page: "1",
    pageSize: "100"
  })).toEqual(expect.objectContaining({ technicianId: 17 }));
});

it("still rejects an unscoped public availability query", () => {
  expect(() => availabilityListQuerySchema.parse({
    from: "2026-08-31T15:00:00.000Z",
    to: "2026-10-01T15:00:00.000Z"
  })).toThrow();
});
```

Add a repository assertion that `technicianId: 17` produces `technicianProfileId: 17` together with `status: "AVAILABLE"`, remaining capacity, published shop, and no active suspension.

```ts
await repository.listAvailableSlots({
  technicianId: 17,
  from: new Date("2026-08-31T15:00:00.000Z"),
  to: new Date("2026-10-01T15:00:00.000Z"),
  page: 1,
  pageSize: 100
});
expect(scheduleSlot.findMany).toHaveBeenCalledWith(expect.objectContaining({
  where: expect.objectContaining({
    technicianProfileId: 17,
    status: "AVAILABLE",
    bookedCount: expect.any(Object),
    shop: expect.objectContaining({ status: "published" })
  })
}));
```

- [ ] **Step 2: Run tests and verify RED**

```bash
cd backend
npm test -- booking-api.test.ts booking-repository-scope.test.ts
```

Expected: the technician-only validator case FAILS.

- [ ] **Step 3: Implement the exact query rule**

Replace the current exclusive service refinement with:

```ts
.superRefine((value, context) => {
  if (value.serviceId && value.technicianServiceId) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "serviceId and technicianServiceId are mutually exclusive",
      path: ["serviceId"]
    });
  }
  if (!value.serviceId && !value.technicianServiceId && !value.technicianId) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "serviceId, technicianServiceId, or technicianId is required",
      path: ["technicianId"]
    });
  }
  if (value.to.getTime() - value.from.getTime() > 93 * 24 * 60 * 60 * 1000) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "date range must not exceed 93 days",
      path: ["to"]
    });
  }
});
```

Keep the repository public safety predicates unchanged. Update OpenAPI to describe all allowed query combinations.

- [ ] **Step 4: Verify and commit**

```bash
cd backend
npm test -- booking-api.test.ts booking-repository-scope.test.ts
npm run lint
npm run build
cd ..
git add backend/src/validators/booking.validator.ts backend/src/api/openapi.ts backend/tests/booking-api.test.ts backend/tests/booking-repository-scope.test.ts
git commit -m "feat: expose technician availability windows"
```

---

### Task 3: Frontend Formal Window Loaders

**Files:**
- Modify: `src/features/booking/api.ts`
- Modify: `src/features/booking/api.test.ts`
- Create: `src/features/booking/window-loaders.ts`
- Create: `src/features/booking/window-loaders.test.ts`

**Interfaces:**
- Consumes: paginated `bookingApi.listOrders` and `bookingApi.listAvailability`.
- Produces: `loadCustomerOrderWindow(from, to): Promise<BookingOrder[]>` and `loadTechnicianAvailabilityWindow(technicianId, from, to): Promise<BookingScheduleSlot[]>`.

- [ ] **Step 1: Write failing API and pagination tests**

```ts
const makeSlot = (id: number): BookingScheduleSlot => {
  const startsAt = new Date(Date.UTC(2026, 8, 1, id));
  const endsAt = new Date(startsAt.getTime() + 60 * 60_000);
  return {
    id,
    serviceId: null,
    technicianServiceId: 701,
    shopId: 16,
    technicianProfileId: 17,
    startsAt: startsAt.toISOString(),
    endsAt: endsAt.toISOString(),
    capacity: 1,
    bookedCount: 0,
    status: "available",
    serviceName: "ボディケア",
    shopName: "LifeDance Wellness 渋谷",
    technicianName: "Formal Technician",
    priceAmount: "8000",
    currency: "JPY",
    durationMinutes: 60
  };
};
const firstHundred = Array.from({ length: 100 }, (_, index) => makeSlot(index + 1));
const lastSlot = makeSlot(101);

it("serializes the bounded customer order window", async () => {
  await bookingApi.listOrders({
    from: "2026-08-31T15:00:00.000Z",
    to: "2026-10-01T15:00:00.000Z",
    page: 1,
    pageSize: 100
  });
  expect(fetch).toHaveBeenCalledWith(
    "/api/v1/orders?from=2026-08-31T15%3A00%3A00.000Z&page=1&pageSize=100&to=2026-10-01T15%3A00%3A00.000Z",
    expect.anything()
  );
});

it("loads every page in a bounded technician window exactly once", async () => {
  vi.spyOn(bookingApi, "listAvailability")
    .mockResolvedValueOnce({ list: firstHundred, total: 101, page: 1, page_size: 100 })
    .mockResolvedValueOnce({ list: [lastSlot], total: 101, page: 2, page_size: 100 });
  await expect(loadTechnicianAvailabilityWindow(17, from, to)).resolves.toHaveLength(101);
  expect(bookingApi.listAvailability).toHaveBeenNthCalledWith(
    2,
    expect.objectContaining({ technicianId: 17, page: 2, pageSize: 100 })
  );
});
```

- [ ] **Step 2: Run tests and verify RED**

```bash
npm test -- src/features/booking/api.test.ts src/features/booking/window-loaders.test.ts
```

Expected: FAIL because the bounded order fields and loader file are absent.

- [ ] **Step 3: Implement bounded exhaustive pagination**

Add `from?: string` and `to?: string` to the order list query type. Create the loader around this private helper:

```ts
const MAX_WINDOW_MS = 93 * 24 * 60 * 60 * 1000;

function assertWindow(from: Date, to: Date): void {
  const duration = to.getTime() - from.getTime();
  if (!Number.isFinite(duration) || duration <= 0 || duration > MAX_WINDOW_MS) {
    throw new Error("Formal schedule window must be between 1 ms and 93 days.");
  }
}

async function loadEveryPage<T>(
  request: (page: number) => Promise<PaginatedBookingData<T>>
): Promise<T[]> {
  const rows: T[] = [];
  for (let page = 1; ; page += 1) {
    const response = await request(page);
    rows.push(...response.list);
    if (rows.length >= response.total || response.list.length === 0) return rows;
  }
}
```

Both exported loaders call `assertWindow`, use page size 100, preserve API order, and let errors propagate to the page.

- [ ] **Step 4: Verify and commit**

```bash
npm test -- src/features/booking/api.test.ts src/features/booking/window-loaders.test.ts
npm run lint
git add src/features/booking/api.ts src/features/booking/api.test.ts src/features/booking/window-loaders.ts src/features/booking/window-loaders.test.ts
git commit -m "feat: load complete formal schedule windows"
```

---

### Task 4: Formal-Only User Calendar Mode

**Files:**
- Modify: `src/components/scheduling/UnifiedUserCalendar.tsx`
- Modify: `src/components/scheduling/UnifiedUserCalendar.test.ts`

**Interfaces:**
- Consumes: `formalOnly?: boolean` and the bounded customer order loader.
- Produces: formal-only mode with persisted BookingOrder events, retryable failure state, and no local business-event editor or local-storage write.

- [ ] **Step 1: Add failing source-boundary and behavior tests**

```ts
it("has an explicit formal-only user boundary", () => {
  expect(source).toContain("formalOnly = false");
  expect(source).toContain("loadCustomerOrderWindow");
  expect(source).toContain("formalOnly ? [] : getLocalCalendarEvents");
  expect(source).toContain("formalOnly ? null :");
});
```

Add a component test with a rejected loader and assert that the error region and retry button are visible while no generated calendar event appears.

```tsx
vi.mock("../../features/booking/window-loaders", () => ({
  loadCustomerOrderWindow: vi.fn()
}));
const customerFixture = {
  id: "7",
  systemId: "u0000000007",
  name: "Formal Customer"
} as Customer;

it("does not replace a failed formal request with local events", async () => {
  vi.mocked(loadCustomerOrderWindow).mockRejectedValue(new Error("schedule unavailable"));
  render(
    <MemoryRouter>
      <UnifiedUserCalendar currentCustomer={customerFixture} formalOnly />
    </MemoryRouter>
  );
  expect(await screen.findByText("schedule unavailable")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /retry|重试|再试/i })).toBeInTheDocument();
  expect(screen.queryByText("local fixture event")).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run the calendar test and verify RED**

```bash
npm test -- src/components/scheduling/UnifiedUserCalendar.test.ts
```

Expected: FAIL because formal-only mode does not exist.

- [ ] **Step 3: Implement formal-only behavior**

Add this prop:

```ts
export type UnifiedUserCalendarProps = {
  // retain existing props
  formalOnly?: boolean;
};
```

When `activeScope === "user" && formalOnly`:

- load orders using the visible `period.startDate` and exclusive day after `period.endDate`;
- use `loadCustomerOrderWindow`, not the first page of `bookingApi.listOrders`;
- set `localCalendarEvents` and `birthdayEvents` to empty arrays;
- do not call `writeBrowserStorage` for calendar business events;
- hide event create/edit/delete controls, Google import writes, and the creation floating action;
- keep view switching, search, order detail navigation, loading, retry, and true empty state;
- derive every NeeDo event from `mapBookingOrderToDomainOrder` and keep cancelled orders excluded by the existing event mapper.

Use a monotonically increasing request token or `AbortController` equivalent so a slower previous period cannot replace the current period.

- [ ] **Step 4: Verify and commit**

```bash
npm test -- src/components/scheduling/UnifiedUserCalendar.test.ts src/features/booking/window-loaders.test.ts
npm run lint
npm run build
git add src/components/scheduling/UnifiedUserCalendar.tsx src/components/scheduling/UnifiedUserCalendar.test.ts
git commit -m "feat: isolate the formal user calendar"
```

---

### Task 5: Authenticated Customer Profile Resource

**Files:**
- Create: `src/features/core-read/useCustomerSelfProfile.ts`
- Create: `src/features/core-read/useCustomerSelfProfile.test.tsx`

**Interfaces:**
- Consumes: `customerProfileApi.getMine()`.
- Produces: `{ profile, customer, loading, error, reload }`, where `customer` is mapped with `mapCoreCustomerToCustomer` and is never substituted.

- [ ] **Step 1: Write the failing hook test**

```tsx
const profile: CustomerSelfProfile = {
  id: 7,
  publicId: "u0000000007",
  userId: 70,
  displayName: "Formal Customer",
  city: "東京",
  bio: null,
  avatarUrl: null,
  membershipLevel: "free",
  gender: "private",
  age: null,
  heightCm: null,
  languages: ["日本語"],
  visibility: "public",
  isPublic: true,
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-01T00:00:00.000Z"
};

it("returns the authenticated formal customer without a fallback row", async () => {
  vi.spyOn(customerProfileApi, "getMine").mockResolvedValue(profile);
  const { result } = renderHook(() => useCustomerSelfProfile());
  expect(result.current.loading).toBe(true);
  await waitFor(() => expect(result.current.customer?.systemId).toBe(profile.publicId));
  expect(result.current.error).toBeNull();
});

it("keeps customer null after a failed request and retries explicitly", async () => {
  vi.spyOn(customerProfileApi, "getMine")
    .mockRejectedValueOnce(new Error("network"))
    .mockResolvedValueOnce(profile);
  const { result } = renderHook(() => useCustomerSelfProfile());
  await waitFor(() => expect(result.current.error).toBe("network"));
  expect(result.current.customer).toBeNull();
  act(() => result.current.reload());
  await waitFor(() => expect(result.current.customer).not.toBeNull());
});
```

- [ ] **Step 2: Run and verify RED**

```bash
npm test -- src/features/core-read/useCustomerSelfProfile.test.tsx
```

Expected: FAIL because the hook does not exist.

- [ ] **Step 3: Implement the resource hook**

Use an internal request generation counter, clear stale errors on reload, map the successful payload once, and return `null` customer/profile on failure. Do not accept a fallback argument.

- [ ] **Step 4: Verify and commit**

```bash
npm test -- src/features/core-read/useCustomerSelfProfile.test.tsx
npm run lint
git add src/features/core-read/useCustomerSelfProfile.ts src/features/core-read/useCustomerSelfProfile.test.tsx
git commit -m "feat: load the authenticated customer profile"
```

---

### Task 6: User Schedule Page Cutover

**Files:**
- Modify: `src/pages/user/UserSchedulePage.tsx`
- Create: `src/pages/user/UserSchedulePage.test.tsx`
- Modify: `src/components/mobile/SharedHomeHeaderLocation.test.ts`

**Interfaces:**
- Consumes: `useCustomerSelfProfile()` and `<UnifiedUserCalendar formalOnly />`.
- Produces: a user schedule page whose identity, avatar, membership, city, and appointments are all formal records.

- [ ] **Step 1: Write failing page tests**

```tsx
vi.mock("../../features/core-read/useCustomerSelfProfile", () => ({
  useCustomerSelfProfile: vi.fn()
}));

const profileFixture = {
  id: 7,
  publicId: "u0000000007",
  userId: 70,
  displayName: "Formal Customer",
  city: "東京",
  bio: null,
  avatarUrl: null,
  membershipLevel: "free",
  gender: "private",
  age: null,
  heightCm: null,
  languages: ["日本語"],
  visibility: "public",
  isPublic: true,
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-01T00:00:00.000Z"
} satisfies CustomerSelfProfile;
const successfulCustomerResource = {
  profile: profileFixture,
  customer: mapCoreCustomerToCustomer(profileFixture),
  loading: false,
  error: null,
  reload: vi.fn()
};

const renderUserSchedulePage = () => render(
  <MemoryRouter initialEntries={["/schedule"]}>
    <UserSchedulePage />
  </MemoryRouter>
);

it("renders the formal customer and formal-only calendar", async () => {
  vi.mocked(useCustomerSelfProfile).mockReturnValue(successfulCustomerResource);
  renderUserSchedulePage();
  expect(await screen.findByText(profileFixture.displayName)).toBeInTheDocument();
  expect(screen.getByTestId("formal-user-calendar")).toBeInTheDocument();
});

it("shows a retryable API failure without a fallback customer", async () => {
  vi.mocked(useCustomerSelfProfile).mockReturnValue({
    profile: null,
    customer: null,
    loading: false,
    error: "profile unavailable",
    reload: vi.fn()
  });
  renderUserSchedulePage();
  expect(await screen.findByText("profile unavailable")).toBeInTheDocument();
  expect(screen.queryByText("Mia")).not.toBeInTheDocument();
});
```

Add raw-source assertions that the page no longer contains `useEntityStore`, `useHomeLayoutStore`, `customers[0]`, or `config.locations[0]`.

- [ ] **Step 2: Run and verify RED**

```bash
npm test -- src/pages/user/UserSchedulePage.test.tsx src/components/mobile/SharedHomeHeaderLocation.test.ts
```

Expected: FAIL because the page still reads browser entity/layout stores.

- [ ] **Step 3: Implement the formal page states**

Use `useCustomerSelfProfile`. During loading render the existing mobile shell with an accessible loading label. On failure render the error plus a retry button. On success:

```tsx
<SharedHomeHeader
  avatarAlt={customer.name}
  avatarLevelLabel={getCustomerLevelLabel(customer.activeScore)}
  avatarMembershipLevel={customer.memberLevel}
  avatarSrc={customer.avatar}
  avatarTo={userPortalConfig.myPath}
  locationLabel={profile.city ?? "服务区域未设置"}
  locationCaption="当前服务区域"
  locationTo="/me/settings/service-range"
  settingsLabel="系统设置"
  settingsTo={userPortalConfig.settingsPath}
/>
<UnifiedUserCalendar
  currentCustomer={customer}
  formalOnly
  searchQuery={scheduleSearchQuery}
/>
```

No success path may return `null` because a fallback array item is absent.

- [ ] **Step 4: Verify and commit**

```bash
npm test -- src/pages/user/UserSchedulePage.test.tsx src/components/mobile/SharedHomeHeaderLocation.test.ts src/components/scheduling/UnifiedUserCalendar.test.ts
npm run lint
npm run build
git add src/pages/user/UserSchedulePage.tsx src/pages/user/UserSchedulePage.test.tsx src/components/mobile/SharedHomeHeaderLocation.test.ts
git commit -m "feat: connect the user schedule to formal data"
```

---

### Task 7: Real Technician Availability Mapping

**Files:**
- Create: `src/features/booking/formal-technician-availability.ts`
- Create: `src/features/booking/formal-technician-availability.test.ts`

**Interfaces:**
- Consumes: `BookingScheduleSlot[]` returned for one technician.
- Produces: `groupFormalAvailabilityByJstDate(slots): Map<string, TechnicianPublicAvailabilityRange[]>`.

- [ ] **Step 1: Write failing mapping tests**

```ts
const slot = (
  patch: Partial<BookingScheduleSlot> & Pick<BookingScheduleSlot, "id" | "startsAt" | "endsAt">
): BookingScheduleSlot => ({
  serviceId: null,
  technicianServiceId: 701,
  shopId: 16,
  technicianProfileId: 17,
  capacity: 1,
  bookedCount: 0,
  status: "available",
  serviceName: "ボディケア",
  shopName: "LifeDance Wellness 渋谷",
  technicianName: "Formal Technician",
  priceAmount: "8000",
  currency: "JPY",
  durationMinutes: 60,
  ...patch
});

it("groups only available capacity-safe slots by JST calendar date", () => {
  const grouped = groupFormalAvailabilityByJstDate([
    slot({ id: 1, startsAt: "2026-08-31T15:00:00.000Z", endsAt: "2026-08-31T16:00:00.000Z", status: "available", bookedCount: 0 }),
    slot({ id: 2, startsAt: "2026-08-31T16:00:00.000Z", endsAt: "2026-08-31T17:00:00.000Z", status: "booked", bookedCount: 1 })
  ]);
  expect(grouped.get("2026-09-01")).toEqual([
    { date: "2026-09-01", startTime: "00:00", endTime: "01:00" }
  ]);
});
```

- [ ] **Step 2: Run and verify RED**

```bash
npm test -- src/features/booking/formal-technician-availability.test.ts
```

Expected: FAIL because the mapper does not exist.

- [ ] **Step 3: Implement explicit Asia/Tokyo formatting**

Use `Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo", ... })` for the date key and a separate `hourCycle: "h23"` formatter for time. Sort by `startsAt`, include only `status === "available" && bookedCount < capacity`, and keep each persisted slot as one range. Do not merge gaps or infer shifts.

- [ ] **Step 4: Verify and commit**

```bash
npm test -- src/features/booking/formal-technician-availability.test.ts
npm run lint
git add src/features/booking/formal-technician-availability.ts src/features/booking/formal-technician-availability.test.ts
git commit -m "feat: map formal technician availability"
```

---

### Task 8: Technician Schedule Detail Cutover

**Files:**
- Modify: `src/pages/user/UserTechnicianScheduleDetailPage.tsx`
- Modify: `src/pages/user/UserTechnicianScheduleDetailPage.test.ts`

**Interfaces:**
- Consumes: numeric technician route ID, `coreReadApi.getTechnicianDetail`, `useCustomerSelfProfile`, `loadTechnicianAvailabilityWindow`, and the formal availability mapper.
- Produces: day, three-day, week, and month public availability views backed only by persisted available ScheduleSlot rows.

- [ ] **Step 1: Write failing page-boundary tests**

```ts
it("loads the selected formal technician and bounded availability", () => {
  expect(pageSource).toContain("coreReadApi.getTechnicianDetail");
  expect(pageSource).toContain("loadTechnicianAvailabilityWindow");
  expect(pageSource).toContain("groupFormalAvailabilityByJstDate");
});

it("does not derive availability from browser stores", () => {
  expect(pageSource).not.toMatch(/useEntityStore|useHomeLayoutStore|useShiftPlanningStore|useTechnicianScheduleStore/);
  expect(pageSource).not.toMatch(/technicians\[0\]|customers\[0\]|config\.locations\[0\]/);
});
```

Add a rendered test that switches from day to month, verifies that the loader receives the correct exclusive range, and confirms an empty day says no available slot without displaying generated hours.

```tsx
const technicianDetailFixture = {
  id: 17,
  publicId: "s0000000017",
  displayName: "Formal Technician",
  city: "東京",
  avatarUrl: null,
  reviewSummary: {
    ratingAverage: "5.00",
    reviewCount: 1,
    latestReviewAt: null,
    highlights: []
  },
  shop: null,
  bio: null,
  serviceArea: "東京",
  yearsExperience: 3,
  mediaAssets: [],
  services: [],
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-01T00:00:00.000Z"
} satisfies CoreTechnicianDetail;

const renderTechnicianScheduleRoute = (path: string) => render(
  <MemoryRouter initialEntries={[path]}>
    <Routes>
      <Route
        path="/schedule/technicians/:technicianId"
        element={<UserTechnicianScheduleDetailPage />}
      />
    </Routes>
  </MemoryRouter>
);

it("requests the selected visible period and renders a true empty day", async () => {
  vi.mocked(coreReadApi.getTechnicianDetail).mockResolvedValue(technicianDetailFixture);
  vi.mocked(loadTechnicianAvailabilityWindow).mockResolvedValue([]);
  renderTechnicianScheduleRoute("/schedule/technicians/17?date=2026-09-01");
  expect(await screen.findByText("当前日期没有可预约的空档。")).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "月" }));
  await waitFor(() => expect(loadTechnicianAvailabilityWindow).toHaveBeenLastCalledWith(
    17,
    new Date("2026-08-30T15:00:00.000Z"),
    new Date("2026-10-11T15:00:00.000Z")
  ));
});
```

- [ ] **Step 2: Run and verify RED**

```bash
npm test -- src/pages/user/UserTechnicianScheduleDetailPage.test.ts
```

Expected: FAIL because the page still imports four browser stores.

- [ ] **Step 3: Implement formal resources and stale-request safety**

- Reject a nonnumeric route ID with the existing not-found presentation.
- Load the technician detail once per route ID.
- Resolve the visible period dates, convert JST boundaries to ISO instants, and load all public availability pages.
- Re-fetch only when the route ID or visible period changes.
- Ignore stale responses after navigation.
- Use the real technician display name, avatar, shop, public ID, and customer header profile.
- Feed `AvailabilityTimeline` and date counts from `groupFormalAvailabilityByJstDate`.
- Show accessible loading, error with retry, true empty, and not-found states.
- Keep close/back navigation and the existing day/three-day/week/month layout.

- [ ] **Step 4: Verify and commit**

```bash
npm test -- src/pages/user/UserTechnicianScheduleDetailPage.test.ts src/features/booking/formal-technician-availability.test.ts src/features/booking/window-loaders.test.ts
npm run lint
npm run build
git add src/pages/user/UserTechnicianScheduleDetailPage.tsx src/pages/user/UserTechnicianScheduleDetailPage.test.ts
git commit -m "feat: show formal technician availability"
```

---

### Task 9: User Slice Guardrail and Real Acceptance

**Files:**
- Modify: `src/data/mockRetirement.test.ts`
- Modify: `docs/MOCK_RETIREMENT_MAP.md`

**Interfaces:**
- Consumes: completed backend and frontend user-schedule slice.
- Produces: a permanent source guard plus database and browser acceptance evidence.

- [ ] **Step 1: Add the failing retirement guard**

```ts
it("keeps formal user schedule pages free of browser business stores", () => {
  for (const source of [userScheduleSource, userTechnicianScheduleSource]) {
    expect(source).not.toMatch(
      /entityStore|scheduleStore|technicianScheduleStore|shiftPlanningStore|dispatch-center\/store/
    );
    expect(source).not.toMatch(/customers\[0\]|technicians\[0\]|localStorage/);
  }
  expect(userScheduleSource).toContain("formalOnly");
});
```

- [ ] **Step 2: Run the retirement test and verify RED or immediate GREEN**

```bash
npm test -- src/data/mockRetirement.test.ts
```

Expected: PASS if Tasks 6 and 8 removed every path; otherwise FAIL on the exact remaining import or fallback, which must be removed in its owning page before continuing.

- [ ] **Step 3: Run proportional automated verification**

```bash
cd backend
npm test -- booking-api.test.ts booking-repository-scope.test.ts booking-service.test.ts
npm run check:future-operations
npm run check:lifedance-operations
npm run lint
npm run build
cd ..
npm test -- src/features/booking/api.test.ts src/features/booking/window-loaders.test.ts src/features/booking/formal-technician-availability.test.ts src/features/core-read/useCustomerSelfProfile.test.tsx src/components/scheduling/UnifiedUserCalendar.test.ts src/pages/user/UserSchedulePage.test.tsx src/pages/user/UserTechnicianScheduleDetailPage.test.ts src/data/mockRetirement.test.ts
npm run verify:production-build
git diff --check
```

Expected: all tests and builds PASS; both database checkers report `status: "ok"`.

- [ ] **Step 4: Run formal browser acceptance with an existing customer account**

Start the formal backend and frontend, then use an existing `sim.customer.*@needo.local` account and the password from the local environment:

1. Open `/schedule` after formal login.
2. Verify September 2026 contains persisted bookings and the network panel shows paginated `/api/v1/orders?from=...&to=...` requests.
3. Refresh and verify the same order IDs and times remain.
4. Navigate to `/schedule/technicians/<numeric-technician-profile-id>?date=2026-09-01`.
5. Verify day/week/month counts come from `/api/v1/schedule/availability?technicianId=...`; select a real available slot and confirm the displayed time matches the API response.
6. Test one date with no available rows and verify a true empty state.
7. Stop and restart the frontend; verify the same database rows remain.
8. Temporarily stop the backend; verify both pages show errors and never display fallback people or appointments.

- [ ] **Step 5: Update the retirement map and commit**

Record the exact commands, date, tested account type, routes, and database checker results. Mark only the user schedule and public technician-availability paths complete. Keep technician self-management and merchant schedule/dispatch pending.

```bash
git add src/data/mockRetirement.test.ts docs/MOCK_RETIREMENT_MAP.md
git commit -m "test: retire user schedule browser data"
```

---

## Ordered Follow-On Plans

After Task 9 passes browser acceptance, create and execute these as separate implementation plans:

1. `docs/superpowers/plans/2026-08-28-technician-schedule-formal-cutover.md`: technician portal schedule, schedule detail/editor/transfer routes, persisted ScheduleSlot CRUD, and removal of `src/state/technicianScheduleStore.ts` from the accepted technician lane.
2. `docs/superpowers/plans/2026-08-28-merchant-schedule-dispatch-formal-cutover.md`: merchant schedule, appointment list, arrangement/cell routes, dispatch-center manual schedule views, and removal of `src/state/shiftPlanningStore.ts` and generated dispatch records from the accepted merchant lane.

Do not start the technician plan until the user slice is browser-accepted. Do not start the merchant plan until the technician slice is browser-accepted.
