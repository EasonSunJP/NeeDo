export interface OrderPaymentProjectionInput<TPaymentMethod extends string = string> {
  orderPriceAmountJpy: number;
  orderPaymentAmountJpy: number;
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
  amountSource: "order_payment" | "order_price" | "checkout";
  paymentMethod: TPaymentMethod;
  effectivePaymentMethod: TPaymentMethod | null;
  otherMethodCode: string | null;
  otherMethodLabel: string | null;
  checkoutPaymentAmountNdp: number | null;
  ndpCurrency: string | null;
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

  return {
    totalAmountJpy:
      activeCheckout?.checkoutAmountJpy ??
      (usesLegacyOrderPrice ? input.orderPriceAmountJpy : input.orderPaymentAmountJpy),
    amountSource: activeCheckout
      ? "checkout"
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
