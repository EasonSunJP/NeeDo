import { planGroupBooking } from "../src/domain/booking-group-plan";

const startsAt = new Date("2026-10-02T01:00:00.000Z");
const slot = (id: number, technicianProfileId: number, serviceId: number, minute = 0) => ({
  id,
  shopId: 5,
  technicianProfileId,
  serviceId,
  technicianServiceId: null,
  startsAt: new Date(startsAt.getTime() + minute * 60_000),
  endsAt: new Date(startsAt.getTime() + (minute + 60) * 60_000),
  occupiedStartsAt: new Date(startsAt.getTime() + (minute - 10) * 60_000),
  occupiedEndsAt: new Date(startsAt.getTime() + (minute + 70) * 60_000),
  bookedCount: 0,
  capacity: 1,
  priceAmountJpy: 8_000,
  currency: "JPY",
  durationMinutes: 60,
  nominationFeeJpy: 500
});
const group = {
  shopId: 5,
  startsAt,
  guests: [
    { label: "A", assignments: [{ technicianProfileId: 11, serviceIds: [101], scheduleSlotIds: [201], expectedPriceAmountJpy: 8_500 }] },
    { label: "B", assignments: [{ technicianProfileId: 12, serviceIds: [102], scheduleSlotIds: [202], expectedPriceAmountJpy: 8_500 }] }
  ]
};
const slots = [slot(201, 11, 101), slot(202, 12, 102)];

describe("planGroupBooking", () => {
  it("plans one independently cancellable order per guest and technician", () => {
    expect(planGroupBooking(group, slots, "black_diamond")).toMatchObject({
      totalPriceAmountJpy: 17_000,
      orders: [
        { guestPosition: 0, technicianProfileId: 11, scheduleSlotIds: [201], priceAmountJpy: 8_500 },
        { guestPosition: 1, technicianProfileId: 12, scheduleSlotIds: [202], priceAmountJpy: 8_500 }
      ]
    });
  });

  it.each(["free", "silver", "gold"] as const)("limits %s to one guest", (tier) => {
    expect(() => planGroupBooking(group, slots, tier)).toThrow("membership_limit");
    expect(() => planGroupBooking({ ...group, guests: group.guests.slice(0, 1) }, slots, tier)).not.toThrow();
  });

  it("rejects a second guest without a distinct fully free technician", () => {
    expect(() => planGroupBooking(group, slots.slice(0, 1), "black_diamond")).toThrow("slot_unavailable");
    expect(() => planGroupBooking(group, [{ ...slots[0]!, bookedCount: 1 }, slots[1]!], "black_diamond")).toThrow("slot_unavailable");
  });

  it("rejects a stale price and a different group start", () => {
    expect(() => planGroupBooking(group, [{ ...slots[0]!, priceAmountJpy: 9_000 }, slots[1]!], "black_diamond")).toThrow("price_changed");
    expect(() => planGroupBooking(group, [slots[0]!, { ...slots[1]!, startsAt: new Date(startsAt.getTime() + 60_000) }], "black_diamond")).toThrow("slot_unavailable");
  });

  it("requires sequential service slots for one technician", () => {
    const bundle = { ...group, guests: [{ label: "A", assignments: [{ technicianProfileId: 11, serviceIds: [101, 103], scheduleSlotIds: [201, 203], expectedPriceAmountJpy: 16_500 }] }] };
    expect(() => planGroupBooking(bundle, [slots[0]!, slot(203, 11, 103, 90)], "free")).toThrow("slot_unavailable");
    expect(planGroupBooking(bundle, [slots[0]!, slot(203, 11, 103, 60)], "free").orders[0]?.scheduleSlotIds).toEqual([201, 203]);
  });

  it("rejects a slot that does not cover the catalog duration or JPY price", () => {
    const one = { ...group, guests: group.guests.slice(0, 1) };
    expect(() => planGroupBooking(one, [{ ...slots[0]!, durationMinutes: 90 }], "free")).toThrow("slot_unavailable");
    expect(() => planGroupBooking(one, [{ ...slots[0]!, currency: "USD" }], "free")).toThrow("slot_unavailable");
  });
});
