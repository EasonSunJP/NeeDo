import { z } from "zod";

export const orderPerformanceOrderParamSchema = z
  .object({
    id: z.coerce.number().int().positive()
  })
  .strict();

export const orderPerformanceCommandBodySchema = z
  .object({
    publicReason: z.string().trim().min(1).max(500),
    internalNote: z.string().trim().min(1).max(1000).nullable().optional(),
    idempotencyKey: z.string().trim().min(16).max(160),
    expectedRevision: z.number().int().min(0)
  })
  .strict();

export type OrderPerformanceCommandBody = z.infer<typeof orderPerformanceCommandBodySchema>;
