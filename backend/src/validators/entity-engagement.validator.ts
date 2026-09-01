import { z } from "zod";

export const entityTargetSchema = z.discriminatedUnion("targetType", [
  z
    .object({
      targetType: z.literal("shop"),
      publicId: z.string().regex(/^shop\d{10}$/u)
    })
    .strict(),
  z
    .object({
      targetType: z.literal("technician"),
      publicId: z.string().regex(/^s\d{10}$/u)
    })
    .strict()
]);

export const entityFavoriteTargetParamSchema = entityTargetSchema;

export const entityFavoriteListQuerySchema = z
  .object({
    page: z.coerce.number().int().positive().default(1),
    pageSize: z.coerce.number().int().positive().max(100).default(20),
    targetType: z.enum(["shop", "technician"]).optional()
  })
  .strict();

export const entityFavoriteStatusesBodySchema = z
  .object({
    targets: z.array(entityTargetSchema).min(1).max(100)
  })
  .strict();

export const needoEntityShareBodySchema = z
  .object({
    conversationId: z.number().int().positive().max(2_147_483_647),
    recipientIdentityId: z.number().int().positive().max(2_147_483_647),
    idempotencyKey: z.string().uuid()
  })
  .strict();

export const systemEntityShareBodySchema = z.object({ idempotencyKey: z.string().uuid() }).strict();

export type EntityFavoriteTargetParams = z.infer<typeof entityFavoriteTargetParamSchema>;
export type EntityFavoriteListQuery = z.infer<typeof entityFavoriteListQuerySchema>;
export type EntityFavoriteStatusesBody = z.infer<typeof entityFavoriteStatusesBodySchema>;
export type NeedoEntityShareBody = z.infer<typeof needoEntityShareBodySchema>;
export type SystemEntityShareBody = z.infer<typeof systemEntityShareBodySchema>;
