import { describe, expect, it } from "vitest";
import type { TechnicianScheduleSnapshot } from "../features/technician-schedule/model";
import { buildTechnicianPublicAvailabilityRanges } from "./technicianPublicAvailability";

const emptySnapshot: TechnicianScheduleSnapshot = {
  dutyShifts: [],
  bookings: [],
  customEvents: [],
  transferRequests: [],
  transferInvitations: [],
  revision: 1
};

describe("buildTechnicianPublicAvailabilityRanges", () => {
  it("shows only bookable gaps after subtracting confirmed work and buffers", () => {
    const snapshot: TechnicianScheduleSnapshot = {
      ...emptySnapshot,
      dutyShifts: [
        {
          id: "shift-a",
          technicianId: "tech-1",
          storeId: "store-1",
          date: "2026-05-26",
          startTime: "08:00",
          endTime: "22:00",
          title: "店铺确认可预约",
          shiftLabel: "全天"
        }
      ],
      bookings: [
        {
          id: "booking-a",
          technicianId: "tech-1",
          storeId: "store-1",
          date: "2026-05-26",
          startTime: "10:00",
          endTime: "18:00",
          title: "排满工作",
          customerName: "顾客A"
        }
      ]
    };

    expect(
      buildTechnicianPublicAvailabilityRanges({
        bufferMinutes: 30,
        date: "2026-05-26",
        snapshot,
        technicianId: "tech-1"
      })
    ).toEqual([
      { date: "2026-05-26", endTime: "09:30", startTime: "08:00" },
      { date: "2026-05-26", endTime: "22:00", startTime: "18:30" }
    ]);
  });
});
