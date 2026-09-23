import { expect, it } from "vitest";
import { resolveGroupBookingDraft } from "./group-booking-plan";
import type { BookingScheduleSlot } from "./api";

const start = "2026-10-02T01:00:00.000Z";
function slot(id: number, technicianProfileId: number, serviceId: number, minute = 0): BookingScheduleSlot {
  return {
    id, shopId: 5, technicianProfileId, serviceId, technicianServiceId: null,
    startsAt: new Date(Date.parse(start) + minute * 60_000).toISOString(),
    endsAt: new Date(Date.parse(start) + (minute + 60) * 60_000).toISOString(),
    capacity: 1, bookedCount: 0, status: "available", serviceName: `Service ${serviceId}`,
    shopName: "Shop", technicianName: `Staff ${technicianProfileId}`, priceAmount: "8000",
    currency: "JPY", durationMinutes: 60, nominationFeeJpy: 500
  };
}

it("resolves ordered services and two guests to real assignment slots and prices", () => {
  const plan = resolveGroupBookingDraft({ shopId: 5, startsAt: start, catalog: "shop_service", guests: [
    { label: "A", assignments: [{ technicianProfileId: 11, serviceIds: [101, 103] }] },
    { label: "B", assignments: [{ technicianProfileId: 12, serviceIds: [101] }] }
  ] }, [slot(201, 11, 101), slot(203, 11, 103, 60), slot(202, 12, 101)]);
  expect(plan?.guests[0]?.assignments[0]).toEqual({
    technicianProfileId: 11, serviceIds: [101, 103], scheduleSlotIds: [201, 203], expectedPriceAmountJpy: 16_500
  });
  expect(plan?.totalPriceAmountJpy).toBe(25_000);
});

it("rejects duplicate technicians, gaps, occupied slots, and non-JPY service slots", () => {
  const draft = { shopId: 5, startsAt: start, catalog: "shop_service" as const, guests: [
    { label: "A", assignments: [{ technicianProfileId: 11, serviceIds: [101, 103] }] },
    { label: "B", assignments: [{ technicianProfileId: 12, serviceIds: [101] }] }
  ] };
  const slots = [slot(201, 11, 101), slot(203, 11, 103, 60), slot(202, 12, 101)];
  expect(resolveGroupBookingDraft(draft, [slots[0]!, slot(203, 11, 103, 90), slots[2]!])).toBeNull();
  expect(resolveGroupBookingDraft(draft, [slots[0]!, { ...slots[1]!, bookedCount: 1 }, slots[2]!])).toBeNull();
  expect(resolveGroupBookingDraft(draft, [slots[0]!, { ...slots[1]!, currency: "USD" }, slots[2]!])).toBeNull();
  expect(resolveGroupBookingDraft({ ...draft, guests: [draft.guests[0]!, { label: "B", assignments: [{ technicianProfileId: 11, serviceIds: [101] }] }] }, slots)).toBeNull();
});

it("reuses only the editing order's occupied slot when adding another service", () => {
  const draft = { shopId: 5, startsAt: start, catalog: "shop_service" as const,
    guests: [{ label: "A", assignments: [{ technicianProfileId: 11, serviceIds: [101, 103] }] }] };
  const owned = { ...slot(201, 11, 101), bookedCount: 1, status: "booked" as const };
  const available = slot(203, 11, 103, 60);
  expect(resolveGroupBookingDraft(draft, [owned, available])).toBeNull();
  expect(resolveGroupBookingDraft(draft, [owned, available], new Set([201]))?.guests[0]?.assignments[0]?.scheduleSlotIds)
    .toEqual([201, 203]);
  expect(resolveGroupBookingDraft(draft, [{ ...owned, status: "blocked" }, available], new Set([201]))?.guests[0]?.assignments[0]?.scheduleSlotIds)
    .toEqual([201, 203]);
  expect(resolveGroupBookingDraft(draft, [owned, available], new Set([203]))).toBeNull();
});
