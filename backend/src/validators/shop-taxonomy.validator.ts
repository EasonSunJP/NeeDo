import { z } from "zod";

export const shopTaxonomyLocaleSchema = z.enum(["zh-CN", "zh-TW", "ja", "en", "ko"]);

export const shopTaxonomyCatalogQuerySchema = z.object({
  locale: shopTaxonomyLocaleSchema.default("ja"),
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().max(100).optional()
});

export const shopTaxonomyCategoryParamSchema = z.object({
  id: z.coerce.number().int().positive()
});

export const shopTaxonomyMerchantQuerySchema = z.object({
  locale: shopTaxonomyLocaleSchema.default("ja")
});

export const shopTaxonomyReplaceBodySchema = z
  .object({
    categoryIds: z.array(z.number().int().positive()).max(100),
    keywordIds: z.array(z.number().int().positive()).max(100),
    expectedRevision: z.number().int().min(0),
    idempotencyKey: z.string().trim().min(16).max(160)
  })
  .strict();

export type ShopTaxonomyCatalogQuery = z.infer<typeof shopTaxonomyCatalogQuerySchema>;
export type ShopTaxonomyReplaceBody = z.infer<typeof shopTaxonomyReplaceBodySchema>;
