import { z } from "zod";

export const imVoiceMessageParamSchema = z.object({
  conversationId: z.coerce.number().int().positive()
});

export const imVoiceMessageQuerySchema = z.object({
  fileName: z.string().trim().min(1).max(255),
  durationSeconds: z.coerce.number().int().min(1).max(59)
});
