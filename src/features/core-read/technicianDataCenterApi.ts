import { httpClient } from "../../api/httpClient";

export type TechnicianDataCenterPeriod = "last7days" | "last30days" | "week" | "month" | "year";
export type TechnicianDataCenterBucketUnit = "day" | "five_days" | "week" | "month";

export type TechnicianDataCenterPayload = {
  period: TechnicianDataCenterPeriod;
  range: {
    startsAt: string;
    endsAt: string;
    timeZone: "Asia/Tokyo";
    bucketUnit: TechnicianDataCenterBucketUnit;
  };
  technician: {
    id: number;
    userId: number;
    displayName: string;
    employmentStartedAt: string | null;
  };
  affiliation: {
    shopId: number;
    shopName: string;
    relationshipType: string;
    startsAt: string;
  } | null;
  incomeModel: {
    sourceType: "merchant_default" | "technician_override";
    name: string;
    version: number;
    updatedAt: string;
    baseSalaryJpy: number;
    serviceCommissionRatePercent: number;
    extensionCommissionRatePercent: number;
    nominationFeeJpy: number;
    hasBonus: boolean;
  } | null;
  summary: {
    recognizedIncomeJpy: number;
    completedOrderCount: number;
    workedMinutes: number;
    upcomingOrderCount: number;
  };
  series: Array<{
    key: string;
    label: string;
    startsAt: string;
    endsAt: string;
    incomeJpy: number;
    workedMinutes: number;
    completedOrderCount: number;
  }>;
  recentOrders: Array<{
    id: number;
    orderNo: string;
    serviceName: string;
    shopName: string;
    status: string;
    startsAt: string;
    endsAt: string;
    recognizedIncomeJpy: number | null;
  }>;
  nextOrder: {
    id: number;
    orderNo: string;
    serviceName: string;
    shopName: string;
    status: string;
    startsAt: string;
    endsAt: string;
  } | null;
};

export const technicianDataCenterApi = {
  getMine(period: TechnicianDataCenterPeriod) {
    return httpClient.request<TechnicianDataCenterPayload>("/technician/data-center", {
      query: { period }
    });
  }
};
