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
    relationshipType: z.enum(["exclusive", "partner"]).optional(),
    workStatus: z.enum(["active", "on_leave", "suspended"]).optional()
  })
  .strict();

export const merchantEmployeeAffiliationBodySchema = z
  .object({
    relationshipType: z.enum(["exclusive", "partner"]),
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
export type ParsedMerchantEmployeeAffiliationBody = z.output<
  typeof merchantEmployeeAffiliationBodySchema
>;
export type ParsedMerchantEmployeeProfileBody = z.output<typeof merchantEmployeeProfileBodySchema>;
