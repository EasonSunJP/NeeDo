import { describe, expect, it } from "vitest";
import type { TechnicianScheduleSnapshot } from "../technician-schedule/model";
import { buildTechnicianWeeklyScheduleItems } from "./profileHeaderPresentation";

const emptySnapshot: TechnicianScheduleSnapshot = {
  dutyShifts: [],
  bookings: [],
  customEvents: [],
  transferRequests: [],
  transferInvitations: [],
  revision: 1
};

describe("buildTechnicianWeeklyScheduleItems", () => {
  it("builds the current Monday-to-Sunday week around the anchor date", () => {
    const items = buildTechnicianWeeklyScheduleItems("tech-1", emptySnapshot, "2026-05-26");

    expect(items.map((item) => item.date)).toEqual([
      "2026-05-25",
      "2026-05-26",
      "2026-05-27",
      "2026-05-28",
      "2026-05-29",
      "2026-05-30",
      "2026-05-31"
    ]);
    expect(items.map((item) => item.weekdayLabel)).toEqual(["一", "二", "三", "四", "五", "六", "日"]);
  });

  it("links a scheduled day to that technician schedule confirmation page", () => {
    const snapshot: TechnicianScheduleSnapshot = {
      ...emptySnapshot,
      dutyShifts: [
        {
          id: "shift-a",
          technicianId: "tech-1",
          storeId: "store-1",
          date: "2026-05-26",
          startTime: "10:00",
          endTime: "18:00",
          title: "已确认勤务",
          shiftLabel: "日班"
        }
      ],
      bookings: [
        {
          id: "booking-a",
          technicianId: "tech-1",
          storeId: "store-1",
          date: "2026-05-26",
          startTime: "11:00",
          endTime: "12:00",
          title: "门店肩颈护理",
          customerName: "顾客A"
        }
      ]
    };

    expect(buildTechnicianWeeklyScheduleItems("tech-1", snapshot, "2026-05-26")[1]).toMatchObject({
      date: "2026-05-26",
      href: "/technician/schedule/events/booking-a",
      statusLabel: "1件",
      tone: "booked"
    });
  });
});
