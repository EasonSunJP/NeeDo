import { describe, expect, it } from "vitest";
import { orders, technicians } from "../data/mock";
import { isBlockingCustomEvent } from "../features/technician-schedule/model";
import { getTechnicianScheduleStoreSnapshot } from "./technicianScheduleStore";
import source from "./technicianScheduleStore.ts?raw";

describe("technicianScheduleStore public availability demo seed", () => {
  it("seeds the user-facing 2026-05-26 technician availability scenario", () => {
    const snapshot = getTechnicianScheduleStoreSnapshot();

    expect(snapshot.dutyShifts).toContainEqual(
      expect.objectContaining({
        date: "2026-05-26",
        endTime: "22:00",
        id: "duty-public-availability-demo-tech-1-2026-05-26",
        startTime: "08:00",
        technicianId: "tech-1"
      })
    );
    expect(snapshot.bookings).toContainEqual(
      expect.objectContaining({
        date: "2026-05-26",
        detailTargetId: "ord-public-availability-demo-tech-1-2026-05-26",
        detailTargetType: "order_detail",
        endTime: "18:00",
        id: "booking-public-availability-demo-tech-1-2026-05-26",
        orderId: "ord-public-availability-demo-tech-1-2026-05-26",
        startTime: "10:00",
        technicianId: "tech-1"
      })
    );
    expect(orders).toContainEqual(
      expect.objectContaining({
        bookedAt: "2026-05-26 10:00",
        id: "ord-public-availability-demo-tech-1-2026-05-26",
        source: "app"
      })
    );
  });

  it("seeds a public demonstration week for every technician", () => {
    const snapshot = getTechnicianScheduleStoreSnapshot();
    const demoDates = ["2026-05-25", "2026-05-26", "2026-05-27", "2026-05-28", "2026-05-29", "2026-05-30", "2026-05-31"];
    const expectedTechnicianIds = new Set(technicians.map((technician) => technician.id));
    const seededTechnicianIds = new Set(
      snapshot.dutyShifts
        .filter((shift) => shift.id.startsWith("duty-public-availability-demo-") && demoDates.includes(shift.date))
        .map((shift) => shift.technicianId)
    );

    expect(seededTechnicianIds).toEqual(expectedTechnicianIds);
    technicians.forEach((technician) => {
      expect(
        demoDates.every((date) =>
          snapshot.dutyShifts.some(
            (shift) => shift.id.startsWith("duty-public-availability-demo-") && shift.technicianId === technician.id && shift.date === date
          )
        )
      ).toBe(true);
      expect(
        snapshot.bookings.some((booking) => booking.id.startsWith("booking-public-availability-demo-") && booking.technicianId === technician.id)
      ).toBe(true);
      expect(
        snapshot.bookings
          .filter((booking) => booking.id.startsWith("booking-public-availability-demo-") && booking.technicianId === technician.id)
          .every((booking) => booking.orderId && booking.detailTargetType === "order_detail" && booking.detailTargetId === booking.orderId)
      ).toBe(true);
      expect(
        snapshot.customEvents.some(
          (event) =>
            event.id.startsWith("event-public-availability-demo-") &&
            event.technicianId === technician.id &&
            isBlockingCustomEvent(event.kind)
        )
      ).toBe(true);
    });
  });

  it("migrates existing cached public demo bookings to appointment detail targets", () => {
    expect(source).toContain("function mergePublicAvailabilityDemoBookingTargets");
    expect(source).toContain("booking.id.startsWith(publicAvailabilityDemoBookingIdPrefix)");
    expect(source).toContain("orderId: seed.orderId");
    expect(source).toContain("detailTargetType: seed.detailTargetType");
    expect(source).toContain("detailTargetId: seed.detailTargetId");
    expect(source).toContain("bookingTargetChanged");
  });
});
