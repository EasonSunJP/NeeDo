import { z } from "zod";
import { publicIdentifierSchema } from "./public-identifier.validator";

const requiredDateSchema = z
  .union([z.date(), z.string().datetime({ offset: true })])
  .transform((value) => (value instanceof Date ? value : new Date(value)));

const reasonSchema = z.string().trim().min(1).max(500);

const shopPublicIdSchema = publicIdentifierSchema
  .refine((value) => value.kind === "SHOP", "Shop public identifier is required")
  .transform((value) => value.publicId);

export const platformPartnerUserParamSchema = z
  .object({ userId: z.coerce.number().int().positive() })
  .strict();

export const platformPartnerProfileBodySchema = z
  .object({
    partnerType: z.enum(["agent", "franchisee", "supplier"]),
    startsAt: requiredDateSchema,
    endsAt: requiredDateSchema.nullable(),
    permanent: z.boolean(),
    reason: reasonSchema
  })
  .strict()
  .superRefine((value, context) => {
    if (value.permanent && value.endsAt !== null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["endsAt"],
        message: "Permanent ranges cannot have an end date"
      });
    }
    if (!value.permanent && value.endsAt === null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["endsAt"],
        message: "An end date is required for non-permanent ranges"
      });
    }
    if (value.endsAt !== null && value.endsAt <= value.startsAt) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["endsAt"],
        message: "End date must be after start date"
      });
    }
  });

export const platformPartnerHistoryQuerySchema = z
  .object({
    page: z.coerce.number().int().positive().default(1),
    pageSize: z.coerce.number().int().positive().max(100).default(20)
  })
  .strict();

export const agentListQuerySchema = z
  .object({
    page: z.coerce.number().int().positive().optional(),
    pageSize: z.coerce.number().int().positive().max(100).optional(),
    keyword: z.string().trim().max(100).optional(),
    status: z.enum(["active", "inactive"]).optional()
  })
  .strict();

export const agentParamSchema = z.object({ agentPublicId: z.string().uuid() }).strict();

export const agentShopReferralListQuerySchema = z
  .object({
    page: z.coerce.number().int().positive().optional(),
    pageSize: z.coerce.number().int().positive().max(100).optional(),
    status: z.enum(["active", "qualified", "revoked"]).optional()
  })
  .strict();

export const agentShopReferralBodySchema = z
  .object({
    shopPublicId: shopPublicIdSchema,
    source: z.string().trim().min(1).max(100),
    confirmedAt: requiredDateSchema,
    reason: reasonSchema
  })
  .strict();

export type PlatformPartnerProfileBody = z.output<typeof platformPartnerProfileBodySchema>;
export type PlatformPartnerHistoryQuery = z.output<typeof platformPartnerHistoryQuerySchema>;
export type AgentListQuery = z.output<typeof agentListQuerySchema>;
export type AgentShopReferralListQuery = z.output<typeof agentShopReferralListQuerySchema>;
export type AgentShopReferralBody = z.output<typeof agentShopReferralBodySchema>;
