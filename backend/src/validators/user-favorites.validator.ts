import { z } from "zod";
import { MESSAGE_JUDGEMENT_REACTIONS } from "../constants/message-reaction.constants";

export const userFavoriteItemTypeSchema = z.enum([
  "shop",
  "technician",
  "service",
  "social_post",
  "chat_record"
]);

export const userFavoritesListQuerySchema = z
  .object({
    page: z.coerce.number().int().positive().default(1),
    pageSize: z.coerce.number().int().positive().max(100).default(20),
    type: userFavoriteItemTypeSchema.optional(),
    query: z.string().trim().max(120).optional()
  })
  .strict();

export const userFavoriteItemParamsSchema = z
  .object({
    type: userFavoriteItemTypeSchema,
    itemKey: z
      .string()
      .trim()
      .min(1)
      .max(191)
      .regex(/^[A-Za-z0-9:_-]+$/u)
  })
  .strict();

const judgementSet = new Set<string>(MESSAGE_JUDGEMENT_REACTIONS);
const emojiOnlyPattern =
  /^(?:\p{Extended_Pictographic}|\p{Emoji_Presentation})(?:[\uFE0F\u200D\p{Emoji_Modifier}\p{Extended_Pictographic}\p{Emoji_Presentation}])*$/u;

export const userFavoriteReactionBodySchema = z
  .object({
    reaction: z
      .string()
      .trim()
      .min(1)
      .max(16)
      .refine((value) => judgementSet.has(value) || emojiOnlyPattern.test(value), {
        message: "error.favorite.reaction_invalid"
      })
  })
  .strict();

export type UserFavoritesListQuery = z.infer<typeof userFavoritesListQuerySchema>;
export type UserFavoriteItemParams = z.infer<typeof userFavoriteItemParamsSchema>;
export type UserFavoriteReactionBody = z.infer<typeof userFavoriteReactionBodySchema>;
