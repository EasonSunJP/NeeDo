import { httpClient } from "./httpClient";

export type AffiliateDiscountType = "none" | "fixed_jpy" | "rate";
export type AffiliateTaskStatus = "scheduled" | "active";
export type AffiliateClaimStatus = "active" | "expired" | "revoked";
export type AffiliateContentLocale = "zh-CN" | "zh-TW" | "en" | "ja" | "ko";

export interface AffiliateTaskTranslation {
  name: string;
  description: string | null;
}

export interface AffiliateMarketplaceMediaAsset {
  url: string;
  altText: string | null;
  sortOrder: number;
}

export interface AffiliateMarketplaceShop {
  id: number;
  shopId: number;
  shopNameSnapshot: string;
  publicId: string | null;
  city: string;
  address: string;
  mediaAssets: AffiliateMarketplaceMediaAsset[];
}

export interface AffiliateMarketplaceService {
  id: number;
  shopId: number;
  serviceId: number;
  serviceNameSnapshot: string;
  servicePriceJpySnapshot: number;
}

export interface AffiliateMarketplaceTask {
  id: number;
  taskCode: string;
  translations: Record<AffiliateContentLocale, AffiliateTaskTranslation>;
  name: string;
  description: string | null;
  coverMediaAssetId: number | null;
  coverImageUrl: string | null;
  rewardNdpPerCompletedOrder: number;
  totalBudgetNdp: number;
  remainingBudgetNdp: number;
  remainingBudgetBps: number;
  customerDiscountType: AffiliateDiscountType;
  fixedDiscountJpy: number;
  discountRateBps: number;
  discountCapJpy: number;
  minimumOrderAmountJpy: number;
  claimStartsAt: string;
  claimEndsAt: string;
  taskStartsAt: string;
  taskEndsAt: string;
  attributionWindowDays: number;
  maxCompletedOrdersPerClaim: number | null;
  maxCompletedOrdersPerCustomer: number | null;
  status: AffiliateTaskStatus;
  claimable: boolean;
  shops: AffiliateMarketplaceShop[];
  services: AffiliateMarketplaceService[];
  createdAt: string;
  updatedAt: string;
}

export interface AffiliateMarketplaceTaskPage {
  list: AffiliateMarketplaceTask[];
  total: number;
  page: number;
  page_size: number;
}

export interface AffiliateClaim {
  id: number;
  taskId: number;
  publicCode: string;
  promotionUrl: string;
  status: AffiliateClaimStatus;
  claimedAt: string;
  expiresAt: string;
  clickCount: number;
  codeUseCount: number;
  attributedOrderCount: number;
  completedOrderCount: number;
  settledRewardNdp: number;
  task: AffiliateMarketplaceTask;
}

export interface AffiliateClaimPage {
  list: AffiliateClaim[];
  total: number;
  page: number;
  page_size: number;
}

interface AbortableOptions {
  signal?: AbortSignal;
}

export interface AffiliateTaskListQuery extends AbortableOptions {
  keyword?: string;
  shopId?: number;
  customerDiscountType?: AffiliateDiscountType;
  page?: number;
  pageSize?: number;
}

export interface AffiliateClaimListQuery extends AbortableOptions {
  status?: AffiliateClaimStatus;
  page?: number;
  pageSize?: number;
}

type QueryValue = string | number | boolean | null | undefined;

function requestQuery(options: object): Record<string, QueryValue> {
  return Object.fromEntries(
    Object.entries(options).filter(([, value]) => value !== undefined)
  ) as Record<string, QueryValue>;
}

export const affiliateMarketplaceApi = {
  listTasks(options: AffiliateTaskListQuery = {}) {
    const { signal, ...query } = options;
    const requestOptions = {
      query: requestQuery(query),
      ...(signal ? { signal } : {})
    };
    return httpClient.request<AffiliateMarketplaceTaskPage>(
      "/affiliate/tasks",
      requestOptions
    );
  },

  getTask(taskId: number, options: AbortableOptions = {}) {
    return httpClient.request<AffiliateMarketplaceTask>(`/affiliate/tasks/${taskId}`, {
      ...(options.signal ? { signal: options.signal } : {})
    });
  },

  claimTask(taskId: number, options: AbortableOptions = {}) {
    return httpClient.request<AffiliateClaim>(`/affiliate/tasks/${taskId}/claims`, {
      method: "POST",
      body: {},
      ...(options.signal ? { signal: options.signal } : {})
    });
  },

  listMyClaims(options: AffiliateClaimListQuery = {}) {
    const { signal, ...query } = options;
    const requestOptions = {
      query: requestQuery(query),
      ...(signal ? { signal } : {})
    };
    return httpClient.request<AffiliateClaimPage>("/affiliate/claims", requestOptions);
  }
};
