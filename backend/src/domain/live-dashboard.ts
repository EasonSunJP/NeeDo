export type LiveDashboardPeriod = "today" | "last7days" | "last30days";

export interface LiveDashboardScope {
  countryCode: "JP";
  admin1Code: string | null;
  admin2Code: string | null;
}

export interface LiveMoney {
  jpy: number;
  ndp: number;
  testNdp: number;
}

export interface LiveDashboardInput {
  scope: LiveDashboardScope;
  period: LiveDashboardPeriod;
  evaluatedAt: Date;
}

export interface LiveDashboardCoverage {
  total: number;
  attributed: number;
  unresolved: number;
  completenessPercent: number;
}

export interface LiveDashboardChildRegion {
  code: string;
  name: string;
  orderCount: number;
  confirmedPayments: LiveMoney;
}

export interface LiveDashboardHeadline {
  newOrders: number;
  completedOrders: number;
  newCustomers: number;
  onboardedTechnicians: number;
}

export interface LiveDashboardOrders {
  total: number;
  serviceGmv: LiveMoney;
  platformNetRevenue: LiveMoney;
  agentCommission: LiveMoney | null;
}

export interface LiveDashboardOrderSummary {
  orderNo: string;
  status: string;
  serviceName: string;
  amountJpy: number;
  occurredAt: Date;
}

export interface LiveDashboardRealtimeOrders {
  list: LiveDashboardOrderSummary[];
  total: number;
  page: 1;
  page_size: 20;
}

export interface LiveDashboardTrendBucket {
  key: string;
  label: string;
  orderCount: number;
  confirmedPayments: LiveMoney;
}

export interface LiveDashboardRankingItem {
  rank: number;
  entityPublicId: string;
  displayName: string;
  avatarUrl: string | null;
  gmvJpy: number;
  completedCount: number;
}

export interface LiveDashboardSnapshotFacts {
  evaluatedAt: Date;
  scope: LiveDashboardScope;
  children: LiveDashboardChildRegion[];
  headline: LiveDashboardHeadline;
  confirmedPayments: LiveMoney;
  orders: LiveDashboardOrders;
  realtimeOrders: LiveDashboardRealtimeOrders;
  activity: LiveDashboardOrderSummary[];
  trend: LiveDashboardTrendBucket[];
  serviceRanking: LiveDashboardRankingItem[];
  technicianRanking: LiveDashboardRankingItem[];
  coverage: LiveDashboardCoverage;
}
