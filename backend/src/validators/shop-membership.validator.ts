import { z } from "zod";

const paginationShape = {
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().max(100).optional()
};

export const shopMembershipPublicIdParamSchema = z
  .object({ publicId: z.string().trim().uuid() })
  .strict();

export const shopMembershipListQuerySchema = z
  .object({
    ...paginationShape,
    keyword: z.string().trim().max(100).optional(),
    status: z.enum(["active", "ended"]).optional()
  })
  .strict();

export const shopMembershipCandidateQuerySchema = z
  .object({
    ...paginationShape,
    keyword: z.string().trim().max(100).optional()
  })
  .strict();

export const shopMembershipCardListQuerySchema = z
  .object({
    ...paginationShape,
    status: z.enum(["active", "frozen", "expired", "void"]).optional(),
    type: z.enum(["stored_value", "count", "benefit"]).optional()
  })
  .strict();

export const shopMembershipActivityQuerySchema = z.object(paginationShape).strict();

export const shopMembershipAnalyticsQuerySchema = z
  .object({ period: z.enum(["last7days", "last30days", "last90days"]).default("last30days") })
  .strict();

export const customerShopMembershipListQuerySchema = z
  .object({
    ...paginationShape,
    status: z.enum(["active", "ended"]).optional()
  })
  .strict();

export const shopMembershipCreateBodySchema = z
  .object({ customerNeedoId: z.string().trim().regex(/^u\d{10}$/i) })
  .strict();
