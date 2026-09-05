import { z } from "zod";

const safeDatabaseInt = z.number().int().min(0).max(2_147_483_647);
const statusSchema = z.enum([
  "pending",
  "approved",
  "rejected",
  "cancelled",
  "expired",
  "invalidated"
]);

export const shopMembershipCardAdjustmentPublicIdParamSchema = z
  .object({
    publicId: z.string().trim().uuid()
  })
  .strict();

export const shopMembershipCardAdjustmentCreateBodySchema = z
  .object({
    targetPrincipalBalanceJpy: safeDatabaseInt.nullable(),
    targetRemainingUses: safeDatabaseInt.nullable(),
    reason: z.string().trim().min(1).max(500),
    idempotencyKey: z.string().trim().min(8).max(160)
  })
  .strict()
  .superRefine((value, context) => {
    const provided =
      Number(value.targetPrincipalBalanceJpy !== null) + Number(value.targetRemainingUses !== null);
    if (provided !== 1) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "exactly one adjustment target is required",
        path: ["targetPrincipalBalanceJpy"]
      });
    }
  });

export const shopMembershipCardAdjustmentDecisionBodySchema = z
  .object({
    decision: z.enum(["approve", "reject"]),
    idempotencyKey: z.string().trim().min(8).max(160)
  })
  .strict();

export const shopMembershipCardAdjustmentCancelBodySchema = z.object({}).strict();

export const shopMembershipCardAdjustmentListQuerySchema = z
  .object({
    page: z.coerce.number().int().positive().optional(),
    pageSize: z.coerce.number().int().positive().max(100).optional(),
    status: statusSchema.optional(),
    cardPublicId: z.string().trim().uuid().optional()
  })
  .strict();

export type ShopMembershipCardAdjustmentCreateBody = z.output<
  typeof shopMembershipCardAdjustmentCreateBodySchema
>;
export type ShopMembershipCardAdjustmentDecisionBody = z.output<
  typeof shopMembershipCardAdjustmentDecisionBodySchema
>;
export type ShopMembershipCardAdjustmentListQuery = z.output<
  typeof shopMembershipCardAdjustmentListQuerySchema
>;
