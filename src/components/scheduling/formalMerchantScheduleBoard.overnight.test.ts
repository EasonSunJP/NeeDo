import { describe, expect, it } from "vitest";
import type { BookingScheduleSlot } from "../../features/booking/api";
import { buildFormalMerchantScheduleBoard } from "./formalMerchantScheduleBoard";

const nightShift: BookingScheduleSlot = {
  id: 901, shopId: 16, shopName: "LifeDance", technicianProfileId: 31,
  technicianName: "佐藤", technicianServiceId: null, serviceId: 18,
  serviceName: "夜班", startsAt: "2026-09-01T22:00:00+09:00",
  endsAt: "2026-09-02T06:00:00+09:00", status: "available",
  bookedCount: 0, capacity: 1, currency: "JPY", durationMinutes: 60, priceAmount: "8800.00"
};

function board(periodStart: string, periodEnd: string, slots = [nightShift]) {
  return buildFormalMerchantScheduleBoard({
    dateKey: periodStart, range: { periodStart, periodEnd }, slots,
    shop: { id: "16", name: "LifeDance", cover: "" },
    technicians: [{ id: "31", name: "佐藤", avatar: "/media/technicians/sato.webp" }]
  });
}

describe("formal schedule overnight coverage", () => {
  it("shows each occupied day with the same technician avatar and a resolvable cell", () => {
    const result = board("2026-09-01", "2026-09-02");
    expect(result.dataOverride.events.map(({ date, startTime, endTime }) => ({ date, startTime, endTime }))).toEqual([
      { date: "2026-09-01", startTime: "22:00", endTime: "24:00" },
      { date: "2026-09-02", startTime: "00:00", endTime: "06:00" }
    ]);
    for (const event of result.dataOverride.events) {
      expect(event.participants?.[0]?.avatar).toBe("/media/technicians/sato.webp");
      expect(result.dataOverride.cellByEventId.get(event.id)?.date).toBe(event.date);
    }
    expect(result.summary.scheduledDayCount).toBe(2);
  });

  it("includes a night shift that starts before the loaded calendar range", () => {
    const result = board("2026-09-02", "2026-09-02");
    expect(result.dataOverride.events).toHaveLength(1);
    expect(result.dataOverride.events[0]).toMatchObject({ date: "2026-09-02", startTime: "00:00", endTime: "06:00" });
  });

  it("does not add a shift to the day after its exclusive midnight end", () => {
    const result = board("2026-09-01", "2026-09-02", [{ ...nightShift, endsAt: "2026-09-02T00:00:00+09:00" }]);
    expect(result.dataOverride.events).toHaveLength(1);
    expect(result.dataOverride.events[0]).toMatchObject({ date: "2026-09-01", endTime: "24:00" });
    expect(result.summary.scheduledDayCount).toBe(1);
  });
});
