import {
  transitionOrderRefundCase,
  type OrderRefundCaseAction,
  type OrderRefundCaseStatus
} from "../src/services/order-refund-case-state-machine";

const statuses: OrderRefundCaseStatus[] = [
  "merchant_review_pending",
  "refund_pending",
  "customer_confirmation_pending",
  "merchant_rejected",
  "disputed",
  "refunded",
  "dispute_rejected"
];

const actions: OrderRefundCaseAction[] = [
  "merchant_approve",
  "merchant_reject",
  "open_complaint",
  "resolve_dispute_refund",
  "resolve_dispute_reject",
  "submit_refund_evidence",
  "confirm_customer_receipt"
];

const allowed = [
  ["merchant_review_pending", "merchant_approve", "refund_pending"],
  ["merchant_review_pending", "merchant_reject", "merchant_rejected"],
  ["merchant_rejected", "open_complaint", "disputed"],
  ["disputed", "resolve_dispute_refund", "refund_pending"],
  ["disputed", "resolve_dispute_reject", "dispute_rejected"],
  ["refund_pending", "submit_refund_evidence", "customer_confirmation_pending"],
  ["customer_confirmation_pending", "confirm_customer_receipt", "refunded"]
] as const;

describe("completed-order refund case state machine", () => {
  it.each(allowed)("transitions %s with %s to %s", (status, action, next) => {
    expect(transitionOrderRefundCase(status, action)).toEqual({ ok: true, status: next });
  });

  it.each(
    statuses.flatMap((status) =>
      actions
        .filter(
          (action) => !allowed.some(([from, candidate]) => from === status && candidate === action)
        )
        .map((action) => [status, action] as const)
    )
  )("rejects invalid transition %s with %s", (status, action) => {
    expect(transitionOrderRefundCase(status, action)).toEqual({
      ok: false,
      reason: "invalid_transition"
    });
  });
});
