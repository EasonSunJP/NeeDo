import { z } from "zod";

const paginationQuerySchema = {
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().max(100).optional()
};

const nullableDateSchema = z.coerce.date().nullable().optional();
const optionalJsonSchema = z.unknown().optional();
const clockSchema = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/);

export const feeTypeSchema = z.enum([
  "b_platform_fee",
  "c_request_dispatch_fee",
  "user_reward",
  "penalty"
]);
export const feeCalculationStageSchema = z.enum([
  "preview",
  "hold",
  "capture",
  "release",
  "reversal"
]);

export const feeRuleSetIdParamSchema = z.object({
  id: z.coerce.number().int().positive()
});

export const feeRuleSetListQuerySchema = z.object({
  ...paginationQuerySchema,
  status: z.enum(["draft", "active", "paused", "archived"]).optional()
});

const feeTierBodySchema = z.object({
  tierBasis: z.string().trim().min(1).max(60).optional(),
  tierMode: z.string().trim().min(1).max(40).optional(),
  minValue: z.number().int().min(0).optional(),
  maxValue: z.number().int().min(0).nullable().optional(),
  feeAmountNdp: z.number().int().min(0).nullable().optional(),
  adjustmentAmountNdp: z.number().int().nullable().optional(),
  adjustmentPercent: z.number().nullable().optional()
});

const feeTimeWindowBodySchema = z.object({
  timeBasis: z.string().trim().min(1).max(60).optional(),
  timezone: z.string().trim().min(1).max(80).optional(),
  dayOfWeekMask: z.string().trim().max(40).nullable().optional(),
  holidayCalendarId: z.string().trim().max(80).nullable().optional(),
  startTime: clockSchema,
  endTime: clockSchema,
  crossDay: z.boolean().optional(),
  adjustmentType: z.string().trim().min(1).max(40).optional(),
  adjustmentValueNdp: z.number().int().optional()
});

const feeRuleBodySchema = z.object({
  feeType: feeTypeSchema,
  orderType: z.enum(["all", "booking", "request"]).optional(),
  payerType: z.enum(["shop", "cast", "user", "platform", "split"]).optional(),
  baseAmountNdp: z.number().int().min(0).optional(),
  calculationMode: z.string().trim().min(1).max(40).optional(),
  holdStrategy: z.string().trim().min(1).max(40).optional(),
  pricingLockMode: z.string().trim().min(1).max(40).optional(),
  stackingMode: z.string().trim().min(1).max(40).optional(),
  priority: z.number().int().optional(),
  conditionJson: optionalJsonSchema,
  formulaJson: optionalJsonSchema,
  capJson: optionalJsonSchema,
  status: z.string().trim().min(1).max(40).optional(),
  effectiveFrom: nullableDateSchema,
  effectiveTo: nullableDateSchema,
  tiers: z.array(feeTierBodySchema).max(20).optional(),
  timeWindows: z.array(feeTimeWindowBodySchema).max(20).optional()
});

export const feeRuleSetCreateBodySchema = z.object({
  name: z.string().trim().min(1).max(160),
  description: z.string().trim().max(500).nullable().optional(),
  scopeType: z.string().trim().min(1).max(40).optional(),
  priority: z.number().int().optional(),
  status: z.enum(["draft", "active", "paused", "archived"]).optional(),
  version: z.number().int().positive().optional(),
  effectiveFrom: nullableDateSchema,
  effectiveTo: nullableDateSchema,
  rules: z.array(feeRuleBodySchema).max(50).optional()
});

export const feeRuleSetUpdateBodySchema = feeRuleSetCreateBodySchema.partial();

export const feeRulePreviewBodySchema = z.object({
  bookingOrderId: z.number().int().positive().optional(),
  orderType: z.enum(["booking", "request"]),
  stage: feeCalculationStageSchema.default("preview"),
  feeType: feeTypeSchema,
  shopId: z.number().int().positive().optional(),
  castId: z.number().int().positive().optional(),
  userId: z.number().int().positive().optional(),
  serviceId: z.number().int().positive().nullable().optional(),
  serviceCategoryId: z.number().int().positive().nullable().optional(),
  regionId: z.number().int().positive().nullable().optional(),
  city: z.string().trim().max(120).nullable().optional(),
  scheduledStartAt: z.coerce.date().optional(),
  acceptedAt: z.coerce.date().optional(),
  completedAt: z.coerce.date().optional(),
  serviceAmountJpy: z.number().int().min(0).optional(),
  paymentChannel: z.string().trim().max(60).optional(),
  timezone: z.string().trim().max(80).optional()
});

export const feeCalculationLogListQuerySchema = z.object({
  ...paginationQuerySchema,
  bookingOrderId: z.coerce.number().int().positive().optional(),
  feeType: feeTypeSchema.optional(),
  stage: feeCalculationStageSchema.optional()
});

export type FeeRuleSetCreateBody = z.infer<typeof feeRuleSetCreateBodySchema>;
export type FeeRuleSetUpdateBody = z.infer<typeof feeRuleSetUpdateBodySchema>;
export type FeeRulePreviewBody = z.infer<typeof feeRulePreviewBodySchema>;
