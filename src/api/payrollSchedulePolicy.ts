import { httpClient } from "./httpClient";

export type PayrollCadence = "daily" | "weekly" | "monthly";
export type PayrollHolidayAdjustment =
  | "previous_business_day"
  | "next_business_day";

export interface PayrollScheduleRule {
  cadence: PayrollCadence;
  weeklySettlementWeekday: number | null;
  monthlySettlementDay: number | null;
  holidayAdjustment: PayrollHolidayAdjustment;
  timezone: "Asia/Tokyo";
}

export interface EffectivePayrollSchedulePolicy extends PayrollScheduleRule {
  id: number;
  version: number;
  effectiveFrom: string;
  effectiveTo: string | null;
}

export interface ShopPayrollSchedulePolicy extends EffectivePayrollSchedulePolicy {
  shopId: number;
  status: "active" | "archived";
  createdById: number | null;
  updatedById: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface EmployeePayrollScheduleOverride {
  id: number;
  technicianShopAffiliationId: number;
  inheritShopPolicy: boolean;
  cadence: PayrollCadence | null;
  weeklySettlementWeekday: number | null;
  monthlySettlementDay: number | null;
  holidayAdjustment: PayrollHolidayAdjustment | null;
  timezone: "Asia/Tokyo" | null;
  effectiveFrom: string;
  effectiveTo: string | null;
  status: "active" | "archived";
  version: number;
  createdById: number | null;
  updatedById: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface PayrollSchedulePreview {
  periodStart: string;
  periodEnd: string;
  naturalSettlementDate: string;
  plannedPaymentDate: string;
  adjustmentReason: "weekend" | "public_holiday" | null;
}

export interface PayrollSchedulePolicyResult {
  configured: boolean;
  source: "shop" | "employee_override" | "shop_unconfigured";
  inheritShopPolicy?: boolean;
  shopPolicy: ShopPayrollSchedulePolicy | null;
  employeeOverride?: EmployeePayrollScheduleOverride | null;
  effectivePolicy: EffectivePayrollSchedulePolicy | null;
  preview: PayrollSchedulePreview | null;
}

export interface ShopPayrollSchedulePolicyInput extends PayrollScheduleRule {
  effectiveFrom: string;
  effectiveTo: string | null;
}

export interface EmployeePayrollSchedulePolicyInput {
  inheritShopPolicy: boolean;
  cadence: PayrollCadence | null;
  weeklySettlementWeekday: number | null;
  monthlySettlementDay: number | null;
  holidayAdjustment: PayrollHolidayAdjustment | null;
  timezone: "Asia/Tokyo" | null;
  effectiveFrom: string;
  effectiveTo: string | null;
}

const shopPath = "/merchant-admin/payroll-schedule-policy";
const employeePath = (needoId: string) =>
  `/merchant-admin/employees/${encodeURIComponent(needoId.trim())}/payroll-schedule-policy`;

export const payrollSchedulePolicyApi = {
  getShop(referenceDate?: string) {
    return httpClient.request<PayrollSchedulePolicyResult>(shopPath, {
      query: { referenceDate },
    });
  },
  updateShop(body: ShopPayrollSchedulePolicyInput) {
    return httpClient.request<PayrollSchedulePolicyResult>(shopPath, {
      method: "PUT",
      body,
    });
  },
  getEmployee(needoId: string, referenceDate?: string) {
    return httpClient.request<PayrollSchedulePolicyResult>(employeePath(needoId), {
      query: { referenceDate },
    });
  },
  updateEmployee(
    needoId: string,
    body: EmployeePayrollSchedulePolicyInput,
  ) {
    return httpClient.request<PayrollSchedulePolicyResult>(employeePath(needoId), {
      method: "PUT",
      body,
    });
  },
};
