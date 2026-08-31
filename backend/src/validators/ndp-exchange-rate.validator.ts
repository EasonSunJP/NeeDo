import { z } from "zod";

const hasVisibleContent = (value: string): boolean => /[\p{L}\p{N}\p{P}\p{S}]/u.test(value);
const positiveSafeInteger = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const nonNegativeSafeInteger = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const isoDate = z.union([
  z.date(),
  z
    .string()
    .datetime({ offset: true })
    .transform((value) => new Date(value))
]);

export const ndpExchangeRateListQuerySchema = z
  .object({
    page: z.coerce.number().int().positive().optional(),
    pageSize: z.coerce.number().int().positive().max(100).optional(),
    at: isoDate.optional()
  })
  .strict();

export const ndpExchangeRatePublishBodySchema = z
  .object({
    ndpUnits: positiveSafeInteger,
    jpyUnits: positiveSafeInteger,
    expectedVersion: nonNegativeSafeInteger,
    effectiveFrom: isoDate,
    reason: z.string().trim().min(1).max(500).refine(hasVisibleContent),
    idempotencyKey: z.string().trim().min(16).max(160).refine(hasVisibleContent)
  })
  .strict();

export type NdpExchangeRateListQuery = z.infer<typeof ndpExchangeRateListQuerySchema>;
export type NdpExchangeRatePublishBody = z.infer<typeof ndpExchangeRatePublishBodySchema>;
