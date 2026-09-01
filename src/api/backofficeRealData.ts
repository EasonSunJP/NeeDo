import { httpClient } from "./httpClient";
import type { Merchant, Order, OrderStatus, Settlement, Store, Technician } from "../types/domain";
import { formatSystemId } from "../lib/systemIds";

export type BackofficeScope = "backoffice" | "merchant-admin";

export type DashboardPeriod =
  | "today"
  | "last7days"
  | "last30days"
  | "week"
  | "month"
  | "year"
  | "custom";

export type DashboardGranularity = "hour" | "day" | "month";

export interface DashboardQuery extends Record<string, string | undefined> {
  period: DashboardPeriod;
  from?: string;
  to?: string;
  city?: string;
}

export interface DashboardMetricComparison {
  current: number;
  previous: number;
  changeRatePercent: number | null;
}

export type AnalyticsDataStatus = "ready" | "not_connected" | "not_available";

export type AnalyticsComparisonDirection = "up" | "down" | "flat" | "unavailable";

export interface AnalyticsMetricPayload {
  metricKey: string;
  currentValue: number | null;
  previousValue: number | null;
  comparisonPercent: number | null;
  comparisonDirection: AnalyticsComparisonDirection;
  unit: "jpy" | "ndp" | "people" | "count";
  dataStatus: AnalyticsDataStatus;
  description: string;
  formula: string;
  detailRoute: string | null;
}

export interface AnalyticsMetricSeries {
  seriesKey: string;
  label: string;
  unit: AnalyticsMetricPayload["unit"];
  points: Array<{ key: string; label: string; value: number | null }>;
}

export interface AnalyticsDashboardFilter {
  period: DashboardPeriod;
  from: string;
  to: string;
  previousFrom: string;
  previousTo: string;
  timeZone: "Asia/Tokyo";
  granularity: DashboardGranularity;
  city: string | null;
}

export interface DashboardOverviewPayload {
  filter: AnalyticsDashboardFilter;
  operationsFinance: AnalyticsMetricPayload[];
  commissionMetrics: AnalyticsMetricPayload[];
  growthMetrics: AnalyticsMetricPayload[];
}

export interface DashboardMetricDetailPayload {
  filter: AnalyticsDashboardFilter;
  metric: AnalyticsMetricPayload;
  series: AnalyticsMetricSeries[];
}

export interface DashboardNdpPair {
  ndp: number;
  testNdp: number;
}

export interface DashboardPlatformGlobalNdpPair extends DashboardNdpPair {
  cityFilterApplied: false;
  scopeLabel: "platform_global";
}

export interface DashboardShopNdpCost {
  totalNdp: number;
  platformNdp: number;
  userRewardNdp: number;
}

export interface DashboardBucketPayload {
  key: string;
  label: string;
  orderCount: number;
  serviceGmvJpy: number;
  platformNetRevenueNdp: number;
  frozenNdp: number;
  shopCount: number;
  registeredTechnicianCount: number;
  shopEstimatedGrossProfitJpy: number;
  scheduleTotalHours: number;
  scheduleAvailableHours: number;
  scheduleBookedHours: number;
}

export interface DashboardMerchantSnapshot {
  publicId: string;
  name: string;
  city: string;
  address: string;
  status: string;
  billing: {
    cadence: "monthly" | "annual" | "free";
    state: "trial" | "paid" | "free" | "overdue";
    trialEndsAt: string | null;
    paidThrough: string | null;
  } | null;
  wallet: {
    status: "available" | "not_opened";
    currency: "NDP";
    availableBalance: number | null;
    frozenBalance: number | null;
  };
}

export interface ManageableMerchantShopPayload {
  publicId: string;
  name: string;
  city: string;
  status: string;
  selected: boolean;
}

export interface BackofficeOrderPayload {
  id: number;
  orderNo: string;
  status: string;
  paymentStatus: "pending" | "confirmed" | "refundPending" | "refunded";
  customerUserId: number;
  customerProfileId: number | null;
  customerName: string;
  serviceId: number | null;
  serviceName: string;
  shopId: number;
  shopName: string;
  technicianProfileId: number | null;
  technicianNeedoId: string | null;
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

export interface NdpAmountPair {
  ndp: number;
  testNdp: number;
}

export interface BackofficeNdpSummaryPayload {
  period: {
    date: string;
    timeZone: "Asia/Tokyo";
  };
  todayNdpConsumption: NdpAmountPair;
  platformNetRevenue: NdpAmountPair;
  requestFeeRevenue: NdpAmountPair;
  userRewardCost: NdpAmountPair;
  pendingHold: NdpAmountPair;
  campaignDiscount: NdpAmountPair;
  settleableNdp: number;
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

export interface TechnicianRankingQuery extends Record<
  string,
  string | number | boolean | null | undefined
> {
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

export interface BackofficeTechnicianRankingPayload extends PaginatedApiPayload<BackofficeTechnicianRankingRowPayload> {
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
  avatarUrl: string | null;
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

export type BackofficeCustomerTimelinePayload = PaginatedApiPayload<BackofficeAuditEventPayload>;

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

export type BackofficeShopUpdateInput = Partial<
  Pick<
    BackofficeShopCreateInput,
    "name" | "description" | "city" | "address" | "phone" | "isRecommended"
  >
>;
export type MerchantShopUpdateInput = Partial<
  Pick<BackofficeShopCreateInput, "name" | "description" | "city" | "address" | "phone">
> & {
  avatarDataUrl?: string;
};
export type BackofficeTechnicianUpdateInput = Partial<
  Pick<
    BackofficeTechnicianPayload,
    "displayName" | "city" | "serviceArea" | "employmentType" | "employmentStartedAt"
  >
> & { shopId?: number | null; isRecommended?: boolean };
export type BackofficeCustomerUpdateInput = Partial<
  Pick<BackofficeCustomerPayload, "displayName" | "city" | "isPublic">
> & { bio?: string | null };

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
export type BackofficeServiceCreateInput = Pick<
  BackofficeServicePayload,
  "categoryId" | "name" | "city" | "serviceMode" | "priceAmount" | "durationMinutes"
> &
  Partial<
    Pick<
      BackofficeServicePayload,
      "technicianProfileId" | "description" | "status" | "isRecommended" | "sortOrder"
    >
  >;
export type BackofficeServiceUpdateInput = Partial<BackofficeServiceCreateInput>;

export interface BackofficeDashboardPayload {
  filter: {
    period: DashboardPeriod;
    from: string;
    to: string;
    previousFrom: string;
    previousTo: string;
    timeZone: "Asia/Tokyo";
    granularity: DashboardGranularity;
    city: string | null;
    availableCities: string[];
  };
  summary: {
    availableScheduleSlots: DashboardMetricComparison;
    activeTechnicians: DashboardMetricComparison;
    registeredTechnicians: DashboardMetricComparison;
    shopCount: DashboardMetricComparison | null;
    newCustomers: DashboardMetricComparison | null;
    pendingOrders: number;
    serviceGmvJpy: number;
  };
  series: { buckets: DashboardBucketPayload[] };
  finance: {
    platformNetRevenue: DashboardNdpPair;
    frozen: DashboardNdpPair;
    userReward: DashboardNdpPair;
    walletStock: DashboardPlatformGlobalNdpPair | null;
    withdrawn: DashboardPlatformGlobalNdpPair | null;
    shopNdpCost: DashboardShopNdpCost | null;
  };
  shop: DashboardMerchantSnapshot | null;
  membership: null | {
    memberCount: null;
    memberDataStatus: "not_available";
    completedCustomerCount: number;
  };
  scope: { kind: "platform"; shopPublicId: null } | { kind: "shop"; shopPublicId: string };
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

export interface BackofficeAffiliateTaskQuery extends Record<
  string,
  string | number | boolean | null | undefined
> {
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

const scopePrefix = (scope: BackofficeScope) =>
  scope === "merchant-admin" ? "/merchant-admin" : "/backoffice";

function serializeDashboardQuery(scope: BackofficeScope, query: DashboardQuery): DashboardQuery {
  const periods = new Set<DashboardPeriod>([
    "today",
    "last7days",
    "last30days",
    "week",
    "month",
    "year",
    "custom"
  ]);
  if (!periods.has(query.period)) {
    throw new Error("error.dashboard.period_invalid");
  }

  if (query.period === "custom" && (!query.from || !query.to)) {
    throw new Error("error.dashboard.custom_range_required");
  }

  const serialized: DashboardQuery = {
    period: query.period,
    ...(query.period === "custom" ? { from: query.from, to: query.to } : {})
  };

  if (scope === "backoffice" && query.city) {
    serialized.city = query.city;
  }

  return serialized;
}

export function serializeDashboardQuerySearch(query: DashboardQuery) {
  const serialized = serializeDashboardQuery("backoffice", query);
  const search = new URLSearchParams();
  search.set("period", serialized.period);
  if (serialized.from) search.set("from", serialized.from);
  if (serialized.to) search.set("to", serialized.to);
  if (serialized.city) search.set("city", serialized.city);
  return search.toString();
}

function isNonNegativeSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

const dashboardPeriods = new Set<DashboardPeriod>([
  "today",
  "last7days",
  "last30days",
  "week",
  "month",
  "year",
  "custom"
]);
const dashboardGranularities = new Set<DashboardGranularity>(["hour", "day", "month"]);
const analyticsStatuses = new Set<AnalyticsDataStatus>([
  "ready",
  "not_connected",
  "not_available"
]);
const analyticsUnits = new Set<AnalyticsMetricPayload["unit"]>([
  "jpy",
  "ndp",
  "people",
  "count"
]);
const analyticsDirections = new Set<AnalyticsComparisonDirection>([
  "up",
  "down",
  "flat",
  "unavailable"
]);
const analyticsMetricGroups = {
  operationsFinance: ["gross_revenue", "travel_fare", "discount_amount", "consumables_sales"],
  commissionMetrics: [
    "dedicated_technician_commission", "part_time_technician_commission", "marketing_commission",
    "agent_commission", "ndp_income", "affiliate_platform_income", "consumables_profit"
  ],
  growthMetrics: [
    "new_users", "new_paid_members", "technician_onboarding", "agent_onboarding",
    "franchisee_onboarding", "supplier_onboarding"
  ]
} as const;
const analyticsMetricKeys = new Set<string>(Object.values(analyticsMetricGroups).flat());
const analyticsMetricUnits: Record<string, AnalyticsMetricPayload["unit"]> = {
  gross_revenue: "jpy",
  travel_fare: "jpy",
  discount_amount: "jpy",
  consumables_sales: "jpy",
  dedicated_technician_commission: "jpy",
  part_time_technician_commission: "jpy",
  marketing_commission: "ndp",
  agent_commission: "jpy",
  ndp_income: "ndp",
  affiliate_platform_income: "ndp",
  consumables_profit: "jpy",
  new_users: "people",
  new_paid_members: "people",
  technician_onboarding: "people",
  agent_onboarding: "people",
  franchisee_onboarding: "people",
  supplier_onboarding: "people"
};

function isExactObject(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const actualKeys = Object.keys(value).sort();
  return actualKeys.length === keys.length && actualKeys.every((key, index) => key === [...keys].sort()[index]);
}

function isCalendarDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function calendarDayNumber(value: string) {
  return Date.parse(`${value}T00:00:00.000Z`) / 86_400_000;
}

function requireAnalyticsFilter(
  value: unknown,
  expectedQuery: DashboardQuery
): AnalyticsDashboardFilter {
  const keys = [
    "period", "from", "to", "previousFrom", "previousTo", "timeZone", "granularity", "city"
  ];
  if (
    !isExactObject(value, keys) ||
    !dashboardPeriods.has(value.period as DashboardPeriod) ||
    !isCalendarDate(value.from) ||
    !isCalendarDate(value.to) ||
    !isCalendarDate(value.previousFrom) ||
    !isCalendarDate(value.previousTo) ||
    value.timeZone !== "Asia/Tokyo" ||
    !dashboardGranularities.has(value.granularity as DashboardGranularity) ||
    !(value.city === null || (
      typeof value.city === "string" && value.city.trim() === value.city &&
      value.city.length > 0 && value.city.length <= 100
    ))
  ) {
    throw new Error("error.api");
  }
  const currentFrom = calendarDayNumber(value.from as string);
  const currentTo = calendarDayNumber(value.to as string);
  const previousFrom = calendarDayNumber(value.previousFrom as string);
  const previousTo = calendarDayNumber(value.previousTo as string);
  const currentDayCount = currentTo - currentFrom + 1;
  const previousDayCount = previousTo - previousFrom + 1;
  const expectedGranularity: DashboardGranularity = expectedQuery.period === "today"
    ? "hour"
    : expectedQuery.period === "year" || (expectedQuery.period === "custom" && currentDayCount > 92)
      ? "month"
      : "day";
  if (
    currentDayCount < 1 ||
    previousDayCount !== currentDayCount ||
    previousTo + 1 !== currentFrom ||
    value.period !== expectedQuery.period ||
    value.city !== (expectedQuery.city ?? null) ||
    value.granularity !== expectedGranularity ||
    (expectedQuery.period === "custom" && (
      value.from !== expectedQuery.from || value.to !== expectedQuery.to
    ))
  ) {
    throw new Error("error.api");
  }
  return value as unknown as AnalyticsDashboardFilter;
}

function compareMetric(current: number, previous: number) {
  if (current === previous) return { comparisonPercent: 0, comparisonDirection: "flat" as const };
  const raw = previous === 0
    ? current > 0 ? 100 : -100
    : ((current - previous) / Math.abs(previous)) * 100;
  const scaledMagnitude = Number((Math.abs(raw) * 100).toPrecision(15));
  const rounded = Math.sign(raw) * (Math.round(scaledMagnitude) / 100);
  const comparisonPercent = Object.is(rounded, -0) ? 0 : rounded;
  return {
    comparisonPercent,
    comparisonDirection: comparisonPercent > 0 ? "up" as const : comparisonPercent < 0 ? "down" as const : "flat" as const
  };
}

function requireAnalyticsMetric(value: unknown): AnalyticsMetricPayload {
  const keys = [
    "metricKey", "currentValue", "previousValue", "comparisonPercent", "comparisonDirection",
    "unit", "dataStatus", "description", "formula", "detailRoute"
  ];
  if (
    !isExactObject(value, keys) ||
    typeof value.metricKey !== "string" || !analyticsMetricKeys.has(value.metricKey) ||
    !analyticsUnits.has(value.unit as AnalyticsMetricPayload["unit"]) ||
    value.unit !== analyticsMetricUnits[value.metricKey as string] ||
    !analyticsStatuses.has(value.dataStatus as AnalyticsDataStatus) ||
    !analyticsDirections.has(value.comparisonDirection as AnalyticsComparisonDirection) ||
    typeof value.description !== "string" || value.description.trim().length === 0 ||
    typeof value.formula !== "string" || value.formula.trim().length === 0 ||
    value.detailRoute !== (
      value.metricKey === "franchisee_onboarding" || value.metricKey === "supplier_onboarding"
        ? null
        : `/admin/analytics/metrics/${value.metricKey}`
    )
  ) {
    throw new Error("error.api");
  }

  if (value.dataStatus === "ready") {
    if (!Number.isSafeInteger(value.currentValue) || !Number.isSafeInteger(value.previousValue)) {
      throw new Error("error.api");
    }
    const expected = compareMetric(value.currentValue as number, value.previousValue as number);
    if (
      value.comparisonPercent !== expected.comparisonPercent ||
      value.comparisonDirection !== expected.comparisonDirection
    ) {
      throw new Error("error.api");
    }
  } else if (
    value.currentValue !== null || value.previousValue !== null ||
    value.comparisonPercent !== null || value.comparisonDirection !== "unavailable"
  ) {
    throw new Error("error.api");
  }

  return value as unknown as AnalyticsMetricPayload;
}

function requireMetricList(value: unknown): AnalyticsMetricPayload[] {
  if (!Array.isArray(value)) throw new Error("error.api");
  return value.map(requireAnalyticsMetric);
}

function requireDashboardOverview(
  value: unknown,
  expectedQuery: DashboardQuery
): DashboardOverviewPayload {
  if (!isExactObject(value, ["filter", "operationsFinance", "commissionMetrics", "growthMetrics"])) {
    throw new Error("error.api");
  }
  const payload = {
    filter: requireAnalyticsFilter(value.filter, expectedQuery),
    operationsFinance: requireMetricList(value.operationsFinance),
    commissionMetrics: requireMetricList(value.commissionMetrics),
    growthMetrics: requireMetricList(value.growthMetrics)
  };
  for (const groupName of Object.keys(analyticsMetricGroups) as Array<keyof typeof analyticsMetricGroups>) {
    const expected = analyticsMetricGroups[groupName];
    const actual = payload[groupName];
    if (actual.length !== expected.length || actual.some((metric, index) => metric.metricKey !== expected[index])) {
      throw new Error("error.api");
    }
  }
  const keys = payload.operationsFinance.concat(payload.commissionMetrics, payload.growthMetrics)
    .map((metric) => metric.metricKey);
  if (new Set(keys).size !== keys.length) throw new Error("error.api");
  return payload;
}

function requireDashboardMetricDetail(
  value: unknown,
  expectedQuery: DashboardQuery
): DashboardMetricDetailPayload {
  if (!isExactObject(value, ["filter", "metric", "series"])) throw new Error("error.api");
  const filter = requireAnalyticsFilter(value.filter, expectedQuery);
  const metric = requireAnalyticsMetric(value.metric);
  if (!Array.isArray(value.series) || value.series.length > 1) throw new Error("error.api");
  if (value.series.length === 0) return { filter, metric, series: [] };
  const seriesValue = value.series[0];
  if (
    !isExactObject(seriesValue, ["seriesKey", "label", "unit", "points"]) ||
    seriesValue.seriesKey !== metric.metricKey ||
    seriesValue.label !== metric.description ||
    seriesValue.unit !== metric.unit ||
    !Array.isArray(seriesValue.points) || seriesValue.points.length !== 2
  ) {
    throw new Error("error.api");
  }
  const expectedPointKeys = ["previous", "current"];
  const expectedPointLabels = [
    `${filter.previousFrom} - ${filter.previousTo}`,
    `${filter.from} - ${filter.to}`
  ];
  const expectedValues = [metric.previousValue, metric.currentValue];
  const points = seriesValue.points.map((point, index) => {
    if (
      !isExactObject(point, ["key", "label", "value"]) ||
      point.key !== expectedPointKeys[index] ||
      point.label !== expectedPointLabels[index] ||
      point.value !== expectedValues[index] ||
      !(point.value === null || Number.isSafeInteger(point.value))
    ) {
      throw new Error("error.api");
    }
    return point as unknown as AnalyticsMetricSeries["points"][number];
  });
  return {
    filter,
    metric,
    series: [{
      seriesKey: seriesValue.seriesKey,
      label: seriesValue.label,
      unit: seriesValue.unit as AnalyticsMetricPayload["unit"],
      points
    }]
  };
}

function requireManageableMerchantShopsPage(
  value: unknown,
  expectedPage: number,
  expectedPageSize: number
): PaginatedApiPayload<ManageableMerchantShopPayload> {
  if (!value || typeof value !== "object") {
    throw new Error("error.api");
  }

  const page = value as Partial<PaginatedApiPayload<ManageableMerchantShopPayload>>;
  if (
    !Array.isArray(page.list) ||
    !isNonNegativeSafeInteger(page.total) ||
    !isNonNegativeSafeInteger(page.page) ||
    page.page !== expectedPage ||
    !isNonNegativeSafeInteger(page.page_size) ||
    page.page_size !== expectedPageSize ||
    page.list.length > page.page_size ||
    page.total < page.list.length ||
    !page.list.every((shop) =>
      Boolean(
        shop &&
        typeof shop === "object" &&
        typeof shop.publicId === "string" &&
        /^shop\d{10}$/.test(shop.publicId) &&
        typeof shop.name === "string" &&
        shop.name.trim().length > 0 &&
        typeof shop.city === "string" &&
        shop.city.trim().length > 0 &&
        typeof shop.status === "string" &&
        shop.status.trim().length > 0 &&
        typeof shop.selected === "boolean"
      )
    )
  ) {
    throw new Error("error.api");
  }

  return {
    list: page.list.map((shop) => ({
      publicId: shop.publicId,
      name: shop.name,
      city: shop.city,
      status: shop.status,
      selected: shop.selected
    })),
    total: page.total,
    page: page.page,
    page_size: page.page_size
  };
}

export const backofficeRealDataApi = {
  dashboard(scope: BackofficeScope, query: DashboardQuery, options?: { signal?: AbortSignal }) {
    return httpClient.request<BackofficeDashboardPayload>(`${scopePrefix(scope)}/dashboard`, {
      query: serializeDashboardQuery(scope, query),
      ...(options?.signal ? { signal: options.signal } : {})
    });
  },
  async dashboardOverview(query: DashboardQuery, options?: { signal?: AbortSignal }) {
    const serializedQuery = serializeDashboardQuery("backoffice", query);
    const payload = await httpClient.request<unknown>("/backoffice/dashboard/overview", {
      query: serializedQuery,
      ...(options?.signal ? { signal: options.signal } : {})
    });
    return requireDashboardOverview(payload, serializedQuery);
  },
  async dashboardMetricDetail(
    metricKey: string,
    query: DashboardQuery,
    options?: { signal?: AbortSignal }
  ) {
    const serializedQuery = serializeDashboardQuery("backoffice", query);
    const payload = await httpClient.request<unknown>(
      `/backoffice/dashboard/metrics/${encodeURIComponent(metricKey)}`,
      {
        query: serializedQuery,
        ...(options?.signal ? { signal: options.signal } : {})
      }
    );
    const detail = requireDashboardMetricDetail(payload, serializedQuery);
    if (detail.metric.metricKey !== metricKey) throw new Error("error.api");
    return detail;
  },
  async manageableMerchantShops(page = 1, pageSize = 20, options?: { signal?: AbortSignal }) {
    if (
      !Number.isSafeInteger(page) ||
      page < 1 ||
      !Number.isSafeInteger(pageSize) ||
      pageSize < 1 ||
      pageSize > 100
    ) {
      throw new Error("error.pagination.invalid");
    }

    const payload = await httpClient.request<PaginatedApiPayload<ManageableMerchantShopPayload>>(
      "/merchant-admin/manageable-shops",
      {
        query: { page, page_size: pageSize },
        ...(options?.signal ? { signal: options.signal } : {})
      }
    );
    return requireManageableMerchantShopsPage(payload, page, pageSize);
  },
  orders(scope: BackofficeScope, query?: ListQuery) {
    return httpClient.request<PaginatedApiPayload<BackofficeOrderPayload>>(
      `${scopePrefix(scope)}/orders`,
      {
        query
      }
    );
  },
  schedule(scope: BackofficeScope, query?: ListQuery) {
    return httpClient.request<PaginatedApiPayload<BackofficeScheduleSlotPayload>>(
      `${scopePrefix(scope)}/schedule`,
      {
        query
      }
    );
  },
  financeSettlements(scope: BackofficeScope, query?: ListQuery) {
    return httpClient.request<PaginatedApiPayload<BackofficeFinanceSettlementPayload>>(
      `${scopePrefix(scope)}/finance/settlements`,
      {
        query
      }
    );
  },
  ndpSummary(query: { date?: string } = {}) {
    return httpClient.request<BackofficeNdpSummaryPayload>("/backoffice/finance/ndp-summary", {
      query
    });
  },
  exportFinanceSettlements(scope: BackofficeScope, query?: ListQuery) {
    return httpClient.request<CsvExportPayload>(
      `${scopePrefix(scope)}/finance/settlements/export`,
      {
        query
      }
    );
  },
  technicians(scope: BackofficeScope, query?: ListQuery) {
    return httpClient.request<PaginatedApiPayload<BackofficeTechnicianPayload>>(
      `${scopePrefix(scope)}/technicians`,
      {
        query
      }
    );
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
    return httpClient.request<PaginatedApiPayload<BackofficeShopPayload>>(
      `${scopePrefix(scope)}/shops`,
      {
        query
      }
    );
  },
  merchantShop() {
    return httpClient.request<PaginatedApiPayload<BackofficeShopPayload>>("/merchant-admin/shop");
  },
  updateMerchantShop(input: MerchantShopUpdateInput) {
    return httpClient.request<BackofficeShopPayload>("/merchant-admin/shop", {
      body: input,
      method: "PATCH"
    });
  },
  createShop(input: BackofficeShopCreateInput) {
    return httpClient.request<BackofficeShopPayload>("/backoffice/shops", {
      body: input,
      method: "POST"
    });
  },
  updateShop(id: number, input: BackofficeShopUpdateInput) {
    return httpClient.request<BackofficeShopPayload>(`/backoffice/shops/${id}`, {
      body: input,
      method: "PATCH"
    });
  },
  approveShop(id: number) {
    return httpClient.request<BackofficeShopPayload>(`/backoffice/shops/${id}/approve`, {
      method: "POST"
    });
  },
  deleteShop(id: number) {
    return httpClient.request<BackofficeShopPayload>(`/backoffice/shops/${id}`, {
      method: "DELETE"
    });
  },
  updateTechnician(scope: BackofficeScope, id: number, input: BackofficeTechnicianUpdateInput) {
    return httpClient.request<BackofficeTechnicianPayload>(
      `${scopePrefix(scope)}/technicians/${id}`,
      { body: input, method: "PATCH" }
    );
  },
  approveTechnician(scope: BackofficeScope, id: number, input: { shopId?: number } = {}) {
    return httpClient.request<BackofficeTechnicianPayload>(
      `${scopePrefix(scope)}/technicians/${id}/approve`,
      { body: input, method: "POST" }
    );
  },
  deleteTechnician(scope: BackofficeScope, id: number) {
    return httpClient.request<BackofficeTechnicianPayload>(
      `${scopePrefix(scope)}/technicians/${id}`,
      { method: "DELETE" }
    );
  },
  technician(scope: BackofficeScope, id: number) {
    return httpClient.request<BackofficeTechnicianDetailPayload>(
      `${scopePrefix(scope)}/technicians/${id}`
    );
  },
  customers(scope: BackofficeScope, query?: ListQuery) {
    return httpClient.request<PaginatedApiPayload<BackofficeCustomerPayload>>(
      `${scopePrefix(scope)}/customers`,
      { query }
    );
  },
  customer(scope: BackofficeScope, id: number) {
    return httpClient.request<BackofficeCustomerDetailPayload>(
      `${scopePrefix(scope)}/customers/${id}`
    );
  },
  customerTimeline(scope: BackofficeScope, id: number, page = 1, pageSize = 10) {
    return httpClient.request<BackofficeCustomerTimelinePayload>(
      `${scopePrefix(scope)}/customers/${id}/timeline`,
      { query: { page, pageSize } }
    );
  },
  updateCustomer(id: number, input: BackofficeCustomerUpdateInput) {
    return httpClient.request<BackofficeCustomerPayload>(`/backoffice/customers/${id}`, {
      body: input,
      method: "PATCH"
    });
  },
  assignCustomerMembership(id: number, input: BackofficeCustomerMembershipGrantInput) {
    return httpClient.request<BackofficeCustomerMembershipGrantPayload>(
      `/backoffice/customers/${id}/membership`,
      { body: input, method: "PUT" }
    );
  },
  deleteCustomer(id: number) {
    return httpClient.request<BackofficeCustomerPayload>(`/backoffice/customers/${id}`, {
      method: "DELETE"
    });
  },
  services(scope: BackofficeScope, query?: ListQuery) {
    return httpClient.request<PaginatedApiPayload<BackofficeServicePayload>>(
      `${scopePrefix(scope)}/services`,
      { query }
    );
  },
  createService(scope: BackofficeScope, input: BackofficeServiceCreateInput, shopId?: number) {
    const path =
      scope === "merchant-admin"
        ? "/merchant-admin/services"
        : `/backoffice/shops/${shopId}/services`;
    return httpClient.request<BackofficeServicePayload>(path, { body: input, method: "POST" });
  },
  updateService(scope: BackofficeScope, id: number, input: BackofficeServiceUpdateInput) {
    return httpClient.request<BackofficeServicePayload>(`${scopePrefix(scope)}/services/${id}`, {
      body: input,
      method: "PATCH"
    });
  },
  deleteService(scope: BackofficeScope, id: number) {
    return httpClient.request<BackofficeServicePayload>(`${scopePrefix(scope)}/services/${id}`, {
      method: "DELETE"
    });
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
    serviceAreas: row.serviceArea
      ? row.serviceArea
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean)
      : [],
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

  if (
    status === "confirmed" ||
    status === "inService" ||
    status === "completed" ||
    status === "cancelled" ||
    status === "pending"
  ) {
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
