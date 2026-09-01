import { httpClient } from "../../api/httpClient";
import "./i18n";

export type ShopMembershipStatus = "active" | "ended";
export type ShopMembershipCardType = "stored_value" | "count" | "benefit";
export type ShopMembershipCardStatus = "active" | "frozen" | "expired" | "void";
export type ShopMembershipCardIssuanceSource = "offline_paid" | "historical_replacement" | "manual_grant";
export type ShopMembershipCardTopUpPaymentMethod = "cash" | "card" | "paypay" | "bank_transfer" | "other";
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
  pendingAdjustment: {
    publicId: string;
    status: "pending";
    beforeValue: number;
    targetValue: number;
    expiresAt: string;
  } | null;
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

export type ShopMembershipCardAdjustmentStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "cancelled"
  | "expired"
  | "invalidated";

export type ShopMembershipCardAdjustment = {
  publicId: string;
  status: ShopMembershipCardAdjustmentStatus;
  reason: string;
  dimension: "principal_balance" | "remaining_uses";
  beforeValue: number;
  targetValue: number;
  difference: number;
  expiresAt: string;
  remainingSeconds: number;
  decidedAt: string | null;
  cancelledAt: string | null;
  invalidatedAt: string | null;
  createdAt: string;
  updatedAt: string;
  card: Pick<
    ShopMembershipCard,
    | "publicId"
    | "cardNoMasked"
    | "name"
    | "type"
    | "status"
    | "principalBalanceJpy"
    | "bonusBalanceJpy"
    | "remainingUses"
    | "totalUses"
  >;
  shop: { shopNo: string | null; name: string };
  customer: { needoId: string; displayName: string };
  replayed: boolean;
};

export type ShopMembershipCardAdjustmentRequest = {
  targetPrincipalBalanceJpy: number | null;
  targetRemainingUses: number | null;
  reason: string;
  idempotencyKey: string;
};

export type ShopMembershipCardAdjustmentQuery = {
  page?: number;
  pageSize?: number;
  status?: ShopMembershipCardAdjustmentStatus;
  cardPublicId?: string;
};

export type ShopMembershipCardTopUpRequest = {
  amountJpy: number;
  paymentMethod: ShopMembershipCardTopUpPaymentMethod;
  paymentReference: string | null;
  note: string | null;
  idempotencyKey: string;
};

export type ShopMembershipCardTopUp = {
  publicId: string;
  amountJpy: number;
  paymentMethod: ShopMembershipCardTopUpPaymentMethod;
  paymentReference: string | null;
  note: string | null;
  principalBalanceBeforeJpy: number;
  principalBalanceAfterJpy: number;
  createdAt: string;
  updatedAt: string;
  card: Pick<
    ShopMembershipCard,
    "publicId" | "cardNoMasked" | "name" | "type" | "status" | "principalBalanceJpy" | "bonusBalanceJpy"
  >;
  shop: { shopNo: string | null; name: string };
  customer: { needoId: string; displayName: string };
  createdBy: { needoId: string; displayName: string };
  replayed: boolean;
};

export type ShopMembershipCardTopUpQuery = {
  page?: number;
  pageSize?: number;
  cardPublicId?: string;
};

export type ShopMembershipCardRedemptionReward = {
  hits: Array<{ ruleIndex: number; kind: MembershipRewardRuleKind; basis: Record<string, string | number | boolean | null>; rewardNdp: number }>;
  rawCustomerRewardNdp: number;
  customerRewardNdp: number;
  platformFeeRateBps: number;
  platformFeeNdp: number;
  totalShopDebitNdp: number;
  capped: boolean;
};

export type ShopMembershipCardRedemptionCandidate = {
  orderNo: string;
  serviceName: string;
  servicePublicId: string | null;
  serviceCategoryCode: string | null;
  serviceStartedAt: string;
  serviceCompletedAt: string;
  eligibleAmountJpy: number;
  consumption: {
    principalJpy: number;
    uses: number;
    principalBalanceBeforeJpy: number | null;
    principalBalanceAfterJpy: number | null;
    remainingUsesBefore: number | null;
    remainingUsesAfter: number | null;
  };
  reward: ShopMembershipCardRedemptionReward;
};

export type ShopMembershipCardRefundSummary = {
  publicId: string;
  reason: string;
  reversalMode: "none" | "cancelled_pending" | "ledger_reversed";
  restoredPrincipalJpy: number;
  restoredUses: number;
  customerRewardReversedNdp: number;
  platformFeeReversedNdp: number;
  totalShopCreditNdp: number;
  customerBalanceBeforeNdp: number | null;
  customerBalanceAfterNdp: number | null;
  refundedAt: string;
  refundedBy: { needoId: string; displayName: string };
  reversalLedgerTransactionNo: string | null;
};

export type ShopMembershipCardRefund = ShopMembershipCardRefundSummary & {
  status: "applied";
  principalBalanceBeforeJpy: number | null;
  principalBalanceAfterJpy: number | null;
  remainingUsesBefore: number | null;
  remainingUsesAfter: number | null;
  orderPaymentRefundedAt: string;
  createdAt: string;
  updatedAt: string;
  redemption: { publicId: string; rewardStatusBefore: "none" | "pending_funds" | "paid" };
  card: Pick<ShopMembershipCard, "publicId" | "cardNoMasked" | "name" | "type" | "status" | "principalBalanceJpy" | "bonusBalanceJpy" | "remainingUses">;
  order: { orderNo: string; serviceName: string };
  shop: { shopNo: string | null; name: string };
  customer: { needoId: string; displayName: string };
  replayed: boolean;
};

export type ShopMembershipCardRedemption = {
  publicId: string;
  status: "applied" | "refunded";
  rewardStatus: "none" | "pending_funds" | "paid" | "reversed";
  rewardFacts: Record<string, unknown>;
  rewardHits: ShopMembershipCardRedemptionReward["hits"];
  rawRewardNdp: number;
  customerRewardNdp: number;
  platformFeeRateBps: number;
  platformFeeNdp: number;
  totalShopDebitNdp: number;
  rewardCapped: boolean;
  outstandingRewardNdp: number;
  consumedPrincipalJpy: number;
  consumedUses: number;
  principalBalanceBeforeJpy: number | null;
  principalBalanceAfterJpy: number | null;
  remainingUsesBefore: number | null;
  remainingUsesAfter: number | null;
  redeemedAt: string;
  rewardSettledAt: string | null;
  refundedAt: string | null;
  createdAt: string;
  updatedAt: string;
  card: Pick<ShopMembershipCard, "publicId" | "cardNoMasked" | "name" | "type" | "status" | "principalBalanceJpy" | "bonusBalanceJpy" | "remainingUses">;
  order: {
    orderNo: string;
    serviceName: string;
    servicePublicId: string | null;
    serviceCategoryCode: string | null;
    serviceStartedAt: string;
    serviceCompletedAt: string;
    eligibleAmountJpy: number;
    paymentStatus: "pending" | "confirmed" | "refundPending" | "refunded";
    paymentRefundedAt: string | null;
  };
  shop: { shopNo: string | null; name: string };
  customer: { needoId: string; displayName: string };
  redeemedBy: { needoId: string; displayName: string };
  ledgerTransactionNo: string | null;
  refund: ShopMembershipCardRefundSummary | null;
  replayed: boolean;
};

export type ShopMembershipCardRedemptionQuery = {
  page?: number;
  pageSize?: number;
  cardPublicId?: string;
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
  requestCardAdjustment(cardPublicId: string, body: ShopMembershipCardAdjustmentRequest) {
    return httpClient.request<ShopMembershipCardAdjustment>(`${publicPath("/merchant-admin/shop-membership-cards", cardPublicId)}/adjustment-requests`, {
      method: "POST",
      body
    });
  },
  adjustmentRequests(query: ShopMembershipCardAdjustmentQuery = {}) {
    return httpClient.request<PaginatedShopMemberships<ShopMembershipCardAdjustment>>("/merchant-admin/shop-membership-card-adjustment-requests", {
      query: { page: query.page ?? 1, pageSize: query.pageSize ?? 20, status: query.status, cardPublicId: query.cardPublicId }
    });
  },
  cancelCardAdjustment(requestPublicId: string) {
    return httpClient.request<ShopMembershipCardAdjustment>(`${publicPath("/merchant-admin/shop-membership-card-adjustment-requests", requestPublicId)}/cancel`, {
      method: "POST",
      body: {}
    });
  },
  topUpCard(cardPublicId: string, body: ShopMembershipCardTopUpRequest) {
    return httpClient.request<ShopMembershipCardTopUp>(`${publicPath("/merchant-admin/shop-membership-cards", cardPublicId)}/top-ups`, {
      method: "POST",
      body
    });
  },
  topUps(query: ShopMembershipCardTopUpQuery = {}) {
    return httpClient.request<PaginatedShopMemberships<ShopMembershipCardTopUp>>("/merchant-admin/shop-membership-card-top-ups", {
      query: { page: query.page ?? 1, pageSize: query.pageSize ?? 20, cardPublicId: query.cardPublicId }
    });
  },
  redemptionCandidates(cardPublicId: string, query: Pick<ShopMembershipCardRedemptionQuery, "page" | "pageSize"> = {}) {
    return httpClient.request<PaginatedShopMemberships<ShopMembershipCardRedemptionCandidate>>(`${publicPath("/merchant-admin/shop-membership-cards", cardPublicId)}/redemption-candidates`, {
      query: { page: query.page ?? 1, pageSize: query.pageSize ?? 20 }
    });
  },
  redeemCard(cardPublicId: string, body: { orderNo: string; idempotencyKey: string }) {
    return httpClient.request<ShopMembershipCardRedemption>(`${publicPath("/merchant-admin/shop-membership-cards", cardPublicId)}/redemptions`, {
      method: "POST",
      body
    });
  },
  redemptions(query: ShopMembershipCardRedemptionQuery = {}) {
    return httpClient.request<PaginatedShopMemberships<ShopMembershipCardRedemption>>("/merchant-admin/shop-membership-card-redemptions", {
      query: { page: query.page ?? 1, pageSize: query.pageSize ?? 20, cardPublicId: query.cardPublicId }
    });
  },
  refundRedemption(redemptionPublicId: string, body: { reason: string; idempotencyKey: string }) {
    return httpClient.request<ShopMembershipCardRefund>(`${publicPath("/merchant-admin/shop-membership-card-redemptions", redemptionPublicId)}/refunds`, {
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
  },
  adjustmentRequests(query: ShopMembershipCardAdjustmentQuery = {}) {
    return httpClient.request<PaginatedShopMemberships<ShopMembershipCardAdjustment>>("/customer-profile/me/shop-membership-card-adjustment-requests", {
      query: { page: query.page ?? 1, pageSize: query.pageSize ?? 20, status: query.status, cardPublicId: query.cardPublicId }
    });
  },
  decideCardAdjustment(requestPublicId: string, body: { decision: "approve" | "reject"; idempotencyKey: string }) {
    return httpClient.request<ShopMembershipCardAdjustment>(`${publicPath("/customer-profile/me/shop-membership-card-adjustment-requests", requestPublicId)}/decision`, {
      method: "POST",
      body
    });
  },
  topUps(query: ShopMembershipCardTopUpQuery = {}) {
    return httpClient.request<PaginatedShopMemberships<ShopMembershipCardTopUp>>("/customer-profile/me/shop-membership-card-top-ups", {
      query: { page: query.page ?? 1, pageSize: query.pageSize ?? 20, cardPublicId: query.cardPublicId }
    });
  },
  redemptions(query: ShopMembershipCardRedemptionQuery = {}) {
    return httpClient.request<PaginatedShopMemberships<ShopMembershipCardRedemption>>("/customer-profile/me/shop-membership-card-redemptions", {
      query: { page: query.page ?? 1, pageSize: query.pageSize ?? 20, cardPublicId: query.cardPublicId }
    });
  }
};
