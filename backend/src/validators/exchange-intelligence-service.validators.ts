import { z } from "zod";

export const exchangeIntelligenceServiceOptionListQuerySchema = z
  .object({
    page: z.coerce.number().int().positive().default(1),
    page_size: z.coerce.number().int().positive().max(100).default(20)
  })
  .strict();

export type ExchangeIntelligenceServiceOptionListQuery = z.infer<
  typeof exchangeIntelligenceServiceOptionListQuerySchema
>;
