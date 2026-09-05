import { describe, expect, it } from "vitest";
import {
  formatMerchantPriceRange,
  parseMerchantPriceRange,
  validateMerchantPriceRange
} from "./merchantPriceRange";

describe("merchant price range", () => {
  it("formats and restores the approved yen range", () => {
    expect(formatMerchantPriceRange({ min: "8800", max: "12800" })).toBe("￥8,800 ~ ￥12,800");
    expect(parseMerchantPriceRange("￥8,800 ~ ￥12,800")).toEqual({ min: "8800", max: "12800" });
  });

  it("allows an empty optional range but requires both ordered endpoints", () => {
    expect(validateMerchantPriceRange({ min: "", max: "" })).toBeNull();
    expect(validateMerchantPriceRange({ min: "8800", max: "" })).toBe("请完整填写费用区间");
    expect(validateMerchantPriceRange({ min: "12800", max: "8800" })).toBe("最低费用不能高于最高费用");
    expect(validateMerchantPriceRange({ min: "8800", max: "12800" })).toBeNull();
  });
});
