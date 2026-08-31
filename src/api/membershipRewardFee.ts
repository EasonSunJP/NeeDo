import { httpClient } from "./httpClient";

export type MembershipRewardFeeVersion = {
  publicId: string;
  version: number;
  feeRateBps: number;
  effectiveFrom: string;
  effectiveTo: string | null;
  reason: string;
  createdByNeedoId: string | null;
  createdAt: string;
};

export type MembershipRewardFeeOverview = {
  summary: {
    evaluatedAt: string;
    current: MembershipRewardFeeVersion | null;
    nextScheduled: MembershipRewardFeeVersion | null;
    latestVersion: number;
  };
  history: {
    list: MembershipRewardFeeVersion[];
    total: number;
    page: number;
    page_size: number;
  };
};

export type MembershipRewardFeeVersionCreateInput = {
  feeRateBps: number;
  expectedVersion: number;
  effectiveFrom: string;
  reason: string;
};

export const membershipRewardFeeApi = {
  getOverview(query: { page?: number; pageSize?: number } = {}) {
    return httpClient.request<MembershipRewardFeeOverview>("/backoffice/membership-reward-fee-policy", {
      query: { page: query.page ?? 1, pageSize: query.pageSize ?? 20 }
    });
  },
  createVersion(body: MembershipRewardFeeVersionCreateInput) {
    return httpClient.request<MembershipRewardFeeVersion>("/backoffice/membership-reward-fee-policy/versions", { method: "POST", body });
  }
};
