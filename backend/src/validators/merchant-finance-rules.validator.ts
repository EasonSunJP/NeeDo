import { z } from "zod";

export const merchantFinanceShopIdParamSchema = z.object({
  shopId: z.coerce.number().int().positive()
});

const activeFlagSchema = z.boolean().default(true);

export const shopFinanceBonusRuleSchema = z.object({
  id: z.string().trim().min(1).max(80),
  name: z.string().trim().min(1).max(120),
  triggerType: z.enum(["monthly_order_count", "monthly_service_gmv", "rating_average"]),
  threshold: z.number().nonnegative().max(100_000_000),
  amountJpy: z.number().int().nonnegative().max(10_000_000),
  active: activeFlagSchema
});

export const shopFinanceDeductionRuleSchema = z.object({
  id: z.string().trim().min(1).max(80),
  name: z.string().trim().min(1).max(120),
  triggerType: z.enum(["late_cancellation_count", "rating_average_below"]),
  threshold: z.number().nonnegative().max(100_000_000),
  amountJpy: z.number().int().nonnegative().max(10_000_000),
  active: activeFlagSchema
});

export const shopFinanceRuleSetBodySchema = z.object({
  name: z.string().trim().min(1).max(160),
  wageMode: z.enum(["fixed_per_order", "commission", "base_plus_commission", "hourly"]),
  baseSalaryJpy: z.number().int().nonnegative().max(100_000_000).default(0),
  hourlyRateJpy: z.number().int().nonnegative().max(10_000_000).default(0),
  dailyRateJpy: z.number().int().nonnegative().max(10_000_000).default(0),
  fixedOrderPayJpy: z.number().int().nonnegative().max(10_000_000).default(0),
  commissionRatePercent: z.number().min(0).max(100).default(60),
  guaranteedMinimumJpy: z.number().int().nonnegative().max(10_000_000).default(0),
  ndpFeeBearer: z.enum(["shop", "technician", "split"]).default("shop"),
  technicianNdpSharePercent: z.number().min(0).max(100).default(0),
  bonusRules: z.array(shopFinanceBonusRuleSchema).max(20).default([]),
  deductionRules: z.array(shopFinanceDeductionRuleSchema).max(20).default([]),
  effectiveFrom: z.coerce.date().nullable().optional(),
  effectiveTo: z.coerce.date().nullable().optional()
});

export const shopFinanceRulePreviewBodySchema = z.object({
  serviceAmountJpy: z.number().int().nonnegative().max(100_000_000),
  platformFeeNdp: z.number().int().nonnegative().max(10_000_000).default(500),
  workedMinutes: z.number().int().nonnegative().max(1440).default(60),
  monthlyCompletedOrders: z.number().int().nonnegative().max(1_000_000).default(0),
  monthlyServiceGmvJpy: z.number().int().nonnegative().max(1_000_000_000).default(0),
  ratingAverage: z.number().min(0).max(5).default(0),
  lateCancellationCount: z.number().int().nonnegative().max(1_000_000).default(0)
});

export type MerchantFinanceShopIdParams = z.infer<typeof merchantFinanceShopIdParamSchema>;
export type ShopFinanceRuleSetBody = z.input<typeof shopFinanceRuleSetBodySchema>;
export type ParsedShopFinanceRuleSetBody = z.output<typeof shopFinanceRuleSetBodySchema>;
export type ShopFinanceRulePreviewBody = z.input<typeof shopFinanceRulePreviewBodySchema>;
