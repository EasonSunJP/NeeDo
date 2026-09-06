import { z } from "zod";

export const exchangeMatchingPostIdParamSchema = z
  .object({ id: z.coerce.number().int().positive() })
  .strict();

const exchangeMatchBudgetConfirmationSchema = z
  .object({
    action: z.literal("increase_to_selected_total"),
    confirmedBudgetMaxJpy: z.number().int().positive().max(1_000_000_000)
  })
  .strict();

const exchangeMatchTargetConfirmationSchema = z
  .object({
    action: z.literal("reduce_to_selected_count"),
    confirmedTargetProviderCount: z.number().int().min(1).max(20)
  })
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
    expectedVersion: z.number().int().positive(),
    budgetConfirmation: exchangeMatchBudgetConfirmationSchema.nullable().optional().default(null),
    targetConfirmation: exchangeMatchTargetConfirmationSchema.nullable().optional().default(null)
  })
  .strict();

export const confirmQuickExchangeBudgetSchema = z
  .object({
    expectedVersion: z.number().int().positive(),
    budgetConfirmation: exchangeMatchBudgetConfirmationSchema
  })
  .strict();

export type SelectExchangeMatchBody = z.infer<typeof selectExchangeMatchSchema>;
export type ConfirmQuickExchangeBudgetBody = z.infer<typeof confirmQuickExchangeBudgetSchema>;
