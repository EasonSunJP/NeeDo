import type { WorkStatus } from '../domain/work-status';
import { hash } from "bcryptjs";
import { UserBootstrapKeyAllocationExhaustedError } from "./user-bootstrap-key.service";
import { ERROR_CODES } from "../constants/error-codes";
import type {
  BackofficeCustomerMembershipGrantBody,
  BackofficeCustomerUpdateBody,
  BackofficeDashboardQuery,
  BackofficeListQuery,
  BackofficeManagedUserListQuery,
  BackofficeManagedUserDetailQuery,
  BackofficeNdpSummaryQuery,
  BackofficeTimelineQuery,
  BackofficeServiceCreateBody,
  BackofficeServiceUpdateBody,
  BackofficeShopCreateBody,
  BackofficeShopUpdateBody,
  MerchantShopUpdateBody,
  MerchantDashboardQuery,
  ManageableMerchantShopsQuery,
  BackofficeTechnicianApproveBody,
  BackofficeTechnicianUpdateBody,
  BackofficeTechnicianRankingQuery,
  TechnicianRankingPeriod as RankingPeriod
} from "../validators/backoffice.validator";
import { DASHBOARD_METRIC_KEYS, type DashboardMetricKey } from "../validators/backoffice.validator";
import { AppError } from "../utils/app-error";
import type { PaginatedResponse } from "../utils/pagination";
import type { AuditLogService } from "./audit-log.service";
import type { AuditLogCreateInput } from "../repositories/audit-log.repository";
import type { AuthRequestContext, AuthenticatedAccessContext } from "./auth.service";
import type { LedgerCurrency } from "./ledger-currency.service";
import type { CustomerAvatarStoragePort } from "./customer-avatar.storage";
import type { PlatformMembershipService } from "./platform-membership.service";
import {
  parseCalendarDate,
  resolveDashboardWindow,
  shiftCalendarDate,
  startOfTokyoCalendarDate,
  toTokyoCalendarDate
} from "../domain/dashboard-period";
import type {
  BackofficeDashboardPayload,
  DashboardAggregateFacts,
  DashboardAggregateInput,
  DashboardHeadlineSeriesPoint,
  DashboardMetricComparison,
  DashboardNdpPair,
  DashboardPlatformGlobalNdpPair
} from "../domain/dashboard";
import {
  compareAnalyticsMetric,
  type AnalyticsDataStatus,
  type AnalyticsMetricPayload,
  type AnalyticsMetricSeries
} from "../domain/analytics-metric";
import type {
  OperationsFinanceFacts,
  TravelFareDetailRow
} from "../repositories/dashboard-operations-finance.repository";
import type { CommissionFacts } from "../repositories/dashboard-commission.repository";
import type { GrowthFacts } from "../repositories/dashboard-growth.repository";
import { DashboardMerchantSnapshotService } from "./dashboard-merchant-snapshot.service";
import {
  merchantShopIdentityForbidden,
  requireMerchantShopId,
  resolveFormalMerchantIdentityKind
} from "./merchant-shop-scope";
import type {
  MerchantShopContextPage,
  MerchantShopContextRepositoryPort
} from "../repositories/merchant-shop-context.repository";

export type { BackofficeDashboardPayload } from "../domain/dashboard";
export { DASHBOARD_METRIC_KEYS } from "../validators/backoffice.validator";

export interface BackofficeAnalyticsReader {
  getOperationsFinance(input: DashboardAggregateInput): Promise<OperationsFinanceFacts>;
  getTravelFareDetails?(input: DashboardAggregateInput): Promise<TravelFareDetailRow[]>;
  getCommissionFacts(input: DashboardAggregateInput): Promise<CommissionFacts>;
  getGrowthFacts(input: DashboardAggregateInput): Promise<GrowthFacts>;
}

interface DashboardAnalyticsFact {
  current: number | null;
  previous: number | null;
  dataStatus: AnalyticsDataStatus;
}

interface DashboardOverviewFilter {
  period: BackofficeDashboardQuery["period"];
  from: string;
  to: string;
  previousFrom: string;
  previousTo: string;
  timeZone: "Asia/Tokyo";
  granularity: ReturnType<typeof resolveDashboardWindow>["granularity"];
  city: string | null;
}

export interface DashboardOverviewPayload {
  filter: DashboardOverviewFilter;
  operationsFinance: AnalyticsMetricPayload[];
  commissionMetrics: AnalyticsMetricPayload[];
  growthMetrics: AnalyticsMetricPayload[];
}

export interface DashboardMetricDetailPayload {
  filter: DashboardOverviewFilter;
  metric: AnalyticsMetricPayload;
  series: AnalyticsMetricSeries[];
  details: TravelFareDetailRow[];
}

interface DashboardMetricMetadata {
  description: string;
  formula: string;
  unit: AnalyticsMetricPayload["unit"];
  detailRoute: string | null;
}

const metricMetadata = (
  description: string,
  formula: string,
  unit: AnalyticsMetricPayload["unit"],
  metricKey: DashboardMetricKey,
  detailEnabled = true
): DashboardMetricMetadata => ({
  description,
  formula,
  unit,
  detailRoute: detailEnabled ? `/admin/analytics/metrics/${metricKey}` : null
});

const DASHBOARD_METRIC_METADATA: Record<DashboardMetricKey, DashboardMetricMetadata> = {
  gross_revenue: metricMetadata(
    "Completed checkout amount sum",
    "SUM(completed checkoutAmountJpy)",
    "jpy",
    "gross_revenue"
  ),
  travel_fare: metricMetadata(
    "Completed payment-evidenced travel fare excluding refunded or reversed orders",
    "SUM(completed non-refunded checkout travelFareAmountJpy)",
    "jpy",
    "travel_fare"
  ),
  discount_amount: metricMetadata(
    "Immutable base and add-on amount minus checkout amount",
    "SUM(discountAmountJpy)",
    "jpy",
    "discount_amount"
  ),
  consumables_sales: metricMetadata(
    "Formal Store consumables sales excluding invalid orders",
    "SUM(consumables sales excluding invalid orders)",
    "jpy",
    "consumables_sales"
  ),
  dedicated_technician_commission: metricMetadata(
    "Natural-month daily base allocation plus settled share for dedicated technicians",
    "SUM(natural-month daily base allocation + settled share)",
    "jpy",
    "dedicated_technician_commission"
  ),
  part_time_technician_commission: metricMetadata(
    "Natural-month daily base allocation plus settled share across associated shops",
    "SUM(natural-month daily base allocation + settled share across associated shops)",
    "jpy",
    "part_time_technician_commission"
  ),
  marketing_commission: metricMetadata(
    "Settled affiliate claimant reward",
    "SUM(settled affiliate claimant reward)",
    "ndp",
    "marketing_commission"
  ),
  agent_commission: metricMetadata(
    "Settled agent success reward plus profit share",
    "SUM(settled success reward + settled profit share)",
    "jpy",
    "agent_commission"
  ),
  ndp_income: metricMetadata(
    "Settled production platform NDP income",
    "SUM(settled production platform NDP income)",
    "ndp",
    "ndp_income"
  ),
  affiliate_platform_income: metricMetadata(
    "Settled affiliate platform fee",
    "SUM(settled affiliate platform fee)",
    "ndp",
    "affiliate_platform_income"
  ),
  consumables_profit: metricMetadata(
    "Tax-exclusive consumables base times the effective platform share",
    "SUM(tax-exclusive base * effective platform share)",
    "jpy",
    "consumables_profit"
  ),
  new_users: metricMetadata(
    "Distinct first formal user registrations",
    "COUNT(DISTINCT first formal registration)",
    "people",
    "new_users"
  ),
  new_paid_members: {
    ...metricMetadata(
      "Distinct first offline-paid active cards excluding grant, trial, replacement and renewal",
      "COUNT(DISTINCT first offline-paid active membership card)",
      "people",
      "new_paid_members"
    ),
    detailRoute: "/admin/analytics/members"
  },
  technician_onboarding: metricMetadata(
    "Distinct first technician identity activations",
    "COUNT(DISTINCT first technician identity activation)",
    "people",
    "technician_onboarding"
  ),
  agent_onboarding: metricMetadata(
    "Distinct first formal agent markings",
    "COUNT(DISTINCT first formal agent marking)",
    "people",
    "agent_onboarding"
  ),
  franchisee_onboarding: metricMetadata(
    "Distinct first formal franchisee markings",
    "COUNT(DISTINCT first formal franchisee marking)",
    "people",
    "franchisee_onboarding",
    false
  ),
  supplier_onboarding: metricMetadata(
    "Distinct first formal supplier markings",
    "COUNT(DISTINCT first formal supplier marking)",
    "people",
    "supplier_onboarding",
    false
  )
};

export type {
  TechnicianRankingPeriod,
  TechnicianRankingSort
} from "../validators/backoffice.validator";

export interface TechnicianRankingWindow {
  period: RankingPeriod;
  timeZone: "Asia/Tokyo";
  timezone: "Asia/Tokyo";
  fromDate: string | null;
  toDate: string | null;
  from: Date | null;
  fromInclusive: Date | null;
  toExclusive: Date | null;
}

export const resolveTechnicianRankingWindow = (
  input: { period?: RankingPeriod; from?: string; to?: string },
  now = new Date()
): TechnicianRankingWindow => {
  const period = input.period ?? "month";
  if (period === "all") {
    return {
      period,
      timeZone: "Asia/Tokyo",
      timezone: "Asia/Tokyo",
      fromDate: null,
      toDate: null,
      from: null,
      fromInclusive: null,
      toExclusive: null
    };
  }

  const today = toTokyoCalendarDate(now);
  let fromDate: string;
  let toDate: string;
  if (period === "custom") {
    if (!input.from || !input.to) {
      throw new Error("Custom period requires both from and to dates");
    }
    parseCalendarDate(input.from);
    parseCalendarDate(input.to);
    if (input.from > input.to) {
      throw new Error("Custom period start must not be after its end");
    }
    fromDate = input.from;
    toDate = input.to;
  } else if (period === "month") {
    fromDate = `${today.slice(0, 7)}-01`;
    toDate = shiftCalendarDate(`${shiftCalendarDate(fromDate, 32).slice(0, 7)}-01`, -1);
  } else {
    const trailingDays = period === "today" ? 1 : period === "last7days" ? 7 : 30;
    fromDate = shiftCalendarDate(today, -(trailingDays - 1));
    toDate = today;
  }

  const from = startOfTokyoCalendarDate(fromDate);
  return {
    period,
    timeZone: "Asia/Tokyo",
    timezone: "Asia/Tokyo",
    fromDate,
    toDate,
    from,
    fromInclusive: from,
    toExclusive: startOfTokyoCalendarDate(shiftCalendarDate(toDate, 1))
  };
};

export type BackofficeScope =
  | {
      scope: "platform";
    }
  | {
      scope: "merchant";
      shopId: number;
    };

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
  fulfillmentMode: string;
  priceAmount: number;
  currency: string;
  startsAt: string;
  endsAt: string;
  note: string | null;
  cancelReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export type BackofficeOrderTimelineEventPayload =
  | {
      type: "ORDER_STATUS_CHANGED";
      id: string;
      createdAt: string;
      actorUserId: number | null;
      fromStatus: string | null;
      toStatus: string;
      publicReason: string | null;
    }
  | {
      type:
        | "TECHNICIAN_CANCEL_CLASSIFIED"
        | "TECHNICIAN_UNCOMPLETED_CLASSIFIED"
        | "SPECIAL_CANCELLATION_APPLIED"
        | "SPECIAL_CANCELLATION_REVOKED";
      id: string;
      createdAt: string;
      actorUserId: number | null;
      publicReason: string | null;
      internalNote: string | null;
    }
  | {
      type: "ADD_ON_PROPOSED" | "ADD_ON_ACCEPTED" | "ADD_ON_REJECTED";
      id: string;
      createdAt: string;
      actorUserId: number | null;
      publicReason: string | null;
      addOnId: number;
      serviceId: number;
      serviceName: string;
      priceAmountJpy: number;
      currency: "JPY";
      durationMinutes: number;
    };

export interface BackofficeOrderDetailPayload extends BackofficeOrderPayload {
  performanceAssessment: {
    id: number;
    bookingOrderId: number;
    technicianProfileId: number;
    outcome: "technician_cancelled" | "technician_uncompleted";
    treatment: "counted" | "special_excluded";
    version: number;
    currentRevisionId: number | null;
    createdAt: string;
    updatedAt: string;
  } | null;
  timelineEvents: BackofficeOrderTimelineEventPayload[];
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

export interface BackofficeManagedUserIdentityPayload {
  type: string;
  displayName: string | null;
  scopeType: string | null;
  scopeId: number | null;
}

export interface BackofficeManagedUserMembershipPayload {
  tierCode: "free" | "silver" | "gold" | "black_diamond";
  tierVersionPublicId: string | null;
  entitlementPublicId: string | null;
  expiresAt: string | null;
  experienceMultiplier: number;
  lockVersion: number | null;
}

export interface BackofficeManagedUserExperiencePayload {
  currentLevel: number;
  totalExpUnits: string;
}

export interface BackofficeManagedUserPayload {
  id: number;
  needoId: string;
  username: string;
  displayName: string;
  email: string;
  phone: string | null;
  emailBound: boolean;
  phoneBound: boolean;
  avatarUrl: string | null;
  isActive: boolean;
  isTestAccount: boolean;
  source: string[];
  identities: BackofficeManagedUserIdentityPayload[];
  roles: Array<{ code: string; name: string }>;
  groups: string[];
  ekycVerified: boolean;
  membership: BackofficeManagedUserMembershipPayload;
  experience: BackofficeManagedUserExperiencePayload | null;
  ndpBalance: { available: number; frozen: number };
  bookingCount: number;
  city: string | null;
  privacyMode: boolean;
  privacyScope: "public" | "privateAll" | "limited" | "network" | null;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BackofficeManagedUserDetailPayload extends BackofficeManagedUserPayload {
  profile: {
    displayName: string;
    bio: string | null;
    city: string | null;
    gender: string | null;
    age: number | null;
    heightCm: string | null;
    languages: unknown[];
  } | null;
  account: {
    roles: Array<{
      code: string;
      name: string;
      scopeType: string | null;
      scopeId: number | null;
      permissions: string[];
    }>;
  };
  bookingSpend: {
    totalBookings: number;
    completedBookings: number;
    completedSpendJpy: number;
  };
  metrics: {
    ndpAvailable: number;
    usageCount: number;
    credit: {
      ratingAverage: number;
      reviewCount: number;
      latestReviewAt: string | null;
    };
  };
  capabilities: {
    membershipWrite: boolean;
    reviewAmend: boolean;
    refundAmend: boolean;
    partnerWrite: boolean;
    timelineCommentWrite: boolean;
  };
  audit: {
    page?: number;
    page_size?: number;
    total: number;
    list: BackofficeAuditEventPayload[];
  };
}

export type BackofficeManagedUserDetailRecord = Omit<
  BackofficeManagedUserDetailPayload,
  "capabilities"
>;

export interface BackofficeTechnicianPayload {
  workStatus?: WorkStatus;
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

export interface BackofficeTechnicianRankingSummaryPayload {
  technicianCount: number;
  completedServiceAmountJpy: number;
  completedOrderCount: number;
  workingDayCount: number;
}

export interface BackofficeTechnicianRankingPayload extends PaginatedResponse<BackofficeTechnicianRankingRowPayload> {
  summary: BackofficeTechnicianRankingSummaryPayload;
}

export interface BackofficeTechnicianRankingResponsePayload extends BackofficeTechnicianRankingPayload {
  period: {
    key: RankingPeriod;
    timeZone: "Asia/Tokyo";
    from: string | null;
    to: string | null;
  };
}

export type TechnicianRankingRepositoryInput = BackofficeScope &
  BackofficeTechnicianRankingQuery & {
    window: TechnicianRankingWindow;
  };

export interface BackofficeShopPayload {
  id: number;
  shopNo: string | null;
  ownerUserId: number | null;
  ownerEmail: string | null;
  avatarUrl: string | null;
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

export interface BackofficeCustomerMembershipGrantPayload {
  membershipLevel: string;
  membershipGrantMode: "operator_complimentary";
  membershipDurationUnit: "forever" | "day" | "month";
  membershipDurationValue: number | null;
  membershipStartsAt: string;
  membershipExpiresAt: string | null;
  membershipGrantedBy: { needoId: string; username: string };
}

export interface BackofficeCustomerMembershipGrantContext {
  customerUserId: number;
  membershipGrantedBy: { needoId: string; username: string };
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
  serviceMode: string;
  priceAmount: number;
  currency: string;
  durationMinutes: number;
  status: string;
  isRecommended: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface BackofficeShopCreateData extends Omit<BackofficeShopCreateBody, "ownerPassword"> {
  ownerPasswordHash: string;
  verifiedById: number;
  serviceLocationAudit?: AuditLogCreateInput;
}

export interface BackofficeShopMutationContext {
  verifiedById: number;
  serviceLocationAudit?: AuditLogCreateInput;
}

export type ScopedTechnicianUpdateInput = BackofficeScope &
  BackofficeTechnicianUpdateBody & { technicianId: number };
export type ScopedTechnicianApprovalInput = BackofficeScope &
  BackofficeTechnicianApproveBody & { technicianId: number; approvedAt: Date };
export type ScopedEntityInput = BackofficeScope & { id: number };
export type ScopedServiceCreateInput = BackofficeScope &
  BackofficeServiceCreateBody & { shopId: number };
export type ScopedServiceUpdateInput = BackofficeScope &
  BackofficeServiceUpdateBody & { serviceId: number };

export interface BackofficeCsvExportPayload {
  filename: string;
  contentType: "text/csv; charset=utf-8";
  content: string;
}

export interface BackofficeNdpAggregate {
  ndpCurrency: LedgerCurrency;
  bPlatformFeeActualNdp: number;
  cRequestFeeActualNdp: number;
  penaltyNdp: number;
  userRewardNdp: number;
  compensationToUserNdp: number;
  bPlatformFeeHoldNdp: number;
  cRequestFeeHoldNdp: number;
  releasedNdp: number;
  campaignDiscountNdp: number;
}

export type NdpAmountPair = DashboardNdpPair;

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

export interface BackofficeRepositoryPort {
  getDashboard: (input: DashboardAggregateInput) => Promise<DashboardAggregateFacts>;
  getHeadlineSeries3d: (
    input: DashboardAggregateInput
  ) => Promise<DashboardHeadlineSeriesPoint[]>;
  listManagedUsers: (
    input: BackofficeScope & BackofficeManagedUserListQuery,
    occurredAt: Date
  ) => Promise<PaginatedResponse<BackofficeManagedUserPayload>>;
  getManagedUser: (
    input: BackofficeScope & { userId: number } & Partial<BackofficeManagedUserDetailQuery>,
    occurredAt: Date
  ) => Promise<BackofficeManagedUserDetailRecord | null>;
  listOrders: (
    input: BackofficeScope & BackofficeListQuery
  ) => Promise<PaginatedResponse<BackofficeOrderPayload>>;
  findOrderById: (
    input: BackofficeScope & { id: number }
  ) => Promise<BackofficeOrderDetailPayload | null>;
  listSchedule: (
    input: BackofficeScope & BackofficeListQuery
  ) => Promise<PaginatedResponse<BackofficeScheduleSlotPayload>>;
  listFinanceSettlements: (
    input: BackofficeScope & BackofficeListQuery
  ) => Promise<PaginatedResponse<BackofficeFinanceSettlementPayload>>;
  exportFinanceSettlements: (
    input: BackofficeScope & BackofficeListQuery
  ) => Promise<BackofficeCsvExportPayload>;
  summarizeNdpByCurrency: (input: {
    fromInclusive: Date;
    toExclusive: Date;
  }) => Promise<BackofficeNdpAggregate[]>;
  listTechnicians: (
    input: BackofficeScope & BackofficeListQuery
  ) => Promise<PaginatedResponse<BackofficeTechnicianPayload>>;
  listTechnicianRankings: (
    input: TechnicianRankingRepositoryInput
  ) => Promise<BackofficeTechnicianRankingPayload>;
  listShops: (
    input: BackofficeScope & BackofficeListQuery
  ) => Promise<PaginatedResponse<BackofficeShopPayload>>;
  findUserByEmail: (email: string) => Promise<{ id: number } | null>;
  createShop: (input: BackofficeShopCreateData) => Promise<BackofficeShopPayload>;
  updateShop: (
    id: number,
    input: BackofficeShopUpdateBody,
    mutation?: BackofficeShopMutationContext
  ) => Promise<BackofficeShopPayload | null>;
  updateMerchantShopProfile?: (input: {
    avatar?: { mimeType: string; url: string };
    fields: BackofficeShopUpdateBody;
    identityId: number;
    shopId: number;
    userId: number;
  }) => Promise<BackofficeShopPayload | null>;
  approveShop: (id: number, approvedAt: Date) => Promise<BackofficeShopPayload | null>;
  softDeleteShop: (id: number) => Promise<BackofficeShopPayload | null>;
  updateTechnician: (
    input: ScopedTechnicianUpdateInput
  ) => Promise<BackofficeTechnicianPayload | null>;
  approveTechnician: (
    input: ScopedTechnicianApprovalInput
  ) => Promise<BackofficeTechnicianPayload | null>;
  softDeleteTechnician: (input: ScopedEntityInput) => Promise<BackofficeTechnicianPayload | null>;
  listCustomers: (
    input: BackofficeScope & BackofficeListQuery
  ) => Promise<PaginatedResponse<BackofficeCustomerPayload>>;
  getCustomer: (input: ScopedEntityInput) => Promise<BackofficeCustomerPayload | null>;
  getTechnicianDetail: (
    input: ScopedEntityInput
  ) => Promise<BackofficeTechnicianDetailPayload | null>;
  getCustomerDetail: (input: ScopedEntityInput) => Promise<BackofficeCustomerDetailPayload | null>;
  listCustomerTimeline: (
    input: ScopedEntityInput & BackofficeTimelineQuery
  ) => Promise<PaginatedResponse<BackofficeAuditEventPayload> | null>;
  updateCustomer: (
    id: number,
    input: BackofficeCustomerUpdateBody
  ) => Promise<BackofficeCustomerPayload | null>;
  findCustomerMembershipGrantContext: (
    customerProfileId: number,
    grantedById: number
  ) => Promise<BackofficeCustomerMembershipGrantContext | null>;
  softDeleteCustomer: (id: number) => Promise<BackofficeCustomerPayload | null>;
  listServices: (
    input: BackofficeScope & BackofficeListQuery
  ) => Promise<PaginatedResponse<BackofficeServicePayload>>;
  createService: (input: ScopedServiceCreateInput) => Promise<BackofficeServicePayload>;
  updateService: (input: ScopedServiceUpdateInput) => Promise<BackofficeServicePayload | null>;
  softDeleteService: (input: ScopedEntityInput) => Promise<BackofficeServicePayload | null>;
}

export class BackofficeService {
  private static readonly BCRYPT_ROUNDS = 12;

  public constructor(
    private readonly repository: BackofficeRepositoryPort,
    private readonly auditLogService: AuditLogService,
    private readonly merchantShopContextRepository: MerchantShopContextRepositoryPort,
    private readonly now: () => Date = () => new Date(),
    private readonly avatarStorage?: CustomerAvatarStoragePort,
    analyticsOrMembership?:
      | BackofficeAnalyticsReader
      | Pick<PlatformMembershipService, "changeEntitlement">,
    platformMembershipService?: Pick<PlatformMembershipService, "changeEntitlement">
  ) {
    if (analyticsOrMembership && "getOperationsFinance" in analyticsOrMembership) {
      this.analyticsReader = analyticsOrMembership;
      this.platformMembershipService = platformMembershipService;
    } else {
      this.platformMembershipService = analyticsOrMembership ?? platformMembershipService;
    }
  }

  private readonly analyticsReader?: BackofficeAnalyticsReader;
  private readonly platformMembershipService?: Pick<PlatformMembershipService, "changeEntitlement">;

  public async getDashboardOverview(
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext,
    query: BackofficeDashboardQuery
  ): Promise<DashboardOverviewPayload> {
    const reader = this.requireAnalyticsReader();
    const window = resolveDashboardWindow(query, this.now());
    const city = query.city ?? null;
    const input: DashboardAggregateInput = { scope: { kind: "platform" }, city, window };
    await this.record(
      actor,
      context,
      "backoffice.dashboard.overview.read",
      "backoffice_dashboard_overview",
      { period: window.period, from: window.fromDate, to: window.toDate, city }
    );
    const [operations, commission, growth] = await Promise.all([
      reader.getOperationsFinance(input),
      reader.getCommissionFacts(input),
      reader.getGrowthFacts(input)
    ]);

    return {
      filter: this.analyticsFilter(window, city),
      operationsFinance: DASHBOARD_METRIC_KEYS.slice(0, 4).map((metricKey) =>
        this.composeAnalyticsMetric(metricKey, this.operationsFact(operations, metricKey))
      ),
      commissionMetrics: DASHBOARD_METRIC_KEYS.slice(4, 11).map((metricKey) =>
        this.composeAnalyticsMetric(metricKey, this.commissionFact(commission, metricKey))
      ),
      growthMetrics: DASHBOARD_METRIC_KEYS.slice(11).map((metricKey) =>
        this.composeAnalyticsMetric(metricKey, this.growthFact(growth, metricKey))
      )
    };
  }

  public async getDashboardMetricDetail(
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext,
    metricKey: DashboardMetricKey,
    query: BackofficeDashboardQuery
  ): Promise<DashboardMetricDetailPayload> {
    const reader = this.requireAnalyticsReader();
    const window = resolveDashboardWindow(query, this.now());
    const city = query.city ?? null;
    const input: DashboardAggregateInput = { scope: { kind: "platform" }, city, window };
    await this.record(
      actor,
      context,
      "backoffice.dashboard.metric.read",
      "backoffice_dashboard_metric",
      { metricKey, period: window.period, from: window.fromDate, to: window.toDate, city }
    );

    let fact: DashboardAnalyticsFact;
    const metricIndex = DASHBOARD_METRIC_KEYS.indexOf(metricKey);
    if (metricIndex < 4) {
      fact = this.operationsFact(await reader.getOperationsFinance(input), metricKey);
    } else if (metricIndex < 11) {
      fact = this.commissionFact(await reader.getCommissionFacts(input), metricKey);
    } else {
      fact = this.growthFact(await reader.getGrowthFacts(input), metricKey);
    }
    const metric = this.composeAnalyticsMetric(metricKey, fact);
    const details =
      metricKey === "travel_fare" && reader.getTravelFareDetails
        ? await reader.getTravelFareDetails(input)
        : [];

    return {
      filter: this.analyticsFilter(window, city),
      metric,
      details,
      series: [
        {
          seriesKey: metricKey,
          label: metric.description,
          unit: metric.unit,
          points: [
            {
              key: "previous",
              label: `${window.previousFromDate} - ${window.previousToDate}`,
              value: metric.previousValue
            },
            {
              key: "current",
              label: `${window.fromDate} - ${window.toDate}`,
              value: metric.currentValue
            }
          ]
        }
      ]
    };
  }

  public async getPlatformDashboard(
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext,
    query: BackofficeDashboardQuery
  ): Promise<BackofficeDashboardPayload> {
    const evaluatedAt = this.now();
    const window = resolveDashboardWindow(query, evaluatedAt);
    const headlineWindow = resolveDashboardWindow(
      {
        period: "custom",
        from: shiftCalendarDate(window.toDate, -2),
        to: window.toDate
      },
      evaluatedAt
    );
    const city = query.city ?? null;
    await this.record(actor, context, "backoffice.dashboard.read", "backoffice_dashboard", {
      period: window.period,
      from: window.fromDate,
      to: window.toDate,
      city,
      shopId: null
    });
    const scope = { kind: "platform" } as const;
    const [aggregate, headlineBuckets] = await Promise.all([
      this.repository.getDashboard({ scope, city, window, evaluatedAt }),
      this.repository.getHeadlineSeries3d({
        scope,
        city,
        window: headlineWindow,
        evaluatedAt
      })
    ]);
    return this.composeDashboard(
      aggregate,
      window,
      headlineWindow,
      headlineBuckets,
      city,
      null,
      evaluatedAt
    );
  }

  public async listManagedUsers(
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext,
    input: BackofficeManagedUserListQuery
  ): Promise<PaginatedResponse<BackofficeManagedUserPayload>> {
    await this.record(actor, context, "backoffice.users.list", "User", {
      filters: Object.keys(input).filter((key) => !["page", "pageSize"].includes(key))
    });
    return this.repository.listManagedUsers({ ...input, scope: "platform" }, this.now());
  }

  public async listMerchantManagedUsers(
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext,
    input: BackofficeManagedUserListQuery
  ): Promise<PaginatedResponse<BackofficeManagedUserPayload>> {
    const scope = this.getMerchantScope(actor);
    await this.record(actor, context, "merchant_admin.users.list", "User", {
      shopId: scope.shopId,
      filters: Object.keys(input).filter((key) => !["page", "pageSize"].includes(key))
    });
    return this.repository.listManagedUsers({ ...input, ...scope }, this.now());
  }

  public async getManagedUser(
    userId: number,
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext,
    query: BackofficeManagedUserDetailQuery = { audit_page: 1, audit_page_size: 10 }
  ): Promise<BackofficeManagedUserDetailPayload> {
    await this.record(actor, context, "backoffice.user.read", "User", { userId });
    const detail = this.requireResult(
      await this.repository.getManagedUser({ scope: "platform", userId, ...query }, this.now()),
      "error.user.not_found"
    );
    return this.withManagedUserCapabilities(detail, actor, "platform");
  }

  public async getMerchantManagedUser(
    userId: number,
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext,
    query: BackofficeManagedUserDetailQuery = { audit_page: 1, audit_page_size: 10 }
  ): Promise<BackofficeManagedUserDetailPayload> {
    const scope = this.getMerchantScope(actor);
    await this.record(actor, context, "merchant_admin.user.read", "User", {
      userId,
      shopId: scope.shopId
    });
    const detail = this.requireResult(
      await this.repository.getManagedUser({ ...scope, userId, ...query }, this.now()),
      "error.user.not_found"
    );
    return this.withManagedUserCapabilities(detail, actor, "merchant");
  }

  private withManagedUserCapabilities(
    detail: BackofficeManagedUserDetailRecord,
    actor: AuthenticatedAccessContext,
    scope: "platform" | "merchant"
  ): BackofficeManagedUserDetailPayload {
    const permits = (permission: string) =>
      scope === "platform" && actor.permissions.includes(permission);
    return {
      ...detail,
      capabilities: {
        membershipWrite: permits("backoffice:user-membership:write"),
        reviewAmend: permits("backoffice:customers:write"),
        refundAmend: permits("backoffice:user-refund:amend"),
        partnerWrite: permits("backoffice:partner-profile:write"),
        timelineCommentWrite: permits("backoffice:user-usage:comment")
      }
    };
  }

  public async getMerchantDashboard(
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext,
    query: MerchantDashboardQuery
  ): Promise<BackofficeDashboardPayload> {
    const scope = this.getMerchantScope(actor);
    const evaluatedAt = this.now();
    const window = resolveDashboardWindow(query, evaluatedAt);
    const headlineWindow = resolveDashboardWindow(
      {
        period: "custom",
        from: shiftCalendarDate(window.toDate, -2),
        to: window.toDate
      },
      evaluatedAt
    );
    await this.record(actor, context, "merchant_admin.dashboard.read", "merchant_admin_dashboard", {
      period: window.period,
      from: window.fromDate,
      to: window.toDate,
      city: null,
      shopId: scope.shopId
    });
    const dashboardScope = { kind: "shop", shopId: scope.shopId } as const;
    const [aggregate, headlineBuckets] = await Promise.all([
      this.repository.getDashboard({
        scope: dashboardScope,
        city: null,
        window,
        evaluatedAt
      }),
      this.repository.getHeadlineSeries3d({
        scope: dashboardScope,
        city: null,
        window: headlineWindow,
        evaluatedAt
      })
    ]);
    return this.composeDashboard(
      aggregate,
      window,
      headlineWindow,
      headlineBuckets,
      null,
      scope.shopId,
      evaluatedAt
    );
  }

  public async listManageableMerchantShops(
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext,
    query: ManageableMerchantShopsQuery
  ): Promise<MerchantShopContextPage> {
    let identityScopeType: "shop" | "merchant_account";
    let identityScopeId: number;
    let selectedShopPublicId: string | null = null;

    const identityKind =
      actor.isReadOnlyMerchantPreview === true
        ? "shop"
        : resolveFormalMerchantIdentityKind({
            type: actor.currentIdentityType ?? "",
            scopeType: actor.currentIdentityScopeType ?? null,
            scopeId: actor.currentIdentityScopeId ?? null
          });
    if (identityKind === "shop") {
      identityScopeType = "shop";
      identityScopeId = requireMerchantShopId(actor);
    } else {
      if (identityKind !== "merchant_account" || !actor.currentIdentityScopeId) {
        throw merchantShopIdentityForbidden();
      }
      requireMerchantShopId(actor);
      if (!actor.selectedMerchantShopPublicId) throw merchantShopIdentityForbidden();
      identityScopeType = "merchant_account";
      identityScopeId = actor.currentIdentityScopeId;
      selectedShopPublicId = actor.selectedMerchantShopPublicId;
    }

    const page = await this.merchantShopContextRepository.listManageableShops({
      identityScopeType,
      identityScopeId,
      selectedShopPublicId,
      now: this.now(),
      page: query.page,
      pageSize: query.page_size
    });
    await this.record(
      actor,
      context,
      "merchant_admin.manageable_shops.read",
      "merchant_shop_context",
      { page: query.page, pageSize: query.page_size, total: page.total }
    );
    return page;
  }

  private requireAnalyticsReader(): BackofficeAnalyticsReader {
    if (!this.analyticsReader) throw new Error("Backoffice analytics reader is unavailable");
    return this.analyticsReader;
  }

  private analyticsFilter(
    window: ReturnType<typeof resolveDashboardWindow>,
    city: string | null
  ): DashboardOverviewFilter {
    return {
      period: window.period,
      from: window.fromDate,
      to: window.toDate,
      previousFrom: window.previousFromDate,
      previousTo: window.previousToDate,
      timeZone: window.timeZone,
      granularity: window.granularity,
      city
    };
  }

  private composeAnalyticsMetric(
    metricKey: DashboardMetricKey,
    fact: DashboardAnalyticsFact
  ): AnalyticsMetricPayload {
    const ready = fact.dataStatus === "ready";
    const coherentReadyValues =
      ready && Number.isSafeInteger(fact.current) && Number.isSafeInteger(fact.previous);
    const coherentUnavailableValues = !ready && fact.current === null && fact.previous === null;
    if (!coherentReadyValues && !coherentUnavailableValues) {
      throw new RangeError("Dashboard analytics fact is incoherent");
    }
    const metadata = DASHBOARD_METRIC_METADATA[metricKey];
    return {
      metricKey,
      currentValue: fact.current,
      previousValue: fact.previous,
      ...compareAnalyticsMetric(fact.current, fact.previous),
      unit: metadata.unit,
      dataStatus: fact.dataStatus,
      description: metadata.description,
      formula: metadata.formula,
      detailRoute: metadata.detailRoute
    };
  }

  private operationsFact(
    facts: OperationsFinanceFacts,
    metricKey: DashboardMetricKey
  ): DashboardAnalyticsFact {
    switch (metricKey) {
      case "gross_revenue":
        return facts.grossRevenue;
      case "travel_fare":
        return facts.travelFare;
      case "discount_amount":
        return facts.discountAmount;
      case "consumables_sales":
        return facts.consumablesSales;
      default:
        throw new RangeError("Dashboard analytics metric group is invalid");
    }
  }

  private commissionFact(
    facts: CommissionFacts,
    metricKey: DashboardMetricKey
  ): DashboardAnalyticsFact {
    switch (metricKey) {
      case "dedicated_technician_commission":
        return facts.dedicatedTechnicianCommission;
      case "part_time_technician_commission":
        return facts.partTimeTechnicianCommission;
      case "marketing_commission":
        return facts.marketingCommission;
      case "agent_commission":
        return facts.agentCommission;
      case "ndp_income":
        return facts.ndpIncome;
      case "affiliate_platform_income":
        return facts.affiliatePlatformIncome;
      case "consumables_profit":
        return facts.consumablesProfit;
      default:
        throw new RangeError("Dashboard analytics metric group is invalid");
    }
  }

  private growthFact(facts: GrowthFacts, metricKey: DashboardMetricKey): DashboardAnalyticsFact {
    switch (metricKey) {
      case "new_users":
        return facts.newUsers;
      case "new_paid_members":
        return facts.newPaidMembers;
      case "technician_onboarding":
        return facts.technicianOnboarding;
      case "agent_onboarding":
        return facts.agentOnboarding;
      case "franchisee_onboarding":
        return facts.franchiseeOnboarding;
      case "supplier_onboarding":
        return facts.supplierOnboarding;
      default:
        throw new RangeError("Dashboard analytics metric group is invalid");
    }
  }

  private composeDashboard(
    aggregate: DashboardAggregateFacts,
    window: ReturnType<typeof resolveDashboardWindow>,
    headlineWindow: ReturnType<typeof resolveDashboardWindow>,
    headlineBuckets: DashboardHeadlineSeriesPoint[],
    city: string | null,
    shopId: number | null,
    evaluatedAt: Date
  ): BackofficeDashboardPayload {
    const isPlatform = shopId === null;
    const merchantFacts = isPlatform
      ? null
      : this.requireResult(aggregate.merchant, "error.shop.not_found");
    const shop = merchantFacts
      ? new DashboardMerchantSnapshotService(undefined, () => evaluatedAt).compose(merchantFacts)
      : null;
    const globalPair = (pair: DashboardNdpPair | null): DashboardPlatformGlobalNdpPair => ({
      ...(pair ?? { ndp: 0, testNdp: 0 }),
      cityFilterApplied: false,
      scopeLabel: "platform_global"
    });
    const shopNdpCost = isPlatform
      ? null
      : (aggregate.finance.shopNdpCost ?? {
          totalNdp: 0,
          platformNdp: 0,
          userRewardNdp: 0
        });
    const membershipFacts = aggregate.membership;
    if (!isPlatform && !membershipFacts) {
      throw new AppError({
        code: ERROR_CODES.DEPENDENCY_UNAVAILABLE,
        message: "error.dependency_unavailable",
        statusCode: 503
      });
    }

    return {
      filter: {
        period: window.period,
        from: window.fromDate,
        to: window.toDate,
        previousFrom: window.previousFromDate,
        previousTo: window.previousToDate,
        timeZone: window.timeZone,
        granularity: window.granularity,
        city: isPlatform ? city : null,
        availableCities: isPlatform ? aggregate.availableCities : []
      },
      summary: {
        availableScheduleSlots: this.dashboardComparison(
          aggregate.current.availableScheduleSlots,
          aggregate.previous.availableScheduleSlots
        ),
        activeTechnicians: this.dashboardComparison(
          aggregate.current.activeTechnicians,
          aggregate.previous.activeTechnicians
        ),
        registeredTechnicians: this.dashboardComparison(
          aggregate.current.registeredTechnicians,
          aggregate.previous.registeredTechnicians
        ),
        shopCount: isPlatform
          ? this.dashboardComparison(
              aggregate.current.shopCount ?? 0,
              aggregate.previous.shopCount ?? 0
            )
          : null,
        newCustomers: isPlatform
          ? this.dashboardComparison(
              aggregate.current.newCustomers ?? 0,
              aggregate.previous.newCustomers ?? 0
            )
          : null,
        pendingOrders: aggregate.current.pendingOrders,
        serviceGmvJpy: aggregate.current.serviceGmvJpy
      },
      series: {
        buckets: aggregate.buckets.map((bucket) => ({
          ...bucket,
          platformNetRevenueNdp: aggregate.finance.bucketPlatformNetRevenueNdp.get(bucket.key) ?? 0,
          frozenNdp: aggregate.finance.bucketFrozenNdp.get(bucket.key) ?? 0,
          shopEstimatedGrossProfitJpy:
            aggregate.finance.bucketShopEstimatedGrossProfitJpy.get(bucket.key) ?? 0
        }))
      },
      headlineSeries3d: {
        from: headlineWindow.fromDate,
        to: headlineWindow.toDate,
        timeZone: "Asia/Tokyo",
        buckets: headlineBuckets
      },
      finance: {
        platformNetRevenue: aggregate.finance.platformNetRevenue,
        frozen: aggregate.finance.frozen,
        userReward: aggregate.finance.userReward,
        walletStock: isPlatform ? globalPair(aggregate.finance.walletStock) : null,
        withdrawn: isPlatform ? globalPair(aggregate.finance.withdrawn) : null,
        shopNdpCost
      },
      shop,
      membership:
        isPlatform || !membershipFacts
          ? null
          : {
              memberCount: membershipFacts.memberCount,
              memberDataStatus: "ready",
              completedCustomerCount: membershipFacts.completedCustomerCount
            },
      scope: merchantFacts
        ? { kind: "shop", shopPublicId: merchantFacts.publicId }
        : { kind: "platform", shopPublicId: null }
    };
  }

  private dashboardComparison(current: number, previous: number): DashboardMetricComparison {
    return {
      current,
      previous,
      changeRatePercent:
        previous === 0 ? null : Number((((current - previous) / previous) * 100).toFixed(2))
    };
  }

  public async listPlatformOrders(
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext,
    input: BackofficeListQuery
  ): Promise<PaginatedResponse<BackofficeOrderPayload>> {
    await this.record(actor, context, "backoffice.orders.list", "booking_order");

    return this.repository.listOrders({ ...input, scope: "platform" });
  }

  public async getPlatformOrder(
    id: number,
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext
  ): Promise<BackofficeOrderDetailPayload> {
    await this.record(
      actor,
      context,
      "backoffice.order.read",
      "booking_order",
      { bookingOrderId: id },
      id
    );
    return this.requireResult(
      await this.repository.findOrderById({ scope: "platform", id }),
      "error.order.not_found"
    );
  }

  public async listMerchantOrders(
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext,
    input: BackofficeListQuery
  ): Promise<PaginatedResponse<BackofficeOrderPayload>> {
    const scope = this.getMerchantScope(actor);
    await this.record(actor, context, "merchant_admin.orders.list", "booking_order", {
      shopId: scope.shopId
    });

    return this.repository.listOrders({ ...input, ...scope });
  }

  public async listPlatformSchedule(
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext,
    input: BackofficeListQuery
  ): Promise<PaginatedResponse<BackofficeScheduleSlotPayload>> {
    await this.record(actor, context, "backoffice.schedule.list", "schedule_slot");

    return this.repository.listSchedule({ ...input, scope: "platform" });
  }

  public async listMerchantSchedule(
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext,
    input: BackofficeListQuery
  ): Promise<PaginatedResponse<BackofficeScheduleSlotPayload>> {
    const scope = this.getMerchantScope(actor);
    await this.record(actor, context, "merchant_admin.schedule.list", "schedule_slot", {
      shopId: scope.shopId
    });

    return this.repository.listSchedule({ ...input, ...scope });
  }

  public async listPlatformFinance(
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext,
    input: BackofficeListQuery
  ): Promise<PaginatedResponse<BackofficeFinanceSettlementPayload>> {
    await this.record(actor, context, "backoffice.finance.list", "finance_reconciliation");

    return this.repository.listFinanceSettlements({ ...input, scope: "platform" });
  }

  public async getPlatformNdpSummary(
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext,
    input: BackofficeNdpSummaryQuery
  ): Promise<BackofficeNdpSummaryPayload> {
    const date = input.date ?? toTokyoCalendarDate(this.now());
    const fromInclusive = startOfTokyoCalendarDate(date);
    const toExclusive = startOfTokyoCalendarDate(shiftCalendarDate(date, 1));
    await this.record(
      actor,
      context,
      "backoffice.finance.ndp_summary.read",
      "finance_ndp_summary",
      {
        date,
        timeZone: "Asia/Tokyo"
      }
    );

    const aggregates = await this.repository.summarizeNdpByCurrency({
      fromInclusive,
      toExclusive
    });
    const byCurrency = new Map(aggregates.map((aggregate) => [aggregate.ndpCurrency, aggregate]));
    const empty: BackofficeNdpAggregate = {
      ndpCurrency: "NDP",
      bPlatformFeeActualNdp: 0,
      cRequestFeeActualNdp: 0,
      penaltyNdp: 0,
      userRewardNdp: 0,
      compensationToUserNdp: 0,
      bPlatformFeeHoldNdp: 0,
      cRequestFeeHoldNdp: 0,
      releasedNdp: 0,
      campaignDiscountNdp: 0
    };
    const formal = byCurrency.get("NDP") ?? empty;
    const test = byCurrency.get("TEST_NDP") ?? { ...empty, ndpCurrency: "TEST_NDP" };
    const pair = (selector: (aggregate: BackofficeNdpAggregate) => number): NdpAmountPair => ({
      ndp: selector(formal),
      testNdp: selector(test)
    });
    const consumption = (aggregate: BackofficeNdpAggregate): number =>
      aggregate.bPlatformFeeActualNdp + aggregate.cRequestFeeActualNdp + aggregate.penaltyNdp;
    const netRevenue = (aggregate: BackofficeNdpAggregate): number =>
      consumption(aggregate) - aggregate.userRewardNdp - aggregate.compensationToUserNdp;
    const pendingHold = (aggregate: BackofficeNdpAggregate): number =>
      Math.max(
        0,
        aggregate.bPlatformFeeHoldNdp +
          aggregate.cRequestFeeHoldNdp -
          aggregate.bPlatformFeeActualNdp -
          aggregate.cRequestFeeActualNdp -
          aggregate.releasedNdp
      );
    const platformNetRevenue = pair(netRevenue);

    return {
      period: { date, timeZone: "Asia/Tokyo" },
      todayNdpConsumption: pair(consumption),
      platformNetRevenue,
      requestFeeRevenue: pair((aggregate) => aggregate.cRequestFeeActualNdp),
      userRewardCost: pair((aggregate) => aggregate.userRewardNdp),
      pendingHold: pair(pendingHold),
      campaignDiscount: pair((aggregate) => aggregate.campaignDiscountNdp),
      settleableNdp: platformNetRevenue.ndp
    };
  }

  public async listMerchantFinance(
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext,
    input: BackofficeListQuery
  ): Promise<PaginatedResponse<BackofficeFinanceSettlementPayload>> {
    const scope = this.getMerchantScope(actor);
    await this.record(actor, context, "merchant_admin.finance.list", "finance_reconciliation", {
      shopId: scope.shopId
    });

    return this.repository.listFinanceSettlements({ ...input, ...scope });
  }

  public async exportPlatformFinance(
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext,
    input: BackofficeListQuery
  ): Promise<BackofficeCsvExportPayload> {
    await this.record(actor, context, "backoffice.finance.export", "finance_settlement_export");

    return this.repository.exportFinanceSettlements({ ...input, scope: "platform" });
  }

  public async exportMerchantFinance(
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext,
    input: BackofficeListQuery
  ): Promise<BackofficeCsvExportPayload> {
    const scope = this.getMerchantScope(actor);
    await this.record(
      actor,
      context,
      "merchant_admin.finance.export",
      "finance_settlement_export",
      { shopId: scope.shopId }
    );

    return this.repository.exportFinanceSettlements({ ...input, ...scope });
  }

  public async listPlatformTechnicians(
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext,
    input: BackofficeListQuery
  ): Promise<PaginatedResponse<BackofficeTechnicianPayload>> {
    await this.record(actor, context, "backoffice.technicians.list", "technician_profile");

    return this.repository.listTechnicians({ ...input, scope: "platform" });
  }

  public async listPlatformTechnicianRankings(
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext,
    input: BackofficeTechnicianRankingQuery
  ): Promise<BackofficeTechnicianRankingResponsePayload> {
    const window = resolveTechnicianRankingWindow(input);
    await this.record(actor, context, "backoffice.technician_rankings.list", "technician_ranking", {
      period: window.period,
      from: window.fromDate,
      to: window.toDate,
      sortBy: input.sortBy,
      sortOrder: input.sortOrder
    });
    const ranking = await this.repository.listTechnicianRankings({
      scope: "platform",
      ...input,
      window
    });

    return {
      ...ranking,
      period: {
        key: window.period,
        timeZone: window.timeZone,
        from: window.fromDate,
        to: window.toDate
      }
    };
  }

  public async exportPlatformTechnicianRankings(
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext,
    input: BackofficeTechnicianRankingQuery
  ): Promise<BackofficeCsvExportPayload> {
    const window = resolveTechnicianRankingWindow(input);
    await this.record(
      actor,
      context,
      "backoffice.technician_rankings.export",
      "technician_ranking_export",
      {
        period: window.period,
        from: window.fromDate,
        to: window.toDate,
        sortBy: input.sortBy,
        sortOrder: input.sortOrder
      }
    );

    const rows: BackofficeTechnicianRankingRowPayload[] = [];
    const pageSize = 100;
    const exportLimit = 5000;
    let page = 1;
    let total = 0;
    let receivedRows = 0;
    do {
      const result = await this.repository.listTechnicianRankings({
        scope: "platform",
        ...input,
        page,
        pageSize,
        window
      });
      rows.push(...result.list.slice(0, exportLimit - rows.length));
      receivedRows = result.list.length;
      total = result.total;
      page += 1;
    } while (receivedRows > 0 && rows.length < total && rows.length < exportLimit);

    const csvRows = [
      [
        "rank",
        "technicianProfileId",
        "displayName",
        "shopName",
        "city",
        "completedServiceAmountJpy",
        "completedOrderCount",
        "workingDayCount",
        "averageOrderValueJpy"
      ],
      ...rows
        .slice(0, exportLimit)
        .map((row) => [
          row.rank,
          row.technicianProfileId,
          row.displayName,
          row.shopName ?? "",
          row.city,
          row.completedServiceAmountJpy,
          row.completedOrderCount,
          row.workingDayCount,
          row.completedOrderCount === 0
            ? 0
            : Math.round(row.completedServiceAmountJpy / row.completedOrderCount)
        ])
    ];
    const content = `\uFEFF${csvRows
      .map((row) => row.map((value) => this.escapeCsvCell(value)).join(","))
      .join("\n")}`;
    const range = window.fromDate && window.toDate ? `${window.fromDate}_${window.toDate}` : "all";

    return {
      filename: `technician-rankings-${window.period}-${range}.csv`,
      contentType: "text/csv; charset=utf-8",
      content
    };
  }

  public async listMerchantTechnicians(
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext,
    input: BackofficeListQuery
  ): Promise<PaginatedResponse<BackofficeTechnicianPayload>> {
    const scope = this.getMerchantScope(actor);
    await this.record(actor, context, "merchant_admin.technicians.list", "technician_profile", {
      shopId: scope.shopId
    });

    return this.repository.listTechnicians({ ...input, ...scope });
  }

  public async getPlatformTechnician(
    id: number,
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext
  ): Promise<BackofficeTechnicianDetailPayload> {
    await this.record(actor, context, "backoffice.technician.read", "TechnicianProfile", {
      technicianProfileId: id
    });
    return this.requireResult(
      await this.repository.getTechnicianDetail({ scope: "platform", id }),
      "error.technician.not_found"
    );
  }

  public async getMerchantTechnician(
    id: number,
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext
  ): Promise<BackofficeTechnicianDetailPayload> {
    const scope = this.getMerchantScope(actor);
    await this.record(actor, context, "merchant_admin.technician.read", "TechnicianProfile", {
      technicianProfileId: id,
      shopId: scope.shopId
    });
    return this.requireResult(
      await this.repository.getTechnicianDetail({ ...scope, id }),
      "error.technician.not_found"
    );
  }

  public async listPlatformShops(
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext,
    input: BackofficeListQuery
  ): Promise<PaginatedResponse<BackofficeShopPayload>> {
    await this.record(actor, context, "backoffice.shops.list", "shop");

    return this.repository.listShops({ ...input, scope: "platform" });
  }

  public async getMerchantShop(
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext
  ): Promise<PaginatedResponse<BackofficeShopPayload>> {
    const scope = this.getMerchantScope(actor);
    await this.record(actor, context, "merchant_admin.shop.read", "shop", {
      shopId: scope.shopId
    });

    return this.repository.listShops({ ...scope, page: 1, pageSize: 1 });
  }

  public async createPlatformShop(
    input: BackofficeShopCreateBody,
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext
  ): Promise<BackofficeShopPayload> {
    if (await this.repository.findUserByEmail(input.ownerEmail)) {
      throw this.emailExistsError();
    }

    let shop: BackofficeShopPayload;
    try {
      shop = await this.repository.createShop({
        ...input,
        ownerPasswordHash: await hash(input.ownerPassword, BackofficeService.BCRYPT_ROUNDS),
        verifiedById: actor.userId,
        serviceLocationAudit: this.createVerifiedServiceLocationAudit(input, actor, context)
      });
    } catch (error) {
      if (error instanceof UserBootstrapKeyAllocationExhaustedError) {
        throw this.needoIdAllocationUnavailableError();
      }
      if (this.isUniqueConstraintError(error)) {
        throw this.emailExistsError();
      }
      throw error;
    }
    await this.record(actor, context, "backoffice.shop.create", "Shop", {
      shopId: shop.id,
      ownerUserId: shop.ownerUserId
    });

    return shop;
  }

  public async updatePlatformShop(
    id: number,
    input: BackofficeShopUpdateBody,
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext
  ): Promise<BackofficeShopPayload> {
    const shop = this.requireResult(
      await this.repository.updateShop(id, input, {
        verifiedById: actor.userId,
        serviceLocationAudit: this.createVerifiedServiceLocationAudit(input, actor, context)
      }),
      "error.shop.not_found"
    );
    await this.record(actor, context, "backoffice.shop.update", "Shop", {
      shopId: id,
      changedFields: Object.keys(input)
    });
    return shop;
  }

  public async updateMerchantShop(
    input: MerchantShopUpdateBody,
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext
  ): Promise<BackofficeShopPayload> {
    const scope = this.getMerchantScope(actor);
    if (!actor.currentIdentityId) {
      throw new AppError({
        code: ERROR_CODES.IDENTITY_FORBIDDEN,
        message: "error.identity.forbidden",
        statusCode: 403
      });
    }
    const { avatarDataUrl, ...fields } = input;
    let avatar: { mimeType: string; url: string } | undefined;
    if (avatarDataUrl) {
      if (!this.avatarStorage || !this.repository.updateMerchantShopProfile) {
        throw new AppError({
          code: ERROR_CODES.INTERNAL,
          message: "error.shop.avatar_unavailable",
          statusCode: 500
        });
      }
      const saved = await this.avatarStorage.save(avatarDataUrl);
      avatar = { mimeType: saved.mimeType, url: saved.url };
    }
    const shop = this.requireResult(
      this.repository.updateMerchantShopProfile
        ? await this.repository.updateMerchantShopProfile({
            avatar,
            fields,
            identityId: actor.currentIdentityId,
            shopId: scope.shopId,
            userId: actor.userId
          })
        : await this.repository.updateShop(scope.shopId, fields),
      "error.shop.not_found"
    );
    await this.record(actor, context, "merchant_admin.shop.update", "Shop", {
      shopId: scope.shopId,
      changedFields: Object.keys(input).map((field) =>
        field === "avatarDataUrl" ? "avatar" : field
      )
    });
    return shop;
  }

  public async approvePlatformShop(
    id: number,
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext
  ): Promise<BackofficeShopPayload> {
    const shop = this.requireResult(
      await this.repository.approveShop(id, new Date()),
      "error.shop.not_found"
    );
    await this.record(actor, context, "backoffice.shop.approve", "Shop", { shopId: id });
    return shop;
  }

  public async deletePlatformShop(
    id: number,
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext
  ): Promise<BackofficeShopPayload> {
    const shop = this.requireResult(
      await this.repository.softDeleteShop(id),
      "error.shop.not_found"
    );
    await this.record(actor, context, "backoffice.shop.delete", "Shop", { shopId: id });
    return shop;
  }

  public async updatePlatformTechnician(
    technicianId: number,
    input: BackofficeTechnicianUpdateBody,
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext
  ): Promise<BackofficeTechnicianPayload> {
    const technician = this.requireResult(
      await this.repository.updateTechnician({ ...input, scope: "platform", technicianId }),
      "error.technician.not_found"
    );
    await this.record(actor, context, "backoffice.technician.update", "TechnicianProfile", {
      technicianId,
      changedFields: Object.keys(input)
    });
    return technician;
  }

  public async updateMerchantTechnician(
    technicianId: number,
    input: BackofficeTechnicianUpdateBody,
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext
  ): Promise<BackofficeTechnicianPayload> {
    const scope = this.getMerchantScope(actor);
    const safeInput: Omit<BackofficeTechnicianUpdateBody, "shopId"> = {
      ...(input.displayName !== undefined ? { displayName: input.displayName } : {}),
      ...(input.city !== undefined ? { city: input.city } : {}),
      ...(input.serviceArea !== undefined ? { serviceArea: input.serviceArea } : {}),
      ...(input.employmentType !== undefined ? { employmentType: input.employmentType } : {}),
      ...(input.employmentStartedAt !== undefined
        ? { employmentStartedAt: input.employmentStartedAt }
        : {}),
      ...(input.isRecommended !== undefined ? { isRecommended: input.isRecommended } : {})
    };
    const technician = this.requireResult(
      await this.repository.updateTechnician({ ...scope, technicianId, ...safeInput }),
      "error.technician.not_found"
    );
    await this.record(actor, context, "merchant_admin.technician.update", "TechnicianProfile", {
      technicianId,
      shopId: scope.shopId,
      changedFields: Object.keys(safeInput)
    });
    return technician;
  }

  public async approvePlatformTechnician(
    technicianId: number,
    input: BackofficeTechnicianApproveBody,
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext
  ): Promise<BackofficeTechnicianPayload> {
    const technician = this.requireResult(
      await this.repository.approveTechnician({
        scope: "platform",
        technicianId,
        shopId: input.shopId,
        approvedAt: new Date()
      }),
      "error.technician.not_found"
    );
    await this.record(actor, context, "backoffice.technician.approve", "TechnicianProfile", {
      technicianId,
      shopId: technician.shopId
    });
    return technician;
  }

  public async approveMerchantTechnician(
    technicianId: number,
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext
  ): Promise<BackofficeTechnicianPayload> {
    const scope = this.getMerchantScope(actor);
    const technician = this.requireResult(
      await this.repository.approveTechnician({ ...scope, technicianId, approvedAt: new Date() }),
      "error.technician.not_found"
    );
    await this.record(actor, context, "merchant_admin.technician.approve", "TechnicianProfile", {
      technicianId,
      shopId: scope.shopId
    });
    return technician;
  }

  public async deletePlatformTechnician(
    technicianId: number,
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext
  ): Promise<BackofficeTechnicianPayload> {
    return this.deleteTechnician(
      { scope: "platform" },
      technicianId,
      actor,
      context,
      "backoffice.technician.delete"
    );
  }

  public async deleteMerchantTechnician(
    technicianId: number,
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext
  ): Promise<BackofficeTechnicianPayload> {
    return this.deleteTechnician(
      this.getMerchantScope(actor),
      technicianId,
      actor,
      context,
      "merchant_admin.technician.delete"
    );
  }

  public async listPlatformCustomers(
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext,
    input: BackofficeListQuery
  ): Promise<PaginatedResponse<BackofficeCustomerPayload>> {
    await this.record(actor, context, "backoffice.customers.list", "CustomerProfile");
    return this.repository.listCustomers({ ...input, scope: "platform" });
  }

  public async listMerchantCustomers(
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext,
    input: BackofficeListQuery
  ): Promise<PaginatedResponse<BackofficeCustomerPayload>> {
    const scope = this.getMerchantScope(actor);
    await this.record(actor, context, "merchant_admin.customers.list", "CustomerProfile", {
      shopId: scope.shopId
    });
    return this.repository.listCustomers({ ...input, ...scope });
  }

  public async getPlatformCustomer(
    id: number,
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext
  ): Promise<BackofficeCustomerDetailPayload> {
    await this.record(actor, context, "backoffice.customer.read", "CustomerProfile", {
      customerProfileId: id
    });
    return this.requireResult(
      await this.repository.getCustomerDetail({ scope: "platform", id }),
      "error.customer.not_found"
    );
  }

  public async getMerchantCustomer(
    id: number,
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext
  ): Promise<BackofficeCustomerDetailPayload> {
    const scope = this.getMerchantScope(actor);
    await this.record(actor, context, "merchant_admin.customer.read", "CustomerProfile", {
      customerProfileId: id,
      shopId: scope.shopId
    });
    return this.requireResult(
      await this.repository.getCustomerDetail({ ...scope, id }),
      "error.customer.not_found"
    );
  }

  public async getPlatformCustomerTimeline(
    id: number,
    _actor: AuthenticatedAccessContext,
    _context: AuthRequestContext,
    input: BackofficeTimelineQuery
  ): Promise<PaginatedResponse<BackofficeAuditEventPayload>> {
    return this.requireResult(
      await this.repository.listCustomerTimeline({ ...input, scope: "platform", id }),
      "error.customer.not_found"
    );
  }

  public async getMerchantCustomerTimeline(
    id: number,
    actor: AuthenticatedAccessContext,
    _context: AuthRequestContext,
    input: BackofficeTimelineQuery
  ): Promise<PaginatedResponse<BackofficeAuditEventPayload>> {
    const scope = this.getMerchantScope(actor);
    return this.requireResult(
      await this.repository.listCustomerTimeline({ ...input, ...scope, id }),
      "error.customer.not_found"
    );
  }

  public async updatePlatformCustomer(
    id: number,
    input: BackofficeCustomerUpdateBody,
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext
  ): Promise<BackofficeCustomerPayload> {
    const customer = this.requireResult(
      await this.repository.updateCustomer(id, input),
      "error.customer.not_found"
    );
    await this.record(actor, context, "backoffice.customer.update", "CustomerProfile", {
      customerProfileId: id,
      changedFields: Object.keys(input)
    });
    return customer;
  }

  public async assignPlatformCustomerMembership(
    id: number,
    input: BackofficeCustomerMembershipGrantBody,
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext
  ): Promise<BackofficeCustomerMembershipGrantPayload> {
    const grantContext = this.requireResult(
      await this.repository.findCustomerMembershipGrantContext(id, actor.userId),
      "error.customer.not_found"
    );
    const membership = await this.requirePlatformMembershipService().changeEntitlement(
      actor,
      context,
      grantContext.customerUserId,
      {
        kind: "grant",
        targetTierCode: input.membershipLevel,
        billingCycle: input.durationValue === 12 ? "annual" : "monthly",
        source: "operations",
        sourceReference: `backoffice:customer:${id}:membership:${input.membershipLevel}:${input.startsAt}`,
        expectedCurrentLockVersion: null
      }
    );
    return {
      membershipLevel: membership.tierCode,
      membershipGrantMode: "operator_complimentary",
      membershipDurationUnit: "month",
      membershipDurationValue: input.durationValue,
      membershipStartsAt: membership.startsAt.toISOString(),
      membershipExpiresAt: membership.expiresAt?.toISOString() ?? null,
      membershipGrantedBy: grantContext.membershipGrantedBy
    };
  }

  public async deletePlatformCustomer(
    id: number,
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext
  ): Promise<BackofficeCustomerPayload> {
    const customer = this.requireResult(
      await this.repository.softDeleteCustomer(id),
      "error.customer.not_found"
    );
    await this.record(actor, context, "backoffice.customer.delete", "CustomerProfile", {
      customerProfileId: id
    });
    return customer;
  }

  public async listPlatformServices(
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext,
    input: BackofficeListQuery
  ): Promise<PaginatedResponse<BackofficeServicePayload>> {
    await this.record(actor, context, "backoffice.services.list", "Service");
    return this.repository.listServices({ ...input, scope: "platform" });
  }

  public async listMerchantServices(
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext,
    input: BackofficeListQuery
  ): Promise<PaginatedResponse<BackofficeServicePayload>> {
    const scope = this.getMerchantScope(actor);
    await this.record(actor, context, "merchant_admin.services.list", "Service", {
      shopId: scope.shopId
    });
    return this.repository.listServices({ ...input, ...scope });
  }

  public async createPlatformService(
    shopId: number,
    input: BackofficeServiceCreateBody,
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext
  ): Promise<BackofficeServicePayload> {
    return this.createService(
      { ...input, scope: "platform", shopId },
      actor,
      context,
      "backoffice.service.create"
    );
  }

  public async createMerchantService(
    input: BackofficeServiceCreateBody,
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext
  ): Promise<BackofficeServicePayload> {
    const scope = this.getMerchantScope(actor);
    return this.createService(
      { ...input, ...scope },
      actor,
      context,
      "merchant_admin.service.create"
    );
  }

  public async updatePlatformService(
    serviceId: number,
    input: BackofficeServiceUpdateBody,
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext
  ): Promise<BackofficeServicePayload> {
    return this.updateService(
      { ...input, scope: "platform", serviceId },
      actor,
      context,
      "backoffice.service.update"
    );
  }

  public async updateMerchantService(
    serviceId: number,
    input: BackofficeServiceUpdateBody,
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext
  ): Promise<BackofficeServicePayload> {
    const scope = this.getMerchantScope(actor);
    return this.updateService(
      { ...input, ...scope, serviceId },
      actor,
      context,
      "merchant_admin.service.update"
    );
  }

  public async deletePlatformService(
    serviceId: number,
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext
  ): Promise<BackofficeServicePayload> {
    return this.deleteService(
      { scope: "platform" },
      serviceId,
      actor,
      context,
      "backoffice.service.delete"
    );
  }

  public async deleteMerchantService(
    serviceId: number,
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext
  ): Promise<BackofficeServicePayload> {
    return this.deleteService(
      this.getMerchantScope(actor),
      serviceId,
      actor,
      context,
      "merchant_admin.service.delete"
    );
  }

  private async deleteTechnician(
    scope: BackofficeScope,
    technicianId: number,
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext,
    action: string
  ): Promise<BackofficeTechnicianPayload> {
    const technician = this.requireResult(
      await this.repository.softDeleteTechnician({ ...scope, id: technicianId }),
      "error.technician.not_found"
    );
    await this.record(actor, context, action, "TechnicianProfile", {
      technicianId,
      ...(scope.scope === "merchant" ? { shopId: scope.shopId } : {})
    });
    return technician;
  }

  private async createService(
    input: ScopedServiceCreateInput,
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext,
    action: string
  ): Promise<BackofficeServicePayload> {
    const service = await this.repository.createService(input);
    await this.record(actor, context, action, "Service", {
      serviceId: service.id,
      shopId: service.shopId
    });
    return service;
  }

  private async updateService(
    input: ScopedServiceUpdateInput,
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext,
    action: string
  ): Promise<BackofficeServicePayload> {
    const service = this.requireResult(
      await this.repository.updateService(input),
      "error.service.not_found"
    );
    await this.record(actor, context, action, "Service", {
      serviceId: input.serviceId,
      shopId: service.shopId,
      changedFields: Object.keys(input).filter(
        (key) => !["scope", "shopId", "serviceId"].includes(key)
      )
    });
    return service;
  }

  private async deleteService(
    scope: BackofficeScope,
    serviceId: number,
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext,
    action: string
  ): Promise<BackofficeServicePayload> {
    const service = this.requireResult(
      await this.repository.softDeleteService({ ...scope, id: serviceId }),
      "error.service.not_found"
    );
    await this.record(actor, context, action, "Service", { serviceId, shopId: service.shopId });
    return service;
  }

  private createVerifiedServiceLocationAudit(
    input: {
      serviceCountryCode?: "JP";
      serviceAdmin1Code?: string;
      serviceAdmin2Code?: string;
    },
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext
  ): AuditLogCreateInput | undefined {
    if (!input.serviceCountryCode || !input.serviceAdmin1Code || !input.serviceAdmin2Code) {
      return undefined;
    }
    return this.auditLogService.createInput({
      actor,
      action: "backoffice.shop.service_location.verify",
      targetType: "shop",
      targetId: null,
      context,
      metadata: {
        countryCode: input.serviceCountryCode,
        admin1Code: input.serviceAdmin1Code,
        admin2Code: input.serviceAdmin2Code
      }
    });
  }

  private requireResult<T>(value: T | null, message: string): T {
    if (!value) {
      throw new AppError({ code: ERROR_CODES.NOT_FOUND, message, statusCode: 404 });
    }
    return value;
  }

  private requirePlatformMembershipService(): Pick<PlatformMembershipService, "changeEntitlement"> {
    if (this.platformMembershipService) return this.platformMembershipService;
    throw new AppError({
      code: ERROR_CODES.INTERNAL,
      message: "error.platform_membership.service_unavailable",
      statusCode: 500
    });
  }

  private emailExistsError(): AppError {
    return new AppError({
      code: ERROR_CODES.EMAIL_ALREADY_EXISTS,
      message: "error.user.email_exists",
      statusCode: 409
    });
  }

  private needoIdAllocationUnavailableError(): AppError {
    return new AppError({
      code: ERROR_CODES.NEEDO_ID_ALLOCATION_UNAVAILABLE,
      message: "error.auth.needo_id_allocation_unavailable",
      statusCode: 503
    });
  }

  private isUniqueConstraintError(error: unknown): boolean {
    return Boolean(error && typeof error === "object" && "code" in error && error.code === "P2002");
  }

  private getMerchantScope(
    actor: AuthenticatedAccessContext
  ): BackofficeScope & { scope: "merchant" } {
    return { scope: "merchant", shopId: requireMerchantShopId(actor) };
  }

  private record(
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext,
    action: string,
    targetType: string,
    metadata?: unknown,
    targetId?: number
  ): Promise<void> {
    return this.auditLogService.record({
      actor,
      action,
      targetType,
      targetId,
      context,
      metadata
    });
  }

  private escapeCsvCell(value: number | string): string {
    const rawText = String(value);
    const text = /^[\t\r\n ]*[=+\-@]/.test(rawText) ? `'${rawText}` : rawText;
    return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  }
}
