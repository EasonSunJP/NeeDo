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
export type BackofficeUserReviewAmendmentBody = z.infer<
  typeof backofficeUserReviewAmendmentBodySchema
>;
