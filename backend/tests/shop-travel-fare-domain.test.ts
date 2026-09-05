import {
  TravelFareRuleError,
  selectTravelFareBand,
  validateTravelFareBands
} from "../src/domain/shop-travel-fare";

describe("shop travel fare domain", () => {
  const bands = [
    { maximumDistanceMeters: 5_000, fareAmountJpy: 0 },
    { maximumDistanceMeters: 10_000, fareAmountJpy: 500 },
    { maximumDistanceMeters: 20_000, fareAmountJpy: 1_000 }
  ];

  it("accepts one to fifty strictly ascending positive limits with non-negative integer fares", () => {
    expect(validateTravelFareBands(bands)).toEqual(
      bands.map((band, ordinal) => ({ ...band, ordinal }))
    );
    expect(() => validateTravelFareBands([])).toThrow("error.travel.policy_bands_invalid");
    expect(() => validateTravelFareBands(Array.from({ length: 51 }, (_, index) => ({
      maximumDistanceMeters: index + 1,
      fareAmountJpy: 0
    })))).toThrow("error.travel.policy_bands_invalid");
  });

  it.each([
    ["zero limit", [{ maximumDistanceMeters: 0, fareAmountJpy: 0 }]],
    ["descending limits", [bands[1], bands[0]]],
    ["duplicate limits", [bands[0], bands[0]]],
    ["fractional limit", [{ maximumDistanceMeters: 1.5, fareAmountJpy: 0 }]],
    ["negative fare", [{ maximumDistanceMeters: 5_000, fareAmountJpy: -1 }]],
    ["fractional fare", [{ maximumDistanceMeters: 5_000, fareAmountJpy: 1.5 }]],
    ["unsafe fare", [{ maximumDistanceMeters: 5_000, fareAmountJpy: Number.MAX_VALUE }]]
  ])("rejects %s", (_label, input) => {
    expect(() => validateTravelFareBands(input)).toThrow(
      new TravelFareRuleError("error.travel.policy_bands_invalid")
    );
  });

  it.each([
    [1, 5_000, 0, 0],
    [5_000, 5_000, 0, 0],
    [5_001, 10_000, 500, 1],
    [10_000, 10_000, 500, 1],
    [10_001, 20_000, 1_000, 2],
    [20_000, 20_000, 1_000, 2]
  ])(
    "matches %i metres to the first inclusive %i metre band",
    (distanceMeters, maximumDistanceMeters, fareAmountJpy, ordinal) => {
      expect(selectTravelFareBand(distanceMeters, bands)).toEqual({
        maximumDistanceMeters,
        fareAmountJpy,
        ordinal
      });
    }
  );

  it("rejects non-positive route distances and distances outside the last band", () => {
    expect(() => selectTravelFareBand(0, bands)).toThrow("error.travel.distance_invalid");
    expect(() => selectTravelFareBand(20_001, bands)).toThrow(
      "error.travel.outside_service_area"
    );
  });
});
