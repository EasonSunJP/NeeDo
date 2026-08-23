import { describe, expect, it } from "vitest";
import { financing, scenarios } from "../needo-roadshow/data.mjs";
import { premiumSlides } from "./content.mjs";

describe("premium roadshow locks", () => {
  it("keeps 34 slides and seven approved dark slides", () => {
    expect(premiumSlides).toHaveLength(34);
    expect(premiumSlides.filter((slide) => slide.mode === "dark").map((slide) => slide.page))
      .toEqual([2, 10, 16, 19, 26, 31, 34]);
  });

  it("keeps financing and store scenarios", () => {
    expect(financing).toMatchObject({ amountJpy: 200_000_000, equity: 0.10, preMoney: 1_800_000_000, postMoney: 2_000_000_000 });
    expect(scenarios.general.stores).toEqual([1200, 3000, 6000]);
    expect(scenarios.aggressive.stores).toEqual([1800, 5000, 10000]);
  });
});
