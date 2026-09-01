import { z } from "zod";

export const exchangeMatchingPostIdParamSchema = z
  .object({ id: z.coerce.number().int().positive() })
  .strict();

export const selectExchangeMatchSchema = z
  .object({
    selectedClaimIds: z
      .array(z.number().int().positive())
      .min(1)
      .max(20)
      .refine((ids) => new Set(ids).size === ids.length, {
        message: "selectedClaimIds must be unique"
      }),
    expectedVersion: z.number().int().positive()
  })
  .strict();

export type SelectExchangeMatchBody = z.infer<typeof selectExchangeMatchSchema>;
