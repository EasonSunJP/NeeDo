# Future Six-Month Operations Dataset Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist deterministic 2026-09-01 through 2027-02-28 JST schedules and future bookings in the local formal MySQL database using only the existing NeeDo test-account cohort.

**Architecture:** Add a pure deterministic planner, a read-only Prisma cohort resolver, and a separately guarded transactional apply path. The default command is dry-run; `--apply` is required for writes, and an independent checker proves counts, relationships, time ranges, idempotency, and absence of future completed work. The schedule/booking frontend cutover is a separate follow-on plan after this database deliverable is accepted.

**Tech Stack:** Node.js 22, TypeScript strict mode, Prisma 7, MySQL 8, Jest, existing NeeDo simulation safety configuration.

## Global Constraints

- Work only in `/Users/eason/Documents/New project` and preserve unrelated working-tree changes.
- Window is `[2026-09-01 00:00 JST, 2027-03-01 00:00 JST)`, stored as UTC.
- Reuse exactly the existing 100 technician and 100 customer test accounts, 10 shops, and their active service relationships.
- Do not create users, profiles, shops, services, public identifiers, passwords, or role grants.
- Do not delete or soft-delete the 2026-06 through 2026-08 historical dataset.
- Future booking states are only `PENDING`, `CONFIRMED`, or `CANCELLED`.
- Future bookings create no completed financial, payroll, review, settlement, or wallet records.
- Default execution is read-only dry-run; writes require `ALLOW_SIMULATION_SEED=true`, a local non-production MySQL URL, and `--apply`.
- Apply is transactional and idempotent; a non-matching record in the target window is a hard conflict, not something to overwrite.
- No new mock, demo, placeholder, fake API, `TODO`, `FIXME`, or `not implemented` code.
- Every task follows red-green-refactor TDD and ends in an independent commit.

---

## File Structure

- Create `backend/src/simulation/future-six-month-operations-plan.ts`: pure types, constants, deterministic schedule/booking planner, histories, validation, and summary.
- Create `backend/src/simulation/future-six-month-operations-dataset.ts`: Prisma cohort resolution, existing-window inspection, transactional persistence, and post-write reconciliation.
- Create `backend/scripts/seed-future-six-month-operations.ts`: environment loading, dry-run output, explicit `--apply` dispatch, and JSON result.
- Create `backend/scripts/check-future-six-month-operations.ts`: independent read-only database acceptance checker.
- Create `backend/tests/future-six-month-operations-plan.test.ts`: pure planner behavior and invariant tests.
- Create `backend/tests/future-six-month-operations-dataset.test.ts`: resolver, dry-run, conflict, idempotency, and transaction contract tests.
- Modify `backend/package.json`: named dry-run, apply, and checker commands.
- Modify `README.md`: replace the stale three-month-only operational-data section with separate historical and future dataset instructions.
- Modify `docs/MOCK_RETIREMENT_MAP.md`: record the real database prerequisite and keep frontend retirement marked pending until the separate cutover plan passes.

---

### Task 1: Deterministic Six-Month Planner

**Files:**
- Create: `backend/src/simulation/future-six-month-operations-plan.ts`
- Create: `backend/tests/future-six-month-operations-plan.test.ts`

**Interfaces:**
- Consumes: `FutureOperationsCohort` containing existing numeric IDs, stable keys, employment types, service duration, price, and fulfillment mode.
- Produces: `buildFutureSixMonthOperationsPlan(cohort): FutureOperationsPlan`, `validateFutureOperationsPlan(plan): FutureOperationsValidation`, and `summarizeFutureOperationsPlan(plan): FutureOperationsSummary`.

- [ ] **Step 1: Write the failing planner tests**

```ts
import {
  FUTURE_OPERATIONS_END_EXCLUSIVE_AT,
  FUTURE_OPERATIONS_NAMESPACE,
  FUTURE_OPERATIONS_START_AT,
  buildFutureSixMonthOperationsPlan,
  summarizeFutureOperationsPlan,
  validateFutureOperationsPlan,
  type FutureOperationsCohort
} from "../src/simulation/future-six-month-operations-plan";

const cohort: FutureOperationsCohort = {
  customers: Array.from({ length: 100 }, (_, index) => ({
    key: `customer-${String(index + 1).padStart(3, "0")}`,
    userId: 10_000 + index
  })),
  technicians: Array.from({ length: 100 }, (_, index) => ({
    key: `technician-${String(index + 1).padStart(3, "0")}`,
    userId: 20_000 + index,
    technicianProfileId: 30_000 + index,
    shopId: 40_000 + (index % 10),
    shopOwnerUserId: 50_000 + (index % 10),
    serviceId: 60_000 + (index % 10),
    technicianServiceId: 70_000 + index,
    employmentType: index < 63 ? "FULL_TIME" : "TEMPORARY",
    serviceName: "ボディケア",
    durationMinutes: 60,
    priceAmountJpy: 8_000,
    fulfillmentMode: "store"
  }))
};

describe("future six-month operations plan", () => {
  const first = buildFutureSixMonthOperationsPlan(cohort);
  const second = buildFutureSixMonthOperationsPlan(cohort);

  it("uses the approved JST window and a stable namespace", () => {
    expect(FUTURE_OPERATIONS_NAMESPACE).toBe("lifedance_future_ops_2026_09_2027_02_v1");
    expect(FUTURE_OPERATIONS_START_AT).toBe("2026-08-31T15:00:00.000Z");
    expect(FUTURE_OPERATIONS_END_EXCLUSIVE_AT).toBe("2027-02-28T15:00:00.000Z");
  });

  it("is deterministic and uses only supplied database identities", () => {
    expect(second).toEqual(first);
    expect(new Set(first.slots.map((slot) => slot.technicianProfileId))).toEqual(
      new Set(cohort.technicians.map((technician) => technician.technicianProfileId))
    );
    expect(
      first.bookings.every((booking) =>
        cohort.customers.some((customer) => customer.userId === booking.customerUserId)
      )
    ).toBe(true);
  });

  it("creates realistic full-time and temporary schedules without overlaps", () => {
    const validation = validateFutureOperationsPlan(first);
    expect(validation).toEqual({
      customerOverlapCount: 0,
      duplicateOrderNoCount: 0,
      invalidRelationshipCount: 0,
      technicianOverlapCount: 0,
      futureTerminalStatusCount: 0
    });
    expect(first.slots.length).toBeGreaterThan(35_000);
    expect(first.slots.length).toBeLessThan(45_000);
  });

  it("limits future bookings to pending, confirmed and cancelled", () => {
    expect(new Set(first.bookings.map((booking) => booking.status))).toEqual(
      new Set(["PENDING", "CONFIRMED", "CANCELLED"])
    );
    expect(first.bookings.some((booking) => booking.status === "COMPLETED")).toBe(false);
    expect(first.bookings.some((booking) => booking.status === "IN_SERVICE")).toBe(false);
  });

  it("reports every approved calendar month", () => {
    expect(Object.keys(summarizeFutureOperationsPlan(first).months)).toEqual([
      "2026-09",
      "2026-10",
      "2026-11",
      "2026-12",
      "2027-01",
      "2027-02"
    ]);
  });
});
```

- [ ] **Step 2: Run the planner test and verify RED**

Run:

```bash
cd backend
npm test -- future-six-month-operations-plan.test.ts
```

Expected: FAIL because `future-six-month-operations-plan.ts` does not exist.

- [ ] **Step 3: Implement the pure planner**

Create the following exported contract and deterministic rules:

```ts
export const FUTURE_OPERATIONS_NAMESPACE = "lifedance_future_ops_2026_09_2027_02_v1";
export const FUTURE_OPERATIONS_ORDER_PREFIX = "LDF26-";
export const FUTURE_OPERATIONS_START_AT = "2026-08-31T15:00:00.000Z";
export const FUTURE_OPERATIONS_END_EXCLUSIVE_AT = "2027-02-28T15:00:00.000Z";
export const FUTURE_OPERATIONS_AS_OF_AT = "2026-08-28T00:00:00.000Z";

export type FutureBookingStatus = "PENDING" | "CONFIRMED" | "CANCELLED";
export type FutureSlotStatus = "AVAILABLE" | "BOOKED" | "BLOCKED";

export interface FutureOperationsCustomerInput {
  key: string;
  userId: number;
}

export interface FutureOperationsTechnicianInput {
  key: string;
  userId: number;
  technicianProfileId: number;
  shopId: number;
  shopOwnerUserId: number;
  serviceId: number;
  technicianServiceId: number;
  employmentType: "FULL_TIME" | "TEMPORARY";
  serviceName: string;
  durationMinutes: number;
  priceAmountJpy: number;
  fulfillmentMode: "store" | "home_visit";
}

export interface FutureOperationsCohort {
  customers: FutureOperationsCustomerInput[];
  technicians: FutureOperationsTechnicianInput[];
}

export interface FutureAvailabilityPlan {
  key: string;
  technicianProfileId: number;
  shopId: number;
  startsAt: string;
  endsAt: string;
  isActive: boolean;
}

export interface FutureSlotPlan extends FutureAvailabilityPlan {
  serviceId: number;
  technicianServiceId: number;
  status: FutureSlotStatus;
  bookedCount: 0 | 1;
}

export interface FutureBookingPlan {
  orderNo: string;
  customerUserId: number;
  technicianProfileId: number;
  technicianServiceId: number;
  shopId: number;
  shopOwnerUserId: number;
  serviceId: number;
  slotKey: string;
  status: FutureBookingStatus;
  fulfillmentMode: "store" | "home_visit";
  serviceName: string;
  priceAmountJpy: number;
  durationMinutes: number;
  startsAt: string;
  endsAt: string;
  createdAt: string;
  cancelReason: string | null;
}

export interface FutureHistoryPlan {
  orderNo: string;
  fromStatus: FutureBookingStatus | null;
  toStatus: FutureBookingStatus;
  actorUserId: number;
  reason: string;
  createdAt: string;
}

export interface FutureOperationsPlan {
  availabilities: FutureAvailabilityPlan[];
  slots: FutureSlotPlan[];
  bookings: FutureBookingPlan[];
  histories: FutureHistoryPlan[];
}

export interface FutureOperationsValidation {
  technicianOverlapCount: number;
  customerOverlapCount: number;
  duplicateOrderNoCount: number;
  invalidRelationshipCount: number;
  futureTerminalStatusCount: number;
}

export interface FutureOperationsMonthSummary {
  availabilities: number;
  slots: number;
  bookings: number;
  statuses: Record<FutureBookingStatus, number>;
}

export interface FutureOperationsSummary {
  availabilities: number;
  slots: number;
  bookings: number;
  histories: number;
  months: Record<string, FutureOperationsMonthSummary>;
}

const MONTH_OCCUPANCY = new Map([
  ["2026-09", 65],
  ["2026-10", 55],
  ["2026-11", 45],
  ["2026-12", 50],
  ["2027-01", 35],
  ["2027-02", 25]
]);

const stableNumber = (...values: number[]): number =>
  values.reduce((result, value, index) => (result * 131 + value * (index + 17)) % 100_003, 97);

const toTokyoDateKey = (instant: Date): string =>
  new Date(instant.getTime() + 9 * 60 * 60_000).toISOString().slice(0, 10);

const toTokyoMonthKey = (instant: Date): string => toTokyoDateKey(instant).slice(0, 7);

const atTokyoHour = (dateKey: string, hour: number): Date => {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(year!, month! - 1, day!, hour - 9, 0, 0, 0));
};

const overlaps = (leftStart: string, leftEnd: string, rightStart: string, rightEnd: string): boolean =>
  leftStart < rightEnd && rightStart < leftEnd;

export const buildFutureSixMonthOperationsPlan = (
  cohort: FutureOperationsCohort
): FutureOperationsPlan => {
  if (cohort.technicians.length !== 100 || cohort.customers.length !== 100) {
    throw new Error("Future operations require exactly 100 technicians and 100 customers.");
  }

  const availabilities: FutureAvailabilityPlan[] = [];
  const slots: FutureSlotPlan[] = [];
  const bookings: FutureBookingPlan[] = [];
  const histories: FutureHistoryPlan[] = [];
  const customerBusy = new Map<number, Array<{ startsAt: string; endsAt: string }>>();
  let slotSequence = 0;
  let bookingSequence = 0;

  for (
    let cursor = new Date(FUTURE_OPERATIONS_START_AT), dayIndex = 0;
    cursor < new Date(FUTURE_OPERATIONS_END_EXCLUSIVE_AT);
    cursor = new Date(cursor.getTime() + 24 * 60 * 60_000), dayIndex += 1
  ) {
    const dateKey = toTokyoDateKey(cursor);
    const dayOfWeek = new Date(`${dateKey}T00:00:00.000Z`).getUTCDay();

    for (const [technicianIndex, technician] of cohort.technicians.entries()) {
      const worksToday = technician.employmentType === "FULL_TIME"
        ? !new Set([technicianIndex % 7, (technicianIndex + 3) % 7]).has(dayOfWeek)
        : new Set([
            technicianIndex % 7,
            (technicianIndex + 2) % 7,
            (technicianIndex + 5) % 7
          ]).has(dayOfWeek);
      if (!worksToday) continue;

      const hours = technician.employmentType === "FULL_TIME" ? [10, 12, 14, 16] : [11, 14, 17];
      for (const [slotIndex, hour] of hours.entries()) {
        slotSequence += 1;
        const startsAtDate = atTokyoHour(dateKey, hour);
        const endsAtDate = new Date(startsAtDate.getTime() + technician.durationMinutes * 60_000);
        const startsAt = startsAtDate.toISOString();
        const endsAt = endsAtDate.toISOString();
        const key = `future-slot-${String(slotSequence).padStart(6, "0")}`;
        const blocked = stableNumber(technicianIndex, dayIndex, slotIndex, 29) % 37 === 0;
        const occupancy = MONTH_OCCUPANCY.get(toTokyoMonthKey(startsAtDate));
        if (occupancy === undefined) throw new Error(`Unsupported future month for ${startsAt}.`);
        const selected = !blocked && stableNumber(technicianIndex, dayIndex, slotIndex, 43) % 100 < occupancy;
        const cancelled = selected && stableNumber(technicianIndex, dayIndex, slotIndex, 61) % 100 < 8;
        const status: FutureSlotStatus = blocked
          ? "BLOCKED"
          : selected && !cancelled
            ? "BOOKED"
            : "AVAILABLE";

        availabilities.push({
          key: `future-availability-${String(slotSequence).padStart(6, "0")}`,
          technicianProfileId: technician.technicianProfileId,
          shopId: technician.shopId,
          startsAt,
          endsAt,
          isActive: !blocked
        });
        slots.push({
          key,
          technicianProfileId: technician.technicianProfileId,
          shopId: technician.shopId,
          serviceId: technician.serviceId,
          technicianServiceId: technician.technicianServiceId,
          startsAt,
          endsAt,
          isActive: !blocked,
          status,
          bookedCount: status === "BOOKED" ? 1 : 0
        });
        if (!selected) continue;

        const customerOffset = stableNumber(technicianIndex, dayIndex, slotIndex, 73) % cohort.customers.length;
        const customer = Array.from({ length: cohort.customers.length }, (_, offset) =>
          cohort.customers[(customerOffset + offset) % cohort.customers.length]!
        ).find((candidate) =>
          !(customerBusy.get(candidate.userId) ?? []).some((busy) =>
            overlaps(startsAt, endsAt, busy.startsAt, busy.endsAt)
          )
        );
        if (!customer) continue;

        bookingSequence += 1;
        customerBusy.set(customer.userId, [
          ...(customerBusy.get(customer.userId) ?? []),
          { startsAt, endsAt }
        ]);
        const bookingStatus: FutureBookingStatus = cancelled
          ? "CANCELLED"
          : stableNumber(bookingSequence, technicianIndex, 89) % 4 === 0
            ? "PENDING"
            : "CONFIRMED";
        const createdAt = new Date(
          Math.min(
            new Date(FUTURE_OPERATIONS_AS_OF_AT).getTime() - (1 + bookingSequence % 14) * 60 * 60_000,
            startsAtDate.getTime() - (3 + bookingSequence % 45) * 24 * 60 * 60_000
          )
        ).toISOString();
        const orderNo = `${FUTURE_OPERATIONS_ORDER_PREFIX}${String(bookingSequence).padStart(7, "0")}`;
        bookings.push({
          orderNo,
          customerUserId: customer.userId,
          technicianProfileId: technician.technicianProfileId,
          technicianServiceId: technician.technicianServiceId,
          shopId: technician.shopId,
          shopOwnerUserId: technician.shopOwnerUserId,
          serviceId: technician.serviceId,
          slotKey: key,
          status: bookingStatus,
          fulfillmentMode: technician.fulfillmentMode,
          serviceName: technician.serviceName,
          priceAmountJpy: technician.priceAmountJpy,
          durationMinutes: technician.durationMinutes,
          startsAt,
          endsAt,
          createdAt,
          cancelReason: bookingStatus === "CANCELLED" ? "お客様の予定変更によりキャンセルしました。" : null
        });
        histories.push({
          orderNo,
          fromStatus: null,
          toStatus: "PENDING",
          actorUserId: customer.userId,
          reason: "予約を受け付けました。",
          createdAt
        });
        if (bookingStatus !== "PENDING") {
          histories.push({
            orderNo,
            fromStatus: "PENDING",
            toStatus: bookingStatus,
            actorUserId: bookingStatus === "CANCELLED" ? customer.userId : technician.shopOwnerUserId,
            reason: bookingStatus === "CANCELLED"
              ? "お客様の予定変更によりキャンセルしました。"
              : "店舗が予約内容を確認しました。",
            createdAt: new Date(new Date(createdAt).getTime() + 30 * 60_000).toISOString()
          });
        }
      }
    }
  }

  return { availabilities, slots, bookings, histories };
};
```

In the same file, add the validation and summary functions:

```ts
const countOverlaps = (
  rows: Array<{ ownerId: number; startsAt: string; endsAt: string }>
): number => {
  const byOwner = new Map<number, Array<{ startsAt: string; endsAt: string }>>();
  for (const row of rows) {
    byOwner.set(row.ownerId, [...(byOwner.get(row.ownerId) ?? []), row]);
  }
  let count = 0;
  for (const intervals of byOwner.values()) {
    const sorted = [...intervals].sort((left, right) => left.startsAt.localeCompare(right.startsAt));
    let latestEnd = "";
    for (const interval of sorted) {
      if (latestEnd && interval.startsAt < latestEnd) count += 1;
      if (interval.endsAt > latestEnd) latestEnd = interval.endsAt;
    }
  }
  return count;
};

export const validateFutureOperationsPlan = (
  plan: FutureOperationsPlan
): FutureOperationsValidation => {
  const slotByKey = new Map(plan.slots.map((slot) => [slot.key, slot]));
  const orderNumbers = plan.bookings.map((booking) => booking.orderNo);
  const invalidRelationshipCount = plan.bookings.filter((booking) => {
    const slot = slotByKey.get(booking.slotKey);
    return !slot ||
      slot.technicianProfileId !== booking.technicianProfileId ||
      slot.technicianServiceId !== booking.technicianServiceId ||
      slot.shopId !== booking.shopId ||
      slot.serviceId !== booking.serviceId ||
      slot.startsAt !== booking.startsAt ||
      slot.endsAt !== booking.endsAt ||
      (booking.status === "CANCELLED" && slot.status !== "AVAILABLE") ||
      (booking.status !== "CANCELLED" && slot.status !== "BOOKED");
  }).length;

  return {
    technicianOverlapCount: countOverlaps(
      plan.slots.map((slot) => ({
        ownerId: slot.technicianProfileId,
        startsAt: slot.startsAt,
        endsAt: slot.endsAt
      }))
    ),
    customerOverlapCount: countOverlaps(
      plan.bookings
        .filter((booking) => booking.status !== "CANCELLED")
        .map((booking) => ({
          ownerId: booking.customerUserId,
          startsAt: booking.startsAt,
          endsAt: booking.endsAt
        }))
    ),
    duplicateOrderNoCount: orderNumbers.length - new Set(orderNumbers).size,
    invalidRelationshipCount,
    futureTerminalStatusCount: plan.bookings.filter(
      (booking) => !new Set<FutureBookingStatus>(["PENDING", "CONFIRMED", "CANCELLED"]).has(booking.status)
    ).length
  };
};

export const summarizeFutureOperationsPlan = (
  plan: FutureOperationsPlan
): FutureOperationsSummary => {
  const months: Record<string, FutureOperationsMonthSummary> = {};
  for (const month of [...MONTH_OCCUPANCY.keys()]) {
    months[month] = {
      availabilities: 0,
      slots: 0,
      bookings: 0,
      statuses: { PENDING: 0, CONFIRMED: 0, CANCELLED: 0 }
    };
  }
  for (const availability of plan.availabilities) {
    months[toTokyoMonthKey(new Date(availability.startsAt))]!.availabilities += 1;
  }
  for (const slot of plan.slots) {
    months[toTokyoMonthKey(new Date(slot.startsAt))]!.slots += 1;
  }
  for (const booking of plan.bookings) {
    const month = months[toTokyoMonthKey(new Date(booking.startsAt))]!;
    month.bookings += 1;
    month.statuses[booking.status] += 1;
  }
  return {
    availabilities: plan.availabilities.length,
    slots: plan.slots.length,
    bookings: plan.bookings.length,
    histories: plan.histories.length,
    months
  };
};
```

- [ ] **Step 4: Run the planner test and verify GREEN**

Run:

```bash
cd backend
npm test -- future-six-month-operations-plan.test.ts
```

Expected: PASS with all planner invariants and an observed slot count between 35,000 and 45,000.

- [ ] **Step 5: Commit the planner**

```bash
git add backend/src/simulation/future-six-month-operations-plan.ts backend/tests/future-six-month-operations-plan.test.ts
git commit -m "feat: plan six months of future operations"
```

---

### Task 2: Existing-Cohort Resolver and Read-Only Dry-Run

**Files:**
- Create: `backend/src/simulation/future-six-month-operations-dataset.ts`
- Create: `backend/scripts/seed-future-six-month-operations.ts`
- Create: `backend/tests/future-six-month-operations-dataset.test.ts`
- Modify: `backend/package.json`

**Interfaces:**
- Consumes: Prisma client and `buildThreeMonthSimulationPlan()` only for the stable existing account email/key inventory.
- Produces: `loadFutureOperationsCohort(prisma): Promise<FutureOperationsCohort>`, `inspectFutureOperationsWindow(prisma, plan): Promise<FutureOperationsInspection>`, and a default dry-run CLI.

- [ ] **Step 1: Write failing resolver and command-contract tests**

```ts
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("future operations dataset contract", () => {
  const datasetSource = readFileSync(
    resolve(__dirname, "../src/simulation/future-six-month-operations-dataset.ts"),
    "utf8"
  );
  const commandSource = readFileSync(
    resolve(__dirname, "../scripts/seed-future-six-month-operations.ts"),
    "utf8"
  );

  it("resolves the existing cohort and never creates identity entities", () => {
    expect(datasetSource).toContain("buildThreeMonthSimulationPlan");
    expect(datasetSource).toContain("user.findMany");
    expect(datasetSource).toContain("technicianProfile.findMany");
    expect(datasetSource).toContain("technicianService.findMany");
    expect(datasetSource).not.toMatch(/(?:user|technicianProfile|customerProfile|shop|service)\.create/);
  });

  it("is dry-run unless the explicit apply argument is present", () => {
    expect(commandSource).toContain('process.argv.includes("--apply")');
    expect(commandSource).toContain('mode: apply ? "apply" : "dry-run"');
    expect(commandSource).toContain("getSimulationSeedConfig");
  });
});
```

- [ ] **Step 2: Run the dataset test and verify RED**

Run:

```bash
cd backend
npm test -- future-six-month-operations-dataset.test.ts
```

Expected: FAIL because the dataset and command files do not exist.

- [ ] **Step 3: Implement strict existing-cohort resolution**

Use the existing plan only to obtain the stable email/key inventory, then query the database in bounded set-based reads:

```ts
import type { Prisma, PrismaClient } from "@prisma/client";
import { buildThreeMonthSimulationPlan } from "./three-month-simulation-plan";
import type {
  FutureOperationsCohort,
  FutureOperationsPlan
} from "./future-six-month-operations-plan";
import {
  FUTURE_OPERATIONS_END_EXCLUSIVE_AT,
  FUTURE_OPERATIONS_NAMESPACE,
  FUTURE_OPERATIONS_START_AT
} from "./future-six-month-operations-plan";

export interface FutureOperationsInspection {
  activeAvailabilities: number;
  activeSlots: number;
  namespacedBookings: number;
  conflictingBookings: number;
}

const assert = (condition: unknown, message: string): asserts condition => {
  if (!condition) throw new Error(message);
};

type FutureOperationsDb = Prisma.TransactionClient;

const readJsonRecord = (value: Prisma.JsonValue | null): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

export const loadFutureOperationsCohort = async (
  prisma: PrismaClient
): Promise<FutureOperationsCohort> => {
  const inventory = buildThreeMonthSimulationPlan();
  const technicianByEmail = new Map(inventory.technicians.map((item) => [item.email, item]));
  const customerByEmail = new Map(inventory.customers.map((item) => [item.email, item]));
  const emails = [...technicianByEmail.keys(), ...customerByEmail.keys()];
  const users = await prisma.user.findMany({
    where: { email: { in: emails }, deletedAt: null, isActive: true },
    select: { id: true, email: true }
  });
  assert(users.length === 200, `Expected 200 existing test users, found ${users.length}.`);

  const userIdByEmail = new Map(users.map((user) => [user.email, user.id]));
  const technicianUserIds = [...technicianByEmail.keys()].map((email) => {
    const userId = userIdByEmail.get(email);
    assert(userId, `Existing technician account is missing: ${email}`);
    return userId;
  });
  const profiles = await prisma.technicianProfile.findMany({
    where: { userId: { in: technicianUserIds }, deletedAt: null, isPublished: true },
    select: {
      id: true,
      userId: true,
      shopId: true,
      employmentType: true,
      shop: { select: { ownerUserId: true, deletedAt: true } },
      technicianServices: {
        where: { deletedAt: null, isActive: true, isBookable: true },
        select: {
          id: true,
          shopId: true,
          name: true,
          durationMinutes: true,
          priceAmount: true,
          sourceShopServiceId: true,
          sourceShopService: {
            select: { id: true, serviceMode: true, shopId: true, deletedAt: true }
          }
        }
      }
    }
  });
  assert(profiles.length === 100, `Expected 100 existing technician profiles, found ${profiles.length}.`);

  const profileByUserId = new Map(profiles.map((profile) => [profile.userId, profile]));
  const technicians = inventory.technicians.map((item) => {
    const userId = userIdByEmail.get(item.email);
    assert(userId, `Existing technician account is missing: ${item.email}`);
    const profile = profileByUserId.get(userId);
    assert(profile?.shopId && profile.shop && !profile.shop.deletedAt, `Active shop is missing for ${item.email}.`);
    assert(profile.technicianServices.length === 1, `Expected one active bookable service for ${item.email}.`);
    const assignment = profile.technicianServices[0]!;
    const source = assignment.sourceShopService;
    assert(source && !source.deletedAt, `Active source service is missing for ${item.email}.`);
    assert(assignment.shopId === profile.shopId && source.shopId === profile.shopId, `Cross-shop service relation for ${item.email}.`);
    assert(profile.employmentType === "FULL_TIME" || profile.employmentType === "TEMPORARY", `Unsupported employment type for ${item.email}.`);
    assert(source.serviceMode === "store" || source.serviceMode === "home_visit", `Unsupported service mode for ${item.email}.`);
    return {
      key: item.key,
      userId,
      technicianProfileId: profile.id,
      shopId: profile.shopId,
      shopOwnerUserId: profile.shop.ownerUserId,
      serviceId: source.id,
      technicianServiceId: assignment.id,
      employmentType: profile.employmentType,
      serviceName: assignment.name,
      durationMinutes: assignment.durationMinutes,
      priceAmountJpy: Number(assignment.priceAmount),
      fulfillmentMode: source.serviceMode
    } as const;
  });

  const customers = inventory.customers.map((item) => {
    const userId = userIdByEmail.get(item.email);
    assert(userId, `Existing customer account is missing: ${item.email}`);
    return { key: item.key, userId };
  });
  return { customers, technicians };
};

export const inspectFutureOperationsWindow = async (
  prisma: FutureOperationsDb,
  plan: FutureOperationsPlan
): Promise<FutureOperationsInspection> => {
  const technicianProfileIds = [...new Set(plan.slots.map((slot) => slot.technicianProfileId))];
  const window = {
    gte: new Date(FUTURE_OPERATIONS_START_AT),
    lt: new Date(FUTURE_OPERATIONS_END_EXCLUSIVE_AT)
  };
  const [activeAvailabilities, activeSlots, bookings] = await Promise.all([
    prisma.availability.count({
      where: { technicianProfileId: { in: technicianProfileIds }, startsAt: window, deletedAt: null }
    }),
    prisma.scheduleSlot.count({
      where: { technicianProfileId: { in: technicianProfileIds }, startsAt: window, deletedAt: null }
    }),
    prisma.bookingOrder.findMany({
      where: { technicianProfileId: { in: technicianProfileIds }, startsAt: window, deletedAt: null },
      select: { serviceSnapshotJson: true }
    })
  ]);
  const namespacedBookings = bookings.filter(
    (booking) =>
      readJsonRecord(booking.serviceSnapshotJson)?.namespace === FUTURE_OPERATIONS_NAMESPACE
  ).length;
  return {
    activeAvailabilities,
    activeSlots,
    namespacedBookings,
    conflictingBookings: bookings.length - namespacedBookings
  };
};
```

- [ ] **Step 4: Implement the default dry-run command and package script**

The script must load `.env.dev` before dynamically importing Prisma, call `getSimulationSeedConfig`, resolve the cohort, build and validate the plan, inspect the target window, and print JSON. It must call the apply function only inside `if (apply)`:

```ts
const apply = process.argv.includes("--apply");
const cohort = await loadFutureOperationsCohort(prisma);
const plan = buildFutureSixMonthOperationsPlan(cohort);
const validation = validateFutureOperationsPlan(plan);
const inspection = await inspectFutureOperationsWindow(prisma, plan);
const result = apply
  ? await applyFutureOperationsPlan(prisma, plan)
  : { mode: "dry-run" as const, inspection, summary: summarizeFutureOperationsPlan(plan), validation };
console.log(JSON.stringify({ database: seedConfig.databaseName, mode: apply ? "apply" : "dry-run", ...result }, null, 2));
```

Add scripts:

```json
"plan:future-operations": "ALLOW_SIMULATION_SEED=true ENV_FILE=.env.dev tsx scripts/seed-future-six-month-operations.ts",
"seed:future-operations": "ALLOW_SIMULATION_SEED=true ENV_FILE=.env.dev tsx scripts/seed-future-six-month-operations.ts --apply",
"check:future-operations": "ALLOW_SIMULATION_SEED=true ENV_FILE=.env.dev tsx scripts/check-future-six-month-operations.ts"
```

- [ ] **Step 5: Run tests and a real read-only dry-run**

Run:

```bash
cd backend
npm test -- future-six-month-operations-dataset.test.ts future-six-month-operations-plan.test.ts
npm run plan:future-operations
```

Expected: tests PASS; dry-run reports database `needo_dev`, 100 technicians, 100 customers, six month keys, zero existing target-window conflicts, and no writes.

- [ ] **Step 6: Prove dry-run made no writes**

Run the existing checker before and after the dry-run:

```bash
cd backend
npm run check:lifedance-operations
npm run plan:future-operations
npm run check:lifedance-operations
```

Expected: both historical checker outputs remain identical for account, shop, historical slot, booking, finance, payroll, contact, conversation, and message totals.

- [ ] **Step 7: Commit the resolver and dry-run**

```bash
git add backend/src/simulation/future-six-month-operations-dataset.ts backend/scripts/seed-future-six-month-operations.ts backend/tests/future-six-month-operations-dataset.test.ts backend/package.json
git commit -m "feat: add future operations dry run"
```

---

### Task 3: Transactional Apply and Idempotency

**Files:**
- Modify: `backend/src/simulation/future-six-month-operations-dataset.ts`
- Modify: `backend/tests/future-six-month-operations-dataset.test.ts`

**Interfaces:**
- Consumes: validated `FutureOperationsPlan` and Prisma client.
- Produces: `applyFutureOperationsPlan(prisma, plan): Promise<FutureOperationsApplyResult>` with `created` or `noop` mode.

- [ ] **Step 1: Add failing apply-contract tests**

```ts
it("uses one transaction and never overwrites unrelated target-window records", () => {
  expect(datasetSource).toContain("prisma.$transaction");
  expect(datasetSource).toContain("Target window contains non-matching operational data");
  expect(datasetSource).not.toMatch(/(?:availability|scheduleSlot|bookingOrder)\.deleteMany/);
});

it("persists only future-safe order side effects", () => {
  expect(datasetSource).toContain("orderStatusHistory.createMany");
  expect(datasetSource).toContain("notification.createMany");
  expect(datasetSource).not.toMatch(/(?:orderFinancial|walletHold|walletLedger|payRun|payslip|orderReview)\.(?:create|createMany)/);
});

it("stores the dataset namespace in every auditable booking artifact", () => {
  expect(datasetSource).toContain("FUTURE_OPERATIONS_NAMESPACE");
  expect(datasetSource).toContain("serviceSnapshotJson");
  expect(datasetSource).toContain("metadata: { namespace: FUTURE_OPERATIONS_NAMESPACE }");
  expect(datasetSource).toContain("payload: { namespace: FUTURE_OPERATIONS_NAMESPACE");
});
```

- [ ] **Step 2: Run the dataset test and verify RED**

Run:

```bash
cd backend
npm test -- future-six-month-operations-dataset.test.ts
```

Expected: FAIL because `applyFutureOperationsPlan` and its transactional writes are absent.

- [ ] **Step 3: Implement exact-match idempotency and conflict refusal**

Inside the transaction:

1. Re-run `inspectFutureOperationsWindow` using the transaction client.
2. If the target window is empty, continue to create.
3. If records exist, load all target-window rows and compare the complete deterministic composite sets:
   - availability: `technicianProfileId|shopId|startsAt|endsAt|isActive`;
   - slot: `technicianProfileId|shopId|serviceId|technicianServiceId|startsAt|endsAt|status|bookedCount`;
   - booking: `orderNo|customerUserId|shopId|technicianProfileId|serviceId|technicianServiceId|startsAt|endsAt|status` and namespace;
   - histories and notifications: expected count and namespace.
4. Return `{ mode: "noop" }` only when every set matches exactly.
5. Throw `Target window contains non-matching operational data; refusing to overwrite it.` for every other non-empty state.

Use a stable composite-key helper:

```ts
const stableSetEquals = (left: string[], right: string[]): boolean =>
  left.length === right.length &&
  [...left].sort().every((value, index) => value === [...right].sort()[index]);
```

- [ ] **Step 4: Implement chunked transactional persistence**

Use `createMany` chunks of 500 for Availability and ScheduleSlot, then resolve generated IDs by `(technicianProfileId, startsAt)` within the bounded window. Persist BookingOrder with:

```ts
{
  orderNo: booking.orderNo,
  orderType: OrderType.BOOKING,
  customerUserId: booking.customerUserId,
  serviceId: booking.serviceId,
  technicianServiceId: booking.technicianServiceId,
  shopId: booking.shopId,
  technicianProfileId: booking.technicianProfileId,
  scheduleSlotId,
  status: toBookingOrderStatus(booking.status),
  fulfillmentMode: booking.fulfillmentMode,
  priceAmount: booking.priceAmountJpy,
  currency: "JPY",
  pricingModeSnapshot: ShopPricingMode.MERCHANT,
  serviceOwnerType: ServiceOwnerType.SHOP,
  serviceOwnerId: booking.shopId,
  serviceNameSnapshot: booking.serviceName,
  servicePriceSnapshot: booking.priceAmountJpy,
  serviceDurationSnapshot: booking.durationMinutes,
  serviceSnapshotJson: {
    namespace: FUTURE_OPERATIONS_NAMESPACE,
    dataset: "future_six_month_operations",
    slotKey: booking.slotKey
  },
  startsAt: new Date(booking.startsAt),
  endsAt: new Date(booking.endsAt),
  note: "将来予約の正式ローカル運用テストデータです。",
  cancelReason: booking.cancelReason,
  paymentMethod: ServicePaymentMethod.ONSITE,
  paymentStatus: ServicePaymentStatus.PENDING,
  paymentAmountJpy: 0,
  createdAt: new Date(booking.createdAt)
}
```

Persist histories with `metadata.namespace`, notifications with `payload.namespace`, and one audit log:

```ts
{
  action: "simulation.future_operations.applied",
  targetType: "simulation_dataset",
  metadata: {
    namespace: FUTURE_OPERATIONS_NAMESPACE,
    startsAt: FUTURE_OPERATIONS_START_AT,
    endExclusiveAt: FUTURE_OPERATIONS_END_EXCLUSIVE_AT,
    availabilityCount: plan.availabilities.length,
    slotCount: plan.slots.length,
    bookingCount: plan.bookings.length,
    historyCount: plan.histories.length
  }
}
```

Do not call any create/delete/update method for User, CustomerProfile, TechnicianProfile, Shop, Service, TechnicianService, wallet, finance, payroll, review, IM, Social, or contact models.

- [ ] **Step 5: Run tests and verify GREEN**

Run:

```bash
cd backend
npm test -- future-six-month-operations-dataset.test.ts future-six-month-operations-plan.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit transactional apply**

```bash
git add backend/src/simulation/future-six-month-operations-dataset.ts backend/tests/future-six-month-operations-dataset.test.ts
git commit -m "feat: persist future operations transactionally"
```

---

### Task 4: Independent Database Checker and Safe Local Apply

**Files:**
- Create: `backend/scripts/check-future-six-month-operations.ts`
- Modify: `backend/tests/future-six-month-operations-dataset.test.ts`

**Interfaces:**
- Consumes: existing local MySQL records and the deterministic plan generated from the currently resolved cohort.
- Produces: JSON acceptance report with exact plan/database parity and process exit code 0 only when every invariant passes.

- [ ] **Step 1: Add a failing checker-contract test**

```ts
it("has an independent checker for exact database reconciliation", () => {
  const checker = readFileSync(
    resolve(__dirname, "../scripts/check-future-six-month-operations.ts"),
    "utf8"
  );
  for (const required of [
    "months",
    "technicianOverlapCount",
    "customerOverlapCount",
    "duplicateOrderNoCount",
    "invalidRelationshipCount",
    "futureTerminalStatusCount",
    "historicalBaseline"
  ]) {
    expect(checker).toContain(required);
  }
});
```

- [ ] **Step 2: Run the test and verify RED**

Run:

```bash
cd backend
npm test -- future-six-month-operations-dataset.test.ts
```

Expected: FAIL because the checker script does not exist.

- [ ] **Step 3: Implement the checker**

The checker must independently query the bounded window and assert:

```ts
assert(databaseSummary.availabilities === plan.availabilities.length, "Availability count mismatch.");
assert(databaseSummary.slots === plan.slots.length, "Schedule slot count mismatch.");
assert(databaseSummary.bookings === plan.bookings.length, "Booking count mismatch.");
assert(databaseSummary.histories === plan.histories.length, "Status history count mismatch.");
assert(databaseSummary.notifications === plan.bookings.length, "Notification count mismatch.");
assert(databaseSummary.technicianOverlapCount === 0, "Technician schedule overlap detected.");
assert(databaseSummary.customerOverlapCount === 0, "Customer booking overlap detected.");
assert(databaseSummary.duplicateOrderNoCount === 0, "Duplicate order number detected.");
assert(databaseSummary.invalidRelationshipCount === 0, "Cross-entity relationship mismatch detected.");
assert(databaseSummary.futureTerminalStatusCount === 0, "Future completed or in-service booking detected.");
assert(databaseSummary.orderFinancials === 0, "Future financial records must not exist.");
assert(databaseSummary.walletHolds === 0, "Future wallet holds must not exist.");
assert(databaseSummary.reviews === 0, "Future reviews must not exist.");
```

Capture the unchanged historical baseline by querying `LDF26-` separately from `LD2026-`; report the old historical counts without altering them. Print `status: "ok"` only after every assertion.

- [ ] **Step 4: Run focused tests and the final dry-run**

Run:

```bash
cd backend
npm test -- future-six-month-operations-plan.test.ts future-six-month-operations-dataset.test.ts
npm run plan:future-operations
```

Expected: PASS; dry-run prints the exact counts that will be applied and zero conflicts.

- [ ] **Step 5: Apply once to the authorized local database**

Run:

```bash
cd backend
npm run seed:future-operations
```

Expected: JSON reports `mode: "created"`, database `needo_dev`, six calendar months, and exact created counts. Any conflict or missing account aborts and rolls back the full transaction.

- [ ] **Step 6: Re-run apply to prove idempotency**

Run:

```bash
cd backend
npm run seed:future-operations
```

Expected: JSON reports `mode: "noop"`; database row counts remain unchanged.

- [ ] **Step 7: Run independent future and historical reconciliation**

Run:

```bash
cd backend
npm run check:future-operations
npm run check:lifedance-operations
```

Expected: both commands print `status: "ok"`; future checker has zero conflicts and the historical checker retains the original 210-account, 10-shop, 100-technician, 100-customer, 2,600-slot, and 1,957-booking baseline.

- [ ] **Step 8: Commit the checker**

```bash
git add backend/scripts/check-future-six-month-operations.ts backend/tests/future-six-month-operations-dataset.test.ts
git commit -m "test: reconcile future operations dataset"
```

---

### Task 5: Documentation and Production-Safety Verification

**Files:**
- Modify: `README.md`
- Modify: `docs/MOCK_RETIREMENT_MAP.md`

**Interfaces:**
- Consumes: successful database checker output and committed scripts.
- Produces: accurate operator commands and an explicit boundary between completed real database work and pending frontend mock retirement.

- [ ] **Step 1: Update the README with exact commands and boundaries**

Document:

```md
### Future Six-Month Local Operations Dataset

The historical June-August dataset remains unchanged. The future dataset reuses the existing
100 technician and 100 customer test accounts and covers 2026-09-01 through 2027-02-28 JST.

Read-only plan:
`cd backend && npm run plan:future-operations`

Explicit local apply:
`cd backend && npm run seed:future-operations`

Independent reconciliation:
`cd backend && npm run check:future-operations`

The workflow rejects production/remote databases, does not create accounts, and refuses to
overwrite non-matching schedule or booking data in the target window.
```

- [ ] **Step 2: Update the mock retirement map accurately**

Add a dated entry stating that the database prerequisite is complete only after `check:future-operations` passes. Keep user/technician/merchant schedule UI paths marked pending until the separate frontend cutover plan removes their browser stores and passes browser acceptance.

- [ ] **Step 3: Run the complete proportional verification set**

Run:

```bash
cd backend
npm test -- future-six-month-operations-plan.test.ts future-six-month-operations-dataset.test.ts simulation-seed-config.test.ts three-month-simulation-plan.test.ts
npm run check:future-operations
npm run check:lifedance-operations
npm run lint
npm run build
cd ..
npm run verify:production-build
git diff --check
```

Expected: all tests, both database checkers, backend lint/build, formal production build, production bundle audit, and whitespace validation pass. If unrelated pre-existing failures remain, record their exact commands and errors separately; do not modify unrelated files to hide them.

- [ ] **Step 4: Commit documentation and verification boundary**

```bash
git add README.md docs/MOCK_RETIREMENT_MAP.md
git commit -m "docs: document future operations dataset"
```

- [ ] **Step 5: Record the next approved micro-step**

Create a separate frontend-cutover implementation plan from the approved design. Its first acceptance slice is user schedule and booking pages, followed by technician schedule pages, then merchant schedule and dispatch views. Each slice must remove its own localStorage/mock generator only after the corresponding formal API contract is verified.
