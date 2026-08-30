import { httpClient } from "../../api/httpClient";

export type ShopMembershipStatus = "active" | "ended";
export type ShopMembershipCardType = "stored_value" | "count" | "benefit";
export type ShopMembershipCardStatus = "active" | "frozen" | "expired" | "void";
export type ShopMembershipAnalyticsPeriod = "last7days" | "last30days" | "last90days";

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
  activities(query: MembershipActivityQuery = {}) {
    return httpClient.request<PaginatedShopMemberships<ShopMembershipActivity>>("/merchant-admin/shop-membership-activities", {
      query: { page: query.page ?? 1, pageSize: query.pageSize ?? 20 }
    });
  },
  analytics(period: ShopMembershipAnalyticsPeriod = "last30days") {
    return httpClient.request<ShopMembershipAnalytics>("/merchant-admin/shop-membership-analytics", { query: { period } });
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
