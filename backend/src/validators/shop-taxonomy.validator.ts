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

export type ShopTaxonomyCatalogQuery = z.infer<typeof shopTaxonomyCatalogQuerySchema>;
