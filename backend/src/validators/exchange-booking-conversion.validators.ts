import { z } from "zod";

export const exchangeBookingConversionPostIdParamSchema = z
  .object({ id: z.coerce.number().int().positive() })
  .strict();

export const exchangeBookingConversionBodySchema = z
  .object({ expectedVersion: z.number().int().positive() })
  .strict();

export type ExchangeBookingConversionBody = z.infer<typeof exchangeBookingConversionBodySchema>;
