import { z } from "zod";

const safePositiveInteger = (max = Number.MAX_SAFE_INTEGER) =>
  z.coerce
    .number()
    .int()
    .positive()
    .max(max)
    .refine(Number.isSafeInteger, "error.validation.safe_integer_required");

export const safePositiveIntegerSchema = safePositiveInteger();

export const messageIdsSchema = z
  .array(safePositiveIntegerSchema)
  .min(1)
  .max(100)
  .refine((ids) => new Set(ids).size === ids.length, "error.im.message_ids_duplicate");

export const chatRecordCommandBodySchema = z
  .object({
    idempotencyKey: z.string().uuid(),
    messageIds: messageIdsSchema,
    sourceConversationId: safePositiveIntegerSchema
  })
  .strict();

export const targetConversationParamSchema = z.object({
  targetConversationId: safePositiveIntegerSchema
});

export const chatRecordPublicIdParamSchema = z.object({
  publicId: z.string().uuid()
});

export const chatRecordItemsQuerySchema = z.object({
  beforePosition: safePositiveIntegerSchema.optional(),
  pageSize: safePositiveInteger(100).optional()
});

export const chatRecordMediaParamSchema = chatRecordPublicIdParamSchema.extend({
  checksumSha256: z.string().regex(/^[a-f0-9]{64}$/u)
});

export const favoriteListQuerySchema = z.object({
  page: safePositiveIntegerSchema.optional(),
  pageSize: safePositiveInteger(100).optional()
});

export const favoriteIdParamSchema = z.object({
  favoriteId: safePositiveIntegerSchema
});
