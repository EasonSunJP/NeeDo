import {
  buildScheduleSlotRepairPlan,
  digestScheduleSlotRepairPlan,
  type ScheduleSlotRepairInventory,
  type ScheduleSlotRepairObservation
} from "../src/domain/schedule-slot-inventory-repair";

const now = new Date("2026-09-11T00:00:00.000Z");

const service = (overrides: Record<string, unknown> = {}) => ({
  id: 10,
  shopId: 3,
  name: "Body care 60",
  categoryId: 7,
  priceAmount: "8000.00",
  currency: "JPY",
  durationMinutes: 60,
  serviceMode: "store",
  status: "published",
  deletedAt: null,
  categoryIsActive: true,
  categoryDeletedAt: null,
  ...overrides
});

const technicianService = (overrides: Record<string, unknown> = {}) => ({
  id: 20,
  shopId: 3,
  technicianId: 5,
  sourceShopServiceId: 10,
  name: "Body care 60",
  categoryId: 7,
  priceAmount: "8000.00",
  currency: "JPY",
  durationMinutes: 60,
  isActive: true,
  isBookable: true,
  reviewStatus: "APPROVED",
  deletedAt: null,
  categoryIsActive: true,
  categoryDeletedAt: null,
  technicianStatus: "published",
  technicianDeletedAt: null,
  technicianUserIsActive: true,
  technicianUserDeletedAt: null,
  ...overrides
});

const slot = (overrides: Partial<ScheduleSlotRepairObservation> = {}): ScheduleSlotRepairObservation => ({
  id: 100,
  availabilityId: 200,
  serviceId: 10,
  technicianServiceId: 20,
  shopId: 3,
  technicianProfileId: 5,
  startsAt: new Date("2026-09-12T01:00:00.000Z"),
  endsAt: new Date("2026-09-12T02:00:00.000Z"),
  capacity: 1,
  bookedCount: 0,
  status: "AVAILABLE",
  service: service({ deletedAt: new Date("2026-09-10T00:00:00.000Z") }),
  technicianService: technicianService({
    deletedAt: new Date("2026-09-10T00:00:00.000Z")
  }),
  relationCounts: {
    bookingOrders: 0,
    routeEstimates: 0,
    exchangeClaims: 0,
    exchangeMatchParticipants: 0
  },
  ...overrides
});

const inventory = (
  overrides: Partial<ScheduleSlotRepairInventory> = {}
): ScheduleSlotRepairInventory => ({
  services: [service({ id: 11 })],
  technicianServices: [technicianService({ id: 21, sourceShopServiceId: 11 })],
  activeAffiliations: new Set(["3:5"]),
  ...overrides
});

describe("schedule slot inventory repair domain", () => {
  it("regenerates a future unbooked stale pair only from one exact current pair", () => {
    const plan = buildScheduleSlotRepairPlan([slot()], inventory(), now);

    expect(plan.entries).toEqual([
      expect.objectContaining({
        slotId: 100,
        kind: "repair_replace",
        reasons: ["service_deleted", "technician_service_deleted"],
        replacement: { serviceId: 11, technicianServiceId: 21 },
        candidateCount: 1
      })
    ]);
    expect(plan.summary).toEqual(
      expect.objectContaining({ stale: 1, protected: 0, replace: 1, remove: 0 })
    );
  });

  it("does not guess when price semantics differ", () => {
    const plan = buildScheduleSlotRepairPlan(
      [slot()],
      inventory({ technicianServices: [technicianService({ id: 21, priceAmount: "8100.00" })] }),
      now
    );

    expect(plan.entries[0]).toEqual(
      expect.objectContaining({
        kind: "repair_remove",
        replacement: null,
        candidateCount: 0
      })
    );
  });

  it("reports an ambiguous exact mapping instead of choosing one", () => {
    const plan = buildScheduleSlotRepairPlan(
      [slot()],
      inventory({
        services: [service({ id: 11 }), service({ id: 12 })],
        technicianServices: [
          technicianService({ id: 21, sourceShopServiceId: 11 }),
          technicianService({ id: 22, sourceShopServiceId: 12 })
        ]
      }),
      now
    );

    expect(plan.entries[0]).toEqual(
      expect.objectContaining({
        kind: "repair_remove",
        replacement: null,
        candidateCount: 2
      })
    );
  });

  it.each([
    ["past", { startsAt: new Date("2026-09-10T01:00:00.000Z") }],
    ["booked count", { bookedCount: 1 }],
    ["booked status", { status: "BOOKED" as const }],
    ["order relation", { relationCounts: { bookingOrders: 1, routeEstimates: 0, exchangeClaims: 0, exchangeMatchParticipants: 0 } }],
    ["route relation", { relationCounts: { bookingOrders: 0, routeEstimates: 1, exchangeClaims: 0, exchangeMatchParticipants: 0 } }],
    ["exchange relation", { relationCounts: { bookingOrders: 0, routeEstimates: 0, exchangeClaims: 1, exchangeMatchParticipants: 0 } }]
  ])("protects stale %s slots without producing a replacement", (_label, overrides) => {
    const plan = buildScheduleSlotRepairPlan([slot(overrides)], inventory(), now);

    expect(plan.entries[0]).toEqual(
      expect.objectContaining({ kind: "protected", replacement: null })
    );
    expect(plan.summary.protected).toBe(1);
  });

  it("does not include a current slot in the repair entries", () => {
    const plan = buildScheduleSlotRepairPlan(
      [slot({ service: service(), technicianService: technicianService() })],
      inventory(),
      now
    );

    expect(plan.entries).toEqual([]);
    expect(plan.summary.current).toBe(1);
  });

  it("keeps the plan digest stable across input order", () => {
    const first = buildScheduleSlotRepairPlan([slot({ id: 101 }), slot({ id: 100 })], inventory(), now);
    const second = buildScheduleSlotRepairPlan([slot({ id: 100 }), slot({ id: 101 })], inventory(), now);

    expect(digestScheduleSlotRepairPlan(first)).toMatch(/^[a-f0-9]{64}$/u);
    expect(digestScheduleSlotRepairPlan(first)).toBe(digestScheduleSlotRepairPlan(second));
  });
});
