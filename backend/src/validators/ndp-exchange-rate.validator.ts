import { z } from "zod";
import { PRISMA_INT_MAX } from "../constants/database";

const hasVisibleContent = (value: string): boolean => /[\p{L}\p{N}\p{P}\p{S}]/u.test(value);
const positivePersistenceInteger = z.number().int().positive().max(PRISMA_INT_MAX);
const versionWithSafeSuccessor = z
  .number()
  .int()
  .min(0)
  .max(PRISMA_INT_MAX - 1);
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
    ndpUnits: positivePersistenceInteger,
    jpyUnits: positivePersistenceInteger,
    expectedVersion: versionWithSafeSuccessor,
    effectiveFrom: isoDate,
    reason: z.string().trim().min(1).max(500).refine(hasVisibleContent),
    idempotencyKey: z.string().trim().min(16).max(160).refine(hasVisibleContent)
  })
  .strict();

export type NdpExchangeRateListQuery = z.infer<typeof ndpExchangeRateListQuerySchema>;
export type NdpExchangeRatePublishBody = z.infer<typeof ndpExchangeRatePublishBodySchema>;
