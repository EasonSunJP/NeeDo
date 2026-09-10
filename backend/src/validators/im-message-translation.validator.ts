import { z } from "zod";
import { imTranslationTargetLanguages } from "../services/im-translation.provider";

export const imMessageTranslationParamsSchema = z
  .object({
    conversationId: z.coerce.number().int().positive()
  })
  .strict();

export const imMessageTranslationBodySchema = z
  .object({
    messageIds: z
      .array(z.coerce.number().int().positive())
      .min(1)
      .max(50)
      .refine((ids) => new Set(ids).size === ids.length, "error.im.message_ids_duplicate"),
    targetLanguage: z.enum(imTranslationTargetLanguages)
  })
  .strict();
