import { z } from "zod";

export const imMediaUploadParamSchema = z.object({
  conversationId: z.coerce.number().int().positive()
});

export const imMediaUploadQuerySchema = z.object({
  fileName: z.string().trim().min(1).max(255)
});
