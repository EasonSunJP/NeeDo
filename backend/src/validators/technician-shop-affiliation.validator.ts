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

export type ParsedMerchantEmployeeListQuery = z.output<typeof merchantEmployeeListQuerySchema>;
export type ParsedMerchantEmployeeAffiliationBody = z.output<
  typeof merchantEmployeeAffiliationBodySchema
>;
