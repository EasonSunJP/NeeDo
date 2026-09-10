import { httpClient } from "./httpClient";

export type AffiliateContentLocale = "ja" | "en" | "ko" | "zh-TW" | "zh-CN";
export type MerchantAffiliatePublisherType = "shop" | "merchant_account";
export type MerchantAffiliateTaskStatus =
  | "draft"
  | "pending_review"
  | "scheduled"
  | "active"
  | "paused"
  | "budget_exhausted"
  | "ended"
  | "cancelled"
  | "rejected";
export type MerchantAffiliateDiscountType = "none" | "fixed_jpy" | "percent";
export type MerchantAffiliateServiceScopeMode =
  | "all_current_services"
  | "selected_services";

export interface MerchantAffiliateTaskTranslation {
  name: string;
  description: string | null;
  sourceLocale: AffiliateContentLocale;
  isInitialCopy: boolean;
}

export type MerchantAffiliateTaskTranslations = Partial<
  Record<AffiliateContentLocale, MerchantAffiliateTaskTranslation>
>;

export interface MerchantAffiliateTaskShop {
  id: number;
  shopId: number;
  shopNameSnapshot: string;
  publicId: string;
}

export interface MerchantAffiliateTaskService {
  id: number;
  shopId: number;
  serviceId: number;
  serviceNameSnapshot: string;
  servicePriceJpySnapshot: number;
}

export interface MerchantAffiliateBudgetReservation {
  id: number;
  taskId: number;
  walletId: number;
  totalFrozenNdp: number;
  commissionFrozenNdp: number;
  platformFeeFrozenNdp: number;
  allocatedNdp: number;
  capturedNdp: number;
  platformFeeCapturedNdp: number;
  releasedNdp: number;
  platformFeeReleasedNdp: number;
  status: "active" | "released" | "exhausted";
  idempotencyKey: string;
  frozenAt: string;
  releasedAt: string | null;
}

export interface MerchantAffiliateTask {
  id: number;
  taskCode: string;
  lineageKey: string;
  version: number;
  lockVersion: number;
  publisherType: MerchantAffiliatePublisherType;
  publisherMerchantAccountId: number | null;
  publisherShopId: number | null;
  publisherDisplayName: string;
  translations: MerchantAffiliateTaskTranslations;
  name: string;
  description: string | null;
  coverMediaAssetId: number | null;
  rewardNdpPerCompletedOrder: number;
  totalBudgetNdp: number;
  platformFeeRuleId: number | null;
  platformFeeBps: number;
  platformFeeReserveNdp: number;
  reservedBudgetNdp: number;
  allocatedBudgetNdp: number;
  settledBudgetNdp: number;
  settledPlatformFeeNdp: number;
  releasedBudgetNdp: number;
  releasedPlatformFeeNdp: number;
  customerDiscountType: MerchantAffiliateDiscountType;
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
  serviceScopeMode: MerchantAffiliateServiceScopeMode;
  status: MerchantAffiliateTaskStatus;
  reviewedById: number | null;
  reviewedAt: string | null;
  rejectionReason: string | null;
  submittedAt: string | null;
  activatedAt: string | null;
  createdAt: string;
  updatedAt: string;
  shops: MerchantAffiliateTaskShop[];
  services: MerchantAffiliateTaskService[];
  budgetReservation: MerchantAffiliateBudgetReservation | null;
}

export interface MerchantAffiliatePage<TItem> {
  list: TItem[];
  total: number;
  page: number;
  page_size: number;
}

export interface MerchantAffiliatePublisherOption {
  publisherType: MerchantAffiliatePublisherType;
  merchantAccountId: number | null;
  shopId: number | null;
  publicId: string | null;
  displayName: string;
  current: boolean;
  manageableShopCount: number;
}

export interface MerchantAffiliateShopOption {
  shopId: number;
  publicId: string;
  name: string;
  city: string;
  activeServiceCount: number;
}

export interface MerchantAffiliateServiceOption {
  serviceId: number;
  shopId: number;
  serviceName: string;
  priceJpy: number;
  shopName: string;
  shopPublicId: string;
}

export interface MerchantAffiliateFeePreview {
  evaluatedAt: string;
  effectiveAt: string;
  platformFeeBps: number;
  commissionBudgetNdp: number;
  platformFeeReserveNdp: number;
  grossFreezeNdp: number;
  shopRateStatus: "consistent";
}

type QueryValue = boolean | number | string | null | undefined;
type QueryRecord = Record<string, QueryValue>;

export type MerchantAffiliateTaskListQuery = QueryRecord & {
  page?: number;
  pageSize?: number;
  status?: MerchantAffiliateTaskStatus;
  publisherType?: MerchantAffiliatePublisherType;
  keyword?: string;
};

export type MerchantAffiliatePublisherQuery = QueryRecord & {
  keyword?: string;
  page?: number;
  pageSize?: number;
};

export type MerchantAffiliateShopQuery = QueryRecord & {
  publisherType: MerchantAffiliatePublisherType;
  merchantAccountId?: number;
  keyword?: string;
  page?: number;
  pageSize?: number;
};

export type MerchantAffiliateServiceQuery = MerchantAffiliateShopQuery & {
  shopIds: string;
};

export interface MerchantAffiliateEditableInput {
  name: string;
  description: string | null;
  coverMediaAssetId: number | null;
  rewardNdpPerCompletedOrder: number;
  totalBudgetNdp: number;
  customerDiscountType: MerchantAffiliateDiscountType;
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
  serviceScopeMode: MerchantAffiliateServiceScopeMode;
  selectedServiceIds: number[];
}

export type MerchantAffiliateTaskCreateInput =
  | (MerchantAffiliateEditableInput & {
      publisherType: "shop";
      sourceLocale?: AffiliateContentLocale;
    })
  | (MerchantAffiliateEditableInput & {
      publisherType: "merchant_account";
      merchantAccountId: number;
      shopIds: number[];
      sourceLocale?: AffiliateContentLocale;
    });

export type MerchantAffiliateTaskUpdateInput = MerchantAffiliateEditableInput & {
  lockVersion: number;
  shopIds?: number[];
};

export interface MerchantAffiliateTaskLocaleInput {
  lockVersion: number;
  name: string;
  description: string | null;
  syncToAll: boolean;
}

export type MerchantAffiliateFeePreviewInput =
  | {
      publisherType: "shop";
      shopIds: number[];
      totalBudgetNdp: number;
    }
  | {
      publisherType: "merchant_account";
      merchantAccountId: number;
      shopIds: number[];
      totalBudgetNdp: number;
    };

export const merchantAffiliateTasksApi = {
  listTasks(query: MerchantAffiliateTaskListQuery = {}) {
    return httpClient.request<MerchantAffiliatePage<MerchantAffiliateTask>>(
      "/merchant-admin/affiliate/tasks",
      { query }
    );
  },
  getTask(taskId: number) {
    return httpClient.request<MerchantAffiliateTask>(
      `/merchant-admin/affiliate/tasks/${taskId}`
    );
  },
  createDraft(body: MerchantAffiliateTaskCreateInput) {
    return httpClient.request<MerchantAffiliateTask>("/merchant-admin/affiliate/tasks", {
      method: "POST",
      body
    });
  },
  updateDraft(taskId: number, body: MerchantAffiliateTaskUpdateInput) {
    return httpClient.request<MerchantAffiliateTask>(
      `/merchant-admin/affiliate/tasks/${taskId}`,
      { method: "PATCH", body }
    );
  },
  updateLocale(taskId: number, locale: AffiliateContentLocale, body: MerchantAffiliateTaskLocaleInput) {
    return httpClient.request<MerchantAffiliateTask>(
      `/merchant-admin/affiliate/tasks/${taskId}/locales/${locale}`,
      { method: "PUT", body }
    );
  },
  submit(taskId: number) {
    return httpClient.request<MerchantAffiliateTask>(
      `/merchant-admin/affiliate/tasks/${taskId}/submit`,
      { method: "POST" }
    );
  },
  listPublishers(query: MerchantAffiliatePublisherQuery = {}) {
    return httpClient.request<MerchantAffiliatePage<MerchantAffiliatePublisherOption>>(
      "/merchant-admin/affiliate/publishers",
      { query }
    );
  },
  listShops(query: MerchantAffiliateShopQuery) {
    return httpClient.request<MerchantAffiliatePage<MerchantAffiliateShopOption>>(
      "/merchant-admin/affiliate/shops",
      { query }
    );
  },
  listServices(query: MerchantAffiliateServiceQuery) {
    return httpClient.request<MerchantAffiliatePage<MerchantAffiliateServiceOption>>(
      "/merchant-admin/affiliate/services",
      { query }
    );
  },
  previewFee(body: MerchantAffiliateFeePreviewInput) {
    return httpClient.request<MerchantAffiliateFeePreview>(
      "/merchant-admin/affiliate/tasks/fee-preview",
      { method: "POST", body }
    );
  }
};
