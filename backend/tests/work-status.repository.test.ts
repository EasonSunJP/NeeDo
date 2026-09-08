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
