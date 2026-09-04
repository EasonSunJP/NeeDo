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
    activatedAt: requiredDateSchema,
    reason: reasonSchema
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
export type AgentListQuery = z.output<typeof agentListQuerySchema>;
export type AgentShopReferralListQuery = z.output<typeof agentShopReferralListQuerySchema>;
export type AgentShopReferralBody = z.output<typeof agentShopReferralBodySchema>;
