import { z } from "zod";

export const userExperienceEntriesParamSchema = z.object({
  userId: z.coerce.number().int().positive()
});

export const userExperienceEntriesQuerySchema = z
  .object({
    page: z.coerce.number().int().positive().default(1),
    pageSize: z.coerce.number().int().positive().max(100).default(20)
  })
  .strict();
