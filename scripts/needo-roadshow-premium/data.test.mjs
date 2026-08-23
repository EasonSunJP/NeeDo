import { describe, expect, it } from "vitest";
import { financing, scenarios, slideTitles } from "../needo-roadshow/data.mjs";
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

  it("derives every title from the approved source data", () => {
    expect(premiumSlides.map((slide) => slide.title)).toEqual(slideTitles);
  });

  it("locks the Pre-A round and appendix classification", () => {
    expect(financing.round).toBe("Pre-A");
    for (const page of [2, 25, 26]) {
      expect(premiumSlides[page - 1].statement).toContain(financing.round);
    }
    expect(premiumSlides.filter((slide) => slide.section === "appendix").map((slide) => slide.page))
      .toEqual([27, 28]);
    expect(premiumSlides[26].statement).toContain("僅附錄");
  });

  it("labels prototype-only CPS and transparent-order disclosures", () => {
    for (const page of [10, 15, 16, 17, 18, 22]) {
      expect(premiumSlides[page - 1].statement).toMatch(/可操作原型|尚無真實歸因 GMV|不納入核心模型/);
    }
  });

  it("states the prohibited and separately regulated adult-service boundary", () => {
    for (const page of [8, 9, 23, 30, 31]) {
      expect(premiumSlides[page - 1].statement).toContain("現行條款禁止");
      expect(premiumSlides[page - 1].statement).toContain("獨立受監管市場");
      expect(premiumSlides[page - 1].statement).toContain("不進入核心模型");
    }
  });
});
