import {
  calculateShopPlatformRating,
  calculateTechnicianPlatformRating,
  TECHNICIAN_PLATFORM_RATING_PRIOR
} from "../src/domain/technician-rating";

describe("technician platform rating", () => {
  it("starts every technician at one five-star platform prior", () => {
    expect(TECHNICIAN_PLATFORM_RATING_PRIOR).toBe(5);
    expect(calculateTechnicianPlatformRating(0, 0)).toBe(5);
  });

  it("applies the same five-star platform prior to shops", () => {
    expect(calculateShopPlatformRating(0, 0)).toBe(5);
    expect(calculateShopPlatformRating(4, 1)).toBe(4.5);
  });

  it("averages the platform prior with formal customer reviews", () => {
    expect(calculateTechnicianPlatformRating(4, 1)).toBe(4.5);
    expect(calculateTechnicianPlatformRating(3.5, 2)).toBe(4);
    expect(calculateTechnicianPlatformRating(5, 20)).toBe(5);
  });

  it.each([
    [Number.NaN, 0],
    [-1, 1],
    [6, 1],
    [4, -1],
    [4, 1.5]
  ])("rejects invalid persisted inputs instead of hiding corrupt rating data", (average, count) => {
    expect(() => calculateTechnicianPlatformRating(average, count)).toThrow(RangeError);
  });
});
