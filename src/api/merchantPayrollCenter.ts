import { httpClient } from "./httpClient";

export type PayRunStatus =
  | "draft"
  | "reviewing"
  | "published"
  | "confirmed"
  | "disputed"
  | "approved"
  | "scheduled"
  | "paid"
  | "locked";
export type PayslipStatus = PayRunStatus;
export type PayslipDisputeStatus = "none" | "confirmed" | "disputed" | "resolved";
export type PayslipLineType =
  | "base_salary"
  | "commission"
  | "bonus"
  | "allowance"
  | "deduction"
  | "adjustment"
  | "guarantee_topup"
  | "platform_fee_share_deduction";
export type PayslipLineSourceType = "order" | "attendance" | "rule" | "manual" | "payout" | "adjustment";
export type PayoutMethod = "bank_transfer" | "cash" | "ndp" | "external" | "mixed" | "other";
export type PayrollAdjustmentType = "bonus" | "allowance" | "deduction" | "adjustment";
export type PayrollAdjustmentStatus = "draft" | "submitted" | "approved" | "rejected" | "applied";

export interface PayrollListPayload<T> {
  list: T[];
  total: number;
  page: number;
  page_size: number;
}

export interface PayrollCsvExportPayload {
  filename: string;
  contentType: "text/csv; charset=utf-8";
  csv: string;
}

export interface PayslipLinePayload {
  id: number;
  payslipId: number;
  lineType: PayslipLineType;
  title: string;
  amountJpy: number;
  quantity: number;
  unitAmountJpy: number;
  formulaText: string | null;
  sourceType: PayslipLineSourceType;
  sourceId: number | null;
  ruleId: string | null;
  orderId: number | null;
  explanation: string | null;
  createdById: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface PayoutRecordPayload {
  id: number;
  payslipId: number;
  shopId: number;
  technicianProfileId: number;
  amountJpy: number;
  payoutMethod: PayoutMethod;
  payoutDate: string;
  referenceNo: string | null;
  proofUrl: string | null;
  note: string | null;
  status: "pending" | "completed" | "failed" | "cancelled";
  confirmedByTechnician: boolean;
  technicianConfirmedAt: string | null;
  createdById: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface PayslipPayload {
  id: number;
  payRunId: number;
  shopId: number;
  shopName: string;
  technicianProfileId: number;
  technicianName: string;
  technicianUserId: number | null;
  compensationProfileId: number | null;
  periodStart: string;
  periodEnd: string;
  status: PayslipStatus;
  disputeStatus: PayslipDisputeStatus;
  disputeReason: string | null;
  baseSalaryJpy: number;
  annualSalaryProratedJpy: number;
  dailyWageJpy: number;
  hourlyWageJpy: number;
  commissionJpy: number;
  guaranteeTopupJpy: number;
  bonusJpy: number;
  allowanceJpy: number;
  deductionJpy: number;
  platformFeeShareDeductionJpy: number;
  netPayJpy: number;
  paidAmountJpy: number;
  unpaidAmountJpy: number;
  confirmedAt: string | null;
  disputedAt: string | null;
  disputeResolvedAt: string | null;
  disputeResolvedById: number | null;
  disputeResolutionNote: string | null;
  createdAt: string;
  updatedAt: string;
  lines: PayslipLinePayload[];
  payoutRecords: PayoutRecordPayload[];
}

export interface PayRunPayload {
  id: number;
  shopId: number;
  shopName: string;
  periodStart: string;
  periodEnd: string;
  status: PayRunStatus;
  totalBaseSalaryJpy: number;
  totalCommissionJpy: number;
  totalBonusJpy: number;
  totalAllowanceJpy: number;
  totalDeductionJpy: number;
  totalNetPayJpy: number;
  paidAmountJpy: number;
  unpaidAmountJpy: number;
  generatedById: number | null;
  approvedById: number | null;
  lockedAt: string | null;
  createdAt: string;
  updatedAt: string;
  payslips: PayslipPayload[];
}

export interface PayRunCreateInput {
  shopId: number;
  periodStart: string;
  periodEnd: string;
  manualLines?: Array<{
    technicianProfileId: number;
    lineType: Exclude<PayslipLineType, "commission" | "platform_fee_share_deduction">;
    title: string;
    amountJpy: number;
    explanation?: string | null;
  }>;
}

export interface PayoutRecordInput {
  amountJpy: number;
  payoutMethod: PayoutMethod;
  payoutDate: string;
  referenceNo?: string | null;
  proofUrl?: string | null;
  note?: string | null;
}

export interface PayrollAdjustmentRequestPayload {
  id: number;
  shopId: number;
  shopName: string;
  technicianProfileId: number;
  technicianName: string;
  technicianUserId: number | null;
  periodStart: string;
  periodEnd: string;
  adjustmentType: PayrollAdjustmentType;
  title: string;
  amountJpy: number;
  reason: string;
  proofUrl: string | null;
  status: PayrollAdjustmentStatus;
  requestedById: number;
  submittedAt: string | null;
  approvedById: number | null;
  approvedAt: string | null;
  rejectedById: number | null;
  rejectedAt: string | null;
  rejectionReason: string | null;
  appliedPayRunId: number | null;
  appliedPayslipLineId: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface PayrollAdjustmentCreateInput {
  shopId: number;
  technicianProfileId: number;
  periodStart: string;
  periodEnd: string;
  adjustmentType: PayrollAdjustmentType;
  title: string;
  amountJpy: number;
  reason: string;
  proofUrl?: string | null;
}

export const merchantPayrollCenterApi = {
  listPayRuns(params = "") {
    return httpClient.request<PayrollListPayload<PayRunPayload>>(
      `/merchant-admin/pay-runs${params}`
    );
  },
  exportPayRuns(params = "") {
    return httpClient.request<PayrollCsvExportPayload>(
      `/merchant-admin/pay-runs/export${params}`
    );
  },
  createPayRun(body: PayRunCreateInput) {
    return httpClient.request<PayRunPayload>("/merchant-admin/pay-runs", {
      method: "POST",
      body
    });
  },
  getPayRun(id: number) {
    return httpClient.request<PayRunPayload>(`/merchant-admin/pay-runs/${id}`);
  },
  recalculatePayRun(id: number) {
    return httpClient.request<PayRunPayload>(`/merchant-admin/pay-runs/${id}/recalculate`, {
      method: "POST"
    });
  },
  publishPayRun(id: number) {
    return httpClient.request<PayRunPayload>(`/merchant-admin/pay-runs/${id}/publish`, {
      method: "POST"
    });
  },
  approvePayRun(id: number) {
    return httpClient.request<PayRunPayload>(`/merchant-admin/pay-runs/${id}/approve`, {
      method: "POST"
    });
  },
  lockPayRun(id: number) {
    return httpClient.request<PayRunPayload>(`/merchant-admin/pay-runs/${id}/lock`, {
      method: "POST"
    });
  },
  recordPayout(payslipId: number, body: PayoutRecordInput) {
    return httpClient.request<PayslipPayload>(
      `/merchant-admin/payslips/${payslipId}/payout-records`,
      {
        method: "POST",
        body
      }
    );
  },
  resolvePayslipDispute(payslipId: number, resolutionNote: string) {
    return httpClient.request<PayslipPayload>(
      `/merchant-admin/payslips/${payslipId}/resolve-dispute`,
      {
        method: "POST",
        body: { resolutionNote }
      }
    );
  },
  listPayrollAdjustments(params = "") {
    return httpClient.request<PayrollListPayload<PayrollAdjustmentRequestPayload>>(
      `/merchant-admin/payroll-adjustments${params}`
    );
  },
  createPayrollAdjustment(body: PayrollAdjustmentCreateInput) {
    return httpClient.request<PayrollAdjustmentRequestPayload>(
      "/merchant-admin/payroll-adjustments",
      {
        method: "POST",
        body
      }
    );
  },
  submitPayrollAdjustment(id: number) {
    return httpClient.request<PayrollAdjustmentRequestPayload>(
      `/merchant-admin/payroll-adjustments/${id}/submit`,
      { method: "POST" }
    );
  },
  approvePayrollAdjustment(id: number) {
    return httpClient.request<PayrollAdjustmentRequestPayload>(
      `/merchant-admin/payroll-adjustments/${id}/approve`,
      { method: "POST" }
    );
  },
  rejectPayrollAdjustment(id: number, reason: string) {
    return httpClient.request<PayrollAdjustmentRequestPayload>(
      `/merchant-admin/payroll-adjustments/${id}/reject`,
      {
        method: "POST",
        body: { reason }
      }
    );
  },
  listBackofficePayRuns(params = "") {
    return httpClient.request<PayrollListPayload<PayRunPayload>>(`/backoffice/pay-runs${params}`);
  },
  exportBackofficePayRuns(params = "") {
    return httpClient.request<PayrollCsvExportPayload>(`/backoffice/pay-runs/export${params}`);
  }
};
