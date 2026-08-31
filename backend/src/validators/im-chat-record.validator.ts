import { z } from "zod";

export const messageIdsSchema = z
  .array(z.coerce.number().int().positive())
  .min(1)
  .max(100)
  .refine((ids) => new Set(ids).size === ids.length, "error.im.message_ids_duplicate");

export const chatRecordCommandBodySchema = z
  .object({
    idempotencyKey: z.string().uuid(),
    messageIds: messageIdsSchema,
    sourceConversationId: z.coerce.number().int().positive()
  })
  .strict();

export const targetConversationParamSchema = z.object({
  targetConversationId: z.coerce.number().int().positive()
});

export const chatRecordPublicIdParamSchema = z.object({
  publicId: z.string().uuid()
});

export const chatRecordItemsQuerySchema = z.object({
  beforePosition: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().max(100).optional()
});

export const chatRecordMediaParamSchema = chatRecordPublicIdParamSchema.extend({
  checksumSha256: z.string().regex(/^[a-f0-9]{64}$/u)
});

export const favoriteListQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().max(100).optional()
});

export const favoriteIdParamSchema = z.object({
  favoriteId: z.coerce.number().int().positive()
});
