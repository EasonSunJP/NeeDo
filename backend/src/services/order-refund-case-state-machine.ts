export type OrderRefundCaseStatus =
  | "merchant_review_pending"
  | "refund_pending"
  | "customer_confirmation_pending"
  | "merchant_rejected"
  | "disputed"
  | "refunded"
  | "dispute_rejected";

export type OrderRefundCaseAction =
  | "merchant_approve"
  | "merchant_reject"
  | "open_complaint"
  | "resolve_dispute_refund"
  | "resolve_dispute_reject"
  | "submit_refund_evidence"
  | "confirm_customer_receipt";

export type OrderRefundCaseTransition =
  | { ok: true; status: OrderRefundCaseStatus }
  | { ok: false; reason: "invalid_transition" };

const TRANSITIONS: Readonly<
  Partial<
    Record<OrderRefundCaseStatus, Partial<Record<OrderRefundCaseAction, OrderRefundCaseStatus>>>
  >
> = Object.freeze({
  merchant_review_pending: Object.freeze({
    merchant_approve: "refund_pending",
    merchant_reject: "merchant_rejected"
  }),
  merchant_rejected: Object.freeze({ open_complaint: "disputed" }),
  disputed: Object.freeze({
    resolve_dispute_refund: "refund_pending",
    resolve_dispute_reject: "dispute_rejected"
  }),
  refund_pending: Object.freeze({ submit_refund_evidence: "customer_confirmation_pending" }),
  customer_confirmation_pending: Object.freeze({ confirm_customer_receipt: "refunded" })
});

export const transitionOrderRefundCase = (
  status: OrderRefundCaseStatus,
  action: OrderRefundCaseAction
): OrderRefundCaseTransition => {
  const next = TRANSITIONS[status]?.[action];
  return next ? { ok: true, status: next } : { ok: false, reason: "invalid_transition" };
};
