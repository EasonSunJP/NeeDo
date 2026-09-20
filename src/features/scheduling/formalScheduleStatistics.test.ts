import { describe, expect, it } from "vitest";
import type { BookingScheduleSlot } from "../booking/api";
import { buildFormalScheduleStatusStatistics } from "./formalScheduleStatistics";

const slots: BookingScheduleSlot[] = [
  {
    id: 1, serviceId: 1, technicianServiceId: 1, shopId: 11, technicianProfileId: 101,
    startsAt: "2026-09-21T10:30:00+09:00", endsAt: "2026-09-21T12:30:00+09:00",
    capacity: 1, bookedCount: 0, status: "available", serviceName: "A", shopName: "Shop",
    technicianName: "One", priceAmount: "1000", currency: "JPY", durationMinutes: 120
  },
  {
    id: 2, serviceId: 2, technicianServiceId: 2, shopId: 11, technicianProfileId: 102,
    startsAt: "2026-09-21T11:00:00+09:00", endsAt: "2026-09-21T12:00:00+09:00",
    capacity: 1, bookedCount: 1, status: "booked", serviceName: "B", shopName: "Shop",
    technicianName: "Two", priceAmount: "1000", currency: "JPY", durationMinutes: 60
  },
  {
    id: 3, serviceId: 3, technicianServiceId: 3, shopId: 11, technicianProfileId: 103,
    startsAt: "2026-09-22T09:00:00+09:00", endsAt: "2026-09-22T10:00:00+09:00",
    capacity: 1, bookedCount: 0, status: "blocked", serviceName: "C", shopName: "Shop",
    technicianName: "Three", priceAmount: "1000", currency: "JPY", durationMinutes: 60
  }
];

const cycleRange = { periodStart: "2026-09-21", periodEnd: "2026-10-04" };

describe("formal schedule status statistics", () => {
  it("uses hourly buckets for the selected day and clamps partial overlaps", () => {
    const result = buildFormalScheduleStatusStatistics({ cycleRange, dateKey: "2026-09-21", slots, view: "day" });

    expect(result.range).toEqual({ start: "2026-09-21", end: "2026-09-21", dayCount: 1 });
    expect(result.buckets).toHaveLength(24);
    expect(result.buckets[10]).toMatchObject({ scheduleAvailableHours: 0.5, scheduleBookedHours: 0, scheduleAttendanceCount: 1 });
    expect(result.buckets[11]).toMatchObject({ scheduleAvailableHours: 1, scheduleBookedHours: 1, scheduleAttendanceCount: 2 });
    expect(result.buckets[12]).toMatchObject({ scheduleAvailableHours: 0.5, scheduleBookedHours: 0, scheduleAttendanceCount: 1 });
  });

  it("uses daily buckets for week and caps month to the active cycle", () => {
    const week = buildFormalScheduleStatusStatistics({ cycleRange, dateKey: "2026-09-21", slots, view: "week" });
    const month = buildFormalScheduleStatusStatistics({ cycleRange, dateKey: "2026-09-21", slots, view: "month" });

    expect(week.range).toEqual({ start: "2026-09-21", end: "2026-09-27", dayCount: 7 });
    expect(week.buckets).toHaveLength(7);
    expect(week.buckets[0]).toMatchObject({ scheduleAvailableHours: 2, scheduleBookedHours: 1, scheduleAttendanceCount: 2 });
    expect(week.buckets[1]).toMatchObject({ scheduleAvailableHours: 0, scheduleBookedHours: 0, scheduleAttendanceCount: 0 });
    expect(month.range).toEqual({ start: "2026-09-21", end: "2026-10-04", dayCount: 14 });
    expect(month.buckets).toHaveLength(14);
  });

  it("summarizes only active available or booked slots in the selected range", () => {
    const result = buildFormalScheduleStatusStatistics({ cycleRange, dateKey: "2026-09-21", slots, view: "week" });

    expect(result.summary).toEqual({
      availableHours: 2,
      bookedHours: 1,
      bookedSlotCount: 1,
      scheduledDayCount: 1,
      scheduledTechnicianCount: 2
    });
  });
});
