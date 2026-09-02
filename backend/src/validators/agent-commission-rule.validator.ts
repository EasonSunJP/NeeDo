import { z } from "zod";

const visibleText = (value: string): boolean => /[\p{L}\p{N}\p{P}\p{S}]/u.test(value);
const dateSchema = z
  .union([z.date(), z.string().datetime({ offset: true })])
  .transform((value) => (value instanceof Date ? value : new Date(value)));
const paymentDetailValueSchema = z.union([
  z.string().trim().max(255),
  z.number().finite().safe(),
  z.boolean(),
  z.null()
]);
const paymentDetailsSchema = z
  .record(z.string().trim().min(1).max(80), paymentDetailValueSchema)
  .refine((value) => Object.keys(value).length <= 20, "At most 20 payment detail fields are allowed");

export const agentCommissionRuleListQuerySchema = z
  .object({
    page: z.coerce.number().int().positive().optional(),
    pageSize: z.coerce.number().int().positive().max(100).optional(),
    at: dateSchema.optional()
  })
  .strict();

export const agentCommissionRulePublishBodySchema = z
  .object({
    fixedSuccessRewardJpy: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
    profitShareRateBps: z.number().int().min(0).max(10_000),
    paymentMethod: z.enum(["bank_transfer", "ndp", "other"]),
    paymentDetails: paymentDetailsSchema.nullable().optional(),
    effectiveFrom: dateSchema,
    reason: z.string().trim().min(1).max(500).refine(visibleText)
  })
  .strict();

export type AgentCommissionRuleListQuery = z.output<
  typeof agentCommissionRuleListQuerySchema
>;
export type AgentCommissionRulePublishBody = z.output<
  typeof agentCommissionRulePublishBodySchema
>;
