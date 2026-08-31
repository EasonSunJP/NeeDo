import { z } from "zod";
import { PRISMA_INT_MAX } from "../constants/database";

const safePositiveInteger = (max = PRISMA_INT_MAX) => {
  const numeric = z
    .number()
    .int()
    .positive()
    .max(max)
    .refine(Number.isSafeInteger, "error.validation.safe_integer_required");

  return z.union([
    numeric,
    z
      .string()
      .regex(/^[1-9]\d*$/u)
      .transform((value) => Number(value))
      .pipe(numeric)
  ]);
};

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
  pageSize: safePositiveInteger(50).optional()
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
