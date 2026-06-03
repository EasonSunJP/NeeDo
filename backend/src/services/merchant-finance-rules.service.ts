import { ERROR_CODES } from "../constants/error-codes";
import { AppError } from "../utils/app-error";
import type {
  ParsedShopFinanceRuleSetBody,
  ShopFinanceRulePreviewBody,
  ShopFinanceRuleSetBody
} from "../validators/merchant-finance-rules.validator";
import type { AuditLogService } from "./audit-log.service";
import type { AuthRequestContext, AuthenticatedAccessContext } from "./auth.service";

export type ShopFinanceRuleStatus = "active" | "archived";
export type ShopFinanceWageMode =
  | "fixed_per_order"
  | "commission"
  | "base_plus_commission"
  | "hourly";
export type ShopFinanceNdpBearer = "shop" | "technician" | "split";
export type ShopFinanceBonusTriggerType =
  | "monthly_order_count"
  | "monthly_service_gmv"
  | "rating_average";
export type ShopFinanceDeductionTriggerType = "late_cancellation_count" | "rating_average_below";

export interface ShopFinanceBonusRulePayload {
  id: string;
  name: string;
  triggerType: ShopFinanceBonusTriggerType;
  threshold: number;
  amountJpy: number;
  active: boolean;
}

export interface ShopFinanceDeductionRulePayload {
  id: string;
  name: string;
  triggerType: ShopFinanceDeductionTriggerType;
  threshold: number;
  amountJpy: number;
  active: boolean;
}

export interface ShopFinanceRuleSetPayload {
  id: number;
  shopId: number;
  name: string;
  status: ShopFinanceRuleStatus;
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
  createdById: number | null;
  updatedById: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface AppliedShopFinanceAdjustment {
  id: string;
  name: string;
  amountJpy: number;
}

export interface ShopFinanceRulePreviewPayload {
  serviceAmountJpy: number;
  platformFeeNdp: number;
  basePayJpy: number;
  commissionPayJpy: number;
  minimumGuaranteeAdjustmentJpy: number;
  bonusPayJpy: number;
  deductionJpy: number;
  technicianGrossIncomeJpy: number;
  technicianNdpShareNdp: number;
  shopNdpShareNdp: number;
  technicianNetIncomeJpy: number;
  shopGrossMarginJpy: number;
  appliedBonusRules: AppliedShopFinanceAdjustment[];
  appliedDeductionRules: AppliedShopFinanceAdjustment[];
  explanation: string[];
}

export interface ShopFinanceRulePreviewResult {
  shopId: number;
  ruleSet: ShopFinanceRuleSetPayload;
  preview: ShopFinanceRulePreviewPayload;
}

export interface MerchantFinanceRulesRepositoryPort {
  findActiveRuleSet: (shopId: number) => Promise<ShopFinanceRuleSetPayload | null>;
  replaceActiveRuleSet: (
    shopId: number,
    input: ParsedShopFinanceRuleSetBody,
    actorUserId: number
  ) => Promise<ShopFinanceRuleSetPayload>;
}

type AuditRecorder = Pick<AuditLogService, "record">;

const defaultRuleSetForShop = (shopId: number): ShopFinanceRuleSetPayload => {
  const timestamp = new Date(0).toISOString();

  return {
    id: 0,
    shopId,
    name: "Default merchant finance rules",
    status: "active",
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
    effectiveFrom: null,
    effectiveTo: null,
    createdById: null,
    updatedById: null,
    createdAt: timestamp,
    updatedAt: timestamp
  };
};

export class MerchantFinanceRulesService {
  public constructor(
    private readonly repository: MerchantFinanceRulesRepositoryPort,
    private readonly auditLogService: AuditRecorder
  ) {}

  public async getShopFinanceRuleSet(
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext,
    shopId: number
  ): Promise<ShopFinanceRuleSetPayload> {
    this.assertMerchantShopScope(actor, shopId);
    const ruleSet = await this.getExistingRuleSet(shopId);
    await this.record(actor, context, "merchant_admin.finance_rules.read", shopId, {
      ruleSetId: ruleSet.id
    });

    return ruleSet;
  }

  public async updateShopFinanceRuleSet(
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext,
    shopId: number,
    input: ShopFinanceRuleSetBody
  ): Promise<ShopFinanceRuleSetPayload> {
    this.assertMerchantShopScope(actor, shopId);
    const previous = await this.getExistingRuleSet(shopId);
    const next = await this.repository.replaceActiveRuleSet(
      shopId,
      this.normalizeRuleSetInput(input),
      actor.userId
    );
    await this.record(actor, context, "merchant_admin.finance_rules.update", shopId, {
      previousRuleSetId: previous.id,
      nextRuleSetId: next.id,
      previousWageMode: previous.wageMode,
      nextWageMode: next.wageMode,
      previousNdpFeeBearer: previous.ndpFeeBearer,
      nextNdpFeeBearer: next.ndpFeeBearer
    });

    return next;
  }

  public async previewShopFinanceRule(
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext,
    shopId: number,
    input: ShopFinanceRulePreviewBody
  ): Promise<ShopFinanceRulePreviewResult> {
    this.assertMerchantShopScope(actor, shopId);
    const ruleSet = await this.getExistingRuleSet(shopId);
    const preview = this.calculatePreview(ruleSet, input);
    await this.record(actor, context, "merchant_admin.finance_rules.preview", shopId, {
      ruleSetId: ruleSet.id,
      serviceAmountJpy: preview.serviceAmountJpy,
      technicianGrossIncomeJpy: preview.technicianGrossIncomeJpy,
      shopGrossMarginJpy: preview.shopGrossMarginJpy
    });

    return { shopId, ruleSet, preview };
  }

  private async getExistingRuleSet(shopId: number): Promise<ShopFinanceRuleSetPayload> {
    return (await this.repository.findActiveRuleSet(shopId)) ?? defaultRuleSetForShop(shopId);
  }

  private normalizeRuleSetInput(input: ShopFinanceRuleSetBody): ParsedShopFinanceRuleSetBody {
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
      effectiveFrom: input.effectiveFrom,
      effectiveTo: input.effectiveTo
    };
  }

  private calculatePreview(
    ruleSet: ShopFinanceRuleSetPayload,
    input: ShopFinanceRulePreviewBody
  ): ShopFinanceRulePreviewPayload {
    const serviceAmountJpy = Math.round(input.serviceAmountJpy);
    const platformFeeNdp = Math.round(input.platformFeeNdp ?? 500);
    const commissionPayJpy = this.calculateCommission(ruleSet, serviceAmountJpy);
    const basePayJpy = this.calculateBasePay(ruleSet, input.workedMinutes ?? 60);
    const minimumGuaranteeAdjustmentJpy = Math.max(
      0,
      ruleSet.guaranteedMinimumJpy - basePayJpy - commissionPayJpy
    );
    const appliedBonusRules = this.evaluateBonusRules(ruleSet, input);
    const appliedDeductionRules = this.evaluateDeductionRules(ruleSet, input);
    const bonusPayJpy = appliedBonusRules.reduce((sum, rule) => sum + rule.amountJpy, 0);
    const deductionJpy = appliedDeductionRules.reduce((sum, rule) => sum + rule.amountJpy, 0);
    const technicianGrossIncomeJpy = Math.max(
      0,
      basePayJpy + commissionPayJpy + minimumGuaranteeAdjustmentJpy + bonusPayJpy - deductionJpy
    );
    const { shopNdpShareNdp, technicianNdpShareNdp } = this.splitPlatformFee(
      ruleSet,
      platformFeeNdp
    );
    const technicianNetIncomeJpy = Math.max(0, technicianGrossIncomeJpy - technicianNdpShareNdp);
    const shopGrossMarginJpy = serviceAmountJpy - technicianGrossIncomeJpy - shopNdpShareNdp;

    return {
      serviceAmountJpy,
      platformFeeNdp,
      basePayJpy,
      commissionPayJpy,
      minimumGuaranteeAdjustmentJpy,
      bonusPayJpy,
      deductionJpy,
      technicianGrossIncomeJpy,
      technicianNdpShareNdp,
      shopNdpShareNdp,
      technicianNetIncomeJpy,
      shopGrossMarginJpy,
      appliedBonusRules,
      appliedDeductionRules,
      explanation: [
        `wage_mode:${ruleSet.wageMode}`,
        `ndp_fee_bearer:${ruleSet.ndpFeeBearer}`,
        `commission_rate_percent:${ruleSet.commissionRatePercent}`
      ]
    };
  }

  private calculateBasePay(ruleSet: ShopFinanceRuleSetPayload, workedMinutes: number): number {
    if (ruleSet.wageMode === "fixed_per_order" || ruleSet.wageMode === "base_plus_commission") {
      return ruleSet.fixedOrderPayJpy;
    }

    if (ruleSet.wageMode === "hourly") {
      return Math.round((Math.max(0, workedMinutes) / 60) * ruleSet.hourlyRateJpy);
    }

    return 0;
  }

  private calculateCommission(
    ruleSet: ShopFinanceRuleSetPayload,
    serviceAmountJpy: number
  ): number {
    if (ruleSet.wageMode === "commission" || ruleSet.wageMode === "base_plus_commission") {
      return Math.round(serviceAmountJpy * (ruleSet.commissionRatePercent / 100));
    }

    return 0;
  }

  private evaluateBonusRules(
    ruleSet: ShopFinanceRuleSetPayload,
    input: ShopFinanceRulePreviewBody
  ): AppliedShopFinanceAdjustment[] {
    return ruleSet.bonusRules
      .filter((rule) => rule.active)
      .filter((rule) => {
        if (rule.triggerType === "monthly_order_count") {
          return (input.monthlyCompletedOrders ?? 0) >= rule.threshold;
        }
        if (rule.triggerType === "monthly_service_gmv") {
          return (input.monthlyServiceGmvJpy ?? 0) >= rule.threshold;
        }

        return (input.ratingAverage ?? 0) >= rule.threshold;
      })
      .map((rule) => ({
        id: rule.id,
        name: rule.name,
        amountJpy: rule.amountJpy
      }));
  }

  private evaluateDeductionRules(
    ruleSet: ShopFinanceRuleSetPayload,
    input: ShopFinanceRulePreviewBody
  ): AppliedShopFinanceAdjustment[] {
    return ruleSet.deductionRules
      .filter((rule) => rule.active)
      .filter((rule) => {
        if (rule.triggerType === "late_cancellation_count") {
          return (input.lateCancellationCount ?? 0) >= rule.threshold;
        }

        return (input.ratingAverage ?? 5) < rule.threshold;
      })
      .map((rule) => ({
        id: rule.id,
        name: rule.name,
        amountJpy: rule.amountJpy
      }));
  }

  private splitPlatformFee(
    ruleSet: ShopFinanceRuleSetPayload,
    platformFeeNdp: number
  ): { shopNdpShareNdp: number; technicianNdpShareNdp: number } {
    if (ruleSet.ndpFeeBearer === "technician") {
      return { shopNdpShareNdp: 0, technicianNdpShareNdp: platformFeeNdp };
    }

    if (ruleSet.ndpFeeBearer === "split") {
      const technicianNdpShareNdp = Math.round(
        platformFeeNdp * (ruleSet.technicianNdpSharePercent / 100)
      );
      return {
        shopNdpShareNdp: platformFeeNdp - technicianNdpShareNdp,
        technicianNdpShareNdp
      };
    }

    return { shopNdpShareNdp: platformFeeNdp, technicianNdpShareNdp: 0 };
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
    shopId: number,
    metadata?: unknown
  ): Promise<void> {
    await this.auditLogService.record({
      actor,
      action,
      targetType: "shop",
      targetId: shopId,
      context,
      metadata
    });
  }
}
