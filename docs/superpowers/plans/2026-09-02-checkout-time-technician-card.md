# Checkout Time Dropdown and Technician Detail Card Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the formal checkout's cross-day slot list with a same-day dropdown that preserves disabled formal slots, reuse the approved simple technician card without social metrics or level, and route it to a read-only formal information-card page.

**Architecture:** Add an opt-in `includeUnavailable` flag to the existing public availability API while preserving its default safety filters. Keep date/slot derivation in a small checkout utility, place the interactive time row in a focused component, configure the shared simple-card renderer instead of cloning it, and select a `?view=card` branch inside the existing technician profile route so unrelated social routes and dirty route-table work remain untouched.

**Tech Stack:** React 18, TypeScript strict mode, React Router, Vite/Vitest, Tailwind utilities, Express, Zod, Prisma/MySQL, Jest/Supertest, existing NeeDo client theme components.

## Global Constraints

- Do not add or synthesize time slots that are absent from the formal schedule data.
- Do not change merchant or technician self-profile editing flows.
- Do not expose technician wallet, Test NDP balance, privacy controls, or other self-only fields to customers.
- Do not replace the social technician profile route for unrelated callers.
- Do not modify `src/App.tsx` or `src/pages/mobile/TechnicianPortalPage.tsx`; both have unrelated active changes.
- Do not add mock, demo, or local-storage booking data.
- `includeUnavailable` must remain opt-in; its omitted behavior must be byte-for-byte compatible at the repository predicate level.
- Booking submission must continue to send the selected formal `scheduleSlotId` and let the server arbitrate concurrency.
- Browser acceptance must use frontend port 5180 and formal backend port 3000 after proving listener PID, cwd, branch, and proxy origin.

## File Map

- `backend/src/validators/booking.validator.ts`: parse the optional public availability flag.
- `backend/src/repositories/booking.repository.ts`: preserve default public filtering and conditionally include unavailable formal rows.
- `backend/src/api/openapi.ts`: document the opt-in query contract.
- `backend/tests/booking-validator.test.ts`: validate true, false, and invalid query values.
- `backend/tests/booking-repository-scope.test.ts`: prove default and opt-in Prisma predicates.
- `backend/tests/booking-api.test.ts`: prove the controller passes the parsed flag to the repository.
- `src/features/booking/api.ts`: type and send the new query field.
- `src/features/booking/api.test.ts`: prove URL serialization.
- `src/pages/user/formal-checkout/checkoutTimeSlots.ts`: own Tokyo-day grouping, bookability, and initial selection rules.
- `src/pages/user/formal-checkout/checkoutTimeSlots.test.ts`: pure regression tests for same-day filtering and disabled slots.
- `src/pages/user/formal-checkout/CheckoutTimeRow.tsx`: own time trigger, people summary, dropdown, and keyboard/outside-close behavior.
- `src/pages/user/formal-checkout/CheckoutTimeRow.test.tsx`: interaction tests for available and unavailable choices.
- `src/pages/user/FormalCheckoutPage.tsx`: request the selected day, integrate the time row, and render the shared technician card.
- `src/pages/user/FormalCheckoutPage.test.ts`: protect the formal checkout data and navigation contract.
- `src/shared/profile-card/SocialProfileMiniCard.tsx`: add reusable controls for social-stat and level visibility.
- `src/shared/profile-card/SocialProfileMiniCard.test.ts`: render-test the stripped technician presentation.
- `src/pages/user/TechnicianInfoCardRoutePage.tsx`: read-only routed formal technician detail scene.
- `src/pages/user/TechnicianInfoCardRoutePage.test.tsx`: formal API, header, error, and close behavior tests.
- `src/pages/user/ProfileDetailPage.tsx`: select the information-card scene only for `view=card`.
- `src/pages/user/ProfileDetailPage.test.ts`: prove default social behavior remains and card view is explicit.

---

### Task 1: Opt-in Formal Unavailable-slot API Contract

**Files:**
- Modify: `backend/src/validators/booking.validator.ts:1-90`
- Modify: `backend/src/repositories/booking.repository.ts:171-179,849-890`
- Modify: `backend/src/api/openapi.ts:16394-16460`
- Test: `backend/tests/booking-validator.test.ts`
- Test: `backend/tests/booking-repository-scope.test.ts`
- Test: `backend/tests/booking-api.test.ts`

**Interfaces:**
- Consumes: existing `GET /api/v1/schedule/availability` request and `ScheduleSlotPayload` response.
- Produces: `AvailabilityListInput.includeUnavailable?: boolean`; default omitted/false keeps existing filtering.

- [ ] **Step 1: Write failing validator and controller-forwarding tests**

Add the availability schema import and these cases to `backend/tests/booking-validator.test.ts`:

```ts
import {
  availabilityListQuerySchema,
  orderListQuerySchema
} from "../src/validators/booking.validator";

describe("availabilityListQuerySchema", () => {
  const base = {
    serviceId: "12",
    from: "2026-09-02T15:00:00.000Z",
    to: "2026-09-03T15:00:00.000Z"
  };

  it("parses the opt-in unavailable-slot flag without changing the omitted default", () => {
    expect(availabilityListQuerySchema.parse(base)).not.toHaveProperty("includeUnavailable");
    expect(availabilityListQuerySchema.parse({ ...base, includeUnavailable: "true" }).includeUnavailable).toBe(true);
    expect(availabilityListQuerySchema.parse({ ...base, includeUnavailable: "false" }).includeUnavailable).toBe(false);
  });

  it("rejects ambiguous unavailable-slot query values", () => {
    expect(availabilityListQuerySchema.safeParse({ ...base, includeUnavailable: "1" }).success).toBe(false);
    expect(availabilityListQuerySchema.safeParse({ ...base, includeUnavailable: "yes" }).success).toBe(false);
  });
});
```

Add this request and assertion to the existing public availability API test in `backend/tests/booking-api.test.ts`:

```ts
await request(fixture.app)
  .get(
    "/api/v1/schedule/availability?serviceId=1&includeUnavailable=true&from=2026-05-26T00:00:00.000Z&to=2026-05-27T00:00:00.000Z&page=1&pageSize=100"
  )
  .expect(200);

expect(fixture.bookingRepository.listAvailableSlots).toHaveBeenCalledWith({
  serviceId: 1,
  includeUnavailable: true,
  from: new Date("2026-05-26T00:00:00.000Z"),
  to: new Date("2026-05-27T00:00:00.000Z"),
  page: 1,
  pageSize: 100
});
```

- [ ] **Step 2: Run the validator/API tests and verify failure**

Run:

```bash
cd backend
npm test -- tests/booking-validator.test.ts tests/booking-api.test.ts
```

Expected: FAIL because `includeUnavailable` is stripped by the strict availability query schema and is absent from the repository call.

- [ ] **Step 3: Add strict boolean parsing and the repository input field**

Add near the other shared query schemas in `backend/src/validators/booking.validator.ts`:

```ts
const strictBooleanQuerySchema = z
  .enum(["true", "false"])
  .transform((value) => value === "true");
```

Add to `availabilityListQuerySchema`:

```ts
includeUnavailable: strictBooleanQuerySchema.optional(),
```

Add to `AvailabilityListInput` in `backend/src/repositories/booking.repository.ts`:

```ts
includeUnavailable?: boolean;
```

- [ ] **Step 4: Write the failing repository predicate test**

Keep the existing default-filter test intact, then add:

```ts
it("includes formal unavailable rows only when the public caller opts in", async () => {
  const scheduleSlot = {
    fields: { capacity: Symbol("capacity") },
    findMany: jest.fn(async () => []),
    count: jest.fn(async () => 0)
  };
  const repository = new BookingRepository({ scheduleSlot } as never);

  await repository.listAvailableSlots({
    serviceId: 12,
    includeUnavailable: true,
    from: new Date("2026-09-02T15:00:00.000Z"),
    to: new Date("2026-09-03T15:00:00.000Z"),
    page: 1,
    pageSize: 100
  });

  const where = scheduleSlot.findMany.mock.calls[0]?.[0]?.where;
  expect(where).not.toHaveProperty("status");
  expect(where).not.toHaveProperty("bookedCount");
  expect(where).toEqual(expect.objectContaining({
    deletedAt: null,
    serviceId: 12,
    startsAt: { gte: new Date("2026-09-02T15:00:00.000Z") },
    endsAt: { lte: new Date("2026-09-03T15:00:00.000Z") },
    service: { deletedAt: null, status: "published" },
    shop: expect.objectContaining({ deletedAt: null, status: "published" })
  }));
  expect(scheduleSlot.count).toHaveBeenCalledWith({ where });
});
```

- [ ] **Step 5: Run the repository test and verify failure**

Run:

```bash
cd backend
npm test -- tests/booking-repository-scope.test.ts
```

Expected: FAIL because the repository still adds `status` and `bookedCount` for opt-in calls.

- [ ] **Step 6: Make unavailable filtering conditional**

Replace the unconditional availability predicates in `listAvailableSlots` with:

```ts
const where: Prisma.ScheduleSlotWhereInput = {
  deletedAt: null,
  ...(input.includeUnavailable
    ? {}
    : {
        status: "AVAILABLE",
        bookedCount: { lt: this.client.scheduleSlot.fields.capacity }
      }),
  ...(input.serviceId ? { serviceId: input.serviceId } : {}),
  ...(input.technicianServiceId ? { technicianServiceId: input.technicianServiceId } : {}),
  startsAt: { gte: input.from },
  endsAt: { lte: input.to },
  ...(input.serviceId
    ? {
        service: {
          deletedAt: null,
          status: "published"
        }
      }
    : {}),
  ...(input.technicianServiceId
    ? {
        technicianService: {
          deletedAt: null,
          isActive: true,
          isBookable: true
        }
      }
    : {}),
  shop: {
    deletedAt: null,
    status: "published",
    entitySuspensions: {
      none: { activeKey: { not: null }, status: "active", deletedAt: null }
    }
  },
  ...(input.shopId ? { shopId: input.shopId } : {}),
  ...(input.technicianId ? { technicianProfileId: input.technicianId } : {})
};
```

Do not change the existing `include`, ordering, pagination, or slot mapper.

- [ ] **Step 7: Document the opt-in OpenAPI field**

Update the availability summary/description to explain that the default remains bookable-only. Add this parameter after `technicianId`:

```ts
{
  name: "includeUnavailable",
  in: "query",
  description: "When true, include booked, blocked, and full formal slots for disabled time-option display.",
  schema: { type: "boolean", default: false }
}
```

- [ ] **Step 8: Run backend checks**

Run:

```bash
cd backend
npm test -- tests/booking-validator.test.ts tests/booking-repository-scope.test.ts tests/booking-api.test.ts
npm run build
```

Expected: all named Jest suites PASS and TypeScript build exits 0.

- [ ] **Step 9: Commit the API contract**

```bash
git add backend/src/validators/booking.validator.ts backend/src/repositories/booking.repository.ts backend/src/api/openapi.ts backend/tests/booking-validator.test.ts backend/tests/booking-repository-scope.test.ts backend/tests/booking-api.test.ts
git commit -m "feat: expose formal unavailable booking slots"
```

---

### Task 2: Frontend Booking API and Tokyo-day Selection Utilities

**Files:**
- Modify: `src/features/booking/api.ts:231-240`
- Modify: `src/features/booking/api.test.ts`
- Create: `src/pages/user/formal-checkout/checkoutTimeSlots.ts`
- Create: `src/pages/user/formal-checkout/checkoutTimeSlots.test.ts`

**Interfaces:**
- Consumes: `BookingScheduleSlot`, `bookingApi.listAvailability`, ISO timestamps.
- Produces: `AvailabilityQuery.includeUnavailable?: boolean`, `getTokyoDayWindow`, `getTokyoSlotParts`, `isCheckoutSlotBookable`, `slotsForCheckoutDate`, and `resolveInitialCheckoutSlotId`.

- [ ] **Step 1: Write failing API serialization and pure selection tests**

Add to `src/features/booking/api.test.ts`:

```ts
it("serializes the opt-in unavailable-slot query", async () => {
  vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({
    code: 0,
    message: "success",
    data: { list: [], total: 0, page: 1, page_size: 100 }
  }));

  await bookingApi.listAvailability({
    serviceId: 12,
    includeUnavailable: true,
    from: "2026-09-02T15:00:00.000Z",
    to: "2026-09-03T15:00:00.000Z",
    page: 1,
    pageSize: 100
  });

  const [requestUrl, requestInit] = vi.mocked(fetch).mock.calls[0]!;
  const parsedUrl = new URL(String(requestUrl), "http://needo.test");
  expect(parsedUrl.pathname).toBe("/api/v1/schedule/availability");
  expect(Object.fromEntries(parsedUrl.searchParams.entries())).toEqual({
    serviceId: "12",
    includeUnavailable: "true",
    from: "2026-09-02T15:00:00.000Z",
    to: "2026-09-03T15:00:00.000Z",
    page: "1",
    pageSize: "100"
  });
  expect(requestInit).toEqual(expect.objectContaining({ method: "GET" }));
});
```

Create `checkoutTimeSlots.test.ts` with a slot factory and these assertions:

```ts
import { describe, expect, it } from "vitest";
import type { BookingScheduleSlot } from "../../../features/booking/api";
import {
  getTokyoDayWindow,
  isCheckoutSlotBookable,
  resolveInitialCheckoutSlotId,
  slotsForCheckoutDate
} from "./checkoutTimeSlots";

const slot = (id: number, startsAt: string, status: BookingScheduleSlot["status"], bookedCount = 0): BookingScheduleSlot => ({
  id,
  serviceId: 12,
  technicianServiceId: null,
  shopId: 7,
  technicianProfileId: 9,
  startsAt,
  endsAt: new Date(new Date(startsAt).getTime() + 3_600_000).toISOString(),
  capacity: 1,
  bookedCount,
  status,
  serviceName: "肩颈调理",
  shopName: "GINZA Calm Body Lab",
  technicianName: "Misaki",
  priceAmount: "8800.00",
  currency: "JPY",
  durationMinutes: 60
});

const slots = [
  slot(1, "2026-09-02T23:00:00.000Z", "available"), // JST 09/03 08:00
  slot(2, "2026-09-03T01:00:00.000Z", "booked", 1), // JST 09/03 10:00
  slot(3, "2026-09-03T05:00:00.000Z", "available", 1), // JST 09/03 14:00 full
  slot(4, "2026-09-03T23:00:00.000Z", "available") // JST 09/04 08:00
];

it("builds the exact Tokyo calendar-day window", () => {
  expect(getTokyoDayWindow("2026-09-03")).toEqual({
    from: "2026-09-02T15:00:00.000Z",
    to: "2026-09-03T15:00:00.000Z"
  });
});

it("keeps unavailable same-day rows but never selects them", () => {
  expect(slotsForCheckoutDate(slots, "2026-09-03").map((item) => item.id)).toEqual([1, 2, 3]);
  expect(isCheckoutSlotBookable(slots[0]!)).toBe(true);
  expect(isCheckoutSlotBookable(slots[1]!)).toBe(false);
  expect(isCheckoutSlotBookable(slots[2]!)).toBe(false);
  expect(resolveInitialCheckoutSlotId(slots, "2026-09-03", "10:00")).toBe(1);
  expect(resolveInitialCheckoutSlotId(slots, "2026-09-04", "08:00")).toBe(4);
});
```

- [ ] **Step 2: Run frontend tests and verify failure**

Run:

```bash
npm test -- src/features/booking/api.test.ts src/pages/user/formal-checkout/checkoutTimeSlots.test.ts
```

Expected: FAIL because the query field and checkout time utility do not exist.

- [ ] **Step 3: Add the typed query field**

Add to `AvailabilityQuery`:

```ts
includeUnavailable?: boolean;
```

No request-layer change is needed beyond the type because the existing HTTP client serializes defined boolean query members.

- [ ] **Step 4: Implement the Tokyo-day utility**

Create `checkoutTimeSlots.ts`:

```ts
import type { BookingScheduleSlot } from "../../../features/booking/api";

const tokyoDateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Tokyo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit"
});

const tokyoTimeFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Tokyo",
  hourCycle: "h23",
  hour: "2-digit",
  minute: "2-digit"
});

function parts(formatter: Intl.DateTimeFormat, value: Date) {
  return new Map(formatter.formatToParts(value).map((part) => [part.type, part.value]));
}

export function getTokyoSlotParts(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  const dateParts = parts(tokyoDateFormatter, date);
  const timeParts = parts(tokyoTimeFormatter, date);
  return {
    date: `${dateParts.get("year")}-${dateParts.get("month")}-${dateParts.get("day")}`,
    time: `${timeParts.get("hour")}:${timeParts.get("minute")}`
  };
}

export function getTokyoDayWindow(date: string) {
  const from = new Date(`${date}T00:00:00+09:00`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(from.getTime())) return null;
  return {
    from: from.toISOString(),
    to: new Date(from.getTime() + 86_400_000).toISOString()
  };
}

export function remainingCheckoutCapacity(slot: BookingScheduleSlot) {
  return Math.max(0, slot.capacity - slot.bookedCount);
}

export function isCheckoutSlotBookable(slot: BookingScheduleSlot) {
  return slot.status === "available" && remainingCheckoutCapacity(slot) > 0;
}

export function slotsForCheckoutDate(slots: BookingScheduleSlot[], date: string) {
  return slots
    .filter((slot) => getTokyoSlotParts(slot.startsAt)?.date === date)
    .sort((left, right) => left.startsAt.localeCompare(right.startsAt) || left.id - right.id);
}

export function resolveInitialCheckoutSlotId(slots: BookingScheduleSlot[], date: string, requestedTime: string | null) {
  const sameDay = slotsForCheckoutDate(slots, date);
  const requested = requestedTime
    ? sameDay.find((slot) => getTokyoSlotParts(slot.startsAt)?.time === requestedTime && isCheckoutSlotBookable(slot))
    : null;
  return requested?.id ?? sameDay.find(isCheckoutSlotBookable)?.id ?? null;
}
```

- [ ] **Step 5: Run tests and commit**

Run:

```bash
npm test -- src/features/booking/api.test.ts src/pages/user/formal-checkout/checkoutTimeSlots.test.ts
```

Expected: both Vitest files PASS.

```bash
git add src/features/booking/api.ts src/features/booking/api.test.ts src/pages/user/formal-checkout/checkoutTimeSlots.ts src/pages/user/formal-checkout/checkoutTimeSlots.test.ts
git commit -m "feat: derive formal checkout times by Tokyo day"
```

---

### Task 3: Same-day Checkout Time Dropdown

**Files:**
- Create: `src/pages/user/formal-checkout/CheckoutTimeRow.tsx`
- Create: `src/pages/user/formal-checkout/CheckoutTimeRow.test.tsx`
- Modify: `src/pages/user/FormalCheckoutPage.tsx:120-225,445-505`
- Modify: `src/pages/user/FormalCheckoutPage.test.ts`

**Interfaces:**
- Consumes: Task 2's `slotsForCheckoutDate`, `isCheckoutSlotBookable`, `remainingCheckoutCapacity`, and `getTokyoSlotParts`.
- Produces: `CheckoutTimeRow` with props `{ date, people, slots, selectedSlotId, onSelect }`.

- [ ] **Step 1: Write failing dropdown interaction tests**

Create `CheckoutTimeRow.test.tsx` with a complete DOM interaction fixture:

```tsx
// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BookingScheduleSlot } from "../../../features/booking/api";
import { CheckoutTimeRow } from "./CheckoutTimeRow";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const slot = (id: number, startsAt: string, status: BookingScheduleSlot["status"], bookedCount = 0): BookingScheduleSlot => ({
  id,
  serviceId: 12,
  technicianServiceId: null,
  shopId: 7,
  technicianProfileId: 9,
  startsAt,
  endsAt: new Date(new Date(startsAt).getTime() + 3_600_000).toISOString(),
  capacity: 1,
  bookedCount,
  status,
  serviceName: "肩颈调理",
  shopName: "GINZA Calm Body Lab",
  technicianName: "Misaki",
  priceAmount: "8800.00",
  currency: "JPY",
  durationMinutes: 60
});

const slots = [
  slot(1, "2026-09-02T23:00:00.000Z", "available"),
  slot(2, "2026-09-03T01:00:00.000Z", "booked", 1),
  slot(3, "2026-09-03T23:00:00.000Z", "available")
];

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

async function click(element: Element) {
  await act(async () => element.dispatchEvent(new MouseEvent("click", { bubbles: true })));
}

function renderRow(onSelect = vi.fn()) {
  act(() => {
    root.render(
      <CheckoutTimeRow
        date="2026-09-03"
        onSelect={onSelect}
        people="1名"
        selectedSlotId={1}
        slots={slots}
      />
    );
  });
  return onSelect;
}

describe("CheckoutTimeRow", () => {
  it("shows only same-day formal times and disables unavailable rows", async () => {
    const onSelect = renderRow();
    const trigger = container.querySelector<HTMLButtonElement>('button[aria-label="选择预约时间"]')!;
    expect(trigger.getAttribute("aria-expanded")).toBe("false");

    await click(trigger);
    const listbox = container.querySelector('[role="listbox"]')!;
    const options = Array.from(listbox.querySelectorAll<HTMLButtonElement>('[role="option"]'));
    expect(listbox.getAttribute("aria-label")).toBe("2026-09-03 可预约时间");
    expect(options.map((option) => option.textContent?.trim())).toEqual(["08:00", "10:00"]);
    expect(options[0]?.disabled).toBe(false);
    expect(options[1]?.disabled).toBe(true);

    await click(options[1]!);
    expect(onSelect).not.toHaveBeenCalled();
    await click(options[0]!);
    expect(onSelect).toHaveBeenCalledWith(1);
    expect(container.querySelector('[role="listbox"]')).toBeNull();
  });

  it("closes on Escape and outside pointer interaction", async () => {
    renderRow();
    const trigger = container.querySelector<HTMLButtonElement>('button[aria-label="选择预约时间"]')!;
    await click(trigger);
    await act(async () => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    expect(container.querySelector('[role="listbox"]')).toBeNull();

    await click(trigger);
    await act(async () => document.body.dispatchEvent(new Event("pointerdown", { bubbles: true })));
    expect(container.querySelector('[role="listbox"]')).toBeNull();
  });
});
```

- [ ] **Step 2: Run the component test and verify failure**

Run:

```bash
npm test -- src/pages/user/formal-checkout/CheckoutTimeRow.test.tsx
```

Expected: FAIL because `CheckoutTimeRow` does not exist.

- [ ] **Step 3: Implement the focused dropdown component**

Create `CheckoutTimeRow.tsx` with this structure:

```tsx
import { useEffect, useMemo, useRef, useState } from "react";
import type { BookingScheduleSlot } from "../../../features/booking/api";
import { cn } from "../../../lib/utils";
import {
  getTokyoSlotParts,
  isCheckoutSlotBookable,
  remainingCheckoutCapacity,
  slotsForCheckoutDate
} from "./checkoutTimeSlots";

export function CheckoutTimeRow({ date, people, slots, selectedSlotId, onSelect }: {
  date: string;
  people: string;
  slots: BookingScheduleSlot[];
  selectedSlotId: number | null;
  onSelect: (slotId: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const sameDaySlots = useMemo(() => slotsForCheckoutDate(slots, date), [date, slots]);
  const selectedSlot = sameDaySlots.find((slot) => slot.id === selectedSlotId && isCheckoutSlotBookable(slot)) ?? null;

  useEffect(() => {
    if (!open) return undefined;
    const closeOnPointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", closeOnPointer);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnPointer);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  return (
    <div className="relative mt-2" ref={rootRef}>
      <div className="grid grid-cols-2 gap-2">
        <button
          aria-controls="formal-checkout-time-options"
          aria-expanded={open}
          aria-label="选择预约时间"
          className="focus-ring rounded-[22px] border border-[color:color-mix(in_srgb,var(--client-line)_74%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_72%,transparent)] p-4 text-left"
          onClick={() => setOpen((value) => !value)}
          type="button"
        >
          <p className="text-xs font-bold text-[color:var(--client-muted)]">时间</p>
          <p className="mt-2 text-[22px] font-black text-[color:var(--client-primary)]">
            {selectedSlot ? getTokyoSlotParts(selectedSlot.startsAt)?.time : "—"}
          </p>
          <p className="mt-1 truncate text-[11px] font-semibold text-[color:var(--client-muted)]">
            {selectedSlot?.technicianName ?? "店铺安排技师"}
          </p>
        </button>
        <div className="rounded-[22px] border border-[color:color-mix(in_srgb,var(--client-line)_74%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_72%,transparent)] p-4">
          <p className="text-xs font-bold text-[color:var(--client-muted)]">人数</p>
          <p className="mt-2 text-[22px] font-black text-[color:var(--client-text)]">{people}</p>
          <p className="mt-1 text-[11px] font-semibold text-[color:var(--client-muted)]">
            剩余 {selectedSlot ? remainingCheckoutCapacity(selectedSlot) : 0} 名
          </p>
        </div>
      </div>
      {open ? (
        <div
          aria-label={`${date} 可预约时间`}
          className="absolute inset-x-0 top-[calc(100%+8px)] z-50 grid max-h-60 gap-2 overflow-y-auto rounded-[20px] border border-[color:var(--client-line)] bg-[color:var(--client-surface)] p-2 shadow-[0_20px_46px_rgba(0,0,0,0.34)]"
          id="formal-checkout-time-options"
          role="listbox"
        >
          {sameDaySlots.map((slot) => {
            const bookable = isCheckoutSlotBookable(slot);
            const selected = slot.id === selectedSlotId;
            const time = getTokyoSlotParts(slot.startsAt)?.time ?? "—";
            return (
              <button
                aria-selected={selected}
                className={cn(
                  "rounded-[16px] border px-4 py-3 text-left text-sm font-black",
                  selected && bookable
                    ? "border-[color:var(--client-primary)] bg-[color:var(--client-primary-soft)] text-[color:var(--client-primary)]"
                    : bookable
                      ? "border-[color:var(--client-line)] text-[color:var(--client-text)]"
                      : "cursor-not-allowed border-[color:var(--client-line)] bg-[color:var(--client-elevated)] text-[color:var(--client-muted)] opacity-45"
                )}
                disabled={!bookable}
                key={slot.id}
                onClick={() => {
                  onSelect(slot.id);
                  setOpen(false);
                }}
                role="option"
                type="button"
              >
                {time}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 4: Replace the checkout's 21-day/available-only state logic**

In `FormalCheckoutPage.tsx`:

1. Import the new component and Task 2 utilities.
2. Add `selectedDate` state initialized from the route date or the current Tokyo date.
3. Build `from/to` with `getTokyoDayWindow(selectedDate)`.
4. Call `bookingApi.listAvailability` with `includeUnavailable: true`.
5. Store every returned formal row sorted by start/ID.
6. Set `selectedSlotId` with `resolveInitialCheckoutSlotId`.
7. Derive `selectedSlot` only when `isCheckoutSlotBookable` is true.
8. Replace the time/people card pair with:

```tsx
<CheckoutTimeRow
  date={selectedDate}
  onSelect={setSelectedSlotId}
  people={people}
  selectedSlotId={selectedSlotId}
  slots={slots}
/>
```

9. Delete the `slots.map` cross-day button list completely.
10. Update `technicianIsAvailable` to call `isCheckoutSlotBookable` so blocked/full slots do not mark a technician available.

- [ ] **Step 5: Add checkout source-contract assertions**

Update `FormalCheckoutPage.test.ts` to require:

```ts
expect(formalSource).toContain("includeUnavailable: true");
expect(formalSource).toContain("getTokyoDayWindow");
expect(formalSource).toContain("resolveInitialCheckoutSlotId");
expect(formalSource).toContain("<CheckoutTimeRow");
expect(formalSource).not.toContain("formatSlotDateTime(slot.startsAt)");
```

- [ ] **Step 6: Run tests, typecheck, and commit**

Run:

```bash
npm test -- src/pages/user/formal-checkout/CheckoutTimeRow.test.tsx src/pages/user/formal-checkout/checkoutTimeSlots.test.ts src/pages/user/FormalCheckoutPage.test.ts
npm run lint
```

Expected: all named Vitest files PASS and TypeScript exits 0.

```bash
git add src/pages/user/formal-checkout/CheckoutTimeRow.tsx src/pages/user/formal-checkout/CheckoutTimeRow.test.tsx src/pages/user/FormalCheckoutPage.tsx src/pages/user/FormalCheckoutPage.test.ts
git commit -m "fix: collapse checkout times into same-day dropdown"
```

---

### Task 4: Shared Technician Card Stripped Presentation

**Files:**
- Modify: `src/shared/profile-card/SocialProfileMiniCard.tsx:80-95,655-740,775-950`
- Modify: `src/shared/profile-card/SocialProfileMiniCard.test.ts`
- Modify: `src/pages/user/FormalCheckoutPage.tsx:220-245,550-615`
- Modify: `src/pages/user/FormalCheckoutPage.test.ts`

**Interfaces:**
- Consumes: existing `SocialProfileMiniCard` and formal `CoreServiceDetail.technician`.
- Produces: optional `showSocialStats?: boolean` and `showLevel?: boolean`, both defaulting to true.

- [ ] **Step 1: Write the failing stripped-presentation render test**

Add to `SocialProfileMiniCard.test.ts`:

```tsx
it("can reuse the technician card without social counts or level", () => {
  const markup = renderToStaticMarkup(
    createElement(
      ClientThemeProvider,
      null,
      createElement(
        MemoryRouter,
        null,
        createElement(SocialProfileMiniCard, {
          data: {
            id: "17",
            entityType: "technician",
            displayName: "Misaki",
            avatar: "/images/misaki.jpg",
            coverImage: "/images/misaki.jpg",
            regionLabel: "东京都",
            addressValue: "东京都",
            primaryLabel: "技师",
            kycVerified: true,
            levelLabel: "Lv.99",
            scoreLabel: "服务评价",
            scoreValue: "5.0/5",
            followerCount: 1200,
            followingCount: 300
          },
          detailTo: "/profiles/technician/17?view=card",
          showAction: false,
          showLevel: false,
          showSocialStats: false
        })
      )
    )
  );

  expect(markup).toContain("Misaki");
  expect(markup).toContain("5.0");
  expect(markup).toContain("东京都");
  expect(markup).not.toContain("粉丝：");
  expect(markup).not.toContain("关注：");
  expect(markup).not.toContain("Lv.99");
});
```

- [ ] **Step 2: Run the card test and verify failure**

Run:

```bash
npm test -- src/shared/profile-card/SocialProfileMiniCard.test.ts
```

Expected: FAIL because the two visibility props are not part of the component contract and the level/social rows still render.

- [ ] **Step 3: Add reusable visibility controls**

Extend `CommonSocialProfileMiniCardProps`:

```ts
showLevel?: boolean;
showSocialStats?: boolean;
```

Default both values to `true` in `SocialProfileMiniCard`. Pass `showLevel` into `InlineIdentityMeta`, and render the two optional sections as:

```tsx
<InlineIdentityMeta coverDark={coverDark} data={data} onCover showLevel={showLevel} />
```

```tsx
{showSocialStats ? (
  <div className={cn("flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] font-black leading-4", mutedClassName)}>
    <SocialStatsLine data={data} valueClassName={dark ? "text-white" : "text-[color:var(--client-text)]"} />
  </div>
) : null}
```

Inside the technician branch of `InlineIdentityMeta`, retain `EntityTypeTag` and wrap only `InlineLevelLabel` in `showLevel`.

- [ ] **Step 4: Replace the checkout-only technician markup**

Build `checkoutTechnicianCardData` with `useMemo` from formal fields only:

```ts
const checkoutTechnicianCardData = useMemo(() => {
  const technician = service?.technician;
  if (!technician) return null;
  return {
    id: String(technician.id),
    entityType: "technician" as const,
    displayName: technician.displayName,
    avatar: technician.avatarUrl ?? "",
    coverImage: technician.avatarUrl ?? "",
    regionLabel: technician.city,
    addressValue: technician.city,
    primaryLabel: "技师",
    kycVerified: true,
    levelLabel: "",
    scoreLabel: "服务评价",
    scoreValue: `${finiteRating(technician.reviewSummary.ratingAverage).toFixed(1)}/5`,
    followerCount: 0,
    followingCount: 0
  };
}, [service?.technician]);
```

Replace the bespoke button with:

```tsx
<SocialProfileMiniCard
  className="cursor-pointer"
  data={checkoutTechnicianCardData}
  detailTo={`/profiles/technician/${checkoutTechnicianCardData.id}?view=card`}
  onOpenDetails={() => navigate(`/profiles/technician/${checkoutTechnicianCardData.id}?view=card`)}
  showAction={false}
  showLevel={false}
  showSocialStats={false}
/>
```

Keep the existing `由店铺安排技师` empty state. Remove checkout-only `technicianSkills` and availability/status/card markup that no longer has a rendered consumer.

- [ ] **Step 5: Protect navigation and forbidden metadata**

Add to `FormalCheckoutPage.test.ts`:

```ts
expect(formalSource).toContain("<SocialProfileMiniCard");
expect(formalSource).toContain("showSocialStats={false}");
expect(formalSource).toContain("showLevel={false}");
expect(formalSource).toContain("?view=card");
expect(formalSource).not.toContain("navigate(`/technicians/");
expect(formalSource).not.toContain("acceptanceRatePercent}% 接单率");
```

- [ ] **Step 6: Run tests and commit**

Run:

```bash
npm test -- src/shared/profile-card/SocialProfileMiniCard.test.ts src/pages/user/FormalCheckoutPage.test.ts
npm run lint
```

Expected: named tests PASS and TypeScript exits 0.

```bash
git add src/shared/profile-card/SocialProfileMiniCard.tsx src/shared/profile-card/SocialProfileMiniCard.test.ts src/pages/user/FormalCheckoutPage.tsx src/pages/user/FormalCheckoutPage.test.ts
git commit -m "fix: reuse stripped technician card in checkout"
```

---

### Task 5: Read-only Formal Technician Information-card Page

**Files:**
- Create: `src/pages/user/TechnicianInfoCardRoutePage.tsx`
- Create: `src/pages/user/TechnicianInfoCardRoutePage.test.tsx`
- Modify: `src/pages/user/ProfileDetailPage.tsx:1-25`
- Modify: `src/pages/user/ProfileDetailPage.test.ts`

**Interfaces:**
- Consumes: `coreReadApi.getTechnicianDetail(id)`, `MobileFullscreenPage`, `MobileFullscreenHeader`, and `TechnicianPublicInfoCard`.
- Produces: `TechnicianInfoCardRoutePage({ id }: { id: number })` and the explicit `view=card` route branch.

- [ ] **Step 1: Write failing route-selection and formal-page tests**

Update `ProfileDetailPage.test.ts` to assert both behaviors:

```ts
expect(profileDetailSource).toContain('searchParams.get("view") === "card"');
expect(profileDetailSource).toContain("<TechnicianInfoCardRoutePage id={apiId} />");
expect(profileDetailSource).toContain("return <SocialProfilePage />");
```

Create `TechnicianInfoCardRoutePage.test.tsx` with the repository's React DOM test pattern. Use a complete `CoreTechnicianDetail` fixture, render the page under `ClientThemeProvider` and `MemoryRouter`, and query `document.body` because `MobileFullscreenPage` uses a portal:

```tsx
// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { coreReadApi, type CoreTechnicianDetail } from "../../features/core-read/api";
import { ClientThemeProvider } from "../../theme/ClientThemeProvider";
import { TechnicianInfoCardRoutePage } from "./TechnicianInfoCardRoutePage";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const detail: CoreTechnicianDetail = {
  id: 17,
  publicId: "s0000000017",
  displayName: "Misaki",
  city: "东京都",
  avatarUrl: "/images/misaki.jpg",
  reviewSummary: { ratingAverage: "5.0", reviewCount: 1, latestReviewAt: null, highlights: ["服务精神"] },
  age: 28,
  favoriteCount: 0,
  shareCount: 0,
  completedOrderCount: 12,
  acceptanceRatePercent: 100,
  primaryService: { id: 31, name: "肩颈调理", priceAmount: "8800.00", currency: "JPY", durationMinutes: 60 },
  shop: null,
  bio: "专业肩颈护理。",
  serviceArea: "银座",
  yearsExperience: 5,
  mediaAssets: [],
  services: [],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-09-01T00:00:00.000Z"
};

let container: HTMLDivElement;
let root: Root;

async function waitFor(assertion: () => void) {
  let lastError: unknown;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      assertion();
      return;
    } catch (error) {
      lastError = error;
      await act(async () => new Promise((resolve) => setTimeout(resolve, 0)));
    }
  }
  throw lastError;
}

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});

describe("TechnicianInfoCardRoutePage", () => {
  it("loads formal public detail and renders shared back/close controls", async () => {
    vi.spyOn(coreReadApi, "getTechnicianDetail").mockResolvedValue(detail);
    await act(async () => {
      root.render(
        <ClientThemeProvider>
          <MemoryRouter initialEntries={["/profiles/technician/17?view=card"]}>
            <TechnicianInfoCardRoutePage id={17} />
          </MemoryRouter>
        </ClientThemeProvider>
      );
    });

    await waitFor(() => expect(document.body.textContent).toContain("Misaki"));
    expect(coreReadApi.getTechnicianDetail).toHaveBeenCalledWith(17);
    expect(document.body.textContent).toContain("详细信息卡");
    expect(document.body.querySelector('button[aria-label="返回结算页"]')).not.toBeNull();
    expect(document.body.querySelector('button[aria-label="关闭详细信息卡"]')).not.toBeNull();
    expect(document.body.querySelector('[aria-label="打开技师设置"]')).toBeNull();
    expect(document.body.textContent).not.toContain("Test NDP");
    expect(document.body.textContent).not.toContain("隐私模式");
  });

  it("keeps retry and close available after a formal read failure", async () => {
    vi.spyOn(coreReadApi, "getTechnicianDetail").mockRejectedValue(new Error("network"));
    await act(async () => {
      root.render(
        <ClientThemeProvider>
          <MemoryRouter>
            <TechnicianInfoCardRoutePage id={17} />
          </MemoryRouter>
        </ClientThemeProvider>
      );
    });

    await waitFor(() => expect(document.body.textContent).toContain("技师详细信息读取失败"));
    expect(document.body.textContent).toContain("重新加载");
    expect(document.body.querySelector('button[aria-label="关闭详细信息卡"]')).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run the detail tests and verify failure**

Run:

```bash
npm test -- src/pages/user/ProfileDetailPage.test.ts src/pages/user/TechnicianInfoCardRoutePage.test.tsx
```

Expected: FAIL because the explicit card view and routed page do not exist.

- [ ] **Step 3: Implement formal public presentation mapping**

In `TechnicianInfoCardRoutePage.tsx`, add an exported pure mapper. Required fields use formal API values; required domain fields that are not rendered use neutral empty values rather than invented metrics:

```ts
export function buildFormalTechnicianInfoCard(detail: CoreTechnicianDetail): {
  technician: Technician;
  formalData: TechnicianFormalContactCardData;
} {
  const profileTags = Array.from(new Set([
    ...detail.reviewSummary.highlights,
    ...detail.services.map((service) => service.category.nameJa ?? service.category.name)
  ].map((value) => value.trim()).filter(Boolean)));
  const serviceAreas = detail.serviceArea
    ? detail.serviceArea.split(/[,，、\n]/).map((value) => value.trim()).filter(Boolean)
    : detail.city ? [detail.city] : [];

  return {
    technician: {
      id: String(detail.id),
      systemId: detail.publicId,
      name: detail.displayName,
      storeId: detail.shop ? String(detail.shop.id) : "",
      role: "therapist",
      status: "available",
      rating: Number(detail.reviewSummary.ratingAverage) || 0,
      orderCount: detail.completedOrderCount,
      income: 0,
      skills: profileTags,
      serviceAreas,
      acceptRate: detail.acceptanceRatePercent,
      cancelRate: 0,
      reviewCount: detail.reviewSummary.reviewCount,
      languages: [],
      avatar: detail.avatarUrl ?? "",
      bio: detail.bio ?? undefined,
      age: detail.age === null ? undefined : String(detail.age),
      identityLabel: detail.shop ? "店铺所属技师" : "个人技师",
      profileTags,
      gallery: detail.mediaAssets.map((asset) => asset.url)
    },
    formalData: {
      metrics: {
        completedOrderCount: detail.completedOrderCount,
        ratingAverage: String(detail.reviewSummary.ratingAverage),
        reviewCount: detail.reviewSummary.reviewCount,
        acceptanceRateBps: Math.round(detail.acceptanceRatePercent * 100)
      },
      contactDetails: {
        bidBudgetMinJpy: null,
        bidBudgetMaxJpy: null,
        paymentMethods: [],
        specialTags: [],
        profileTags,
        services: detail.services.map((service, index) => ({
          id: service.id,
          shopId: service.shop.id,
          name: service.name,
          priceAmount: Number(service.priceAmount) || 0,
          currency: service.currency,
          durationMinutes: service.durationMinutes,
          taxIncluded: true,
          sortOrder: index
        }))
      }
    }
  };
}
```

The mapper must not derive follower count, following count, level, wallet values, privacy state, languages, height, or bid budget.

- [ ] **Step 4: Implement the full-screen route page**

Use `useCoreReadQuery` with a local `revision` dependency. Render:

```tsx
<MobileFullscreenPage>
  <MobileFullscreenHeader
    backLabel="返回结算页"
    closeLabel="关闭详细信息卡"
    onBack={closePage}
    onClose={closePage}
    showSpacer={false}
    title="详细信息卡"
  />
  <main className="min-h-0 flex-1 overflow-y-auto px-4 pb-[calc(env(safe-area-inset-bottom)+24px)] pt-[calc(env(safe-area-inset-top)+86px)]">
    {query.data ? (
      <TechnicianPublicInfoCard
        formalData={presentation.formalData}
        technician={presentation.technician}
        themeScope="user"
      />
    ) : query.loading ? (
      <StatusPanel title="正在读取技师详细信息" />
    ) : (
      <StatusPanel
        action={<button onClick={() => setRevision((value) => value + 1)} type="button">重新加载</button>}
        description={query.error ?? "当前技师资料不可用"}
        title="技师详细信息读取失败"
      />
    )}
  </main>
</MobileFullscreenPage>
```

Implement `closePage` with the existing history-index pattern: `navigate(-1)` when `window.history.state.idx > 0`, otherwise `navigate("/", { replace: true })`.

- [ ] **Step 5: Select the card scene without changing the default profile**

In `ProfileDetailPage.tsx`, add `useSearchParams` and:

```tsx
const [searchParams] = useSearchParams();
const apiId = coreReadIdFromRoute(id);

if (entityType === "technician") {
  return searchParams.get("view") === "card" && apiId
    ? <TechnicianInfoCardRoutePage id={apiId} />
    : <SocialProfilePage />;
}
```

Keep customer/shop branches unchanged.

- [ ] **Step 6: Run tests, typecheck, and commit**

Run:

```bash
npm test -- src/pages/user/ProfileDetailPage.test.ts src/pages/user/TechnicianInfoCardRoutePage.test.tsx src/shared/profile-card/SocialProfileMiniCard.test.ts
npm run lint
```

Expected: all named tests PASS and TypeScript exits 0.

```bash
git add src/pages/user/TechnicianInfoCardRoutePage.tsx src/pages/user/TechnicianInfoCardRoutePage.test.tsx src/pages/user/ProfileDetailPage.tsx src/pages/user/ProfileDetailPage.test.ts
git commit -m "fix: route checkout technicians to formal info cards"
```

---

### Task 6: Integrated Regression and Standard-runtime Browser Acceptance

**Files:**
- Verify only: all files changed in Tasks 1-5
- Update only if a regression is found: the smallest owning file and its test

**Interfaces:**
- Consumes: completed backend/frontend changes and the standard local runtime.
- Produces: test, build, runtime, and browser evidence; no production deployment.

- [ ] **Step 1: Run the focused regression set**

```bash
cd backend
npm test -- tests/booking-validator.test.ts tests/booking-repository-scope.test.ts tests/booking-api.test.ts
npm run build
cd ..
npm test -- src/features/booking/api.test.ts src/pages/user/formal-checkout/checkoutTimeSlots.test.ts src/pages/user/formal-checkout/CheckoutTimeRow.test.tsx src/pages/user/FormalCheckoutPage.test.ts src/shared/profile-card/SocialProfileMiniCard.test.ts src/pages/user/ProfileDetailPage.test.ts src/pages/user/TechnicianInfoCardRoutePage.test.tsx
npm run build
```

Expected: every named suite PASS; both builds exit 0.

- [ ] **Step 2: Inspect the final diff boundary**

```bash
git diff --check HEAD~5..HEAD
git status --short
git diff --name-only HEAD~5..HEAD
```

Expected: no whitespace errors; no change to `src/App.tsx`, `src/pages/mobile/TechnicianPortalPage.tsx`, merchant staff files, or unrelated dirty files.

- [ ] **Step 3: Prove the standard listeners and formal proxy**

Run read-only listener/PID/cwd checks for ports 5180 and 3000, then:

```bash
curl -s http://127.0.0.1:3000/health
curl -s http://127.0.0.1:3000/ready
curl -I -s http://127.0.0.1:5180/user.html
curl -s http://127.0.0.1:5180/api/v1/health
```

Expected: backend health/ready are successful, frontend returns 200, and the frontend proxy reaches the same formal backend.

- [ ] **Step 4: Perform authenticated mobile browser acceptance**

At 390×844 or the current phone viewport:

1. Open the store detail route and click `立即预约`.
2. Confirm the route remains `/checkout/:serviceId` with the chosen date/time query.
3. Confirm no cross-day slot list appears.
4. Click the time card; confirm only `HH:mm` options for the displayed Tokyo date appear.
5. Confirm blocked/booked/full options are gray and do not change the summary.
6. Select a different available option; confirm time, technician, capacity, and booking-button state update.
7. Click the technician simple card from its cover, avatar, and body target; each must open `/profiles/technician/:id?view=card`.
8. Confirm the page title is `详细信息卡`, the right action is close, settings/tabs/social metrics/level are absent, and formal public data is visible.
9. Close; confirm history returns to the same checkout and retains the selected time.
10. Confirm no horizontal overflow, React runtime error, 401/429 loop, or failed formal API request appears in the console/network panel.

- [ ] **Step 5: Verify booking submission remains wired**

Using the authorized local TEST_NDP test account, submit one available slot only if no equivalent pending booking already exists. Confirm the request sends the newly selected `scheduleSlotId` and the response navigates to `/orders/:id`. Do not delete or mutate unrelated local records; report any created local order ID.

- [ ] **Step 6: Record final status**

Report separately:

- repository commits;
- backend test/build state;
- frontend test/build state;
- standard-runtime listener/proxy state;
- authenticated browser acceptance state;
- whether a local test order was created;
- production deployment state (`not performed`).
