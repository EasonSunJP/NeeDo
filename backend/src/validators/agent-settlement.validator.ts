import { z } from "zod";
import { publicIdentifierSchema } from "./public-identifier.validator";

const visibleText = (value: string): boolean => /[\p{L}\p{N}\p{P}\p{S}]/u.test(value);
const reasonSchema = z.string().trim().min(1).max(500).refine(visibleText);
const calendarDateSchema = z
  .union([z.date(), z.string().regex(/^\d{4}-\d{2}-\d{2}$/)])
  .transform((value, context) => {
    if (value instanceof Date) return value;
    const parsed = new Date(`${value}T00:00:00.000Z`);
    if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "Invalid calendar date" });
      return z.NEVER;
    }
    return parsed;
  });
const shopPublicIdSchema = publicIdentifierSchema
  .refine((value) => value.kind === "SHOP", "Shop public identifier is required")
  .transform((value) => value.publicId);
const jpySchema = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);

const externalDeductionSchema = z
  .object({
    shopPublicId: shopPublicIdSchema,
    channelFeesJpy: jpySchema,
    consumptionTaxJpy: jpySchema,
    evidenceReference: z.string().trim().min(1).max(255).refine(visibleText),
    reason: reasonSchema
  })
  .strict();

const settlementPeriodFields = {
  periodStart: calendarDateSchema,
  periodEnd: calendarDateSchema,
  externalDeductions: z.array(externalDeductionSchema).min(1).max(500)
} as const;

const validatePeriod = (
  value: {
    periodStart: Date;
    periodEnd: Date;
    externalDeductions: Array<{ shopPublicId: string }>;
  },
  context: z.RefinementCtx
): void => {
  if (value.periodEnd < value.periodStart) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Invalid settlement period" });
  }
  if (
    new Set(value.externalDeductions.map((deduction) => deduction.shopPublicId)).size !==
    value.externalDeductions.length
  ) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Duplicate deduction shop" });
  }
};

export const agentSettlementPreviewBodySchema = z
  .object(settlementPeriodFields)
  .strict()
  .superRefine(validatePeriod);

export const agentSettlementConfirmBodySchema = z
  .object({
    ...settlementPeriodFields,
    idempotencyKey: z.string().trim().min(8).max(160)
  })
  .strict()
  .superRefine(validatePeriod);

export const agentSettlementListQuerySchema = z
  .object({
    page: z.coerce.number().int().positive().optional(),
    pageSize: z.coerce.number().int().positive().max(100).optional(),
    status: z.enum(["confirmed", "paid"]).optional(),
    periodStart: calendarDateSchema.optional(),
    periodEnd: calendarDateSchema.optional()
  })
  .strict()
  .superRefine((value, context) => {
    if (value.periodStart && value.periodEnd && value.periodEnd < value.periodStart) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "Invalid settlement period" });
    }
  });

export const agentSettlementParamSchema = z
  .object({ agentPublicId: z.string().uuid(), settlementPublicId: z.string().uuid() })
  .strict();

export const agentSettlementAgentParamSchema = z
  .object({ agentPublicId: z.string().uuid() })
  .strict();

export const agentSettlementPaymentBodySchema = z
  .object({
    paymentMethod: z.enum(["bank_transfer", "ndp", "other"]),
    paymentReference: z.string().trim().min(1).max(255).refine(visibleText),
    reason: reasonSchema
  })
  .strict();

export type AgentSettlementPreviewBody = z.output<typeof agentSettlementPreviewBodySchema>;
export type AgentSettlementConfirmBody = z.output<typeof agentSettlementConfirmBodySchema>;
export type AgentSettlementListQuery = z.output<typeof agentSettlementListQuerySchema>;
export type AgentSettlementPaymentBody = z.output<typeof agentSettlementPaymentBodySchema>;
