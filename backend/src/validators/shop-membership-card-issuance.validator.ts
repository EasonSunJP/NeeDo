import { z } from "zod";

const safeNonNegativeInt = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);

export const shopMembershipCardIssuanceParamSchema = z.object({
  publicId: z.string().trim().uuid()
}).strict();

export const shopMembershipCardIssuanceBodySchema = z.object({
  planPublicId: z.string().trim().uuid(),
  initialPrincipalJpy: safeNonNegativeInt.nullable(),
  initialUses: safeNonNegativeInt.nullable(),
  issuanceSource: z.enum(["offline_paid", "historical_replacement", "manual_grant"]),
  issuanceReference: z.string().trim().max(160).nullable(),
  issuanceNote: z.string().trim().max(500).nullable(),
  idempotencyKey: z.string().trim().min(8).max(160)
}).strict();

export type ShopMembershipCardIssuanceBody = z.output<typeof shopMembershipCardIssuanceBodySchema>;
