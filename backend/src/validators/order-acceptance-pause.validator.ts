import { z } from "zod";

const subjectTypeSchema = z.enum(["merchant_account", "shop"]);

export const orderAcceptancePauseIdParamSchema = z.object({
  id: z.coerce.number().int().positive()
});

export const orderAcceptancePauseListQuerySchema = z
  .object({
    page: z.coerce.number().int().positive().optional(),
    pageSize: z.coerce.number().int().positive().max(100).optional(),
    status: z.enum(["active", "released"]).optional(),
    subjectType: subjectTypeSchema.optional(),
    subjectId: z.coerce.number().int().positive().optional()
  })
  .strict();

export const orderAcceptancePauseCreateBodySchema = z
  .object({
    subjectType: subjectTypeSchema,
    subjectId: z.coerce.number().int().positive(),
    reasonCode: z
      .string()
      .trim()
      .regex(/^[a-z0-9][a-z0-9_-]{1,79}$/),
    reasonDetail: z.string().trim().min(1).max(500)
  })
  .strict();

export const orderAcceptancePauseReleaseBodySchema = z
  .object({
    releaseReason: z.string().trim().min(1).max(500)
  })
  .strict();

export type OrderAcceptancePauseListQuery = z.infer<typeof orderAcceptancePauseListQuerySchema>;
export type OrderAcceptancePauseCreateBody = z.infer<typeof orderAcceptancePauseCreateBodySchema>;
export type OrderAcceptancePauseReleaseBody = z.infer<typeof orderAcceptancePauseReleaseBodySchema>;
