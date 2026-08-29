import { z } from "zod";

const feeRuleMutationFields = {
  feeBps: z.number().int().min(0).max(10_000),
  expectedVersion: z.number().int().min(0),
  effectiveFrom: z.union([
    z.date(),
    z
      .string()
      .datetime({ offset: true })
      .transform((value) => new Date(value))
  ]),
  reason: z.string().trim().min(1).max(500)
};

export const affiliatePlatformFeeRuleCreateBodySchema = z.discriminatedUnion("scopeType", [
  z
    .object({
      scopeType: z.literal("global"),
      shopId: z.null(),
      ...feeRuleMutationFields
    })
    .strict(),
  z
    .object({
      scopeType: z.literal("shop"),
      shopId: z.number().int().positive(),
      ...feeRuleMutationFields
    })
    .strict()
]);

export const affiliatePlatformFeeRuleListQuerySchema = z
  .object({
    page: z.coerce.number().int().positive().optional(),
    pageSize: z.coerce.number().int().positive().max(100).optional(),
    scopeType: z.enum(["global", "shop"]).optional(),
    shopId: z.coerce.number().int().positive().optional()
  })
  .strict()
  .superRefine((value, context) => {
    if (value.scopeType === "global" && value.shopId !== undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["shopId"],
        message: "shopId cannot be used with global scope"
      });
    }
  });

export type AffiliatePlatformFeeRuleCreateBody = z.infer<
  typeof affiliatePlatformFeeRuleCreateBodySchema
>;
export type AffiliatePlatformFeeRuleListQuery = z.infer<
  typeof affiliatePlatformFeeRuleListQuerySchema
>;
