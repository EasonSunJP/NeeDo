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
