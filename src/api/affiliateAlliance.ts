import { httpClient } from "./httpClient";

export type AffiliateAllianceStatus = "active" | "suspended" | "closed";
export type AffiliateAllianceMemberRole = "owner" | "partner" | "subordinate";

export type AffiliateAlliancePermissions = {
  canClaimTasks: boolean;
  canViewAllianceOverview: boolean;
  canViewMemberDetails: boolean;
  canManageOwnSubordinates: boolean;
  canViewAllianceWallet: boolean;
};

export type AffiliateAlliance = {
  allianceId: number;
  name: string;
  description: string | null;
  status: AffiliateAllianceStatus;
  version: number;
  defaultPromoterShareBps: number;
  owner: {
    needoId: string;
    displayName: string;
    avatarUrl: string | null;
  };
  membership: {
    memberId: number;
    role: AffiliateAllianceMemberRole;
    managerNeedoId: string | null;
    promoterShareBpsOverride: number | null;
    permissions: AffiliateAlliancePermissions;
  };
  wallet: {
    currency: "NDP";
    availableBalance: number;
    frozenBalance: number;
  };
  createdAt: string;
  updatedAt: string;
};

export type AffiliateAllianceMineResponse = {
  alliance: AffiliateAlliance | null;
};

export type AffiliateAllianceCreatedResponse = {
  alliance: AffiliateAlliance;
};

export type AffiliateAllianceCreateInput = {
  name: string;
  description?: string | null;
  defaultPromoterShareBps: number;
};

export const affiliateAllianceApi = {
  getMine() {
    return httpClient.request<AffiliateAllianceMineResponse>("/affiliate/alliances/me");
  },
  create(body: AffiliateAllianceCreateInput) {
    return httpClient.request<AffiliateAllianceCreatedResponse>("/affiliate/alliances", {
      method: "POST",
      body
    });
  }
};
