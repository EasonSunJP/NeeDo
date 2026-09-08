import { httpClient } from "./httpClient";

export type TravelRouteProviderStatus = {
  providerCode: "disabled" | "geoapify";
  status: "configured" | "unconfigured" | "healthy" | "rate_limited" | "unavailable";
  configured: boolean;
  checkedAt: string | null;
  routingProfile: "drive";
  estimateTtlSeconds: number;
  cacheTtlSeconds: number;
};

export type TravelFareBand = {
  ordinal: number;
  maximumDistanceMeters: number;
  fareAmountJpy: number;
};

export type TravelFarePolicyVersion = {
  publicId: string;
  version: number;
  effectiveFrom: string;
  reason: string;
  bands: TravelFareBand[];
  publishedByUserId: number;
  createdAt: string;
};

export type ShopTravelFarePolicySummary = { current: TravelFarePolicyVersion | null; next: TravelFarePolicyVersion | null };
export type ShopTravelFarePolicyHistoryPage = {
  list: TravelFarePolicyVersion[];
  total: number;
  page: number;
  page_size: number;
};
export type PublishTravelFarePolicyInput = {
  expectedVersion: number;
  effectiveFrom: string;
  reason: string;
  bands: Array<Omit<TravelFareBand, "ordinal">>;
};
export type JapaneseRouteAddress = {
  countryCode: "JP";
  postalCode: string;
  prefecture: string;
  city: string;
  addressLine1: string;
  addressLine2?: string;
  building?: string;
};
export type RouteEstimate = {
  publicId: string;
  distanceMeters: number;
  durationSeconds: number;
  fareAmountJpy: number;
  policyVersionPublicId: string;
  policyVersion: number;
  bandMaximumDistanceMeters: number;
  expiresAt: string;
  cached: boolean;
};

export type OperationsTravelFarePolicy = {
  shopId: number;
  shopPublicId: string | null;
  shopName: string;
  city: string;
  current: TravelFarePolicyVersion | null;
  next: TravelFarePolicyVersion | null;
};

export type OperationsTravelFarePolicyPage = {
  list: OperationsTravelFarePolicy[];
  total: number;
  page: number;
  page_size: number;
};

export type TravelFarePolicyListQuery = {
  page?: number;
  pageSize?: number;
  city?: string;
  shopKeyword?: string;
};

export const travelFareApi = {
  getProviderStatus() {
    return httpClient.request<TravelRouteProviderStatus>("/backoffice/travel/providers/status");
  },
  listPolicies(query: TravelFarePolicyListQuery) {
    return httpClient.request<OperationsTravelFarePolicyPage>("/backoffice/travel/fare-policies", { query });
  },
  getMerchantPolicy() {
    return httpClient.request<ShopTravelFarePolicySummary>("/merchant-admin/travel-fare-policy");
  },
  listMerchantPolicyVersions(query: { page?: number; pageSize?: number }) {
    return httpClient.request<ShopTravelFarePolicyHistoryPage>("/merchant-admin/travel-fare-policy/versions", { query });
  },
  publishMerchantPolicy(input: PublishTravelFarePolicyInput) {
    return httpClient.request<TravelFarePolicyVersion>("/merchant-admin/travel-fare-policy/versions", { method: "POST", body: input });
  },
  createEstimate(input: { servicePublicId: string; scheduleSlotId: number; destination: JapaneseRouteAddress }) {
    return httpClient.request<RouteEstimate>("/bookings/travel-estimates", { method: "POST", body: input });
  }
};
