import {
  mapWorkEvent,
  WorkStatusSession
} from "../src/repositories/work-status.repository";

const reassignedOrderEvent = {
  id: "late-reassigned",
  technicianProfileId: 12,
  shopId: 16,
  orderId: 24424,
  incidentId: "incident-reassigned",
  actorId: null,
  kind: "late",
  fromStatus: null,
  toStatus: null,
  at: new Date("2026-09-21T00:30:00.000Z"),
  actualAt: null,
  reason: null,
  commandKey: null,
  commandHash: null,
  result: null,
  createdAt: new Date("2026-09-21T00:30:00.000Z"),
  updatedAt: new Date("2026-09-21T00:30:00.000Z"),
  deletedAt: null,
  actor: null,
  order: {
    id: 24424,
    orderNo: "ND202609210621189522",
    serviceNameSnapshot: "Care",
    technicianProfileId: 99,
    customer: { username: "Customer" }
  },
  incident: {
    id: "incident-reassigned",
    incidentKey: "v1:late:booking:24424",
    technicianProfileId: 12,
    shopId: 16,
    orderId: 24424,
    availabilityId: null,
    kind: "late",
    basis: "booking",
    plannedAt: new Date("2026-09-21T00:30:00.000Z"),
    plannedEndAt: new Date("2026-09-21T01:30:00.000Z"),
    occurredAt: new Date("2026-09-21T00:30:00.000Z"),
    actualAt: null,
    ruleVersion: 1,
    reason: null,
    createdAt: new Date("2026-09-21T00:30:00.000Z"),
    updatedAt: new Date("2026-09-21T00:30:00.000Z"),
    deletedAt: null,
    attendanceAffectedOrders: []
  }
} as Parameters<typeof mapWorkEvent>[0];

it("does not project a reassigned order into the former technician's self timeline", () => {
  expect(mapWorkEvent(reassignedOrderEvent, {
    technicianProfileId: 12,
    userId: 7
  }).order).toBeNull();
});

it("does not project a reassigned affected order into the former technician's self timeline", () => {
  const projected = mapWorkEvent({
    ...reassignedOrderEvent,
    order: null,
    incident: {
      ...reassignedOrderEvent.incident!,
      basis: "shift",
      attendanceAffectedOrders: [{
        id: "affected-reassigned",
        incidentId: "incident-reassigned",
        orderId: 24424,
        shopId: 16,
        orderNo: "ND202609210621189522",
        serviceName: "Care",
        startsAt: new Date("2026-09-21T00:30:00.000Z"),
        endsAt: new Date("2026-09-21T01:30:00.000Z"),
        createdAt: new Date("2026-09-21T00:30:00.000Z"),
        updatedAt: new Date("2026-09-21T00:30:00.000Z"),
        deletedAt: null,
        order: { technicianProfileId: 99 }
      }]
    }
  }, {
    technicianProfileId: 12,
    userId: 7
  });

  expect(projected.affectedOrders).toEqual([]);
});

it("keeps the reassigned order in authorized merchant and operations history", () => {
  expect(mapWorkEvent(reassignedOrderEvent, {
    technicianProfileId: 12,
    shopId: 16
  }).order?.id).toBe(24424);
  expect(mapWorkEvent(reassignedOrderEvent, {
    technicianProfileId: 12
  }).order?.id).toBe(24424);
});
it("returns an active service across midnight without restricting it to today", async () => {
  const active = jest.fn(async () => ({ id: 88, shopId: 3 }));
  const db = {
    technicianWorkState: {
      findFirst: jest.fn(async () => ({
        status: "on_duty",
        version: 4,
        syncedAt: new Date("2026-09-06T14:00:00Z")
      }))
    },
    bookingOrder: { findFirst: active },
    technicianAttendanceIncident: { count: jest.fn(async () => 0) }
  };
  const snapshot = await new WorkStatusSession(
    db as unknown as ConstructorParameters<typeof WorkStatusSession>[0]
  ).snapshot({ technicianProfileId: 12 }, new Date("2026-09-06T16:00:00Z"));
  expect(snapshot).toMatchObject({ status: "in_service", activeOrderId: 88, version: 4 });
  expect(
    await new WorkStatusSession(
      db as unknown as ConstructorParameters<typeof WorkStatusSession>[0]
    ).snapshot({ technicianProfileId: 12, shopId: 4 }, new Date("2026-09-06T16:00:00Z"))
  ).toMatchObject({ status: "in_service", activeOrderId: null });
  expect(active).toHaveBeenCalledWith({
    where: { technicianProfileId: 12, deletedAt: null, status: "IN_SERVICE" },
    select: { id: true, shopId: true }
  });
});

it("checks for an active shop affiliation at the requested instant", async () => {
  const findFirst = jest.fn(async () => ({ id: 91 }));
  const db = {
    technicianShopAffiliation: { findFirst }
  };
  const now = new Date("2026-09-09T04:30:00.000Z");

  await expect(
    new WorkStatusSession(
      db as unknown as ConstructorParameters<typeof WorkStatusSession>[0]
    ).hasActiveAffiliation(12, now)
  ).resolves.toEqual({ id: 91 });
  expect(findFirst).toHaveBeenCalledWith({
    where: {
      technicianProfileId: 12,
      activeKey: { not: null },
      deletedAt: null,
      workStatus: "ACTIVE",
      startsAt: { lte: now },
      OR: [{ endsAt: null }, { endsAt: { gt: now } }],
      shop: { status: "published", deletedAt: null }
    },
    select: { id: true }
  });
});

it("scopes attendance to the canonical active shop affiliation", async () => {
  const findFirst = jest.fn().mockResolvedValue({ id: 12 });
  const db = { technicianProfile: { findFirst } };
  const now = new Date("2026-09-13T04:30:00.000Z");

  await new WorkStatusSession(
    db as unknown as ConstructorParameters<typeof WorkStatusSession>[0]
  ).assertScope({ technicianProfileId: 12, shopId: 16 }, now);

  expect(findFirst).toHaveBeenCalledWith({
    where: {
      id: 12,
      deletedAt: null,
      technicianShopAffiliations: {
        some: {
          shopId: 16,
          activeKey: { not: null },
          deletedAt: null,
          workStatus: "ACTIVE",
          startsAt: { lte: now },
          OR: [{ endsAt: null }, { endsAt: { gt: now } }],
          shop: { status: "published", deletedAt: null }
        }
      }
    },
    select: { id: true }
  });
});
