import { z } from "zod";
import { publicIdentifierSchema } from "./public-identifier.validator";

export const affiliateAllianceCreateBodySchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    description: z.string().trim().min(1).max(500).nullable().optional(),
    defaultPromoterShareBps: z.number().int().min(0).max(10_000)
  })
  .strict();

export type AffiliateAllianceCreateBody = z.infer<typeof affiliateAllianceCreateBodySchema>;

const affiliateUserNeedoIdSchema = publicIdentifierSchema
  .refine((value) => value.kind === "U", "Affiliate user NeeDoID is required")
  .transform((value) => value.publicId);

export const affiliateAllianceListQuerySchema = z
  .object({
    page: z.coerce.number().int().positive().default(1),
    pageSize: z.coerce.number().int().positive().max(100).default(20),
    q: z.string().trim().max(80).optional()
  })
  .strict();

export const affiliateAllianceInvitationListQuerySchema = z
  .object({
    page: z.coerce.number().int().positive().default(1),
    pageSize: z.coerce.number().int().positive().max(100).default(20),
    status: z.enum(["pending", "accepted", "rejected", "expired"]).optional()
  })
  .strict();

export const affiliateAllianceInvitationCreateBodySchema = z.discriminatedUnion("role", [
  z
    .object({
      inviteeNeedoId: affiliateUserNeedoIdSchema,
      role: z.literal("partner"),
      proposedParentMemberId: z.null().optional()
    })
    .strict(),
  z
    .object({
      inviteeNeedoId: affiliateUserNeedoIdSchema,
      role: z.literal("subordinate"),
      proposedParentMemberId: z.number().int().positive()
    })
    .strict()
]);

export const affiliateAllianceInvitationIdParamSchema = z
  .object({ id: z.coerce.number().int().positive() })
  .strict();

export const affiliateAllianceInvitationRespondBodySchema = z.object({}).strict();

export type AffiliateAllianceListQuery = z.infer<typeof affiliateAllianceListQuerySchema>;
export type AffiliateAllianceInvitationListQuery = z.infer<
  typeof affiliateAllianceInvitationListQuerySchema
>;
export type AffiliateAllianceInvitationCreateBody = z.infer<
  typeof affiliateAllianceInvitationCreateBodySchema
>;
export type AffiliateAllianceInvitationIdParam = z.infer<
  typeof affiliateAllianceInvitationIdParamSchema
>;
