import { z } from "zod";

export const imRetentionSettingsBodySchema = z
  .object({
    expectedVersion: z.number().int().positive(),
    messageDays: z.number().int().min(1).max(3_650),
    mediaDays: z.number().int().min(1).max(3_650)
  })
  .strict();

export type ImRetentionSettingsBody = z.infer<typeof imRetentionSettingsBodySchema>;
