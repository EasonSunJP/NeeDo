import { httpClient } from "../../api/httpClient";
import "./i18n";

export type ShopMembershipStatus = "active" | "ended";
export type ShopMembershipCardType = "stored_value" | "count" | "benefit";
export type ShopMembershipCardStatus = "active" | "frozen" | "expired" | "void";
export type ShopMembershipCardIssuanceSource = "offline_paid" | "historical_replacement" | "manual_grant";
export type ShopMembershipAnalyticsPeriod = "last7days" | "last30days" | "last90days";
export type ShopMembershipCardPlanStatus = "draft" | "active" | "retired";
export type ShopMembershipCardPlanVersionStatus = "draft" | "published" | "retired";
export type MembershipRewardRuleKind =
  | "fixed_per_completion"
  | "percent_of_eligible_amount"
  | "spend_block"
  | "first_card_use_bonus"
  | "service_scope_bonus"
  | "completion_milestone_bonus"
  | "spend_milestone_bonus"
  | "birthday_month_bonus"
  | "schedule_window_bonus"
  | "consecutive_month_bonus";

export type MembershipRewardScope = {
  servicePublicIds: string[];
  categoryCodes: string[];
  excludedServicePublicIds: string[];
  excludedCategoryCodes: string[];
  activeFrom: string | null;
  activeTo: string | null;
};

type RewardScopeField = { scope: MembershipRewardScope };
export type MembershipRewardRule =
  | ({ kind: "fixed_per_completion"; rewardNdp: number } & RewardScopeField)
  | ({ kind: "percent_of_eligible_amount"; rewardRateBps: number } & RewardScopeField)
  | ({ kind: "spend_block"; blockAmountJpy: number; rewardNdpPerBlock: number } & RewardScopeField)
  | ({ kind: "first_card_use_bonus"; rewardNdp: number } & RewardScopeField)
  | ({ kind: "service_scope_bonus"; rewardNdp?: number | null; rewardRateBps?: number | null } & RewardScopeField)
  | ({ kind: "completion_milestone_bonus"; everyCompletions: number; rewardNdp: number; repeat: boolean } & RewardScopeField)
  | ({ kind: "spend_milestone_bonus"; thresholdJpy: number; rewardNdp: number; repeat: boolean } & RewardScopeField)
  | ({ kind: "birthday_month_bonus"; rewardNdp: number; annualLimit: number } & RewardScopeField)
  | ({ kind: "schedule_window_bonus"; rewardNdp: number; timezone: "Asia/Tokyo"; daysOfWeek: number[]; startTime: string; endTime: string } & RewardScopeField)
  | ({ kind: "consecutive_month_bonus"; consecutiveMonths: number; rewardNdp: number } & RewardScopeField);

export type MembershipRewardCaps = {
  perOrderNdp: number | null;
  perDayNdp: number | null;
  perMonthNdp: number | null;
  lifetimeNdp: number | null;
};

export type ShopMembershipCardPlanDraft = {
  expectedLockVersion: number;
  name: string;
  description: string | null;
  cardType: ShopMembershipCardType;
  validity: { mode: "never" } | { mode: "fixed_days"; days: number } | { mode: "fixed_date"; expiresAt: string };
  issuance: {
    minInitialPrincipalJpy: number | null;
    maxInitialPrincipalJpy: number | null;
    minInitialUses: number | null;
    maxInitialUses: number | null;
  };
  caps: MembershipRewardCaps;
  rules: MembershipRewardRule[];
};

export type ShopMembershipCardPlanRule = MembershipRewardRule & {
  publicId: string;
  ruleGroup: "base" | "bonus";
  sortOrder: number;
};

export type ShopMembershipCardPlanVersion = Omit<ShopMembershipCardPlanDraft, "expectedLockVersion" | "rules"> & {
  publicId: string;
  version: number;
  status: ShopMembershipCardPlanVersionStatus;
  lockVersion: number;
  platformFeePolicyPublicId: string | null;
  platformFeeRateBps: number | null;
  publishedAt: string | null;
  rules: ShopMembershipCardPlanRule[];
};

export type ShopMembershipCardPlan = {
  publicId: string;
  status: ShopMembershipCardPlanStatus;
  currentVersion: ShopMembershipCardPlanVersion | null;
  draftVersion: ShopMembershipCardPlanVersion | null;
  createdAt: string;
  updatedAt: string;
};

export type MembershipRewardPreviewScenario = {
  eligibleAmountJpy: number;
  servicePublicId: string;
  categoryCode: string;
  scheduledAt: string;
  completedCountBefore: number;
  lifetimeEligibleSpendJpyBefore: number;
  isFirstCardUse: boolean;
  customerBirthMonth: number | null;
  birthdayRewardsThisYear: number;
  consecutiveEligibleMonths: number;
  rewardedConsecutiveMonthMilestones: number[];
  alreadyRewardedTodayNdp: number;
  alreadyRewardedMonthNdp: number;
  alreadyRewardedLifetimeNdp: number;
};

export type MembershipRewardPreview = {
  hits: Array<{ ruleIndex: number; kind: MembershipRewardRuleKind; basis: Record<string, string | number | boolean | null>; rewardNdp: number }>;
  rawCustomerRewardNdp: number;
  customerRewardNdp: number;
  platformFeeRateBps: number;
  platformFeeNdp: number;
  totalShopDebitNdp: number;
  capped: boolean;
};

export type PaginatedShopMemberships<TItem> = {
  list: TItem[];
  total: number;
  page: number;
  page_size: number;
};

export type ShopMembershipStore = {
  id: number;
  shopNo: string | null;
  name: string;
  city: string;
  address: string;
};

export type ShopMembershipCard = {
  publicId: string;
  cardNoMasked: string;
  name: string;
  type: ShopMembershipCardType;
  status: ShopMembershipCardStatus;
  principalBalanceJpy: number | null;
  bonusBalanceJpy: number | null;
  remainingUses: number | null;
  totalUses: number | null;
  initialPrincipalJpy: number | null;
  initialUses: number | null;
  issuanceSource: ShopMembershipCardIssuanceSource | null;
  platformFeeRateBpsSnapshot: number | null;
  planPublicId: string | null;
  planVersionPublicId: string | null;
  planVersion: number | null;
  issuedAt: string;
  expiresAt: string | null;
  frozenAt: string | null;
};

export type MerchantShopMembershipListItem = {
  publicId: string;
  customerNeedoId: string;
  displayName: string;
  avatarUrl: string | null;
  city: string | null;
  status: ShopMembershipStatus;
  source: "merchant_manual";
  startedAt: string;
  endedAt: string | null;
  cardCount: number;
  activeCardCount: number;
  lastActivityAt: string;
};

export type MerchantShopMembershipDetail = MerchantShopMembershipListItem & {
  shop: ShopMembershipStore;
  cards: ShopMembershipCard[];
};

export type ShopMembershipOverview = {
  shop: ShopMembershipStore;
  activeMemberCount: number;
  todayNewMemberCount: number;
  activeCardCount: number;
  expiringSoonCardCount: number;
  recentActivities: ShopMembershipActivity[];
};

export type ShopMembershipCandidate = {
  customerNeedoId: string;
  displayName: string;
  avatarUrl: string | null;
  city: string | null;
  lastOrderAt: string;
};

export type MerchantShopMembershipCard = ShopMembershipCard & {
  membershipPublicId: string;
  customerNeedoId: string;
  customerDisplayName: string;
};

export type ShopMembershipCardIssuanceRequest = {
  planPublicId: string;
  initialPrincipalJpy: number | null;
  initialUses: number | null;
  issuanceSource: ShopMembershipCardIssuanceSource;
  issuanceReference: string | null;
  issuanceNote: string | null;
  idempotencyKey: string;
};

export type ShopMembershipCardIssuanceResult = ShopMembershipCard & {
  customerNeedoId: string;
  customerDisplayName: string;
  initialPrincipalJpy: number | null;
  initialUses: number | null;
  issuanceSource: ShopMembershipCardIssuanceSource;
  issuanceReference: string | null;
  issuanceNote: string | null;
  platformFeeRateBpsSnapshot: number;
  planPublicId: string;
  planVersionPublicId: string;
  planVersion: number;
  replayed: boolean;
};

export type ShopMembershipActivity = {
  id: string;
  action: "membership_created";
  membershipPublicId: string;
  customerNeedoId: string;
  customerDisplayName: string;
  actorName: string;
  occurredAt: string;
};

export type ShopMembershipAnalytics = {
  period: ShopMembershipAnalyticsPeriod;
  from: string;
  to: string;
  activeMemberCount: number;
  newMemberCount: number;
  cardStatusCounts: Record<ShopMembershipCardStatus, number>;
  dailyNewMembers: Array<{ date: string; count: number }>;
};

export type CustomerShopMembershipListItem = {
  publicId: string;
  status: ShopMembershipStatus;
  startedAt: string;
  endedAt: string | null;
  cardCount: number;
  activeCardCount: number;
  expiringSoonCardCount: number;
  updatedAt: string;
  shop: ShopMembershipStore;
};

export type CustomerShopMembershipDetail = CustomerShopMembershipListItem & {
  cards: ShopMembershipCard[];
};

export type MembershipListQuery = {
  page?: number;
  pageSize?: number;
  keyword?: string;
  status?: ShopMembershipStatus;
};

export type MembershipCandidateQuery = Omit<MembershipListQuery, "status">;
export type MembershipCardQuery = {
  page?: number;
  pageSize?: number;
  status?: ShopMembershipCardStatus;
  type?: ShopMembershipCardType;
};
export type MembershipActivityQuery = Pick<MembershipListQuery, "page" | "pageSize">;

const publicPath = (base: string, publicId: string) => `${base}/${encodeURIComponent(publicId.trim())}`;

export const merchantShopMembershipApi = {
  overview() {
    return httpClient.request<ShopMembershipOverview>("/merchant-admin/shop-memberships/overview");
  },
  list(query: MembershipListQuery = {}) {
    return httpClient.request<PaginatedShopMemberships<MerchantShopMembershipListItem>>("/merchant-admin/shop-memberships", {
      query: {
        keyword: query.keyword,
        page: query.page ?? 1,
        pageSize: query.pageSize ?? 20,
        status: query.status
      }
    });
  },
  detail(publicId: string) {
    return httpClient.request<MerchantShopMembershipDetail>(publicPath("/merchant-admin/shop-memberships", publicId));
  },
  candidates(query: MembershipCandidateQuery = {}) {
    return httpClient.request<PaginatedShopMemberships<ShopMembershipCandidate>>("/merchant-admin/shop-membership-candidates", {
      query: { keyword: query.keyword, page: query.page ?? 1, pageSize: query.pageSize ?? 20 }
    });
  },
  enroll(customerNeedoId: string) {
    return httpClient.request<MerchantShopMembershipDetail>("/merchant-admin/shop-memberships", {
      body: { customerNeedoId: customerNeedoId.trim().toLowerCase() },
      method: "POST"
    });
  },
  cards(query: MembershipCardQuery = {}) {
    return httpClient.request<PaginatedShopMemberships<MerchantShopMembershipCard>>("/merchant-admin/shop-membership-cards", {
      query: { page: query.page ?? 1, pageSize: query.pageSize ?? 20, status: query.status, type: query.type }
    });
  },
  issueCard(membershipPublicId: string, body: ShopMembershipCardIssuanceRequest) {
    return httpClient.request<ShopMembershipCardIssuanceResult>(`${publicPath("/merchant-admin/shop-memberships", membershipPublicId)}/cards`, {
      method: "POST",
      body
    });
  },
  activities(query: MembershipActivityQuery = {}) {
    return httpClient.request<PaginatedShopMemberships<ShopMembershipActivity>>("/merchant-admin/shop-membership-activities", {
      query: { page: query.page ?? 1, pageSize: query.pageSize ?? 20 }
    });
  },
  analytics(period: ShopMembershipAnalyticsPeriod = "last30days") {
    return httpClient.request<ShopMembershipAnalytics>("/merchant-admin/shop-membership-analytics", { query: { period } });
  },
  listCardPlans(query: { page?: number; pageSize?: number } = {}) {
    return httpClient.request<PaginatedShopMemberships<ShopMembershipCardPlan>>("/merchant-admin/shop-membership-card-plans", {
      query: { page: query.page ?? 1, pageSize: query.pageSize ?? 20 }
    });
  },
  getCardPlan(publicId: string) {
    return httpClient.request<ShopMembershipCardPlan>(publicPath("/merchant-admin/shop-membership-card-plans", publicId));
  },
  createCardPlan(body: ShopMembershipCardPlanDraft) {
    return httpClient.request<ShopMembershipCardPlan>("/merchant-admin/shop-membership-card-plans", { method: "POST", body });
  },
  saveCardPlanDraft(publicId: string, body: ShopMembershipCardPlanDraft) {
    return httpClient.request<ShopMembershipCardPlan>(`${publicPath("/merchant-admin/shop-membership-card-plans", publicId)}/draft`, { method: "PATCH", body });
  },
  previewCardPlan(publicId: string, body: MembershipRewardPreviewScenario) {
    return httpClient.request<MembershipRewardPreview>(`${publicPath("/merchant-admin/shop-membership-card-plans", publicId)}/preview`, { method: "POST", body });
  },
  publishCardPlan(publicId: string, expectedLockVersion: number) {
    return httpClient.request<ShopMembershipCardPlan>(`${publicPath("/merchant-admin/shop-membership-card-plans", publicId)}/publish`, { method: "POST", body: { expectedLockVersion } });
  },
  retireCardPlan(publicId: string) {
    return httpClient.request<ShopMembershipCardPlan>(`${publicPath("/merchant-admin/shop-membership-card-plans", publicId)}/retire`, { method: "POST", body: {} });
  }
};

export const customerShopMembershipApi = {
  list(query: Pick<MembershipListQuery, "page" | "pageSize" | "status"> = {}) {
    return httpClient.request<PaginatedShopMemberships<CustomerShopMembershipListItem>>("/customer-profile/me/shop-memberships", {
      query: { page: query.page ?? 1, pageSize: query.pageSize ?? 20, status: query.status }
    });
  },
  detail(publicId: string) {
    return httpClient.request<CustomerShopMembershipDetail>(publicPath("/customer-profile/me/shop-memberships", publicId));
  }
};
