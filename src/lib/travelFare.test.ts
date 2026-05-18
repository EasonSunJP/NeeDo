import { describe, expect, it } from "vitest";
import {
  areaTravelFareRules,
  buildDistanceFarePreview,
  estimateBusFare,
  estimateTaxiFare,
  estimateTrainFare,
  pickRecommendedTravelMode
} from "./travelFare";

function findRule(id: string) {
  const rule = areaTravelFareRules.find((item) => item.id === id);

  if (!rule) {
    throw new Error(`Missing fare rule: ${id}`);
  }

  return rule;
}

describe("travel fare rules", () => {
  it("estimates Tokyo taxi fares from the 2026 distance increments", () => {
    const tokyo = findRule("tokyo-special-ward");

    expect(estimateTaxiFare(tokyo, 1)).toBe(500);
    expect(estimateTaxiFare(tokyo, 3)).toBe(1400);
    expect(estimateTaxiFare(tokyo, 3, { lateNight: true })).toBe(1680);
    expect(estimateTaxiFare(tokyo, 3, { includeDispatch: true })).toBe(1800);
  });

  it("uses distance bands for electric train and bus estimates", () => {
    const tokyo = findRule("tokyo-special-ward");

    expect(estimateTrainFare(tokyo, 3)).toBe(160);
    expect(estimateTrainFare(tokyo, 8)).toBe(220);
    expect(estimateTrainFare(tokyo, 15)).toBe(260);
    expect(estimateBusFare(tokyo, 3)).toBe(210);
    expect(estimateBusFare(tokyo, 8)).toBe(420);
    expect(estimateBusFare(tokyo, 15)).toBe(500);
  });

  it("keeps regional fare differences visible in the preview", () => {
    const tokyo = findRule("tokyo-special-ward");
    const kanagawa = findRule("kanagawa-yokohama-kawasaki");
    const fukuoka = findRule("fukuoka-city");

    expect(estimateTaxiFare(kanagawa, 8)).toBeGreaterThan(estimateTaxiFare(tokyo, 8));
    expect(estimateTrainFare(fukuoka, 8)).toBeGreaterThan(estimateTrainFare(tokyo, 8));
    expect(pickRecommendedTravelMode(tokyo, 8)).toBe("电车");
    expect(buildDistanceFarePreview(tokyo)).toHaveLength(3);
  });
});
