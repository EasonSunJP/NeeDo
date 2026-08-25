import { describe, expect, it } from "vitest";
import { economics, financing, scenarios } from "../needo-roadshow/data.mjs";
import { referenceSlides } from "./content.mjs";

describe("reference-style roadshow locks", () => {
  it("keeps 34 slides and the approved financing", () => {
    expect(referenceSlides).toHaveLength(34);
    expect(referenceSlides.map((slide) => slide.page)).toEqual(
      Array.from({ length: 34 }, (_, index) => index + 1),
    );
    expect(financing).toMatchObject({
      amountJpy: 200_000_000,
      equity: 0.1,
      preMoney: 1_800_000_000,
      postMoney: 2_000_000_000,
    });
  });

  it("keeps unit economics and store scenarios", () => {
    expect(economics).toMatchObject({
      storeSaasMonthly: 9800,
      minimumContractMonths: 6,
      bookingFreeMonths: 3,
      bookingFee: 500,
      simplifiedOrderContribution: 340,
      paidStoreCac: 15000,
      referralSuccessFee: 30000,
    });
    expect(economics.simplifiedOrderContribution / economics.bookingFee).toBeCloseTo(0.68, 6);
    expect(scenarios.general.stores).toEqual([1200, 3000, 6000]);
    expect(scenarios.aggressive.stores).toEqual([1800, 5000, 10000]);
  });

  it("keeps the required maturity and intent disclosures", () => {
    const allText = referenceSlides
      .flatMap((slide) => [slide.title, slide.statement, slide.disclosure])
      .join("\n");
    expect(allText).toContain("使用意向");
    expect(allText).toContain("不是簽約、付費、營收或活躍店鋪");
    expect(allText).toContain("可操作原型");
    expect(allText).toContain("尚無真實歸因 GMV 或 CPS 收入");
  });
});
