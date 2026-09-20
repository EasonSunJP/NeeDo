import type { DashboardGranularity, DashboardPeriod, DashboardWindow } from "./dashboard-period";

export type {
  AnalyticsComparisonDirection,
  AnalyticsDataStatus,
  AnalyticsMetricPayload,
  AnalyticsMetricSeries
} from "./analytics-metric";

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
  scheduleAttendanceCount: number;
}

export interface DashboardAggregateInput {
  scope: { kind: "platform" } | { kind: "shop"; shopId: number };
  city: string | null;
  window: DashboardWindow;
  evaluatedAt?: Date;
}

export interface DashboardNdpPair {
  ndp: number;
  testNdp: number;
}

export interface DashboardMetricComparison {
  current: number;
  previous: number;
  changeRatePercent: number | null;
}

export interface DashboardHeadlineSeriesPoint {
  key: string;
  label: string;
  availableScheduleSlots: number;
  activeTechnicians: number;
  registeredTechnicians: number;
  shopCount: number;
  newCustomers: number;
}

export interface DashboardHeadlineSeries3d {
  from: string;
  to: string;
  timeZone: "Asia/Tokyo";
  buckets: DashboardHeadlineSeriesPoint[];
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

export interface DashboardFinanceFacts {
  platformNetRevenue: DashboardNdpPair;
  frozen: DashboardNdpPair;
  userReward: DashboardNdpPair;
  walletStock: DashboardNdpPair | null;
  withdrawn: DashboardNdpPair | null;
  shopNdpCost: DashboardShopNdpCost | null;
  bucketPlatformNetRevenueNdp: Map<string, number>;
  bucketFrozenNdp: Map<string, number>;
  bucketShopEstimatedGrossProfitJpy: Map<string, number>;
}

export interface DashboardMerchantFacts {
  publicId: string;
  name: string;
  city: string;
  address: string;
  status: string;
  activeTechnicianCount: number;
  billing: {
    cadence: "monthly" | "annual" | "free";
    trialStatus: "not_started" | "active" | "completed" | "interrupted" | "not_applicable";
    trialEndsAt: Date | null;
    paidThrough: Date | null;
  } | null;
  wallet: {
    currency: "NDP";
    availableBalance: number;
    frozenBalance: number;
  } | null;
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

export interface DashboardActivityFacts {
  current: {
    availableScheduleSlots: number;
    activeTechnicians: number;
    registeredTechnicians: number;
    shopCount: number | null;
    newCustomers: number | null;
    pendingOrders: number;
    serviceGmvJpy: number;
    completedCustomerCount: number;
  };
  previous: Omit<DashboardActivityFacts["current"], "pendingOrders">;
  buckets: Array<
    Pick<
      DashboardBucketPayload,
      | "key"
      | "label"
      | "orderCount"
      | "serviceGmvJpy"
      | "shopCount"
      | "registeredTechnicianCount"
      | "scheduleTotalHours"
      | "scheduleAvailableHours"
      | "scheduleBookedHours"
      | "scheduleAttendanceCount"
    >
  >;
}

export interface DashboardMembershipFacts {
  memberCount: number;
  completedCustomerCount: number;
}

export interface DashboardAggregateFacts extends DashboardActivityFacts {
  finance: DashboardFinanceFacts;
  merchant: DashboardMerchantFacts | null;
  membership: DashboardMembershipFacts | null;
  availableCities: string[];
}

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
  headlineSeries3d: DashboardHeadlineSeries3d;
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
    memberCount: number;
    memberDataStatus: "ready";
    completedCustomerCount: number;
  };
  scope: { kind: "platform"; shopPublicId: null } | { kind: "shop"; shopPublicId: string };
}
