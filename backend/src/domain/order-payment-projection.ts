export interface OrderPaymentProjectionInput<TPaymentMethod extends string = string> {
  orderPriceAmountJpy: number;
  orderPaymentAmountJpy: number;
  acceptedAddOnAmountJpy?: number;
  orderPaymentMethod: TPaymentMethod;
  checkout: {
    checkoutAmountJpy: number;
    payableNdp: number;
    paymentMethod: TPaymentMethod | null;
    otherMethodCode: string | null;
    otherMethodLabel: string | null;
    deletedAt: Date | null;
    ledgerTransaction: {
      currency: string;
      deletedAt: Date | null;
    } | null;
  } | null;
  financial: {
    ndpCurrency: string;
    deletedAt: Date | null;
  } | null;
}

export interface OrderPaymentProjection<TPaymentMethod extends string = string> {
  totalAmountJpy: number;
  amountSource: "order_payment" | "order_price" | "accepted_add_ons" | "checkout";
  paymentMethod: TPaymentMethod;
  effectivePaymentMethod: TPaymentMethod | null;
  otherMethodCode: string | null;
  otherMethodLabel: string | null;
  checkoutPaymentAmountNdp: number | null;
  ndpCurrency: string | null;
}

export function sumAcceptedOrderAddOnAmountJpy(
  addOns: Array<{
    status: string;
    priceAmountJpy: number;
    currency: string;
    deletedAt: Date | null;
  }>
): number {
  const total = addOns.reduce((amount, addOn) => {
    if (addOn.status !== "ACCEPTED" || addOn.deletedAt !== null) return amount;
    if (
      addOn.currency !== "JPY" ||
      !Number.isSafeInteger(addOn.priceAmountJpy) ||
      addOn.priceAmountJpy < 0
    ) {
      throw new Error("error.order.payment_projection_invalid");
    }
    return amount + BigInt(addOn.priceAmountJpy);
  }, 0n);
  if (total > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error("error.order.payment_projection_invalid");
  }
  return Number(total);
}

export function projectOrderPayment<TPaymentMethod extends string>(
  input: OrderPaymentProjectionInput<TPaymentMethod>
): OrderPaymentProjection<TPaymentMethod> {
  const activeCheckout = input.checkout?.deletedAt === null ? input.checkout : null;
  const activeFinancial = input.financial?.deletedAt === null ? input.financial : null;
  const effectivePaymentMethod = activeCheckout
    ? activeCheckout.paymentMethod
    : input.orderPaymentMethod;
  const activeLedgerCurrency =
    activeCheckout?.ledgerTransaction?.deletedAt === null
      ? activeCheckout.ledgerTransaction.currency
      : null;
  const usesLegacyOrderPrice =
    !activeCheckout && input.orderPaymentAmountJpy === 0 && input.orderPriceAmountJpy > 0;
  const preCheckoutBaseAmountJpy = usesLegacyOrderPrice
    ? input.orderPriceAmountJpy
    : input.orderPaymentAmountJpy;
  const acceptedAddOnAmountJpy = input.acceptedAddOnAmountJpy ?? 0;
  const preCheckoutTotalAmountJpy = preCheckoutBaseAmountJpy + acceptedAddOnAmountJpy;

  if (
    !Number.isSafeInteger(preCheckoutBaseAmountJpy) ||
    preCheckoutBaseAmountJpy < 0 ||
    !Number.isSafeInteger(acceptedAddOnAmountJpy) ||
    acceptedAddOnAmountJpy < 0 ||
    !Number.isSafeInteger(preCheckoutTotalAmountJpy)
  ) {
    throw new Error("error.order.payment_projection_invalid");
  }

  return {
    totalAmountJpy: activeCheckout?.checkoutAmountJpy ?? preCheckoutTotalAmountJpy,
    amountSource: activeCheckout
      ? "checkout"
      : acceptedAddOnAmountJpy > 0
        ? "accepted_add_ons"
        : usesLegacyOrderPrice
          ? "order_price"
          : "order_payment",
    paymentMethod: input.orderPaymentMethod,
    effectivePaymentMethod,
    otherMethodCode:
      effectivePaymentMethod === "OTHER" ? activeCheckout?.otherMethodCode ?? null : null,
    otherMethodLabel:
      effectivePaymentMethod === "OTHER" ? activeCheckout?.otherMethodLabel ?? null : null,
    checkoutPaymentAmountNdp:
      effectivePaymentMethod === "NDP" ? activeCheckout?.payableNdp ?? null : null,
    ndpCurrency:
      effectivePaymentMethod === "NDP"
        ? activeLedgerCurrency ?? activeFinancial?.ndpCurrency ?? null
        : null
  };
}
