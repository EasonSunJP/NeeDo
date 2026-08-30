import type { DashboardWindow } from "./dashboard-period";

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

export interface DashboardAggregateInput {
  scope: { kind: "platform" } | { kind: "shop"; shopId: number };
  city: string | null;
  window: DashboardWindow;
}

export interface DashboardNdpPair {
  ndp: number;
  testNdp: number;
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
    >
  >;
}
