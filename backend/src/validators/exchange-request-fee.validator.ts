import { z } from "zod";

export const exchangeRequestFeeHistoryQuerySchema = z
  .object({
    page: z.coerce.number().int().positive().default(1),
    page_size: z.coerce.number().int().positive().max(100).default(20)
  })
  .strict();

export const createExchangeRequestFeeVersionSchema = z
  .object({
    amountNdp: z.coerce.number().int().nonnegative().max(1_000_000_000),
    effectiveFrom: z
      .string()
      .datetime({ offset: true })
      .transform((value) => new Date(value)),
    expectedCurrentVersion: z.coerce.number().int().positive()
  })
  .strict();

export type ExchangeRequestFeeHistoryQuery = z.infer<typeof exchangeRequestFeeHistoryQuerySchema>;
export type CreateExchangeRequestFeeVersionBody = z.infer<
  typeof createExchangeRequestFeeVersionSchema
>;
