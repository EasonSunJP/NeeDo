import { z } from "zod";

export const shopMembershipCardRefundPublicIdParamSchema = z
  .object({
    publicId: z.string().trim().uuid()
  })
  .strict();

export const shopMembershipCardRefundCreateBodySchema = z
  .object({
    reason: z.string().trim().min(2).max(500),
    idempotencyKey: z.string().trim().min(8).max(160)
  })
  .strict();

export type ShopMembershipCardRefundCreateBody = z.output<
  typeof shopMembershipCardRefundCreateBodySchema
>;
