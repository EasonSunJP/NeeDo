import { httpClient } from "./httpClient";

export type OrderRefundCaseStatus =
  | "merchant_review_pending"
  | "refund_pending"
  | "customer_confirmation_pending"
  | "merchant_rejected"
  | "disputed"
  | "refunded"
  | "dispute_rejected";

export interface OrderRefundCasePayload {
  publicId: string;
  orderNo: string;
  shop: { shopNo: string | null; name: string };
  customer: { needoId: string; displayName: string };
  status: OrderRefundCaseStatus;
  responsibility: "shop";
  refundAmountJpy: number;
  currency: string;
  version: number;
  requestReason: string;
  merchantDecisionNote: string | null;
  refundReference: string | null;
  requestedAt: string;
  merchantDecisionAt: string | null;
  refundSubmittedAt: string | null;
  customerConfirmedAt: string | null;
  dispute: null | {
    publicId: string;
    status: "open" | "resolved";
    resolution: "refund" | "reject" | null;
    version: number;
    reason: string;
    openedAt: string;
    resolvedAt: string | null;
    publicResolutionReason: string | null;
  };
  affiliateReward: null | { status: "settled"; rewardNdp: number };
  createdAt: string;
  updatedAt: string;
}

export interface RefundDisputeListPayload {
  list: OrderRefundCasePayload[];
  total: number;
  page: number;
  page_size: number;
}

export interface RefundDisputeListQuery {
  page: number;
  pageSize: number;
  search?: string;
  status?: "open" | "resolved";
}

export interface ResolveRefundDisputeInput {
  expectedVersion: number;
  idempotencyKey: string;
  resolution: "refund" | "reject";
  publicReason: string;
  internalNote?: string;
}

export const orderRefundCasesApi = {
  listDisputes(query: RefundDisputeListQuery) {
    return httpClient.request<RefundDisputeListPayload>("/backoffice/refund-disputes", {
      query: {
        page: query.page,
        page_size: query.pageSize,
        search: query.search,
        status: query.status
      }
    });
  },
  resolveDispute(disputePublicId: string, body: ResolveRefundDisputeInput) {
    return httpClient.request<OrderRefundCasePayload>(
      `/backoffice/refund-disputes/${disputePublicId}/resolve`,
      { body, method: "POST" }
    );
  }
};
