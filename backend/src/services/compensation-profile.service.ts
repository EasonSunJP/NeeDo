import { ERROR_CODES } from "../constants/error-codes";
import { AppError } from "../utils/app-error";
import type {
  CompensationProfileBody,
  CompensationProfilePreviewBody,
  ParsedCompensationProfileBody
} from "../validators/compensation-profile.validator";
import type { AuditLogService } from "./audit-log.service";
import type {
  CompensationPreviewPayload,
  CompensationRuleSet
} from "./compensation-engine.service";
import { CompensationEngine } from "./compensation-engine.service";
import type { AuthRequestContext, AuthenticatedAccessContext } from "./auth.service";

export interface CompensationProfilePayload extends CompensationRuleSet {
  version: number;
  status: "active" | "archived";
  effectiveFrom: string | null;
  effectiveTo: string | null;
  createdById: number | null;
  updatedById: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface CompensationProfilePreviewResult {
  shopId: number;
  technicianProfileId: number;
  profile: CompensationProfilePayload;
  preview: CompensationPreviewPayload;
}

export interface EmployeePayrollSummaryPayload {
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

export type EmployeeCompensationProfilePayload = Omit<
  CompensationProfilePayload,
  | "id"
  | "shopId"
  | "technicianProfileId"
  | "createdById"
  | "updatedById"
>;

export interface EmployeeCompensationResult {
  employee: { needoId: string };
  profile: EmployeeCompensationProfilePayload;
  payrollSummary: EmployeePayrollSummaryPayload;
}

export interface EmployeeCompensationPreviewResult {
  employee: { needoId: string };
  profile: EmployeeCompensationProfilePayload;
  preview: CompensationPreviewPayload;
}

export interface CompensationProfileRepositoryPort {
  findActiveProfile: (
    shopId: number,
    technicianProfileId: number
  ) => Promise<CompensationProfilePayload | null>;
  findShopFallbackRule: (shopId: number) => Promise<CompensationRuleSet | null>;
  replaceActiveProfile: (
    shopId: number,
    technicianProfileId: number,
    input: ParsedCompensationProfileBody,
    actorUserId: number
  ) => Promise<CompensationProfilePayload>;
  findCurrentEmployeeAffiliation: (
    shopId: number,
    needoId: string
  ) => Promise<{ id: number; technicianProfileId: number } | null>;
  findEmployeePayrollSummary: (
    shopId: number,
    technicianProfileId: number
  ) => Promise<EmployeePayrollSummaryPayload>;
}

type AuditRecorder = Pick<AuditLogService, "record">;

export class CompensationProfileService {
  public constructor(
    private readonly repository: CompensationProfileRepositoryPort,
    private readonly auditLogService: AuditRecorder,
    private readonly compensationEngine = new CompensationEngine()
  ) {}

  public async getCompensationProfile(
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext,
    shopId: number,
    technicianProfileId: number
  ): Promise<CompensationProfilePayload> {
    this.assertMerchantShopScope(actor, shopId);
    const profile = await this.getProfileOrFallback(shopId, technicianProfileId);
    await this.record(
      actor,
      context,
      "merchant_admin.compensation_profile.read",
      technicianProfileId,
      {
        shopId,
        sourceType: profile.sourceType
      }
    );

    return profile;
  }

  public async updateCompensationProfile(
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext,
    shopId: number,
    technicianProfileId: number,
    input: CompensationProfileBody
  ): Promise<CompensationProfilePayload> {
    this.assertMerchantShopScope(actor, shopId);
    const next = await this.repository.replaceActiveProfile(
      shopId,
      technicianProfileId,
      this.normalizeProfileInput(input),
      actor.userId
    );
    await this.record(
      actor,
      context,
      "merchant_admin.compensation_profile.update",
      technicianProfileId,
      {
        shopId,
        profileId: next.id,
        wageMode: next.wageMode,
        ndpFeeBearer: next.ndpFeeBearer
      }
    );

    return next;
  }

  public async previewCompensationProfile(
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext,
    shopId: number,
    technicianProfileId: number,
    input: CompensationProfilePreviewBody
  ): Promise<CompensationProfilePreviewResult> {
    this.assertMerchantShopScope(actor, shopId);
    const profile = await this.getProfileOrFallback(shopId, technicianProfileId);
    const preview = this.compensationEngine.calculate(profile, input);
    await this.record(
      actor,
      context,
      "merchant_admin.compensation_profile.preview",
      technicianProfileId,
      {
        shopId,
        profileId: profile.id,
        technicianNetIncomeJpy: preview.technicianNetIncomeJpy,
        shopEstimatedGrossProfitJpy: preview.shopEstimatedGrossProfitJpy
      }
    );

    return { shopId, technicianProfileId, profile, preview };
  }

  public async getEmployeeCompensationProfile(
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext,
    needoId: string
  ): Promise<EmployeeCompensationResult> {
    const shopId = this.requireMerchantShopScope(actor);
    const affiliation = await this.requireEmployeeAffiliation(shopId, needoId);
    const [profile, payrollSummary] = await Promise.all([
      this.getProfileOrFallback(shopId, affiliation.technicianProfileId),
      this.repository.findEmployeePayrollSummary(shopId, affiliation.technicianProfileId)
    ]);
    await this.recordEmployee(
      actor,
      context,
      "merchant_admin.compensation_profile.read",
      affiliation.id,
      { shopId, sourceType: profile.sourceType }
    );
    return {
      employee: { needoId },
      profile: this.toEmployeeProfile(profile),
      payrollSummary
    };
  }

  public async updateEmployeeCompensationProfile(
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext,
    needoId: string,
    input: CompensationProfileBody
  ): Promise<EmployeeCompensationResult> {
    const shopId = this.requireMerchantShopScope(actor);
    const affiliation = await this.requireEmployeeAffiliation(shopId, needoId);
    const profile = await this.repository.replaceActiveProfile(
      shopId,
      affiliation.technicianProfileId,
      this.normalizeProfileInput(input),
      actor.userId
    );
    const payrollSummary = await this.repository.findEmployeePayrollSummary(
      shopId,
      affiliation.technicianProfileId
    );
    await this.recordEmployee(
      actor,
      context,
      "merchant_admin.compensation_profile.update",
      affiliation.id,
      {
        shopId,
        profileId: profile.id,
        wageMode: profile.wageMode,
        ndpFeeBearer: profile.ndpFeeBearer
      }
    );
    return {
      employee: { needoId },
      profile: this.toEmployeeProfile(profile),
      payrollSummary
    };
  }

  public async previewEmployeeCompensationProfile(
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext,
    needoId: string,
    input: CompensationProfilePreviewBody
  ): Promise<EmployeeCompensationPreviewResult> {
    const shopId = this.requireMerchantShopScope(actor);
    const affiliation = await this.requireEmployeeAffiliation(shopId, needoId);
    const profile = await this.getProfileOrFallback(shopId, affiliation.technicianProfileId);
    const preview = this.compensationEngine.calculate(profile, input);
    await this.recordEmployee(
      actor,
      context,
      "merchant_admin.compensation_profile.preview",
      affiliation.id,
      {
        shopId,
        profileId: profile.id,
        technicianNetIncomeJpy: preview.technicianNetIncomeJpy,
        shopEstimatedGrossProfitJpy: preview.shopEstimatedGrossProfitJpy
      }
    );
    return { employee: { needoId }, profile: this.toEmployeeProfile(profile), preview };
  }

  private toEmployeeProfile(
    profile: CompensationProfilePayload
  ): EmployeeCompensationProfilePayload {
    return {
      sourceType: profile.sourceType,
      name: profile.name,
      wageMode: profile.wageMode,
      baseSalaryJpy: profile.baseSalaryJpy,
      hourlyRateJpy: profile.hourlyRateJpy,
      dailyRateJpy: profile.dailyRateJpy,
      fixedOrderPayJpy: profile.fixedOrderPayJpy,
      commissionRatePercent: profile.commissionRatePercent,
      guaranteedMinimumJpy: profile.guaranteedMinimumJpy,
      ndpFeeBearer: profile.ndpFeeBearer,
      technicianNdpSharePercent: profile.technicianNdpSharePercent,
      bonusRules: profile.bonusRules,
      deductionRules: profile.deductionRules,
      version: profile.version,
      status: profile.status,
      effectiveFrom: profile.effectiveFrom,
      effectiveTo: profile.effectiveTo,
      createdAt: profile.createdAt,
      updatedAt: profile.updatedAt
    };
  }

  private async getProfileOrFallback(
    shopId: number,
    technicianProfileId: number
  ): Promise<CompensationProfilePayload> {
    const activeProfile = await this.repository.findActiveProfile(shopId, technicianProfileId);

    if (activeProfile) {
      return activeProfile;
    }

    const fallback = await this.repository.findShopFallbackRule(shopId);

    if (!fallback) {
      return this.defaultProfile(shopId, technicianProfileId);
    }

    const timestamp = new Date(0).toISOString();

    return {
      ...fallback,
      sourceType: "shop_default",
      technicianProfileId,
      version: 0,
      status: "active",
      effectiveFrom: null,
      effectiveTo: null,
      createdById: null,
      updatedById: null,
      createdAt: timestamp,
      updatedAt: timestamp
    };
  }

  private normalizeProfileInput(input: CompensationProfileBody): ParsedCompensationProfileBody {
    return {
      name: input.name,
      wageMode: input.wageMode,
      baseSalaryJpy: input.baseSalaryJpy ?? 0,
      hourlyRateJpy: input.hourlyRateJpy ?? 0,
      dailyRateJpy: input.dailyRateJpy ?? 0,
      fixedOrderPayJpy: input.fixedOrderPayJpy ?? 0,
      commissionRatePercent: input.commissionRatePercent ?? 60,
      guaranteedMinimumJpy: input.guaranteedMinimumJpy ?? 0,
      ndpFeeBearer: input.ndpFeeBearer ?? "shop",
      technicianNdpSharePercent:
        input.ndpFeeBearer === "split"
          ? (input.technicianNdpSharePercent ?? 50)
          : (input.technicianNdpSharePercent ?? 0),
      bonusRules: (input.bonusRules ?? []).map((rule) => ({
        ...rule,
        active: rule.active ?? true
      })),
      deductionRules: (input.deductionRules ?? []).map((rule) => ({
        ...rule,
        active: rule.active ?? true
      })),
      effectiveFrom: input.effectiveFrom ?? null,
      effectiveTo: input.effectiveTo ?? null
    };
  }

  private defaultProfile(shopId: number, technicianProfileId: number): CompensationProfilePayload {
    const timestamp = new Date(0).toISOString();

    return {
      id: 0,
      sourceType: "shop_default",
      shopId,
      technicianProfileId,
      name: "Default compensation profile",
      wageMode: "commission",
      baseSalaryJpy: 0,
      hourlyRateJpy: 0,
      dailyRateJpy: 0,
      fixedOrderPayJpy: 0,
      commissionRatePercent: 60,
      guaranteedMinimumJpy: 0,
      ndpFeeBearer: "shop",
      technicianNdpSharePercent: 0,
      bonusRules: [],
      deductionRules: [],
      version: 0,
      status: "active",
      effectiveFrom: null,
      effectiveTo: null,
      createdById: null,
      updatedById: null,
      createdAt: timestamp,
      updatedAt: timestamp
    };
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

  private requireMerchantShopScope(actor: AuthenticatedAccessContext): number {
    if (
      actor.currentIdentityScopeType === "shop" &&
      typeof actor.currentIdentityScopeId === "number" &&
      actor.currentIdentityScopeId > 0
    ) {
      return actor.currentIdentityScopeId;
    }
    throw new AppError({
      code: ERROR_CODES.IDENTITY_FORBIDDEN,
      message: "error.identity.forbidden",
      statusCode: 403
    });
  }

  private async requireEmployeeAffiliation(shopId: number, needoId: string) {
    const affiliation = await this.repository.findCurrentEmployeeAffiliation(shopId, needoId);
    if (affiliation) return affiliation;
    throw new AppError({
      code: ERROR_CODES.TECHNICIAN_AFFILIATION_NOT_FOUND,
      message: "error.technician_affiliation.not_found",
      statusCode: 404
    });
  }

  private async recordEmployee(
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext,
    action: string,
    affiliationId: number,
    metadata?: unknown
  ): Promise<void> {
    await this.auditLogService.record({
      actor,
      action,
      targetType: "technician_shop_affiliation",
      targetId: affiliationId,
      context,
      metadata
    });
  }

  private async record(
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext,
    action: string,
    technicianProfileId: number,
    metadata?: unknown
  ): Promise<void> {
    await this.auditLogService.record({
      actor,
      action,
      targetType: "technician_profile",
      targetId: technicianProfileId,
      context,
      metadata
    });
  }
}
