import { describe, expect, it } from "vitest";
import type { BookingScheduleSlot } from "./api";
import { groupFormalAvailabilityByJstDate } from "./formal-technician-availability";

const slot = (
  patch: Partial<BookingScheduleSlot> & Pick<BookingScheduleSlot, "id" | "startsAt" | "endsAt">
): BookingScheduleSlot => ({
  serviceId: null,
  technicianServiceId: 701,
  shopId: 16,
  technicianProfileId: 17,
  capacity: 1,
  bookedCount: 0,
  status: "available",
  serviceName: "ボディケア",
  shopName: "LifeDance Wellness 渋谷",
  technicianName: "Formal Technician",
  priceAmount: "8000",
  currency: "JPY",
  durationMinutes: 60,
  ...patch
});

describe("groupFormalAvailabilityByJstDate", () => {
  it("groups only available capacity-safe slots by JST calendar date", () => {
    const grouped = groupFormalAvailabilityByJstDate([
      slot({ id: 1, startsAt: "2026-08-31T15:00:00.000Z", endsAt: "2026-08-31T16:00:00.000Z" }),
      slot({ id: 2, startsAt: "2026-08-31T16:00:00.000Z", endsAt: "2026-08-31T17:00:00.000Z", status: "booked", bookedCount: 1 }),
      slot({ id: 3, startsAt: "2026-08-31T17:00:00.000Z", endsAt: "2026-08-31T18:00:00.000Z", bookedCount: 1 })
    ]);

    expect(grouped.get("2026-09-01")).toEqual([
      { date: "2026-09-01", startTime: "00:00", endTime: "01:00" }
    ]);
  });

  it("sorts persisted slots and keeps adjacent ranges independent", () => {
    const grouped = groupFormalAvailabilityByJstDate([
      slot({ id: 12, startsAt: "2026-09-01T02:00:00.000Z", endsAt: "2026-09-01T03:00:00.000Z" }),
      slot({ id: 10, startsAt: "2026-09-01T00:00:00.000Z", endsAt: "2026-09-01T01:00:00.000Z" }),
      slot({ id: 11, startsAt: "2026-09-01T01:00:00.000Z", endsAt: "2026-09-01T02:00:00.000Z" })
    ]);

    expect(grouped.get("2026-09-01")).toEqual([
      { date: "2026-09-01", startTime: "09:00", endTime: "10:00" },
      { date: "2026-09-01", startTime: "10:00", endTime: "11:00" },
      { date: "2026-09-01", startTime: "11:00", endTime: "12:00" }
    ]);
  });
});
