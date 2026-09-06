import { describe, expect, it } from "vitest";
import type { BookingScheduleSlot } from "../../features/booking/api";
import { buildFormalMerchantScheduleBoard, getFormalMerchantScheduleCycleRange } from "./formalMerchantScheduleBoard";

const technicians = [
  {
    avatar: "/media/technicians/misaki.webp",
    id: "31",
    identityLabel: "店铺所属技师" as const,
    name: "佐藤 美咲",
    nickname: "Misaki"
  },
  {
    avatar: "/media/technicians/riko.webp",
    id: "32",
    identityLabel: "店铺所属技师" as const,
    name: "高桥 莉子"
  }
];

const slot = (input: Partial<BookingScheduleSlot> = {}): BookingScheduleSlot => ({
  bookedCount: 1,
  capacity: 1,
  currency: "JPY",
  durationMinutes: 60,
  endsAt: "2026-09-02T11:00:00+09:00",
  id: 801,
  priceAmount: "8800.00",
  serviceId: 18,
  serviceName: "ND预约-上门护理",
  shopId: 16,
  shopName: "LifeDance",
  startsAt: "2026-09-02T10:00:00+09:00",
  status: "booked",
  technicianName: "佐藤 美咲",
  technicianProfileId: 31,
  technicianServiceId: null,
  ...input
});

describe("formal merchant schedule board", () => {
  it("keeps every formal shop technician as an avatar lane and maps persisted slots into the day grid", () => {
    const range = getFormalMerchantScheduleCycleRange("2026-09-02");
    const result = buildFormalMerchantScheduleBoard({
      dateKey: "2026-09-02",
      range,
      shop: { cover: "/media/shops/lifedance.webp", id: "16", name: "LifeDance" },
      slots: [slot()],
      technicians
    });

    expect(getFormalMerchantScheduleCycleRange("2026-04-20")).toEqual({ periodEnd: "2026-04-27", periodStart: "2026-04-14" });
    expect(range).toEqual({ periodEnd: "2026-09-14", periodStart: "2026-09-01" });
    expect(result.periodLabel).toBe("2026-09-01 - 2026-09-14");
    expect(result.dataOverride.lanes).toEqual([
      expect.objectContaining({ avatar: "/media/technicians/misaki.webp", id: "technician:31", label: "Misaki" }),
      expect.objectContaining({ avatar: "/media/technicians/riko.webp", id: "technician:32", label: "高桥 莉子" })
    ]);
    expect(result.dataOverride.dayGrids).toHaveLength(14);
    expect(result.dataOverride.dayGrids[1]?.rows).toHaveLength(2);
    expect(result.dataOverride.dayGrids[1]?.rows[0]).toMatchObject({
      technicianAvatar: "/media/technicians/misaki.webp",
      technicianId: "31",
      technicianName: "Misaki"
    });
    expect(result.dataOverride.events).toContainEqual(expect.objectContaining({
      calendarId: "technician:31",
      scheduleSlotId: 801,
      date: "2026-09-02",
      endTime: "11:00",
      startTime: "10:00",
      title: "ND预约-上门护理"
    }));
    expect(result.summary).toEqual({ bookedCount: 1, scheduledDayCount: 1, scheduledTechnicianCount: 1, technicianCount: 2 });
  });

  it("does not invent an avatar when the formal technician record has none", () => {
    const result = buildFormalMerchantScheduleBoard({
      dateKey: "2026-09-02",
      range: getFormalMerchantScheduleCycleRange("2026-09-02"),
      shop: { cover: "", id: "16", name: "LifeDance" },
      slots: [],
      technicians: [{ avatar: "", id: "31", name: "佐藤 美咲" }]
    });

    expect(result.dataOverride.lanes[0]?.avatar).toBe("");
    expect(result.dataOverride.dayGrids[0]?.rows[0]?.technicianAvatar).toBe("");
  });
});
