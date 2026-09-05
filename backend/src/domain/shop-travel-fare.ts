export interface TravelFareBandInput {
  maximumDistanceMeters: number;
  fareAmountJpy: number;
}

export interface ValidatedTravelFareBand extends TravelFareBandInput {
  ordinal: number;
}

export type TravelFareRuleErrorKey =
  | "error.travel.policy_bands_invalid"
  | "error.travel.distance_invalid"
  | "error.travel.outside_service_area";

export class TravelFareRuleError extends Error {
  public constructor(public readonly errorKey: TravelFareRuleErrorKey) {
    super(errorKey);
    this.name = "TravelFareRuleError";
  }
}

const isSafeInteger = (value: number): boolean => Number.isSafeInteger(value);

export const validateTravelFareBands = (
  bands: readonly TravelFareBandInput[]
): ValidatedTravelFareBand[] => {
  if (bands.length < 1 || bands.length > 50) {
    throw new TravelFareRuleError("error.travel.policy_bands_invalid");
  }

  let previousMaximum = 0;
  return bands.map((band, ordinal) => {
    if (
      !isSafeInteger(band.maximumDistanceMeters) ||
      band.maximumDistanceMeters <= previousMaximum ||
      !isSafeInteger(band.fareAmountJpy) ||
      band.fareAmountJpy < 0
    ) {
      throw new TravelFareRuleError("error.travel.policy_bands_invalid");
    }
    previousMaximum = band.maximumDistanceMeters;
    return { ...band, ordinal };
  });
};

export const selectTravelFareBand = (
  distanceMeters: number,
  bands: readonly TravelFareBandInput[]
): ValidatedTravelFareBand => {
  if (!isSafeInteger(distanceMeters) || distanceMeters <= 0) {
    throw new TravelFareRuleError("error.travel.distance_invalid");
  }

  const validatedBands = validateTravelFareBands(bands);
  const match = validatedBands.find(
    (band) => distanceMeters <= band.maximumDistanceMeters
  );
  if (!match) {
    throw new TravelFareRuleError("error.travel.outside_service_area");
  }
  return match;
};
