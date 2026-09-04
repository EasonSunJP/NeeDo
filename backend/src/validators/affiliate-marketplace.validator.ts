import { z } from "zod";

const paginationShape = {
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().max(100).optional()
};

export const affiliateMarketplaceTaskIdParamSchema = z
  .object({ taskId: z.coerce.number().int().positive() })
  .strict();

export const affiliateMarketplaceClaimIdParamSchema = z
  .object({ claimId: z.coerce.number().int().positive() })
  .strict();

export const affiliateMarketplaceListQuerySchema = z
  .object({
    ...paginationShape,
    keyword: z.string().trim().min(1).max(160).optional(),
    shopId: z.coerce.number().int().positive().optional(),
    serviceId: z.coerce.number().int().positive().optional(),
    customerDiscountType: z.enum(["none", "fixed_jpy", "percent"]).optional()
  })
  .strict();

export const affiliateClaimListQuerySchema = z
  .object({
    ...paginationShape,
    status: z.enum(["active", "expired", "revoked"]).optional()
  })
  .strict();

export const createAffiliateClaimBodySchema = z.object({}).strict();

export const affiliateCodeValidateBodySchema = z
  .object({
    publicCode: z.string().trim().min(1).max(40),
    scheduleSlotId: z.coerce.number().int().positive()
  })
  .strict();

export const affiliatePublicTokenParamSchema = z
  .object({
    publicToken: z.string().regex(/^[A-Za-z0-9_-]{24}\.[A-Za-z0-9_-]{43}$/)
  })
  .strict();

export type AffiliateMarketplaceListQuery = z.infer<typeof affiliateMarketplaceListQuerySchema>;
export type AffiliateClaimListQuery = z.infer<typeof affiliateClaimListQuerySchema>;
export type AffiliateCodeValidateBody = z.infer<typeof affiliateCodeValidateBodySchema>;
