import { z } from "zod";

export const compensationProfileParamSchema = z.object({
  shopId: z.coerce.number().int().positive(),
  technicianProfileId: z.coerce.number().int().positive()
});

const activeFlagSchema = z.boolean().default(true);

export const compensationBonusRuleSchema = z.object({
  id: z.string().trim().min(1).max(80),
  name: z.string().trim().min(1).max(120),
  triggerType: z.enum(["monthly_order_count", "monthly_service_gmv", "rating_average"]),
  threshold: z.number().nonnegative().max(100_000_000),
  amountJpy: z.number().int().nonnegative().max(10_000_000),
  active: activeFlagSchema
});

export const compensationDeductionRuleSchema = z.object({
  id: z.string().trim().min(1).max(80),
  name: z.string().trim().min(1).max(120),
  triggerType: z.enum(["late_cancellation_count", "rating_average_below"]),
  threshold: z.number().nonnegative().max(100_000_000),
  amountJpy: z.number().int().nonnegative().max(10_000_000),
  active: activeFlagSchema
});

export const compensationProfileBodySchema = z.object({
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
  bonusRules: z.array(compensationBonusRuleSchema).max(20).default([]),
  deductionRules: z.array(compensationDeductionRuleSchema).max(20).default([]),
  effectiveFrom: z.coerce.date().nullable().optional(),
  effectiveTo: z.coerce.date().nullable().optional()
});

export const compensationProfilePreviewBodySchema = z.object({
  serviceAmountJpy: z.number().int().nonnegative().max(100_000_000),
  platformFeeNdp: z.number().int().nonnegative().max(10_000_000).default(500),
  workedMinutes: z.number().int().nonnegative().max(1440).default(60),
  monthlyCompletedOrders: z.number().int().nonnegative().max(1_000_000).default(0),
  monthlyServiceGmvJpy: z.number().int().nonnegative().max(1_000_000_000).default(0),
  ratingAverage: z.number().min(0).max(5).default(0),
  lateCancellationCount: z.number().int().nonnegative().max(1_000_000).default(0)
});

export type CompensationProfileParams = z.infer<typeof compensationProfileParamSchema>;
export type CompensationProfileBody = z.input<typeof compensationProfileBodySchema>;
export type ParsedCompensationProfileBody = z.output<typeof compensationProfileBodySchema>;
export type CompensationProfilePreviewBody = z.input<typeof compensationProfilePreviewBodySchema>;
