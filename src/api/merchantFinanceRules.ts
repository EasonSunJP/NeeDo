import { httpClient } from "./httpClient";

export type ShopFinanceWageMode = "fixed_per_order" | "commission" | "base_plus_commission" | "hourly";
export type ShopFinanceNdpBearer = "shop" | "technician" | "split";
export type ShopFinanceBonusTriggerType =
  | "monthly_order_count"
  | "monthly_service_gmv"
  | "rating_average";
export type ShopFinanceDeductionTriggerType =
  | "late_cancellation_count"
  | "rating_average_below";

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
  status: "active" | "archived";
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

export interface ShopFinanceRuleSetInput {
  name: string;
  wageMode: ShopFinanceWageMode;
  baseSalaryJpy?: number;
  hourlyRateJpy?: number;
  dailyRateJpy?: number;
  fixedOrderPayJpy?: number;
  commissionRatePercent?: number;
  guaranteedMinimumJpy?: number;
  ndpFeeBearer?: ShopFinanceNdpBearer;
  technicianNdpSharePercent?: number;
  bonusRules?: ShopFinanceBonusRulePayload[];
  deductionRules?: ShopFinanceDeductionRulePayload[];
  effectiveFrom?: string | null;
  effectiveTo?: string | null;
}

export interface ShopFinanceRulePreviewInput {
  serviceAmountJpy: number;
  platformFeeNdp?: number;
  workedMinutes?: number;
  monthlyCompletedOrders?: number;
  monthlyServiceGmvJpy?: number;
  ratingAverage?: number;
  lateCancellationCount?: number;
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

const pathForShop = (shopId: number) => `/merchant-admin/shops/${shopId}/finance/rules`;

export const merchantFinanceRulesApi = {
  get(shopId: number) {
    return httpClient.request<ShopFinanceRuleSetPayload>(pathForShop(shopId));
  },
  update(shopId: number, body: ShopFinanceRuleSetInput) {
    return httpClient.request<ShopFinanceRuleSetPayload>(pathForShop(shopId), {
      body,
      method: "PUT"
    });
  },
  preview(shopId: number, body: ShopFinanceRulePreviewInput) {
    return httpClient.request<ShopFinanceRulePreviewResult>(`${pathForShop(shopId)}/preview`, {
      body,
      method: "POST"
    });
  }
};
