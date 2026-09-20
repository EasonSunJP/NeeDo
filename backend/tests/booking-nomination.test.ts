import {
  calculateBookingNominationPrice,
  resolveBookingNominatedTechnicianProfileId
} from "../src/domain/booking-nomination";

describe("booking nomination pricing", () => {
  it("adds the server nomination fee only when the customer explicitly nominates a technician", () => {
    expect(calculateBookingNominationPrice({ servicePriceJpy: 10_000, nominationFeeJpy: 3_000, nominated: true }))
      .toEqual({ servicePriceJpy: 10_000, nominationFeeJpy: 3_000, totalPriceJpy: 13_000 });
    expect(calculateBookingNominationPrice({ servicePriceJpy: 10_000, nominationFeeJpy: 3_000, nominated: false }))
      .toEqual({ servicePriceJpy: 10_000, nominationFeeJpy: 0, totalPriceJpy: 10_000 });
  });

  it("rejects fractional or negative persisted prices", () => {
    expect(() => calculateBookingNominationPrice({ servicePriceJpy: 10_000, nominationFeeJpy: 3_000.5, nominated: true }))
      .toThrow("invalid_booking_nomination_price");
  });

  it("derives nomination from technician-service ownership for older or crafted clients", () => {
    expect(resolveBookingNominatedTechnicianProfileId({ technicianServiceOwnerId: 31 })).toBe(31);
    expect(resolveBookingNominatedTechnicianProfileId({
      requestedTechnicianProfileId: 99,
      technicianServiceOwnerId: 31
    })).toBe(31);
    expect(resolveBookingNominatedTechnicianProfileId({})).toBeNull();
  });
});
