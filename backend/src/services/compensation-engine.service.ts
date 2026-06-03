export type CompensationWageMode =
  | "fixed_per_order"
  | "commission"
  | "base_plus_commission"
  | "hourly";
export type CompensationNdpBearer = "shop" | "technician" | "split";
export type CompensationRuleSourceType = "shop_default" | "technician_override";
export type CompensationBonusTriggerType =
  | "monthly_order_count"
  | "monthly_service_gmv"
  | "rating_average";
export type CompensationDeductionTriggerType = "late_cancellation_count" | "rating_average_below";

export interface CompensationAdjustmentRule {
  id: string;
  name: string;
  triggerType: CompensationBonusTriggerType | CompensationDeductionTriggerType;
  threshold: number;
  amountJpy: number;
  active: boolean;
}

export interface CompensationRuleSet {
  id: number;
  sourceType: CompensationRuleSourceType;
  shopId: number;
  technicianProfileId: number | null;
  name: string;
  wageMode: CompensationWageMode;
  baseSalaryJpy: number;
  hourlyRateJpy: number;
  dailyRateJpy: number;
  fixedOrderPayJpy: number;
  commissionRatePercent: number;
  guaranteedMinimumJpy: number;
  ndpFeeBearer: CompensationNdpBearer;
  technicianNdpSharePercent: number;
  bonusRules: CompensationAdjustmentRule[];
  deductionRules: CompensationAdjustmentRule[];
}

export interface CompensationPreviewInput {
  serviceAmountJpy: number;
  platformFeeNdp?: number;
  workedMinutes?: number;
  monthlyCompletedOrders?: number;
  monthlyServiceGmvJpy?: number;
  ratingAverage?: number;
  lateCancellationCount?: number;
}

export interface AppliedCompensationAdjustment {
  id: string;
  name: string;
  amountJpy: number;
}

export interface CompensationPreviewPayload {
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
  shopEstimatedGrossProfitJpy: number;
  appliedBonusRules: AppliedCompensationAdjustment[];
  appliedDeductionRules: AppliedCompensationAdjustment[];
  explanation: string[];
}

export class CompensationEngine {
  public calculate(
    ruleSet: CompensationRuleSet,
    input: CompensationPreviewInput
  ): CompensationPreviewPayload {
    const serviceAmountJpy = Math.round(input.serviceAmountJpy);
    const platformFeeNdp = Math.round(input.platformFeeNdp ?? 500);
    const workedMinutes = Math.max(0, input.workedMinutes ?? 60);
    const basePayJpy = this.calculateBasePay(ruleSet, workedMinutes);
    const commissionPayJpy = this.calculateCommission(ruleSet, serviceAmountJpy);
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
    const shopEstimatedGrossProfitJpy =
      serviceAmountJpy - technicianGrossIncomeJpy - shopNdpShareNdp;

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
      shopEstimatedGrossProfitJpy,
      appliedBonusRules,
      appliedDeductionRules,
      explanation: [
        `source:${ruleSet.sourceType}`,
        `wage_mode:${ruleSet.wageMode}`,
        `ndp_fee_bearer:${ruleSet.ndpFeeBearer}`,
        `commission_rate_percent:${ruleSet.commissionRatePercent}`
      ]
    };
  }

  private calculateBasePay(ruleSet: CompensationRuleSet, workedMinutes: number): number {
    if (ruleSet.wageMode === "fixed_per_order" || ruleSet.wageMode === "base_plus_commission") {
      return ruleSet.fixedOrderPayJpy;
    }

    if (ruleSet.wageMode === "hourly") {
      return Math.round((workedMinutes / 60) * ruleSet.hourlyRateJpy);
    }

    return 0;
  }

  private calculateCommission(ruleSet: CompensationRuleSet, serviceAmountJpy: number): number {
    if (ruleSet.wageMode === "commission" || ruleSet.wageMode === "base_plus_commission") {
      return Math.round(serviceAmountJpy * (ruleSet.commissionRatePercent / 100));
    }

    return 0;
  }

  private evaluateBonusRules(
    ruleSet: CompensationRuleSet,
    input: CompensationPreviewInput
  ): AppliedCompensationAdjustment[] {
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
    ruleSet: CompensationRuleSet,
    input: CompensationPreviewInput
  ): AppliedCompensationAdjustment[] {
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
    ruleSet: CompensationRuleSet,
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
}
