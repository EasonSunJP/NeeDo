import { z } from "zod";

export const userUsagePeriodSchema = z.enum([
  "last7days",
  "thisWeek",
  "last30days",
  "thisMonth",
  "thisYear",
  "custom"
]);

export const backofficeUserUsageParamsSchema = z
  .object({
    userId: z.coerce.number().int().positive(),
    orderId: z.coerce.number().int().positive().optional()
  })
  .strict();

export const backofficeUserUsageListQuerySchema = z
  .object({
    page: z.coerce.number().int().positive().default(1),
    page_size: z.coerce
      .number()
      .int()
      .refine((value) => value === 10, {
        message: "page_size must be 10"
      })
      .default(10),
    keyword: z.string().trim().max(100).optional(),
    period: userUsagePeriodSchema.default("last30days"),
    from: z.string().date().optional(),
    to: z.string().date().optional()
  })
  .strict()
  .superRefine((value, context) => {
    if (value.period === "custom" && (!value.from || !value.to)) {
      context.addIssue({ code: "custom", message: "custom period requires from and to" });
    }
    if (value.period !== "custom" && (value.from || value.to)) {
      context.addIssue({ code: "custom", message: "from and to require custom period" });
    }
    if (value.from && value.to && value.from > value.to) {
      context.addIssue({ code: "custom", message: "from must not be after to" });
    }
  });

export const backofficeUserUsageCommentBodySchema = z
  .object({ body: z.string().trim().min(1).max(2000) })
  .strict();

export const backofficeRefundAmendmentBodySchema = z
  .object({
    displayReference: z.string().trim().max(120).nullable().optional(),
    note: z.string().trim().max(500).nullable().optional(),
    reason: z.string().trim().min(1).max(500),
    expectedVersion: z.number().int().nonnegative()
  })
  .strict()
  .refine((value) => value.displayReference !== undefined || value.note !== undefined, {
    message: "displayReference or note is required"
  });

export type BackofficeUserUsageListQuery = z.infer<typeof backofficeUserUsageListQuerySchema>;
export type BackofficeRefundAmendmentBody = z.infer<typeof backofficeRefundAmendmentBodySchema>;
