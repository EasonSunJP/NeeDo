import { httpClient } from "./httpClient";
import type {
  CompensationPreviewPayload,
  CompensationProfilePreviewInput,
  TechnicianCompensationProfileInput,
} from "./merchantFinanceCenter";
import type {
  ShopFinanceBonusRulePayload,
  ShopFinanceDeductionRulePayload,
  ShopFinanceNdpBearer,
  ShopFinanceWageMode,
} from "./merchantFinanceRules";

export interface EmployeeCompensationProfile {
  sourceType: "shop_default" | "technician_override";
  name: string;
  status: "active" | "archived";
  version: number;
  wageMode: ShopFinanceWageMode;
  baseSalaryJpy: number;
  hourlyRateJpy: number;
  dailyRateJpy: number;
  fixedOrderPayJpy: number;
  commissionRatePercent: number;
  guaranteedMinimumJpy: number;
  ndpFeeBearer: ShopFinanceNdpBearer;
  technicianNdpSharePercent: number;
  bonusRules: ShopFinanceBonusRulePayload[];
  deductionRules: ShopFinanceDeductionRulePayload[];
  effectiveFrom: string | null;
  effectiveTo: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface EmployeePayrollSummary {
  payslipId: number | null;
  periodStart: string | null;
  periodEnd: string | null;
  status: string | null;
  disputeStatus: string | null;
  completedOrderCount: number;
  workedMinutes: number;
  serviceIncomeJpy: number;
  basePayJpy: number;
  commissionJpy: number;
  bonusJpy: number;
  allowanceJpy: number;
  deductionJpy: number;
  platformFeeShareDeductionJpy: number;
  netPayJpy: number;
  paidAmountJpy: number;
  unpaidAmountJpy: number;
  payoutRecordCount: number;
}

export interface EmployeeCompensationResult {
  employee: { needoId: string };
  profile: EmployeeCompensationProfile;
  payrollSummary: EmployeePayrollSummary;
}

export interface EmployeeCompensationPreviewResult {
  employee: { needoId: string };
  profile: EmployeeCompensationProfile;
  preview: CompensationPreviewPayload;
}

const employeeCompensationPath = (needoId: string) =>
  `/merchant-admin/employees/${encodeURIComponent(needoId.trim())}/compensation-profile`;

export const employeeCompensationApi = {
  get(needoId: string) {
    return httpClient.request<EmployeeCompensationResult>(
      employeeCompensationPath(needoId),
    );
  },
  update(needoId: string, body: TechnicianCompensationProfileInput) {
    return httpClient.request<EmployeeCompensationResult>(
      employeeCompensationPath(needoId),
      { method: "PUT", body },
    );
  },
  preview(needoId: string, body: CompensationProfilePreviewInput) {
    return httpClient.request<EmployeeCompensationPreviewResult>(
      `${employeeCompensationPath(needoId)}/preview`,
      { method: "POST", body },
    );
  },
};

export type {
  CompensationProfilePreviewInput,
  TechnicianCompensationProfileInput,
};
