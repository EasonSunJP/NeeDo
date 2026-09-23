export type GroupCatalogAssignment = {
  technicianProfileId: number;
  serviceIds?: number[];
  technicianServiceIds?: number[];
  scheduleSlotIds: number[];
  expectedPriceAmountJpy: number;
};

export type GroupBookingRequest = {
  shopId: number;
  startsAt: Date;
  guests: Array<{ label: string; assignments: GroupCatalogAssignment[] }>;
};

export type GroupBookingSlot = {
  id: number;
  shopId: number;
  technicianProfileId: number | null;
  serviceId: number | null;
  technicianServiceId: number | null;
  startsAt: Date;
  endsAt: Date;
  occupiedStartsAt: Date | null;
  occupiedEndsAt: Date | null;
  bookedCount: number;
  capacity: number;
  priceAmountJpy: number;
  nominationFeeJpy: number;
};

export type GroupBookingOrderPlan = {
  guestPosition: number;
  technicianProfileId: number;
  scheduleSlotIds: number[];
  priceAmountJpy: number;
  servicePriceAmountJpy: number;
  nominationFeeJpy: number;
  startsAt: Date;
  endsAt: Date;
};

export function planGroupBooking(
  request: GroupBookingRequest,
  slots: readonly GroupBookingSlot[],
  tierCode: "free" | "silver" | "gold" | "black_diamond"
): { orders: GroupBookingOrderPlan[]; totalPriceAmountJpy: number } {
  if (request.guests.length < 1 || request.guests.length > 10 ||
      (tierCode !== "black_diamond" && request.guests.length > 1)) {
    throw new Error("membership_limit");
  }
  const byId = new Map(slots.map((slot) => [slot.id, slot]));
  const usedTechnicians = new Set<number>();
  const usedSlots = new Set<number>();
  const orders: GroupBookingOrderPlan[] = [];
  for (const [guestPosition, guest] of request.guests.entries()) {
    if (!guest.assignments.length) throw new Error("slot_unavailable");
    for (const assignment of guest.assignments) {
      if (usedTechnicians.has(assignment.technicianProfileId)) throw new Error("slot_unavailable");
      usedTechnicians.add(assignment.technicianProfileId);
      const selectedServices = assignment.serviceIds ?? assignment.technicianServiceIds;
      if (!selectedServices || selectedServices.length !== assignment.scheduleSlotIds.length || selectedServices.length < 1) {
        throw new Error("slot_unavailable");
      }
      const selectedSlots = assignment.scheduleSlotIds.map((id, position) => {
        const slot = byId.get(id);
        if (!slot || usedSlots.has(id) || slot.shopId !== request.shopId ||
            slot.technicianProfileId !== assignment.technicianProfileId ||
            (assignment.serviceIds ? slot.serviceId : slot.technicianServiceId) !== selectedServices[position] ||
            slot.bookedCount >= slot.capacity || slot.capacity < 1 ||
            slot.startsAt >= slot.endsAt ||
            (slot.occupiedStartsAt ?? slot.startsAt) > slot.startsAt ||
            (slot.occupiedEndsAt ?? slot.endsAt) < slot.endsAt) {
          throw new Error("slot_unavailable");
        }
        usedSlots.add(id);
        return slot;
      });
      if (selectedSlots[0]!.startsAt.getTime() !== request.startsAt.getTime() ||
          selectedSlots.some((slot, index) => index > 0 && slot.startsAt.getTime() !== selectedSlots[index - 1]!.endsAt.getTime())) {
        throw new Error("slot_unavailable");
      }
      const servicePriceAmountJpy = selectedSlots.reduce((sum, slot) => sum + slot.priceAmountJpy, 0);
      const nominationFeeJpy = selectedSlots[0]!.nominationFeeJpy;
      const priceAmountJpy = servicePriceAmountJpy + nominationFeeJpy;
      if (!Number.isSafeInteger(priceAmountJpy) || priceAmountJpy < 0 || priceAmountJpy !== assignment.expectedPriceAmountJpy) {
        throw new Error("price_changed");
      }
      orders.push({
        guestPosition,
        technicianProfileId: assignment.technicianProfileId,
        scheduleSlotIds: assignment.scheduleSlotIds,
        priceAmountJpy,
        servicePriceAmountJpy,
        nominationFeeJpy,
        startsAt: selectedSlots[0]!.startsAt,
        endsAt: selectedSlots[selectedSlots.length - 1]!.endsAt
      });
    }
  }
  if (orders.length > 10 || usedTechnicians.size < request.guests.length) throw new Error("membership_limit");
  return {
    orders,
    totalPriceAmountJpy: orders.reduce((sum, order) => sum + order.priceAmountJpy, 0)
  };
}
