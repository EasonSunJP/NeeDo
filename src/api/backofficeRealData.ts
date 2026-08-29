import { httpClient } from "./httpClient";
import type { Metric, Merchant, Order, OrderStatus, Settlement, Store, Technician } from "../types/domain";
import { formatSystemId } from "../lib/systemIds";

export type BackofficeScope = "backoffice" | "merchant-admin";

export interface BackofficeOrderPayload {
  id: number;
  orderNo: string;
  status: string;
  paymentStatus: "pending" | "confirmed" | "refundPending" | "refunded";
  customerUserId: number;
  customerName: string;
  serviceId: number | null;
  serviceName: string;
  shopId: number;
  shopName: string;
  technicianProfileId: number | null;
  technicianName: string | null;
  fulfillmentMode: "home" | "store" | string;
  priceAmount: number;
  currency: string;
  startsAt: string;
  endsAt: string;
  note: string | null;
  cancelReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BackofficeScheduleSlotPayload {
  id: number;
  serviceId: number | null;
  serviceName: string;
  shopId: number;
  shopName: string;
  technicianProfileId: number | null;
  technicianName: string | null;
  startsAt: string;
  endsAt: string;
  capacity: number;
  bookedCount: number;
  status: string;
}

export interface BackofficeFinanceSettlementPayload {
  id: number;
  bookingOrderId: number;
  orderType: "booking" | "request";
  orderNo: string;
  referenceType: string;
  referenceId: number;
  status: string;
  shopId: number;
  shopName: string;
  technicianProfileId: number | null;
  technicianName: string | null;
  estimatedServiceGmvJpy: number;
  platformCollectedServiceAmountJpy: number;
  offlineReportedServiceAmountJpy: number;
  unknownOrUnreportedServiceAmountJpy: number;
  serviceIncomeStatus: string;
  paymentChannel: string;
  platformNdpRevenue: number;
  cRequestFeeHoldNdp: number;
  cRequestFeeActualNdp: number;
  requestFeeNdpRevenue: number;
  userRewardNdpCost: number;
  pendingHoldNdp: number;
  campaignDiscountNdp: number;
  releasedNdp: number;
  penaltyNdp: number;
  compensationToUserNdp: number;
  technicianEstimatedIncomeJpy: number;
  shopEstimatedGrossProfitJpy: number;
  appliedFeeRuleIds: string[];
  moneyTimeline: unknown[];
  moneyTimelineStatus: string;
  createdAt: string;
}

export interface BackofficeTechnicianPayload {
  id: number;
  userId: number;
  needoId: string;
  displayName: string;
  email: string;
  avatarUrl: string | null;
  shopId: number | null;
  shopName: string | null;
  city: string;
  serviceArea: string | null;
  employmentType: "independent" | "full_time" | "temporary";
  employmentStartedAt: string | null;
  status: string;
  verifiedAt: string | null;
  createdAt: string;
}

export type TechnicianRankingPeriod =
  | "today"
  | "last7days"
  | "last30days"
  | "month"
  | "custom"
  | "all";
export type TechnicianRankingSortBy = "revenue" | "completedOrders" | "workingDays";

export interface TechnicianRankingQuery
  extends Record<string, string | number | boolean | null | undefined> {
  period?: TechnicianRankingPeriod;
  from?: string;
  to?: string;
  sortBy?: TechnicianRankingSortBy;
  sortOrder?: "asc" | "desc";
  keyword?: string;
  shopId?: number;
  city?: string;
  page?: number;
  pageSize?: number;
}

export interface BackofficeTechnicianRankingRowPayload {
  rank: number;
  technicianProfileId: number;
  userId: number;
  displayName: string;
  email: string;
  avatarUrl: string | null;
  shopId: number | null;
  shopName: string | null;
  city: string;
  serviceArea: string | null;
  status: string;
  verifiedAt: string | null;
  completedServiceAmountJpy: number;
  completedOrderCount: number;
  workingDayCount: number;
}

export interface BackofficeTechnicianRankingPayload
  extends PaginatedApiPayload<BackofficeTechnicianRankingRowPayload> {
  summary: {
    technicianCount: number;
    completedServiceAmountJpy: number;
    completedOrderCount: number;
    workingDayCount: number;
  };
  period: {
    key: TechnicianRankingPeriod;
    timeZone: "Asia/Tokyo";
    from: string | null;
    to: string | null;
  };
}

export interface BackofficeShopPayload {
  id: number;
  ownerUserId: number | null;
  ownerEmail: string | null;
  name: string;
  description: string | null;
  city: string;
  address: string;
  phone: string | null;
  status: string;
  isRecommended: boolean;
  createdAt: string;
}

export interface BackofficeCustomerPayload {
  id: number;
  userId: number;
  displayName: string;
  email: string;
  city: string | null;
  membershipLevel: string;
  isPublic: boolean;
  bookingCount: number;
  createdAt: string;
}

export interface BackofficeRolePayload {
  name: string;
  code: string;
  scopeType: string | null;
  scopeId: number | null;
}

export interface BackofficeIdentityPayload {
  type: string;
  scopeType: string | null;
  scopeId: number | null;
  displayName: string | null;
}

export interface BackofficeAccountPayload {
  needoId: string;
  username: string;
  email: string;
  phone: string | null;
  avatarUrl: string | null;
  isActive: boolean;
  lastLoginAt: string | null;
  roles: BackofficeRolePayload[];
  identities: BackofficeIdentityPayload[];
}

export interface BackofficeReviewSummaryPayload {
  ratingAverage: number;
  reviewCount: number;
  latestReviewAt: string | null;
  highlights: string[];
}

export interface BackofficeTechnicianServiceDetailPayload {
  id: number;
  source: "technician_service" | "service";
  sourceShopServiceId: number | null;
  name: string;
  description: string | null;
  categoryId: number;
  priceAmount: number;
  currency: string;
  durationMinutes: number;
  isRecommended: boolean;
}

export interface BackofficeCompensationProfilePayload {
  id: number;
  shopId: number;
  technicianProfileId: number;
  name: string;
  status: string;
  version: number;
  wageMode: string;
  baseSalaryJpy: number;
  hourlyRateJpy: number;
  dailyRateJpy: number;
  fixedOrderPayJpy: number;
  commissionRatePercent: number;
  guaranteedMinimumJpy: number;
  ndpFeeBearer: string;
  technicianNdpSharePercent: number;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  updatedAt: string;
}

export interface BackofficeAuditEventPayload {
  id: string;
  action: string;
  actorName: string;
  actorAvatarUrl: string | null;
  createdAt: string;
  metadata: Record<string, unknown> | null;
}

export type BackofficeCustomerTimelinePayload =
  PaginatedApiPayload<BackofficeAuditEventPayload>;

export interface BackofficeTechnicianDetailPayload extends BackofficeTechnicianPayload {
  bio: string | null;
  yearsExperience: number;
  isRecommended: boolean;
  updatedAt: string;
  account: BackofficeAccountPayload;
  statistics: {
    bookingCount: number;
    completedCount: number;
    cancelledCount: number;
    completedRevenueJpy: number;
    todayScheduleMinutes: number;
    weekScheduleMinutes: number;
    monthScheduleMinutes: number;
  };
  reviewSummary: BackofficeReviewSummaryPayload | null;
  services: BackofficeTechnicianServiceDetailPayload[];
  servicesLimit: number;
  servicesTruncated: boolean;
  upcomingSchedule: BackofficeScheduleSlotPayload[];
  compensationProfile: BackofficeCompensationProfilePayload | null;
  timeline: BackofficeAuditEventPayload[];
  unavailableMetrics: Array<"acceptanceRate" | "lateness" | "shiftPreferences">;
}

export interface BackofficeCustomerDetailPayload extends BackofficeCustomerPayload {
  bio: string | null;
  updatedAt: string;
  account: BackofficeAccountPayload;
  bookingStatusTotals: Record<string, number>;
  completedSpendJpy: number;
  nextBooking: BackofficeOrderPayload | null;
  recentBookings: BackofficeOrderPayload[];
  reviewSummary: BackofficeReviewSummaryPayload | null;
  timeline: BackofficeAuditEventPayload[];
  membershipGrantMode: "self_service" | "operator_complimentary";
  membershipDurationUnit: "forever" | "day" | "month" | null;
  membershipDurationValue: number | null;
  membershipStartsAt: string | null;
  membershipExpiresAt: string | null;
  membershipGrantedBy: { needoId: string; username: string } | null;
}

export interface BackofficeServicePayload {
  id: number;
  categoryId: number;
  categoryName: string;
  shopId: number;
  technicianProfileId: number | null;
  name: string;
  description: string | null;
  city: string;
  serviceMode: "store" | "home" | string;
  priceAmount: number;
  currency: string;
  durationMinutes: number;
  status: string;
  isRecommended: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface BackofficeShopCreateInput {
  ownerEmail: string;
  ownerUsername: string;
  ownerPassword: string;
  name: string;
  description?: string | null;
  city: string;
  address: string;
  phone?: string | null;
  isRecommended?: boolean;
}

export type BackofficeShopUpdateInput = Partial<Pick<BackofficeShopCreateInput, "name" | "description" | "city" | "address" | "phone" | "isRecommended">>;
export type MerchantShopUpdateInput = Partial<Pick<BackofficeShopCreateInput, "name" | "description" | "city" | "address" | "phone">>;
export type BackofficeTechnicianUpdateInput = Partial<Pick<BackofficeTechnicianPayload, "displayName" | "city" | "serviceArea" | "employmentType" | "employmentStartedAt">> & { shopId?: number | null; isRecommended?: boolean };
export type BackofficeCustomerUpdateInput = Partial<Pick<BackofficeCustomerPayload, "displayName" | "city" | "isPublic">> & { bio?: string | null };

export interface BackofficeCustomerMembershipGrantInput {
  membershipLevel: string;
  grantMode: "operator_complimentary";
  durationUnit: "forever" | "day" | "month";
  durationValue: number | null;
  startsAt: string;
}

export interface BackofficeCustomerMembershipGrantPayload {
  membershipLevel: string;
  membershipGrantMode: "operator_complimentary";
  membershipDurationUnit: "forever" | "day" | "month";
  membershipDurationValue: number | null;
  membershipStartsAt: string;
  membershipExpiresAt: string | null;
  membershipGrantedBy: { needoId: string; username: string };
}
export type BackofficeServiceCreateInput = Pick<BackofficeServicePayload, "categoryId" | "name" | "city" | "serviceMode" | "priceAmount" | "durationMinutes"> & Partial<Pick<BackofficeServicePayload, "technicianProfileId" | "description" | "status" | "isRecommended" | "sortOrder">>;
export type BackofficeServiceUpdateInput = Partial<BackofficeServiceCreateInput>;

export interface BackofficeDashboardPayload {
  metrics: Metric[];
  orders: BackofficeOrderPayload[];
  schedule: {
    total: number;
    available: number;
    booked: number;
  };
  finance: {
    estimatedServiceGmvJpy: number;
    platformNdpRevenue: number;
    requestFeeNdpRevenue: number;
    userRewardNdpCost: number;
    pendingHoldNdp: number;
    campaignDiscountNdp: number;
    unknownOrUnreportedServiceAmountJpy: number;
  };
  technicians: BackofficeTechnicianPayload[];
  shops: BackofficeShopPayload[];
}

export interface PaginatedApiPayload<TItem> {
  list: TItem[];
  total: number;
  page: number;
  page_size: number;
}

export type AffiliateTaskStatus =
  | "draft"
  | "pending_review"
  | "scheduled"
  | "active"
  | "paused"
  | "budget_exhausted"
  | "ended"
  | "cancelled"
  | "rejected";
export type AffiliatePublisherType = "merchant_account" | "shop";
export type AffiliateDiscountType = "none" | "fixed_jpy" | "percent";
export type AffiliateServiceScopeMode = "all_current_services" | "selected_services";

export interface BackofficeAffiliateTaskQuery
  extends Record<string, string | number | boolean | null | undefined> {
  page?: number;
  pageSize?: number;
  status?: AffiliateTaskStatus;
  publisherType?: AffiliatePublisherType;
  keyword?: string;
  merchantAccountId?: number;
  shopId?: number;
}

export interface BackofficeAffiliateTaskShopPayload {
  id: number;
  shopId: number;
  shopNameSnapshot: string;
}

export interface BackofficeAffiliateTaskServicePayload {
  id: number;
  shopId: number;
  serviceId: number;
  serviceNameSnapshot: string;
  servicePriceJpySnapshot: number;
}

export interface BackofficeAffiliateBudgetReservationPayload {
  id: number;
  taskId: number;
  walletId: number;
  totalFrozenNdp: number;
  allocatedNdp: number;
  capturedNdp: number;
  releasedNdp: number;
  status: "active" | "released" | "exhausted";
  idempotencyKey: string;
  frozenAt: string;
  releasedAt: string | null;
}

export interface BackofficeAffiliateTaskPayload {
  id: number;
  taskCode: string;
  lineageKey: string;
  version: number;
  lockVersion: number;
  publisherType: AffiliatePublisherType;
  publisherMerchantAccountId: number | null;
  publisherShopId: number | null;
  name: string;
  description: string | null;
  coverMediaAssetId: number | null;
  rewardNdpPerCompletedOrder: number;
  totalBudgetNdp: number;
  reservedBudgetNdp: number;
  allocatedBudgetNdp: number;
  settledBudgetNdp: number;
  releasedBudgetNdp: number;
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
  serviceScopeMode: AffiliateServiceScopeMode;
  status: AffiliateTaskStatus;
  reviewedById: number | null;
  reviewedAt: string | null;
  rejectionReason: string | null;
  submittedAt: string | null;
  activatedAt: string | null;
  createdAt: string;
  updatedAt: string;
  shops: BackofficeAffiliateTaskShopPayload[];
  services: BackofficeAffiliateTaskServicePayload[];
  budgetReservation: BackofficeAffiliateBudgetReservationPayload | null;
}

export interface CsvExportPayload {
  filename: string;
  contentType: "text/csv; charset=utf-8";
  content: string;
}

type ListQuery = {
  page?: number;
  pageSize?: number;
  status?: string;
  from?: string;
  to?: string;
  keyword?: string;
  shopId?: number;
  categoryId?: number;
};

const scopePrefix = (scope: BackofficeScope) => (scope === "merchant-admin" ? "/merchant-admin" : "/backoffice");

export const backofficeRealDataApi = {
  dashboard(scope: BackofficeScope) {
    return httpClient.request<BackofficeDashboardPayload>(`${scopePrefix(scope)}/dashboard`);
  },
  orders(scope: BackofficeScope, query?: ListQuery) {
    return httpClient.request<PaginatedApiPayload<BackofficeOrderPayload>>(`${scopePrefix(scope)}/orders`, {
      query
    });
  },
  schedule(scope: BackofficeScope, query?: ListQuery) {
    return httpClient.request<PaginatedApiPayload<BackofficeScheduleSlotPayload>>(`${scopePrefix(scope)}/schedule`, {
      query
    });
  },
  financeSettlements(scope: BackofficeScope, query?: ListQuery) {
    return httpClient.request<PaginatedApiPayload<BackofficeFinanceSettlementPayload>>(`${scopePrefix(scope)}/finance/settlements`, {
      query
    });
  },
  exportFinanceSettlements(scope: BackofficeScope, query?: ListQuery) {
    return httpClient.request<CsvExportPayload>(`${scopePrefix(scope)}/finance/settlements/export`, {
      query
    });
  },
  technicians(scope: BackofficeScope, query?: ListQuery) {
    return httpClient.request<PaginatedApiPayload<BackofficeTechnicianPayload>>(`${scopePrefix(scope)}/technicians`, {
      query
    });
  },
  technicianRankings(query?: TechnicianRankingQuery) {
    return httpClient.request<BackofficeTechnicianRankingPayload>(
      "/backoffice/technician-rankings",
      { query }
    );
  },
  exportTechnicianRankings(query?: TechnicianRankingQuery) {
    return httpClient.request<CsvExportPayload>("/backoffice/technician-rankings/export", {
      query
    });
  },
  affiliateTasks(query?: BackofficeAffiliateTaskQuery) {
    return httpClient.request<PaginatedApiPayload<BackofficeAffiliateTaskPayload>>(
      "/backoffice/affiliate/tasks",
      { query }
    );
  },
  affiliateTask(taskId: number) {
    return httpClient.request<BackofficeAffiliateTaskPayload>(
      `/backoffice/affiliate/tasks/${taskId}`
    );
  },
  approveAffiliateTask(taskId: number) {
    return httpClient.request<BackofficeAffiliateTaskPayload>(
      `/backoffice/affiliate/tasks/${taskId}/approve`,
      { method: "POST" }
    );
  },
  rejectAffiliateTask(taskId: number, reason: string) {
    return httpClient.request<BackofficeAffiliateTaskPayload>(
      `/backoffice/affiliate/tasks/${taskId}/reject`,
      { body: { reason }, method: "POST" }
    );
  },
  shops(scope: BackofficeScope, query?: ListQuery) {
    return httpClient.request<PaginatedApiPayload<BackofficeShopPayload>>(`${scopePrefix(scope)}/shops`, {
      query
    });
  },
  merchantShop() {
    return httpClient.request<PaginatedApiPayload<BackofficeShopPayload>>("/merchant-admin/shop");
  },
  updateMerchantShop(input: MerchantShopUpdateInput) {
    return httpClient.request<BackofficeShopPayload>("/merchant-admin/shop", { body: input, method: "PATCH" });
  },
  createShop(input: BackofficeShopCreateInput) {
    return httpClient.request<BackofficeShopPayload>("/backoffice/shops", { body: input, method: "POST" });
  },
  updateShop(id: number, input: BackofficeShopUpdateInput) {
    return httpClient.request<BackofficeShopPayload>(`/backoffice/shops/${id}`, { body: input, method: "PATCH" });
  },
  approveShop(id: number) {
    return httpClient.request<BackofficeShopPayload>(`/backoffice/shops/${id}/approve`, { method: "POST" });
  },
  deleteShop(id: number) {
    return httpClient.request<BackofficeShopPayload>(`/backoffice/shops/${id}`, { method: "DELETE" });
  },
  updateTechnician(scope: BackofficeScope, id: number, input: BackofficeTechnicianUpdateInput) {
    return httpClient.request<BackofficeTechnicianPayload>(`${scopePrefix(scope)}/technicians/${id}`, { body: input, method: "PATCH" });
  },
  approveTechnician(scope: BackofficeScope, id: number, input: { shopId?: number } = {}) {
    return httpClient.request<BackofficeTechnicianPayload>(`${scopePrefix(scope)}/technicians/${id}/approve`, { body: input, method: "POST" });
  },
  deleteTechnician(scope: BackofficeScope, id: number) {
    return httpClient.request<BackofficeTechnicianPayload>(`${scopePrefix(scope)}/technicians/${id}`, { method: "DELETE" });
  },
  technician(scope: BackofficeScope, id: number) {
    return httpClient.request<BackofficeTechnicianDetailPayload>(`${scopePrefix(scope)}/technicians/${id}`);
  },
  customers(scope: BackofficeScope, query?: ListQuery) {
    return httpClient.request<PaginatedApiPayload<BackofficeCustomerPayload>>(`${scopePrefix(scope)}/customers`, { query });
  },
  customer(scope: BackofficeScope, id: number) {
    return httpClient.request<BackofficeCustomerDetailPayload>(`${scopePrefix(scope)}/customers/${id}`);
  },
  customerTimeline(scope: BackofficeScope, id: number, page = 1, pageSize = 10) {
    return httpClient.request<BackofficeCustomerTimelinePayload>(
      `${scopePrefix(scope)}/customers/${id}/timeline`,
      { query: { page, pageSize } },
    );
  },
  updateCustomer(id: number, input: BackofficeCustomerUpdateInput) {
    return httpClient.request<BackofficeCustomerPayload>(`/backoffice/customers/${id}`, { body: input, method: "PATCH" });
  },
  assignCustomerMembership(id: number, input: BackofficeCustomerMembershipGrantInput) {
    return httpClient.request<BackofficeCustomerMembershipGrantPayload>(
      `/backoffice/customers/${id}/membership`,
      { body: input, method: "PUT" }
    );
  },
  deleteCustomer(id: number) {
    return httpClient.request<BackofficeCustomerPayload>(`/backoffice/customers/${id}`, { method: "DELETE" });
  },
  services(scope: BackofficeScope, query?: ListQuery) {
    return httpClient.request<PaginatedApiPayload<BackofficeServicePayload>>(`${scopePrefix(scope)}/services`, { query });
  },
  createService(scope: BackofficeScope, input: BackofficeServiceCreateInput, shopId?: number) {
    const path = scope === "merchant-admin" ? "/merchant-admin/services" : `/backoffice/shops/${shopId}/services`;
    return httpClient.request<BackofficeServicePayload>(path, { body: input, method: "POST" });
  },
  updateService(scope: BackofficeScope, id: number, input: BackofficeServiceUpdateInput) {
    return httpClient.request<BackofficeServicePayload>(`${scopePrefix(scope)}/services/${id}`, { body: input, method: "PATCH" });
  },
  deleteService(scope: BackofficeScope, id: number) {
    return httpClient.request<BackofficeServicePayload>(`${scopePrefix(scope)}/services/${id}`, { method: "DELETE" });
  }
};

export function mapBackofficeOrder(row: BackofficeOrderPayload): Order {
  return {
    id: String(row.id),
    orderNo: row.orderNo,
    mode: row.fulfillmentMode === "home" ? "home" : "store",
    status: normalizeOrderStatus(row.status),
    customerId: String(row.customerUserId),
    customerName: row.customerName,
    itemName: row.serviceName,
    storeName: row.shopName,
    technicianName: row.technicianName ?? undefined,
    city: "",
    area: "",
    amount: row.priceAmount,
    paymentStatus:
      row.paymentStatus === "confirmed" || row.paymentStatus === "refundPending"
        ? "paid"
        : row.paymentStatus === "refunded"
          ? "refunded"
          : "unpaid",
    bookedAt: formatDateTime(row.startsAt),
    createdAt: formatDateTime(row.createdAt),
    source: "web",
    remark: row.note ?? row.cancelReason ?? undefined
  };
}

export function mapBackofficeSettlement(row: BackofficeFinanceSettlementPayload): Settlement {
  return {
    id: String(row.id),
    merchantName: row.shopName || `Booking #${row.referenceId}`,
    period: formatDateTime(row.createdAt).slice(0, 10),
    grossAmount: row.estimatedServiceGmvJpy,
    platformFee: row.platformNdpRevenue,
    refundAmount: row.userRewardNdpCost + row.campaignDiscountNdp,
    payableAmount: row.estimatedServiceGmvJpy - row.platformNdpRevenue,
    status: row.status === "settled" || row.status === "compensated" ? "paid" : "pending"
  };
}

export function mapBackofficeTechnician(row: BackofficeTechnicianPayload): Technician {
  return {
    id: `tech-${row.id}`,
    systemId: formatSystemId("b", row.id),
    name: row.displayName,
    storeId: row.shopId ? `store-${row.shopId}` : "",
    role: "therapist",
    status: row.status === "published" ? "available" : "off",
    rating: 0,
    orderCount: 0,
    income: 0,
    skills: [],
    serviceAreas: row.serviceArea ? row.serviceArea.split(",").map((item) => item.trim()).filter(Boolean) : [],
    acceptRate: 0,
    cancelRate: 0,
    reviewCount: 0,
    languages: ["日本語"],
    avatar: row.avatarUrl ?? "/images/generated/profiles/profile-12.jpg",
    accountUsername: row.email,
    identityLabel: row.shopId ? "店铺所属技师" : "个人技师"
  };
}

export function mapBackofficeStore(row: BackofficeShopPayload): Store {
  return {
    id: `store-${row.id}`,
    systemId: formatSystemId("s", row.id),
    merchantId: row.ownerUserId ? `merchant-${row.ownerUserId}` : "merchant-unassigned",
    name: row.name,
    accountUsername: row.ownerEmail ?? undefined,
    area: row.city,
    address: row.address,
    rating: 0,
    reviewCount: 0,
    priceLabel: "NDP",
    tags: [row.city, row.status].filter(Boolean),
    openStatus: row.status === "published" ? "open" : "resting",
    nextSlot: "",
    cover: "/images/generated/home-merchant-feature.jpg",
    gallery: [],
    description: "",
    rankLabel: row.isRecommended ? "Recommended" : "Standard",
    businessHours: "",
    mode: "store"
  };
}

export function mapBackofficeMerchant(row: BackofficeShopPayload): Merchant {
  return {
    id: `merchant-shop-${row.id}`,
    name: row.name,
    status: row.status === "published" ? "active" : "pending",
    categories: [],
    city: row.city,
    commissionRate: 0,
    settlementCycle: "NDP",
    documents: [row.ownerEmail ?? "未绑定账号"]
  };
}

function normalizeOrderStatus(status: string): OrderStatus {
  if (status === "in_service") {
    return "inService";
  }

  if (status === "confirmed" || status === "inService" || status === "completed" || status === "cancelled" || status === "pending") {
    return status as OrderStatus;
  }

  return "pending";
}

function formatDateTime(value: string) {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString("ja-JP", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "2-digit",
    year: "numeric"
  });
}
