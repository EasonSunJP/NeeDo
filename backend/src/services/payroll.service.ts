import { ERROR_CODES } from "../constants/error-codes";
import { AppError } from "../utils/app-error";
import type {
  ParsedPayrollAdjustmentBody,
  ParsedPayrollAdjustmentListQuery,
  ParsedPayrollAdjustmentRejectBody,
  ParsedPayRunCreateBody,
  ParsedPayrollListQuery,
  ParsedPayoutRecordBody,
  ParsedPayslipDisputeBody,
  ParsedPayslipDisputeResolveBody
} from "../validators/payroll.validator";
import type { AuditLogService } from "./audit-log.service";
import type { AuthRequestContext, AuthenticatedAccessContext } from "./auth.service";
import type {
  CompensationPreviewPayload,
  CompensationRuleSet
} from "./compensation-engine.service";
import { CompensationEngine } from "./compensation-engine.service";

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
export type PayslipLineSourceType =
  | "order"
  | "attendance"
  | "rule"
  | "manual"
  | "payout"
  | "adjustment";
export type PayoutMethod = "bank_transfer" | "cash" | "ndp" | "external" | "mixed" | "other";
export type PayrollAdjustmentType = "bonus" | "allowance" | "deduction" | "adjustment";
export type PayrollAdjustmentStatus = "draft" | "submitted" | "approved" | "rejected" | "applied";

export interface PayrollPaginationPayload<T> {
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

export interface PayrollManualLineInput {
  technicianProfileId: number;
  lineType: Exclude<PayslipLineType, "commission" | "platform_fee_share_deduction">;
  title: string;
  amountJpy: number;
  explanation?: string | null;
}

export interface PayrollOrderFinancialSource {
  bookingOrderId: number;
  orderNo: string;
  shopId: number;
  shopName: string;
  technicianProfileId: number;
  technicianName: string;
  technicianUserId?: number | null;
  serviceName: string;
  completedAt: string;
  workedMinutes: number;
  serviceAmountJpy: number;
  bPlatformFeeActualNdp: number;
  serviceIncomeStatus: "reported" | "confirmed";
  compensationRule: CompensationRuleSet;
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

export type PayRunDraftSaveInput = Omit<PayRunPayload, "id" | "createdAt" | "updatedAt">;

export interface PayRunTransitionInput {
  payRunId: number;
  status: PayRunStatus;
  approvedById?: number | null;
  lockedAt?: string | null;
}

export interface PayslipTransitionInput {
  payslipId: number;
  status: PayslipStatus;
  disputeStatus?: PayslipDisputeStatus;
  disputeReason?: string | null;
  confirmedAt?: string | null;
  disputedAt?: string | null;
}

export interface PayoutRecordCreateInput {
  payslipId: number;
  shopId: number;
  technicianProfileId: number;
  amountJpy: number;
  payoutMethod: PayoutMethod;
  payoutDate: string;
  referenceNo: string | null;
  proofUrl: string | null;
  note: string | null;
  createdById: number;
  nextPaidAmountJpy: number;
  nextUnpaidAmountJpy: number;
  nextPayslipStatus: PayslipStatus;
}

export interface PayslipDisputeResolveInput {
  payslipId: number;
  status: PayslipStatus;
  disputeStatus: PayslipDisputeStatus;
  disputeResolvedById: number;
  disputeResolvedAt: string;
  disputeResolutionNote: string;
}

export interface PayoutRecordConfirmInput {
  payslipId: number;
  payoutRecordId: number;
  technicianProfileId: number;
  technicianConfirmedAt: string;
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
  proofUrl: string | null;
  requestedById: number;
}

export interface PayrollAdjustmentTransitionInput {
  adjustmentId: number;
  status: PayrollAdjustmentStatus;
  submittedAt?: string | null;
  approvedById?: number | null;
  approvedAt?: string | null;
  rejectedById?: number | null;
  rejectedAt?: string | null;
  rejectionReason?: string | null;
}

export interface PayrollAdjustmentApplyInput {
  payRunId: number;
  applications: Array<{
    adjustmentId: number;
    payslipLineId: number;
  }>;
}

export interface PayrollRepositoryPort {
  listMerchantPayRuns: (
    shopId: number,
    query: ParsedPayrollListQuery
  ) => Promise<PayrollPaginationPayload<PayRunPayload>>;
  listBackofficePayRuns: (
    query: ParsedPayrollListQuery
  ) => Promise<PayrollPaginationPayload<PayRunPayload>>;
  listTechnicianPayslips: (
    technicianProfileId: number,
    query: ParsedPayrollListQuery
  ) => Promise<PayrollPaginationPayload<PayslipPayload>>;
  findPayRunDetail: (payRunId: number) => Promise<PayRunPayload | null>;
  findPayslipDetail: (payslipId: number) => Promise<PayslipPayload | null>;
  findPayrollSourceOrders: (input: {
    shopId: number;
    periodStart: string;
    periodEnd: string;
  }) => Promise<PayrollOrderFinancialSource[]>;
  savePayRunDraft: (input: PayRunDraftSaveInput) => Promise<PayRunPayload>;
  transitionPayRun: (input: PayRunTransitionInput) => Promise<PayRunPayload>;
  transitionPayslip: (input: PayslipTransitionInput) => Promise<PayslipPayload>;
  resolvePayslipDispute: (input: PayslipDisputeResolveInput) => Promise<PayslipPayload>;
  addPayoutRecord: (input: PayoutRecordCreateInput) => Promise<PayslipPayload>;
  confirmPayoutRecord: (input: PayoutRecordConfirmInput) => Promise<PayslipPayload>;
  listMerchantPayrollAdjustments: (
    shopId: number,
    query: ParsedPayrollAdjustmentListQuery
  ) => Promise<PayrollPaginationPayload<PayrollAdjustmentRequestPayload>>;
  createPayrollAdjustment: (
    input: PayrollAdjustmentCreateInput
  ) => Promise<PayrollAdjustmentRequestPayload>;
  findPayrollAdjustment: (adjustmentId: number) => Promise<PayrollAdjustmentRequestPayload | null>;
  transitionPayrollAdjustment: (
    input: PayrollAdjustmentTransitionInput
  ) => Promise<PayrollAdjustmentRequestPayload>;
  listApprovedPayrollAdjustments: (input: {
    shopId: number;
    periodStart: string;
    periodEnd: string;
  }) => Promise<PayrollAdjustmentRequestPayload[]>;
  applyPayrollAdjustments: (input: PayrollAdjustmentApplyInput) => Promise<void>;
  hasClosedPayRunForPeriod: (input: {
    shopId: number;
    technicianProfileId: number;
    periodStart: string;
    periodEnd: string;
  }) => Promise<boolean>;
}

type AuditRecorder = Pick<AuditLogService, "record">;

interface GeneratedPayslipAccumulator {
  shopId: number;
  shopName: string;
  technicianProfileId: number;
  technicianName: string;
  technicianUserId: number | null;
  compensationProfileId: number | null;
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
  lines: PayslipLinePayload[];
}

export class PayrollService {
  public constructor(
    private readonly repository: PayrollRepositoryPort,
    private readonly auditLogService: AuditRecorder,
    private readonly compensationEngine = new CompensationEngine()
  ) {}

  public async listMerchantPayRuns(
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext,
    query: ParsedPayrollListQuery
  ): Promise<PayrollPaginationPayload<PayRunPayload>> {
    const shopId = query.shopId ?? this.getMerchantShopId(actor);
    this.assertMerchantShopScope(actor, shopId);
    const result = await this.repository.listMerchantPayRuns(shopId, query);
    await this.record(actor, context, "merchant_admin.payroll.list", "pay_run", shopId, {
      page: query.page ?? 1,
      status: query.status
    });
    return result;
  }

  public async listBackofficePayRuns(
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext,
    query: ParsedPayrollListQuery
  ): Promise<PayrollPaginationPayload<PayRunPayload>> {
    const result = await this.repository.listBackofficePayRuns(query);
    await this.record(actor, context, "backoffice.payroll.list", "pay_run", 0, {
      page: query.page ?? 1,
      status: query.status
    });
    return result;
  }

  public async exportMerchantPayRuns(
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext,
    query: ParsedPayrollListQuery
  ): Promise<PayrollCsvExportPayload> {
    const shopId = query.shopId ?? this.getMerchantShopId(actor);
    this.assertMerchantShopScope(actor, shopId);
    const result = await this.repository.listMerchantPayRuns(shopId, {
      ...query,
      page: 1,
      pageSize: Math.min(query.pageSize, 100)
    });
    await this.record(actor, context, "merchant_admin.payroll.export", "pay_run_export", shopId, {
      total: result.total
    });
    return this.buildPayRunCsvExport("merchant-pay-runs", result.list);
  }

  public async exportBackofficePayRuns(
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext,
    query: ParsedPayrollListQuery
  ): Promise<PayrollCsvExportPayload> {
    const result = await this.repository.listBackofficePayRuns({
      ...query,
      page: 1,
      pageSize: Math.min(query.pageSize, 100)
    });
    await this.record(actor, context, "backoffice.payroll.export", "pay_run_export", 0, {
      total: result.total
    });
    return this.buildPayRunCsvExport("backoffice-pay-runs", result.list);
  }

  public async getMerchantPayRun(
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext,
    payRunId: number
  ): Promise<PayRunPayload> {
    const payRun = await this.getPayRun(payRunId);
    this.assertMerchantShopScope(actor, payRun.shopId);
    await this.record(actor, context, "merchant_admin.payroll.read", "pay_run", payRunId);
    return payRun;
  }

  public async generateMerchantPayRun(
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext,
    input: ParsedPayRunCreateBody
  ): Promise<PayRunPayload> {
    this.assertMerchantShopScope(actor, input.shopId);
    const period = {
      shopId: input.shopId,
      periodStart: input.periodStart.toISOString(),
      periodEnd: input.periodEnd.toISOString()
    };
    const sourceOrders = await this.repository.findPayrollSourceOrders({
      ...period
    });
    const approvedAdjustments = await this.repository.listApprovedPayrollAdjustments(period);
    const draft = this.buildDraft(input, sourceOrders, approvedAdjustments, actor.userId);
    const saved = await this.repository.savePayRunDraft(draft);
    await this.record(actor, context, "merchant_admin.payroll.generate", "pay_run", saved.id, {
      shopId: input.shopId,
      periodStart: draft.periodStart,
      periodEnd: draft.periodEnd,
      payslipCount: saved.payslips.length
    });
    return saved;
  }

  public async recalculateMerchantPayRun(
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext,
    payRunId: number
  ): Promise<PayRunPayload> {
    const existing = await this.getPayRun(payRunId);
    this.assertMerchantShopScope(actor, existing.shopId);
    if (existing.status !== "draft" && existing.status !== "reviewing") {
      this.conflict("error.payroll.pay_run_not_recalculable");
    }
    const sourceOrders = await this.repository.findPayrollSourceOrders({
      shopId: existing.shopId,
      periodStart: existing.periodStart,
      periodEnd: existing.periodEnd
    });
    const approvedAdjustments = await this.repository.listApprovedPayrollAdjustments({
      shopId: existing.shopId,
      periodStart: existing.periodStart,
      periodEnd: existing.periodEnd
    });
    const draft = this.buildDraft(
      {
        shopId: existing.shopId,
        periodStart: new Date(existing.periodStart),
        periodEnd: new Date(existing.periodEnd),
        manualLines: []
      },
      sourceOrders,
      approvedAdjustments,
      actor.userId
    );
    const saved = await this.repository.savePayRunDraft({
      ...draft,
      id: existing.id
    } as PayRunDraftSaveInput);
    await this.record(actor, context, "merchant_admin.payroll.recalculate", "pay_run", saved.id, {
      shopId: saved.shopId
    });
    return saved;
  }

  public async publishMerchantPayRun(
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext,
    payRunId: number
  ): Promise<PayRunPayload> {
    const payRun = await this.getPayRun(payRunId);
    this.assertMerchantShopScope(actor, payRun.shopId);
    if (payRun.status !== "draft" && payRun.status !== "reviewing") {
      this.conflict("error.payroll.pay_run_not_publishable");
    }
    return this.transitionPayRun(
      actor,
      context,
      payRunId,
      "published",
      "merchant_admin.payroll.publish"
    );
  }

  public async approveMerchantPayRun(
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext,
    payRunId: number
  ): Promise<PayRunPayload> {
    const payRun = await this.getPayRun(payRunId);
    this.assertMerchantShopScope(actor, payRun.shopId);
    if (this.hasUnresolvedDispute(payRun)) {
      this.conflict("error.payroll.pay_run_has_unresolved_dispute");
    }
    if (payRun.status !== "confirmed") {
      this.conflict("error.payroll.pay_run_not_approvable");
    }
    const updated = await this.repository.transitionPayRun({
      payRunId,
      status: "approved",
      approvedById: actor.userId
    });
    await this.record(actor, context, "merchant_admin.payroll.approve", "pay_run", payRunId);
    return updated;
  }

  public async lockMerchantPayRun(
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext,
    payRunId: number
  ): Promise<PayRunPayload> {
    const payRun = await this.getPayRun(payRunId);
    this.assertMerchantShopScope(actor, payRun.shopId);
    if (payRun.status === "locked") {
      return payRun;
    }
    if (
      payRun.status !== "paid" ||
      payRun.unpaidAmountJpy > 0 ||
      payRun.payslips.some((payslip) => payslip.unpaidAmountJpy > 0)
    ) {
      this.conflict("error.payroll.pay_run_not_fully_paid");
    }
    const updated = await this.repository.transitionPayRun({
      payRunId,
      status: "locked",
      lockedAt: new Date().toISOString()
    });
    await this.repository.applyPayrollAdjustments({
      payRunId,
      applications: this.collectAdjustmentApplications(updated)
    });
    await this.record(actor, context, "merchant_admin.payroll.lock", "pay_run", payRunId);
    return updated;
  }

  public async listMerchantPayrollAdjustments(
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext,
    query: ParsedPayrollAdjustmentListQuery
  ): Promise<PayrollPaginationPayload<PayrollAdjustmentRequestPayload>> {
    const shopId = query.shopId ?? this.getMerchantShopId(actor);
    this.assertMerchantShopScope(actor, shopId);
    const result = await this.repository.listMerchantPayrollAdjustments(shopId, query);
    await this.record(
      actor,
      context,
      "merchant_admin.payroll_adjustment.list",
      "payroll_adjustment",
      shopId,
      {
        page: query.page ?? 1,
        status: query.status
      }
    );
    return result;
  }

  public async createMerchantPayrollAdjustment(
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext,
    input: ParsedPayrollAdjustmentBody
  ): Promise<PayrollAdjustmentRequestPayload> {
    this.assertMerchantShopScope(actor, input.shopId);
    await this.assertPayrollPeriodOpenForAdjustment({
      shopId: input.shopId,
      technicianProfileId: input.technicianProfileId,
      periodStart: input.periodStart.toISOString(),
      periodEnd: input.periodEnd.toISOString()
    });
    const created = await this.repository.createPayrollAdjustment({
      shopId: input.shopId,
      technicianProfileId: input.technicianProfileId,
      periodStart: input.periodStart.toISOString(),
      periodEnd: input.periodEnd.toISOString(),
      adjustmentType: input.adjustmentType,
      title: input.title,
      amountJpy: Math.round(input.amountJpy),
      reason: input.reason,
      proofUrl: input.proofUrl ?? null,
      requestedById: actor.userId
    });
    await this.record(
      actor,
      context,
      "merchant_admin.payroll_adjustment.create",
      "payroll_adjustment",
      created.id,
      {
        shopId: created.shopId,
        adjustmentType: created.adjustmentType,
        amountJpy: created.amountJpy
      }
    );
    return created;
  }

  public async submitMerchantPayrollAdjustment(
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext,
    adjustmentId: number
  ): Promise<PayrollAdjustmentRequestPayload> {
    const adjustment = await this.getPayrollAdjustment(adjustmentId);
    this.assertMerchantShopScope(actor, adjustment.shopId);
    this.assertPayrollAdjustmentStatus(
      adjustment,
      ["draft"],
      "error.payroll_adjustment.not_submittable"
    );
    const updated = await this.repository.transitionPayrollAdjustment({
      adjustmentId,
      status: "submitted",
      submittedAt: new Date().toISOString()
    });
    await this.record(
      actor,
      context,
      "merchant_admin.payroll_adjustment.submit",
      "payroll_adjustment",
      adjustmentId
    );
    return updated;
  }

  public async approveMerchantPayrollAdjustment(
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext,
    adjustmentId: number
  ): Promise<PayrollAdjustmentRequestPayload> {
    const adjustment = await this.getPayrollAdjustment(adjustmentId);
    this.assertMerchantShopScope(actor, adjustment.shopId);
    this.assertPayrollAdjustmentStatus(
      adjustment,
      ["submitted"],
      "error.payroll_adjustment.not_approvable"
    );
    await this.assertPayrollPeriodOpenForAdjustment({
      shopId: adjustment.shopId,
      technicianProfileId: adjustment.technicianProfileId,
      periodStart: adjustment.periodStart,
      periodEnd: adjustment.periodEnd
    });
    const updated = await this.repository.transitionPayrollAdjustment({
      adjustmentId,
      status: "approved",
      approvedById: actor.userId,
      approvedAt: new Date().toISOString()
    });
    await this.record(
      actor,
      context,
      "merchant_admin.payroll_adjustment.approve",
      "payroll_adjustment",
      adjustmentId
    );
    return updated;
  }

  public async rejectMerchantPayrollAdjustment(
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext,
    adjustmentId: number,
    input: ParsedPayrollAdjustmentRejectBody
  ): Promise<PayrollAdjustmentRequestPayload> {
    const adjustment = await this.getPayrollAdjustment(adjustmentId);
    this.assertMerchantShopScope(actor, adjustment.shopId);
    this.assertPayrollAdjustmentStatus(
      adjustment,
      ["submitted"],
      "error.payroll_adjustment.not_rejectable"
    );
    const updated = await this.repository.transitionPayrollAdjustment({
      adjustmentId,
      status: "rejected",
      rejectedById: actor.userId,
      rejectedAt: new Date().toISOString(),
      rejectionReason: input.reason
    });
    await this.record(
      actor,
      context,
      "merchant_admin.payroll_adjustment.reject",
      "payroll_adjustment",
      adjustmentId,
      {
        reason: input.reason
      }
    );
    return updated;
  }

  public async listTechnicianPayslips(
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext,
    query: ParsedPayrollListQuery
  ): Promise<PayrollPaginationPayload<PayslipPayload>> {
    const technicianProfileId = this.getTechnicianProfileId(actor);
    const result = await this.repository.listTechnicianPayslips(technicianProfileId, query);
    await this.record(
      actor,
      context,
      "technician.payslip.list",
      "technician_profile",
      technicianProfileId
    );
    return result;
  }

  public async exportTechnicianPayslips(
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext,
    query: ParsedPayrollListQuery
  ): Promise<PayrollCsvExportPayload> {
    const technicianProfileId = this.getTechnicianProfileId(actor);
    const result = await this.repository.listTechnicianPayslips(technicianProfileId, {
      ...query,
      page: 1,
      pageSize: Math.min(query.pageSize, 100)
    });
    await this.record(
      actor,
      context,
      "technician.payslip.export",
      "technician_profile",
      technicianProfileId,
      {
        total: result.total
      }
    );
    return this.buildPayslipCsvExport("technician-payslips", result.list);
  }

  public async getTechnicianPayslip(
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext,
    payslipId: number
  ): Promise<PayslipPayload> {
    const payslip = await this.getPayslip(payslipId);
    this.assertTechnicianScope(actor, payslip.technicianProfileId);
    await this.record(actor, context, "technician.payslip.read", "payslip", payslipId);
    return payslip;
  }

  public async confirmTechnicianPayslip(
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext,
    payslipId: number
  ): Promise<PayslipPayload> {
    const payslip = await this.getPayslip(payslipId);
    this.assertTechnicianScope(actor, payslip.technicianProfileId);
    if (payslip.status !== "published") {
      this.conflict("error.payroll.payslip_not_confirmable");
    }
    const updated = await this.repository.transitionPayslip({
      payslipId,
      status: "confirmed",
      disputeStatus: "confirmed",
      disputeReason: null,
      confirmedAt: new Date().toISOString()
    });
    await this.record(actor, context, "technician.payslip.confirm", "payslip", payslipId);
    return updated;
  }

  public async disputeTechnicianPayslip(
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext,
    payslipId: number,
    input: ParsedPayslipDisputeBody
  ): Promise<PayslipPayload> {
    const payslip = await this.getPayslip(payslipId);
    this.assertTechnicianScope(actor, payslip.technicianProfileId);
    if (payslip.status !== "published") {
      this.conflict("error.payroll.payslip_not_disputable");
    }
    const updated = await this.repository.transitionPayslip({
      payslipId,
      status: "disputed",
      disputeStatus: "disputed",
      disputeReason: input.reason,
      disputedAt: new Date().toISOString()
    });
    await this.record(actor, context, "technician.payslip.dispute", "payslip", payslipId, {
      reason: input.reason
    });
    return updated;
  }

  public async resolveMerchantPayslipDispute(
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext,
    payslipId: number,
    input: ParsedPayslipDisputeResolveBody
  ): Promise<PayslipPayload> {
    const payslip = await this.getPayslip(payslipId);
    this.assertMerchantShopScope(actor, payslip.shopId);
    if (payslip.status !== "disputed" || payslip.disputeStatus !== "disputed") {
      this.conflict("error.payroll.payslip_dispute_not_resolvable");
    }
    const updated = await this.repository.resolvePayslipDispute({
      payslipId,
      status: "published",
      disputeStatus: "resolved",
      disputeResolvedById: actor.userId,
      disputeResolvedAt: new Date().toISOString(),
      disputeResolutionNote: input.resolutionNote
    });
    await this.record(
      actor,
      context,
      "merchant_admin.payroll_dispute.resolve",
      "payslip",
      payslipId,
      {
        resolutionNote: input.resolutionNote
      }
    );
    return updated;
  }

  public async recordMerchantPayout(
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext,
    payslipId: number,
    input: ParsedPayoutRecordBody
  ): Promise<PayslipPayload> {
    const payslip = await this.getPayslip(payslipId);
    this.assertMerchantShopScope(actor, payslip.shopId);
    if (payslip.status !== "approved" && payslip.status !== "scheduled") {
      this.conflict("error.payroll.payslip_not_payable");
    }
    const amountJpy = Math.round(input.amountJpy);
    if (amountJpy <= 0 || amountJpy > payslip.unpaidAmountJpy) {
      this.conflict("error.payroll.invalid_payout_amount");
    }
    const nextPaidAmountJpy = payslip.paidAmountJpy + amountJpy;
    const nextUnpaidAmountJpy = Math.max(0, payslip.unpaidAmountJpy - amountJpy);
    const updated = await this.repository.addPayoutRecord({
      payslipId,
      shopId: payslip.shopId,
      technicianProfileId: payslip.technicianProfileId,
      amountJpy,
      payoutMethod: input.payoutMethod,
      payoutDate: input.payoutDate.toISOString(),
      referenceNo: input.referenceNo ?? null,
      proofUrl: input.proofUrl ?? null,
      note: input.note ?? null,
      createdById: actor.userId,
      nextPaidAmountJpy,
      nextUnpaidAmountJpy,
      nextPayslipStatus: nextUnpaidAmountJpy === 0 ? "paid" : "scheduled"
    });
    await this.record(
      actor,
      context,
      "merchant_admin.payroll.payout_record.create",
      "payslip",
      payslipId,
      {
        amountJpy,
        nextUnpaidAmountJpy
      }
    );
    return updated;
  }

  public async confirmTechnicianPayoutRecord(
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext,
    payslipId: number,
    payoutRecordId: number
  ): Promise<PayslipPayload> {
    const payslip = await this.getPayslip(payslipId);
    this.assertTechnicianScope(actor, payslip.technicianProfileId);
    if (payslip.status !== "scheduled" && payslip.status !== "paid") {
      this.conflict("error.payroll.payout_record_not_confirmable");
    }
    const payoutRecord = payslip.payoutRecords.find((record) => record.id === payoutRecordId);
    if (!payoutRecord || payoutRecord.technicianProfileId !== payslip.technicianProfileId) {
      throw new AppError({
        code: ERROR_CODES.NOT_FOUND,
        message: "error.payroll.payout_record_not_found",
        statusCode: 404
      });
    }
    if (payoutRecord.confirmedByTechnician || payoutRecord.technicianConfirmedAt) {
      return payslip;
    }
    const updated = await this.repository.confirmPayoutRecord({
      payslipId,
      payoutRecordId,
      technicianProfileId: payslip.technicianProfileId,
      technicianConfirmedAt: new Date().toISOString()
    });
    await this.record(
      actor,
      context,
      "technician.payout_record.confirm",
      "payout_record",
      payoutRecordId,
      {
        payslipId
      }
    );
    return updated;
  }

  private async transitionPayRun(
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext,
    payRunId: number,
    status: PayRunStatus,
    action: string
  ): Promise<PayRunPayload> {
    const updated = await this.repository.transitionPayRun({ payRunId, status });
    await this.record(actor, context, action, "pay_run", payRunId, { status });
    return updated;
  }

  private buildDraft(
    input: ParsedPayRunCreateBody,
    sourceOrders: PayrollOrderFinancialSource[],
    approvedAdjustments: PayrollAdjustmentRequestPayload[],
    actorUserId: number
  ): PayRunDraftSaveInput {
    const periodStart = input.periodStart.toISOString();
    const periodEnd = input.periodEnd.toISOString();
    const grouped = new Map<number, GeneratedPayslipAccumulator>();
    const metrics = this.groupMetrics(sourceOrders);

    sourceOrders.forEach((order) => {
      const group = this.getPayslipAccumulator(grouped, order);
      const metric = metrics.get(order.technicianProfileId) ?? {
        monthlyCompletedOrders: 0,
        monthlyServiceGmvJpy: 0
      };
      const preview = this.compensationEngine.calculate(order.compensationRule, {
        serviceAmountJpy: order.serviceAmountJpy,
        platformFeeNdp: order.bPlatformFeeActualNdp,
        workedMinutes: order.workedMinutes,
        monthlyCompletedOrders: metric.monthlyCompletedOrders,
        monthlyServiceGmvJpy: metric.monthlyServiceGmvJpy
      });
      this.applyOrderPreview(group, order, preview, actorUserId);
    });

    for (const manualLine of input.manualLines ?? []) {
      const group = grouped.get(manualLine.technicianProfileId);
      if (!group) {
        continue;
      }
      const amountJpy = Math.round(manualLine.amountJpy);
      group.lines.push(
        this.line({
          lineType: manualLine.lineType,
          title: manualLine.title,
          amountJpy,
          sourceType: "manual",
          sourceId: null,
          ruleId: null,
          orderId: null,
          explanation: manualLine.explanation ?? null,
          createdById: actorUserId
        })
      );
      if (amountJpy >= 0 && manualLine.lineType === "bonus") {
        group.bonusJpy += amountJpy;
      } else if (amountJpy >= 0 && manualLine.lineType === "allowance") {
        group.allowanceJpy += amountJpy;
      } else if (amountJpy < 0 || manualLine.lineType === "deduction") {
        group.deductionJpy += Math.abs(amountJpy);
      } else {
        group.bonusJpy += amountJpy;
      }
      group.netPayJpy += amountJpy;
    }

    approvedAdjustments.forEach((adjustment) => {
      const group = this.getAdjustmentAccumulator(grouped, input.shopId, adjustment);
      this.applyPayrollAdjustment(group, adjustment, actorUserId);
    });

    const payslips = Array.from(grouped.values()).map((group, index) =>
      this.finalizePayslip(index, group, periodStart, periodEnd)
    );
    const totals = payslips.reduce(
      (sum, payslip) => ({
        totalBaseSalaryJpy: sum.totalBaseSalaryJpy + payslip.baseSalaryJpy,
        totalCommissionJpy: sum.totalCommissionJpy + payslip.commissionJpy,
        totalBonusJpy: sum.totalBonusJpy + payslip.bonusJpy,
        totalAllowanceJpy: sum.totalAllowanceJpy + payslip.allowanceJpy,
        totalDeductionJpy: sum.totalDeductionJpy + payslip.deductionJpy,
        totalNetPayJpy: sum.totalNetPayJpy + payslip.netPayJpy
      }),
      {
        totalBaseSalaryJpy: 0,
        totalCommissionJpy: 0,
        totalBonusJpy: 0,
        totalAllowanceJpy: 0,
        totalDeductionJpy: 0,
        totalNetPayJpy: 0
      }
    );
    const shopName = sourceOrders[0]?.shopName ?? "Unknown shop";

    return {
      shopId: input.shopId,
      shopName,
      periodStart,
      periodEnd,
      status: "draft",
      ...totals,
      paidAmountJpy: 0,
      unpaidAmountJpy: totals.totalNetPayJpy,
      generatedById: actorUserId,
      approvedById: null,
      lockedAt: null,
      payslips
    };
  }

  private groupMetrics(
    sourceOrders: PayrollOrderFinancialSource[]
  ): Map<number, { monthlyCompletedOrders: number; monthlyServiceGmvJpy: number }> {
    const metrics = new Map<
      number,
      { monthlyCompletedOrders: number; monthlyServiceGmvJpy: number }
    >();

    sourceOrders.forEach((order) => {
      const current = metrics.get(order.technicianProfileId) ?? {
        monthlyCompletedOrders: 0,
        monthlyServiceGmvJpy: 0
      };
      current.monthlyCompletedOrders += 1;
      current.monthlyServiceGmvJpy += order.serviceAmountJpy;
      metrics.set(order.technicianProfileId, current);
    });

    return metrics;
  }

  private getPayslipAccumulator(
    grouped: Map<number, GeneratedPayslipAccumulator>,
    order: PayrollOrderFinancialSource
  ): GeneratedPayslipAccumulator {
    const existing = grouped.get(order.technicianProfileId);
    if (existing) {
      return existing;
    }
    const created: GeneratedPayslipAccumulator = {
      shopId: order.shopId,
      shopName: order.shopName,
      technicianProfileId: order.technicianProfileId,
      technicianName: order.technicianName,
      technicianUserId: order.technicianUserId ?? null,
      compensationProfileId:
        order.compensationRule.sourceType === "technician_override"
          ? order.compensationRule.id
          : null,
      baseSalaryJpy: 0,
      annualSalaryProratedJpy: 0,
      dailyWageJpy: 0,
      hourlyWageJpy: 0,
      commissionJpy: 0,
      guaranteeTopupJpy: 0,
      bonusJpy: 0,
      allowanceJpy: 0,
      deductionJpy: 0,
      platformFeeShareDeductionJpy: 0,
      netPayJpy: 0,
      lines: []
    };
    grouped.set(order.technicianProfileId, created);
    return created;
  }

  private getAdjustmentAccumulator(
    grouped: Map<number, GeneratedPayslipAccumulator>,
    shopId: number,
    adjustment: PayrollAdjustmentRequestPayload
  ): GeneratedPayslipAccumulator {
    const existing = grouped.get(adjustment.technicianProfileId);
    if (existing) {
      return existing;
    }
    const created: GeneratedPayslipAccumulator = {
      shopId,
      shopName: adjustment.shopName,
      technicianProfileId: adjustment.technicianProfileId,
      technicianName: adjustment.technicianName,
      technicianUserId: adjustment.technicianUserId,
      compensationProfileId: null,
      baseSalaryJpy: 0,
      annualSalaryProratedJpy: 0,
      dailyWageJpy: 0,
      hourlyWageJpy: 0,
      commissionJpy: 0,
      guaranteeTopupJpy: 0,
      bonusJpy: 0,
      allowanceJpy: 0,
      deductionJpy: 0,
      platformFeeShareDeductionJpy: 0,
      netPayJpy: 0,
      lines: []
    };
    grouped.set(adjustment.technicianProfileId, created);
    return created;
  }

  private applyOrderPreview(
    group: GeneratedPayslipAccumulator,
    order: PayrollOrderFinancialSource,
    preview: CompensationPreviewPayload,
    actorUserId: number
  ): void {
    group.baseSalaryJpy += preview.basePayJpy;
    group.commissionJpy += preview.commissionPayJpy;
    group.guaranteeTopupJpy += preview.minimumGuaranteeAdjustmentJpy;
    group.bonusJpy += preview.bonusPayJpy;
    group.deductionJpy += preview.deductionJpy + preview.technicianNdpShareNdp;
    group.platformFeeShareDeductionJpy += preview.technicianNdpShareNdp;
    group.netPayJpy += preview.technicianNetIncomeJpy;

    if (preview.basePayJpy > 0) {
      group.lines.push(
        this.orderLine(order, "base_salary", "基础工资", preview.basePayJpy, actorUserId)
      );
    }
    if (preview.commissionPayJpy > 0) {
      group.lines.push(
        this.orderLine(
          order,
          "commission",
          "订单分成",
          preview.commissionPayJpy,
          actorUserId,
          `${preview.serviceAmountJpy} x ${order.compensationRule.commissionRatePercent}%`
        )
      );
    }
    if (preview.minimumGuaranteeAdjustmentJpy > 0) {
      group.lines.push(
        this.orderLine(
          order,
          "guarantee_topup",
          "保底补差",
          preview.minimumGuaranteeAdjustmentJpy,
          actorUserId
        )
      );
    }
    preview.appliedBonusRules.forEach((rule) => {
      group.lines.push(
        this.orderLine(order, "bonus", rule.name, rule.amountJpy, actorUserId, null, rule.id)
      );
    });
    preview.appliedDeductionRules.forEach((rule) => {
      group.lines.push(
        this.orderLine(order, "deduction", rule.name, -rule.amountJpy, actorUserId, null, rule.id)
      );
    });
    if (preview.technicianNdpShareNdp > 0) {
      group.lines.push(
        this.orderLine(
          order,
          "platform_fee_share_deduction",
          "NDP 平台费分摊",
          -preview.technicianNdpShareNdp,
          actorUserId,
          `${preview.platformFeeNdp} NDP x ${order.compensationRule.technicianNdpSharePercent}%`
        )
      );
    }
  }

  private applyPayrollAdjustment(
    group: GeneratedPayslipAccumulator,
    adjustment: PayrollAdjustmentRequestPayload,
    actorUserId: number
  ): void {
    const absoluteAmountJpy = Math.abs(Math.round(adjustment.amountJpy));
    const signedAmountJpy =
      adjustment.adjustmentType === "deduction"
        ? -absoluteAmountJpy
        : adjustment.adjustmentType === "adjustment"
          ? Math.round(adjustment.amountJpy)
          : absoluteAmountJpy;
    const lineType: PayslipLineType =
      adjustment.adjustmentType === "deduction" ? "deduction" : adjustment.adjustmentType;

    group.lines.push(
      this.line({
        lineType,
        title: adjustment.title,
        amountJpy: signedAmountJpy,
        sourceType: "adjustment",
        sourceId: adjustment.id,
        ruleId: null,
        orderId: null,
        explanation: adjustment.reason,
        createdById: actorUserId
      })
    );

    if (lineType === "bonus") {
      group.bonusJpy += absoluteAmountJpy;
    } else if (lineType === "allowance") {
      group.allowanceJpy += absoluteAmountJpy;
    } else if (lineType === "deduction" || signedAmountJpy < 0) {
      group.deductionJpy += absoluteAmountJpy;
    } else {
      group.bonusJpy += signedAmountJpy;
    }
    group.netPayJpy += signedAmountJpy;
  }

  private collectAdjustmentApplications(
    payRun: PayRunPayload
  ): PayrollAdjustmentApplyInput["applications"] {
    return payRun.payslips.flatMap((payslip) =>
      payslip.lines.flatMap((line) =>
        line.sourceType === "adjustment" && line.sourceId
          ? [{ adjustmentId: line.sourceId, payslipLineId: line.id }]
          : []
      )
    );
  }

  private finalizePayslip(
    index: number,
    group: GeneratedPayslipAccumulator,
    periodStart: string,
    periodEnd: string
  ): PayslipPayload {
    const netPayJpy = Math.max(0, group.netPayJpy);

    return {
      id: -(index + 1),
      payRunId: 0,
      shopId: group.shopId,
      shopName: group.shopName,
      technicianProfileId: group.technicianProfileId,
      technicianName: group.technicianName,
      technicianUserId: group.technicianUserId,
      compensationProfileId: group.compensationProfileId,
      periodStart,
      periodEnd,
      status: "draft",
      disputeStatus: "none",
      disputeReason: null,
      baseSalaryJpy: group.baseSalaryJpy,
      annualSalaryProratedJpy: group.annualSalaryProratedJpy,
      dailyWageJpy: group.dailyWageJpy,
      hourlyWageJpy: group.hourlyWageJpy,
      commissionJpy: group.commissionJpy,
      guaranteeTopupJpy: group.guaranteeTopupJpy,
      bonusJpy: group.bonusJpy,
      allowanceJpy: group.allowanceJpy,
      deductionJpy: group.deductionJpy,
      platformFeeShareDeductionJpy: group.platformFeeShareDeductionJpy,
      netPayJpy,
      paidAmountJpy: 0,
      unpaidAmountJpy: netPayJpy,
      confirmedAt: null,
      disputedAt: null,
      disputeResolvedAt: null,
      disputeResolvedById: null,
      disputeResolutionNote: null,
      createdAt: new Date(0).toISOString(),
      updatedAt: new Date(0).toISOString(),
      lines: group.lines,
      payoutRecords: []
    };
  }

  private orderLine(
    order: PayrollOrderFinancialSource,
    lineType: PayslipLineType,
    title: string,
    amountJpy: number,
    actorUserId: number,
    formulaText: string | null = null,
    ruleId: string | null = null
  ): PayslipLinePayload {
    return this.line({
      lineType,
      title: `${order.orderNo} ${title}`,
      amountJpy,
      sourceType: "order",
      sourceId: order.bookingOrderId,
      ruleId,
      orderId: order.bookingOrderId,
      explanation: order.serviceName,
      createdById: actorUserId,
      formulaText
    });
  }

  private line(input: {
    lineType: PayslipLineType;
    title: string;
    amountJpy: number;
    sourceType: PayslipLineSourceType;
    sourceId: number | null;
    ruleId: string | null;
    orderId: number | null;
    explanation: string | null;
    createdById: number | null;
    formulaText?: string | null;
  }): PayslipLinePayload {
    return {
      id: 0,
      payslipId: 0,
      lineType: input.lineType,
      title: input.title,
      amountJpy: Math.round(input.amountJpy),
      quantity: 1,
      unitAmountJpy: Math.round(input.amountJpy),
      formulaText: input.formulaText ?? null,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      ruleId: input.ruleId,
      orderId: input.orderId,
      explanation: input.explanation,
      createdById: input.createdById,
      createdAt: new Date(0).toISOString(),
      updatedAt: new Date(0).toISOString()
    };
  }

  private async getPayRun(payRunId: number): Promise<PayRunPayload> {
    const payRun = await this.repository.findPayRunDetail(payRunId);
    if (!payRun) {
      throw new AppError({
        code: ERROR_CODES.NOT_FOUND,
        message: "error.payroll.pay_run_not_found",
        statusCode: 404
      });
    }
    return payRun;
  }

  private async getPayslip(payslipId: number): Promise<PayslipPayload> {
    const payslip = await this.repository.findPayslipDetail(payslipId);
    if (!payslip) {
      throw new AppError({
        code: ERROR_CODES.NOT_FOUND,
        message: "error.payroll.payslip_not_found",
        statusCode: 404
      });
    }
    return payslip;
  }

  private async getPayrollAdjustment(
    adjustmentId: number
  ): Promise<PayrollAdjustmentRequestPayload> {
    const adjustment = await this.repository.findPayrollAdjustment(adjustmentId);
    if (!adjustment) {
      throw new AppError({
        code: ERROR_CODES.NOT_FOUND,
        message: "error.payroll_adjustment.not_found",
        statusCode: 404
      });
    }
    return adjustment;
  }

  private assertPayrollAdjustmentStatus(
    adjustment: PayrollAdjustmentRequestPayload,
    allowedStatuses: PayrollAdjustmentStatus[],
    message: string
  ): void {
    if (adjustment.status === "applied") {
      this.conflict("error.payroll_adjustment.already_applied");
    }
    if (!allowedStatuses.includes(adjustment.status)) {
      this.conflict(message);
    }
  }

  private async assertPayrollPeriodOpenForAdjustment(input: {
    shopId: number;
    technicianProfileId: number;
    periodStart: string;
    periodEnd: string;
  }): Promise<void> {
    const hasClosedPayRun = await this.repository.hasClosedPayRunForPeriod(input);
    if (hasClosedPayRun) {
      this.conflict("error.payroll_adjustment.period_closed");
    }
  }

  private hasUnresolvedDispute(payRun: PayRunPayload): boolean {
    return payRun.payslips.some(
      (payslip) => payslip.status === "disputed" || payslip.disputeStatus === "disputed"
    );
  }

  private assertMerchantShopScope(actor: AuthenticatedAccessContext, shopId: number): void {
    if (actor.currentIdentityScopeType === "shop" && actor.currentIdentityScopeId === shopId) {
      return;
    }
    throw new AppError({
      code: ERROR_CODES.IDENTITY_FORBIDDEN,
      message: "error.identity.forbidden",
      statusCode: 403
    });
  }

  private getMerchantShopId(actor: AuthenticatedAccessContext): number {
    if (actor.currentIdentityScopeType === "shop" && actor.currentIdentityScopeId) {
      return actor.currentIdentityScopeId;
    }
    throw new AppError({
      code: ERROR_CODES.IDENTITY_FORBIDDEN,
      message: "error.identity.forbidden",
      statusCode: 403
    });
  }

  private getTechnicianProfileId(actor: AuthenticatedAccessContext): number {
    if (
      (actor.currentIdentityScopeType === "technician" ||
        actor.currentIdentityScopeType === "technician_profile") &&
      actor.currentIdentityScopeId
    ) {
      return actor.currentIdentityScopeId;
    }
    throw new AppError({
      code: ERROR_CODES.IDENTITY_FORBIDDEN,
      message: "error.identity.forbidden",
      statusCode: 403
    });
  }

  private assertTechnicianScope(
    actor: AuthenticatedAccessContext,
    technicianProfileId: number
  ): void {
    if (
      (actor.currentIdentityScopeType === "technician" ||
        actor.currentIdentityScopeType === "technician_profile") &&
      actor.currentIdentityScopeId === technicianProfileId
    ) {
      return;
    }
    throw new AppError({
      code: ERROR_CODES.IDENTITY_FORBIDDEN,
      message: "error.identity.forbidden",
      statusCode: 403
    });
  }

  private conflict(message: string): never {
    throw new AppError({
      code: ERROR_CODES.ORDER_INVALID_TRANSITION,
      message,
      statusCode: 409
    });
  }

  private async record(
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext,
    action: string,
    targetType: string,
    targetId: number,
    metadata?: unknown
  ): Promise<void> {
    await this.auditLogService.record({
      actor,
      action,
      targetType,
      targetId,
      context,
      metadata
    });
  }

  private buildPayRunCsvExport(prefix: string, payRuns: PayRunPayload[]): PayrollCsvExportPayload {
    const headers = [
      "shop_name",
      "period_start",
      "period_end",
      "status",
      "total_net_pay_jpy",
      "paid_amount_jpy",
      "unpaid_amount_jpy",
      "payslip_count",
      "disputed_payslips"
    ];
    const rows = payRuns.map((payRun) => [
      payRun.shopName,
      payRun.periodStart,
      payRun.periodEnd,
      payRun.status,
      payRun.totalNetPayJpy,
      payRun.paidAmountJpy,
      payRun.unpaidAmountJpy,
      payRun.payslips.length,
      payRun.payslips.filter((payslip) => payslip.disputeStatus === "disputed").length
    ]);

    return {
      filename: `${prefix}-${new Date().toISOString().slice(0, 10)}.csv`,
      contentType: "text/csv; charset=utf-8",
      csv: [headers, ...rows]
        .map((row) => row.map((cell) => this.csvCell(cell)).join(","))
        .join("\n")
    };
  }

  private buildPayslipCsvExport(
    prefix: string,
    payslips: PayslipPayload[]
  ): PayrollCsvExportPayload {
    const headers = [
      "shop_name",
      "technician_name",
      "period_start",
      "period_end",
      "status",
      "net_pay_jpy",
      "paid_amount_jpy",
      "unpaid_amount_jpy",
      "dispute_status",
      "line_count"
    ];
    const rows = payslips.map((payslip) => [
      payslip.shopName,
      payslip.technicianName,
      payslip.periodStart,
      payslip.periodEnd,
      payslip.status,
      payslip.netPayJpy,
      payslip.paidAmountJpy,
      payslip.unpaidAmountJpy,
      payslip.disputeStatus,
      payslip.lines.length
    ]);

    return {
      filename: `${prefix}-${new Date().toISOString().slice(0, 10)}.csv`,
      contentType: "text/csv; charset=utf-8",
      csv: [headers, ...rows]
        .map((row) => row.map((cell) => this.csvCell(cell)).join(","))
        .join("\n")
    };
  }

  private csvCell(value: string | number): string {
    const text = String(value);
    if (/[",\n\r]/.test(text)) {
      return `"${text.replace(/"/g, '""')}"`;
    }
    return text;
  }
}
