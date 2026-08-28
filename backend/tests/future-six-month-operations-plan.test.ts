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

  it("creates realistic schedules without technician or customer overlaps", () => {
    expect(validateFutureOperationsPlan(first)).toEqual({
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
    expect(
      first.bookings.every(
        (booking) => new Date(booking.createdAt) <= new Date("2026-08-28T00:00:00.000Z")
      )
    ).toBe(true);
  });

  it("restores cancelled slots to available while active bookings occupy their slots", () => {
    const slotByKey = new Map(first.slots.map((slot) => [slot.key, slot]));
    for (const booking of first.bookings) {
      const slot = slotByKey.get(booking.slotKey);
      expect(slot).toBeDefined();
      expect(slot?.status).toBe(booking.status === "CANCELLED" ? "AVAILABLE" : "BOOKED");
      expect(slot?.bookedCount).toBe(booking.status === "CANCELLED" ? 0 : 1);
    }
  });

  it("reports all six approved calendar months", () => {
    const months = summarizeFutureOperationsPlan(first).months;
    expect(Object.keys(months)).toEqual([
      "2026-09",
      "2026-10",
      "2026-11",
      "2026-12",
      "2027-01",
      "2027-02"
    ]);
    for (const month of Object.values(months)) {
      expect(month.statuses.PENDING).toBeGreaterThan(0);
      expect(month.statuses.CONFIRMED).toBeGreaterThan(0);
      expect(month.statuses.CANCELLED).toBeGreaterThan(0);
    }
  });
});
