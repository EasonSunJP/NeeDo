import { z } from "zod";
import { publicIdentifierSchema } from "./public-identifier.validator";

const technicianPublicIdSchema = publicIdentifierSchema
  .refine((value) => value.kind === "S", "Technician NeeDoID is required")
  .transform((value) => value.publicId);

export const merchantEmployeeParamSchema = z
  .object({
    needoId: technicianPublicIdSchema
  })
  .strict();

export const merchantEmployeeListQuerySchema = z
  .object({
    page: z.coerce.number().int().positive().optional(),
    pageSize: z.coerce.number().int().positive().max(100).optional(),
    keyword: z.string().trim().max(100).optional(),
    relationshipType: z.literal("partner").optional(),
    workStatus: z.enum(["active", "on_leave", "suspended"]).optional()
  })
  .strict();

export const merchantEmployeeTimelineQuerySchema = z
  .object({
    page: z.coerce.number().int().positive().default(1),
    pageSize: z.coerce.number().int().positive().max(100).default(20)
  })
  .strict();

export const merchantEmployeeTimelineCommentBodySchema = z
  .object({
    message: z.string().trim().min(1).max(1000)
  })
  .strict();

const employeeScheduleDateSchema = z
  .union([z.date(), z.string().datetime({ offset: true })])
  .transform((value) => (value instanceof Date ? value : new Date(value)));

export const merchantEmployeeScheduleQuerySchema = z
  .object({
    from: employeeScheduleDateSchema,
    to: employeeScheduleDateSchema,
    view: z.enum(["day", "week", "month"])
  })
  .strict()
  .superRefine((value, context) => {
    if (value.from.getTime() >= value.to.getTime()) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "from must be earlier than to",
        path: ["to"]
      });
    }
    if (value.to.getTime() - value.from.getTime() > 93 * 24 * 60 * 60 * 1000) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "date range must not exceed 93 days",
        path: ["to"]
      });
    }
  });

export const merchantEmployeeAffiliationBodySchema = z
  .object({
    relationshipType: z.literal("partner"),
    workStatus: z.enum(["active", "on_leave", "suspended", "ended"]),
    startsAt: z.coerce.date(),
    endsAt: z.coerce.date().nullable()
  })
  .strict()
  .superRefine((value, context) => {
    if (value.workStatus === "ended" && value.endsAt === null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "endsAt is required when workStatus is ended",
        path: ["endsAt"]
      });
    }
    if (value.workStatus !== "ended" && value.endsAt !== null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "endsAt must be null for a current relationship",
        path: ["endsAt"]
      });
    }
    if (value.endsAt !== null && value.endsAt < value.startsAt) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "endsAt must not be before startsAt",
        path: ["endsAt"]
      });
    }
  });

export const merchantEmployeeProfileBodySchema = z
  .object({
    displayName: z.string().trim().min(1).max(120).optional(),
    bio: z.string().trim().max(5000).nullable().optional(),
    city: z.string().trim().min(1).max(100).optional(),
    serviceArea: z.string().trim().max(255).nullable().optional(),
    yearsExperience: z.coerce.number().int().min(0).max(80).optional()
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one employee profile field is required"
  });

export type ParsedMerchantEmployeeListQuery = z.output<typeof merchantEmployeeListQuerySchema>;
export type ParsedMerchantEmployeeTimelineQuery = z.output<
  typeof merchantEmployeeTimelineQuerySchema
>;
export type ParsedMerchantEmployeeAffiliationBody = z.output<
  typeof merchantEmployeeAffiliationBodySchema
>;
export type ParsedMerchantEmployeeProfileBody = z.output<typeof merchantEmployeeProfileBodySchema>;
export type ParsedMerchantEmployeeScheduleQuery = z.output<
  typeof merchantEmployeeScheduleQuerySchema
>;
