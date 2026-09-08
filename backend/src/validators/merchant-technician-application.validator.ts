import { z } from "zod";

export const merchantTechnicianApplicationIdParamSchema = z
  .object({ id: z.coerce.number().int().positive() })
  .strict();

export const merchantTechnicianApplicationListQuerySchema = z
  .object({
    page: z.coerce.number().int().positive().default(1),
    page_size: z.coerce.number().int().positive().max(100).default(20),
    status: z.enum(["submitted", "under_review", "approved", "rejected", "withdrawn"]).optional()
  })
  .strict();

export const merchantTechnicianApplicationReviewBodySchema = z
  .object({ expectedVersion: z.number().int().positive() })
  .strict();

export const merchantTechnicianApplicationRejectBodySchema = z
  .object({
    expectedVersion: z.number().int().positive(),
    rejectionReason: z.string().trim().min(1).max(1000)
  })
  .strict();

export const merchantTechnicianApplicationContactBodySchema = z.object({}).strict();
