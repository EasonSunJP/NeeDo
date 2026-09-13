import { z } from "zod";

const positiveId = z.coerce.number().int().positive();

export const backofficeUserReviewUserParamSchema = z.object({ userId: positiveId }).strict();

export const backofficeUserReviewParamSchema = z.object({ reviewId: positiveId }).strict();

export const backofficeUserReviewListQuerySchema = z
  .object({
    page: z.coerce.number().int().positive().default(1),
    page_size: z.coerce
      .number()
      .int()
      .refine((value) => value === 10, {
        message: "page_size must be 10"
      })
      .default(10)
  })
  .strict();

export const backofficeOperationsReviewListQuerySchema = z
  .object({
    page: z.coerce.number().int().positive().default(1),
    page_size: z.coerce
      .number()
      .int()
      .refine((value) => value === 20, { message: "page_size must be 20" })
      .default(20),
    keyword: z.string().trim().min(1).max(100).optional(),
    rating: z.coerce.number().int().min(1).max(5).optional(),
    status: z.enum(["original", "amended", "system"]).optional(),
    targetType: z.enum(["customer", "technician"]).optional(),
    from: z.string().date().optional(),
    to: z.string().date().optional()
  })
  .strict()
  .superRefine((value, context) => {
    if (value.from && value.to && value.from > value.to) {
      context.addIssue({ code: "custom", message: "from must not be after to" });
    }
  });

export const backofficeUserReviewAmendmentBodySchema = z
  .object({
    rating: z.number().int().min(1).max(5).optional(),
    comment: z.string().trim().max(1000).nullable().optional(),
    tags: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
    reason: z.string().trim().min(1).max(500),
    expectedVersion: z.number().int().nonnegative()
  })
  .strict()
  .refine(
    (value) =>
      value.rating !== undefined || value.comment !== undefined || value.tags !== undefined,
    { message: "rating, comment or tags is required" }
  );

export type BackofficeUserReviewListQuery = z.infer<typeof backofficeUserReviewListQuerySchema>;
export type BackofficeOperationsReviewListQuery = z.infer<
  typeof backofficeOperationsReviewListQuerySchema
>;
export type BackofficeUserReviewAmendmentBody = z.infer<
  typeof backofficeUserReviewAmendmentBodySchema
>;
