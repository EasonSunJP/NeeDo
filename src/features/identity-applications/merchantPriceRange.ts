export type MerchantPriceRange = { min: string; max: string };

const digits = (value: string) => value.replace(/\D/gu, "");

export function parseMerchantPriceRange(value: string): MerchantPriceRange {
  const [min = "", max = ""] = value.split(/\s*[~-]\s*/u).map(digits);
  return { min, max };
}

export function formatMerchantPriceRange({ min, max }: MerchantPriceRange) {
  if (!min && !max) return "";
  if (!min || !max) return "";
  return `￥${Number(min).toLocaleString("ja-JP")} ~ ￥${Number(max).toLocaleString("ja-JP")}`;
}

export function validateMerchantPriceRange({ min, max }: MerchantPriceRange) {
  if (!min && !max) return null;
  if (!min || !max) return "请完整填写费用区间";
  if (Number(min) > Number(max)) return "最低费用不能高于最高费用";
  return null;
}
