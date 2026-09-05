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

  it("rejects reversed endpoints beyond the safe Number integer limit", () => {
    expect(validateMerchantPriceRange({ min: "9007199254740993", max: "9007199254740992" })).toBe("最低费用不能高于最高费用");
    expect(validateMerchantPriceRange({ min: "9007199254740992", max: "9007199254740993" })).toBeNull();
  });

  it("formats adjacent large integer endpoints without rounding either digit string", () => {
    const range = { min: "9007199254740992", max: "9007199254740993" };
    const label = formatMerchantPriceRange(range);
    expect(label).toBe("￥9,007,199,254,740,992 ~ ￥9,007,199,254,740,993");
    expect(parseMerchantPriceRange(label)).toEqual(range);
  });

  it("compares and formats 309-digit amounts exactly without infinity", () => {
    const amount = "9".repeat(309);
    const formatted = `${"999,".repeat(102)}999`;
    expect.soft(validateMerchantPriceRange({ min: amount, max: "8".repeat(309) })).toBe("最低费用不能高于最高费用");
    const label = formatMerchantPriceRange({ min: amount, max: amount });
    expect.soft(label).toBe(`￥${formatted} ~ ￥${formatted}`);
    expect.soft(parseMerchantPriceRange(label)).toEqual({ min: amount, max: amount });
  });
});
