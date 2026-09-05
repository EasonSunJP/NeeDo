import { z } from "zod";

export const shopMembershipCardRedemptionPublicIdParamSchema = z
  .object({
    publicId: z.string().trim().uuid()
  })
  .strict();

export const shopMembershipCardRedemptionCreateBodySchema = z
  .object({
    orderNo: z.string().trim().min(1).max(40),
    idempotencyKey: z.string().trim().min(8).max(160)
  })
  .strict();

export const shopMembershipCardRedemptionListQuerySchema = z
  .object({
    page: z.coerce.number().int().positive().optional(),
    pageSize: z.coerce.number().int().positive().max(100).optional(),
    cardPublicId: z.string().trim().uuid().optional()
  })
  .strict();

export const shopMembershipCardRedemptionCandidateQuerySchema = z
  .object({
    page: z.coerce.number().int().positive().optional(),
    pageSize: z.coerce.number().int().positive().max(100).optional()
  })
  .strict();

export type ShopMembershipCardRedemptionCreateBody = z.output<
  typeof shopMembershipCardRedemptionCreateBodySchema
>;
export type ShopMembershipCardRedemptionListQuery = z.output<
  typeof shopMembershipCardRedemptionListQuerySchema
>;
