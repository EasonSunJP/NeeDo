import { WorkStatusSession } from "../src/repositories/work-status.repository";
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
