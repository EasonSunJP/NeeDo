import type { BookingScheduleSlot, CreateBookingGroupInput } from "./api";

export type GroupAssignmentDraft = { technicianProfileId: number | null; serviceIds: number[] };
export type GroupGuestDraft = { label: string; assignments: GroupAssignmentDraft[] };
export type GroupBookingDraft = {
  shopId: number;
  startsAt: string;
  catalog: "shop_service" | "technician_service";
  guests: GroupGuestDraft[];
};

export function resolveGroupBookingDraft(
  draft: GroupBookingDraft,
  slots: readonly BookingScheduleSlot[]
): (CreateBookingGroupInput & { totalPriceAmountJpy: number }) | null {
  if (!draft.guests.length || draft.guests.length > 10) return null;
  const usedTechnicians = new Set<number>();
  const usedSlots = new Set<number>();
  let totalPriceAmountJpy = 0;
  const guests: CreateBookingGroupInput["guests"] = [];
  for (const guest of draft.guests) {
    if (!guest.label.trim() || !guest.assignments.length) return null;
    const assignments: CreateBookingGroupInput["guests"][number]["assignments"] = [];
    for (const assignment of guest.assignments) {
      const technicianProfileId = assignment.technicianProfileId;
      if (!technicianProfileId || usedTechnicians.has(technicianProfileId) || !assignment.serviceIds.length ||
          new Set(assignment.serviceIds).size !== assignment.serviceIds.length) return null;
      usedTechnicians.add(technicianProfileId);
      let nextStart = draft.startsAt;
      let serviceAmount = 0;
      let nominationFeeJpy = 0;
      const scheduleSlotIds: number[] = [];
      for (const [position, serviceId] of assignment.serviceIds.entries()) {
        const slot = slots.find((candidate) =>
          candidate.shopId === draft.shopId && candidate.technicianProfileId === technicianProfileId &&
          (draft.catalog === "shop_service" ? candidate.serviceId : candidate.technicianServiceId) === serviceId &&
          candidate.startsAt === nextStart && candidate.status === "available" &&
          candidate.bookedCount < candidate.capacity && !usedSlots.has(candidate.id)
        );
        if (!slot || slot.currency !== "JPY" || Date.parse(slot.endsAt) - Date.parse(slot.startsAt) !== slot.durationMinutes * 60_000) return null;
        const price = Number(slot.priceAmount);
        if (!Number.isSafeInteger(price) || price < 0) return null;
        scheduleSlotIds.push(slot.id);
        usedSlots.add(slot.id);
        serviceAmount += price;
        if (position === 0) nominationFeeJpy = slot.nominationFeeJpy ?? 0;
        nextStart = slot.endsAt;
      }
      const expectedPriceAmountJpy = serviceAmount + nominationFeeJpy;
      if (!Number.isSafeInteger(expectedPriceAmountJpy) || expectedPriceAmountJpy < 0) return null;
      totalPriceAmountJpy += expectedPriceAmountJpy;
      assignments.push({
        technicianProfileId, scheduleSlotIds, expectedPriceAmountJpy,
        ...(draft.catalog === "shop_service" ? { serviceIds: assignment.serviceIds } : { technicianServiceIds: assignment.serviceIds })
      });
    }
    guests.push({ label: guest.label.trim(), assignments });
  }
  return Number.isSafeInteger(totalPriceAmountJpy)
    ? { shopId: draft.shopId, startsAt: draft.startsAt, guests, totalPriceAmountJpy }
    : null;
}
