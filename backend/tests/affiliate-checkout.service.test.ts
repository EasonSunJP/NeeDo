import {
  calculateAffiliatePrice,
  selectAffiliatePromotion
} from "../src/services/affiliate-checkout.service";

describe("affiliate checkout pricing", () => {
  it("prefers an explicit nonblank code over a signed URL", () => {
    expect(
      selectAffiliatePromotion({
        affiliateCode: " NDO-CODE ",
        affiliatePublicToken: "token.signature"
      })
    ).toEqual({ source: "code", value: "NDO-CODE" });
  });

  it("uses a signed URL only when no nonblank code is present", () => {
    expect(
      selectAffiliatePromotion({
        affiliateCode: "   ",
        affiliatePublicToken: " token.signature "
      })
    ).toEqual({ source: "url", value: "token.signature" });
    expect(selectAffiliatePromotion({})).toBeNull();
  });

  it("keeps the original price when the task has no customer discount", () => {
    expect(
      calculateAffiliatePrice({
        originalPriceJpy: 12_000,
        discountType: "none",
        fixedDiscountJpy: 0,
        discountRateBps: 0,
        discountCapJpy: 0
      })
    ).toEqual({
      originalPriceJpy: 12_000,
      customerDiscountJpy: 0,
      finalPriceJpy: 12_000
    });
  });

  it("caps a fixed JPY discount at the original price", () => {
    expect(
      calculateAffiliatePrice({
        originalPriceJpy: 800,
        discountType: "fixed_jpy",
        fixedDiscountJpy: 1_000,
        discountRateBps: 0,
        discountCapJpy: 0
      })
    ).toEqual({
      originalPriceJpy: 800,
      customerDiscountJpy: 800,
      finalPriceJpy: 0
    });
  });

  it("floors percentage discounts and applies the per-order cap", () => {
    expect(
      calculateAffiliatePrice({
        originalPriceJpy: 12_999,
        discountType: "percent",
        fixedDiscountJpy: 0,
        discountRateBps: 1_500,
        discountCapJpy: 1_500
      })
    ).toEqual({
      originalPriceJpy: 12_999,
      customerDiscountJpy: 1_500,
      finalPriceJpy: 11_499
    });
    expect(
      calculateAffiliatePrice({
        originalPriceJpy: 9_999,
        discountType: "percent",
        fixedDiscountJpy: 0,
        discountRateBps: 1_501,
        discountCapJpy: 9_999
      }).customerDiscountJpy
    ).toBe(1_500);
  });

  it("rejects invalid non-integer or negative price contracts", () => {
    expect(() =>
      calculateAffiliatePrice({
        originalPriceJpy: 10.5,
        discountType: "none",
        fixedDiscountJpy: 0,
        discountRateBps: 0,
        discountCapJpy: 0
      })
    ).toThrow("error.affiliate.price_snapshot_invalid");
    expect(() =>
      calculateAffiliatePrice({
        originalPriceJpy: 1_000,
        discountType: "fixed_jpy",
        fixedDiscountJpy: -1,
        discountRateBps: 0,
        discountCapJpy: 0
      })
    ).toThrow("error.affiliate.price_snapshot_invalid");
    expect(() =>
      calculateAffiliatePrice({
        originalPriceJpy: 1_000,
        discountType: "percent",
        fixedDiscountJpy: 0,
        discountRateBps: 10_001,
        discountCapJpy: 1_000
      })
    ).toThrow("error.affiliate.price_snapshot_invalid");
  });
});
