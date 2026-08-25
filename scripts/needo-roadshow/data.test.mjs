import { describe, expect, it } from "vitest";
import { financing, scenarios, economics, slideTitles } from "./data.mjs";

describe("NeeDo roadshow data locks", () => {
  it("keeps the approved 34-slide financing terms", () => {
    expect(slideTitles).toHaveLength(34);
    expect(financing).toMatchObject({
      amountJpy: 200_000_000,
      equity: 0.10,
      preMoney: 1_800_000_000,
      postMoney: 2_000_000_000,
    });
  });

  it("keeps the three approved store scenarios", () => {
    expect(scenarios.general.stores).toEqual([1200, 3000, 6000]);
    expect(scenarios.aggressive.stores).toEqual([1800, 5000, 10000]);
    expect(scenarios.conservative.stores).toEqual([500, 1000, 2000]);
  });

  it("keeps model-derived unit economics and positive cash balances", () => {
    expect(economics).toMatchObject({
      storeSaasMonthly: 9800,
      bookingFee: 500,
      simplifiedOrderContribution: 340,
    });
    expect(scenarios.general.cashQuarterM.every((value) => value > 0)).toBe(true);
    expect(scenarios.aggressive.cashQuarterM.every((value) => value > 0)).toBe(true);
  });
});
