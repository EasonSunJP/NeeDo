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
