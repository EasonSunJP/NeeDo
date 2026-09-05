export const ORDER_CHECKOUT_MAX_INT = 2_147_483_647;

export class OrderCheckoutSnapshotError extends Error {
  public constructor() {
    super("error.order.checkout.invalid_snapshot");
  }
}

export interface OrderCheckoutCalculationRateInput {
  ruleId: number;
  publicId: string;
  version: number;
  ndpUnits: number;
  jpyUnits: number;
  effectiveFrom: Date;
}

export interface OrderCheckoutCalculationSource {
  currency: string;
  servicePrice: string | number;
  travelFareAmountJpy?: number;
  addOns: Array<{
    id: number;
    status: string;
    priceAmountJpy: number;
    currency: string;
    deletedAt: Date | null;
  }>;
  affiliateAttribution?: {
    originalPriceJpy: number;
    customerDiscountJpy: number;
    finalPriceJpy: number;
  } | null;
}

export interface OrderCheckoutCalculationSnapshot {
  baseAmountJpy: number;
  addOnAmountJpy: number;
  travelFareAmountJpy: number;
  discountAmountJpy: number;
  checkoutAmountJpy: number;
  payableNdp: number;
  rate: {
    ruleId: number;
    publicId: string;
    version: number;
    ndpUnits: number;
    jpyUnits: number;
    effectiveFrom: string;
  };
  calculation: {
    formula: "base_plus_accepted_add_ons_plus_travel_fare_minus_discount";
    baseAmountJpy: number;
    acceptedAddOnIds: number[];
    addOnAmountJpy: number;
    travelFareAmountJpy: number;
    discountAmountJpy: number;
    checkoutAmountJpy: number;
    rateFormula: "ceil(jpy_times_ndp_units_divided_by_jpy_units)";
  };
}

const fail = (): never => {
  throw new OrderCheckoutSnapshotError();
};

const persistedInt = (value: number): number => {
  if (!Number.isInteger(value) || value < 0 || value > ORDER_CHECKOUT_MAX_INT) fail();
  return value;
};

const exactJpyInteger = (value: string | number): number => {
  const text = String(value);
  if (!/^\d+(?:\.0+)?$/.test(text)) fail();
  const parsed = Number(text);
  if (!Number.isSafeInteger(parsed)) fail();
  return persistedInt(parsed);
};

export const calculateOrderCheckoutSnapshot = (
  source: OrderCheckoutCalculationSource,
  rate: OrderCheckoutCalculationRateInput
): OrderCheckoutCalculationSnapshot => {
  if (
    source.currency !== "JPY" ||
    typeof rate.publicId !== "string" ||
    rate.publicId.length === 0 ||
    !(rate.effectiveFrom instanceof Date) ||
    Number.isNaN(rate.effectiveFrom.getTime())
  )
    fail();

  persistedInt(rate.ruleId);
  persistedInt(rate.version);
  persistedInt(rate.ndpUnits);
  persistedInt(rate.jpyUnits);
  if (rate.ruleId === 0 || rate.version === 0 || rate.ndpUnits === 0 || rate.jpyUnits === 0) fail();

  const affiliate = source.affiliateAttribution ?? null;
  const baseAmountJpy = affiliate
    ? persistedInt(affiliate.originalPriceJpy)
    : exactJpyInteger(source.servicePrice);
  const discountAmountJpy = affiliate ? persistedInt(affiliate.customerDiscountJpy) : 0;
  const travelFareAmountJpy = persistedInt(source.travelFareAmountJpy ?? 0);
  if (
    affiliate &&
    (persistedInt(affiliate.finalPriceJpy) < 0 ||
      affiliate.originalPriceJpy - affiliate.customerDiscountJpy !== affiliate.finalPriceJpy)
  )
    fail();

  const accepted = source.addOns.filter(
    (addOn) => addOn.status === "ACCEPTED" && addOn.deletedAt === null
  );
  for (const addOn of accepted) {
    if (
      addOn.currency !== "JPY" ||
      !Number.isInteger(addOn.id) ||
      addOn.id <= 0 ||
      addOn.id > ORDER_CHECKOUT_MAX_INT
    )
      fail();
    persistedInt(addOn.priceAmountJpy);
  }

  const addOnTotal = accepted.reduce((total, addOn) => total + BigInt(addOn.priceAmountJpy), 0n);
  const checkoutAmount =
    BigInt(baseAmountJpy) + addOnTotal + BigInt(travelFareAmountJpy) - BigInt(discountAmountJpy);
  if (
    checkoutAmount < 0n ||
    checkoutAmount > BigInt(ORDER_CHECKOUT_MAX_INT) ||
    addOnTotal > BigInt(ORDER_CHECKOUT_MAX_INT)
  )
    fail();
  const payable =
    (checkoutAmount * BigInt(rate.ndpUnits) + BigInt(rate.jpyUnits) - 1n) / BigInt(rate.jpyUnits);
  if (payable > BigInt(ORDER_CHECKOUT_MAX_INT)) fail();

  const addOnAmountJpy = Number(addOnTotal);
  const checkoutAmountJpy = Number(checkoutAmount);
  return {
    baseAmountJpy,
    addOnAmountJpy,
    travelFareAmountJpy,
    discountAmountJpy,
    checkoutAmountJpy,
    payableNdp: Number(payable),
    rate: {
      ruleId: rate.ruleId,
      publicId: rate.publicId,
      version: rate.version,
      ndpUnits: rate.ndpUnits,
      jpyUnits: rate.jpyUnits,
      effectiveFrom: rate.effectiveFrom.toISOString()
    },
    calculation: {
      formula: "base_plus_accepted_add_ons_plus_travel_fare_minus_discount",
      baseAmountJpy,
      acceptedAddOnIds: accepted.map((addOn) => addOn.id),
      addOnAmountJpy,
      travelFareAmountJpy,
      discountAmountJpy,
      checkoutAmountJpy,
      rateFormula: "ceil(jpy_times_ndp_units_divided_by_jpy_units)"
    }
  };
};
