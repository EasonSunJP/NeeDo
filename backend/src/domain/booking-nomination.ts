export function calculateBookingNominationPrice(input: {
  servicePriceJpy: number;
  nominationFeeJpy: number;
  nominated: boolean;
}) {
  if (
    !Number.isSafeInteger(input.servicePriceJpy) ||
    input.servicePriceJpy < 0 ||
    !Number.isSafeInteger(input.nominationFeeJpy) ||
    input.nominationFeeJpy < 0
  ) {
    throw new Error("invalid_booking_nomination_price");
  }
  const nominationFeeJpy = input.nominated ? input.nominationFeeJpy : 0;
  return {
    servicePriceJpy: input.servicePriceJpy,
    nominationFeeJpy,
    totalPriceJpy: input.servicePriceJpy + nominationFeeJpy,
  };
}

export function resolveBookingNominatedTechnicianProfileId(input: {
  requestedTechnicianProfileId?: number;
  technicianServiceOwnerId?: number;
}): number | null {
  return input.technicianServiceOwnerId ?? input.requestedTechnicianProfileId ?? null;
}
