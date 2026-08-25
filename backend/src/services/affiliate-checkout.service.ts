export type AffiliateCheckoutSource = "code" | "url";
export type AffiliateCheckoutDiscountType = "none" | "fixed_jpy" | "percent";

export type AffiliatePromotionSelector = {
  source: AffiliateCheckoutSource;
  value: string;
};

export interface AffiliatePromotionInput {
  affiliateCode?: string;
  affiliatePublicToken?: string;
}

export interface AffiliatePriceInput {
  originalPriceJpy: number;
  discountType: AffiliateCheckoutDiscountType;
  fixedDiscountJpy: number;
  discountRateBps: number;
  discountCapJpy: number;
}

export interface AffiliatePriceSnapshot {
  originalPriceJpy: number;
  customerDiscountJpy: number;
  finalPriceJpy: number;
}

export interface AffiliateCheckoutSummary extends AffiliatePriceSnapshot {
  taskId: number;
  publicCode: string;
  source: AffiliateCheckoutSource;
  rewardAllocatedNdp: number;
  attributionStatus: "attributed" | "invalidated";
}

export const selectAffiliatePromotion = (
  input: AffiliatePromotionInput
): AffiliatePromotionSelector | null => {
  const code = input.affiliateCode?.trim();
  if (code) {
    return { source: "code", value: code };
  }
  const publicToken = input.affiliatePublicToken?.trim();
  return publicToken ? { source: "url", value: publicToken } : null;
};

export const calculateAffiliatePrice = (
  input: AffiliatePriceInput
): AffiliatePriceSnapshot => {
  assertPriceInput(input);

  let customerDiscountJpy = 0;
  if (input.discountType === "fixed_jpy") {
    customerDiscountJpy = Math.min(input.originalPriceJpy, input.fixedDiscountJpy);
  } else if (input.discountType === "percent") {
    customerDiscountJpy = Math.min(
      input.originalPriceJpy,
      input.discountCapJpy,
      Math.floor((input.originalPriceJpy * input.discountRateBps) / 10_000)
    );
  }

  return {
    originalPriceJpy: input.originalPriceJpy,
    customerDiscountJpy,
    finalPriceJpy: input.originalPriceJpy - customerDiscountJpy
  };
};

const assertPriceInput = (input: AffiliatePriceInput): void => {
  const integers = [
    input.originalPriceJpy,
    input.fixedDiscountJpy,
    input.discountRateBps,
    input.discountCapJpy
  ];
  const invalidInteger = integers.some(
    (value) => !Number.isSafeInteger(value) || value < 0
  );
  const invalidPercentage =
    input.discountType === "percent" &&
    (input.discountRateBps < 1 ||
      input.discountRateBps > 10_000 ||
      input.discountCapJpy < 1);

  if (invalidInteger || invalidPercentage) {
    throw new Error("error.affiliate.price_snapshot_invalid");
  }
};
