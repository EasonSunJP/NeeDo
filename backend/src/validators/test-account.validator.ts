import { z } from "zod";

export const testAccountUpdateBodySchema = z.object({
  isTestAccount: z.boolean(),
  expectedUpdatedAt: z
    .union([z.date(), z.string().datetime({ offset: true })])
    .transform((value) => (value instanceof Date ? value : new Date(value)))
});

export type TestAccountUpdateBody = z.infer<typeof testAccountUpdateBodySchema>;
