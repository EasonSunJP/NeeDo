import { z } from "zod";

export const operationsMerchantApplicationIdParamSchema = z
  .object({ id: z.coerce.number().int().positive() })
  .strict();

export const operationsMerchantApplicationListQuerySchema = z
  .object({
    page: z.coerce.number().int().positive().default(1),
    page_size: z.coerce.number().int().positive().max(100).default(20),
    status: z.enum(["submitted", "under_review", "approved", "rejected", "withdrawn"]).optional()
  })
  .strict();

export const operationsMerchantApplicationReviewBodySchema = z
  .object({ expectedVersion: z.number().int().positive() })
  .strict();

export const operationsMerchantApplicationRejectBodySchema = z
  .object({
    expectedVersion: z.number().int().positive(),
    rejectionReason: z.string().trim().min(1).max(1000)
  })
  .strict();
