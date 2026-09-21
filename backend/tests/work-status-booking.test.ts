import { recordBookingWorkTransition } from "../src/domain/work-status-booking";
import type { WorkStatusSession } from "../src/repositories/work-status.repository";

const fixture = (state: { status: string; shopId: number; version: number }) => {
  const unit = {
    lock: jest.fn(),
    state: jest.fn().mockResolvedValue(state),
    activeService: jest.fn().mockResolvedValue({ id: 90, shopId: 21 }),
    cas: jest.fn(),
    append: jest.fn(),
    audit: jest.fn()
  } as unknown as WorkStatusSession;
  return unit;
};

describe("booking work-status transitions", () => {
  it("rejects service start while the technician is off duty", async () => {
    const unit = fixture({ status: "off_duty", shopId: 21, version: 4 });

    await expect(
      recordBookingWorkTransition(unit, {
        technicianProfileId: 12,
        orderId: 90,
        shopId: 21,
        actorId: 7,
        at: new Date("2026-09-21T01:00:00Z"),
        started: true
      })
    ).rejects.toMatchObject({ data: { reason: "off_duty_required" } });
  });

  it("uses the target shop's independent on-duty state", async () => {
    const unit = fixture({ status: "on_duty", shopId: 21, version: 4 });

    await expect(
      recordBookingWorkTransition(unit, {
        technicianProfileId: 12,
        orderId: 90,
        shopId: 21,
        actorId: 7,
        at: new Date("2026-09-21T01:00:00Z"),
        started: true
      })
    ).resolves.toBeUndefined();
    expect(unit.state).toHaveBeenCalledWith(12, 21);
    expect(unit.cas).toHaveBeenCalledWith(12, 21, 4, "on_duty", expect.any(Date));
  });
});
