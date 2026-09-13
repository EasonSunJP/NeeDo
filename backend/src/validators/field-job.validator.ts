import { z } from "zod";

export const fieldJobStatusSchema = z.enum([
  "pending",
  "confirmed",
  "inService",
  "awaitingCheckout",
  "awaitingPaymentConfirmation",
  "completed",
  "cancelled"
]);

export const fieldJobListQuerySchema = z
  .object({
    page: z.coerce.number().int().positive().default(1),
    pageSize: z.coerce.number().int().positive().max(100).default(20),
    keyword: z.string().trim().min(1).max(100).optional(),
    status: fieldJobStatusSchema.optional(),
    assignment: z.enum(["assigned", "unassigned"]).optional()
  })
  .strict();

export const fieldJobIdParamSchema = z.object({ id: z.coerce.number().int().positive() }).strict();

export type FieldJobListQuery = z.infer<typeof fieldJobListQuerySchema>;
