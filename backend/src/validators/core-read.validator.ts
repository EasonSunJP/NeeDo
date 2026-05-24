import { z } from "zod";

const paginationQuerySchema = {
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().max(100).optional()
};

export const coreReadIdParamSchema = z.object({
  id: z.coerce.number().int().positive()
});

export const categoryListQuerySchema = z.object({
  ...paginationQuerySchema,
  parentId: z.coerce.number().int().positive().nullable().optional()
});

export const coreReadSortSchema = z
  .enum(["recommended", "rating_desc", "price_asc", "price_desc", "newest"])
  .optional();

const serviceListQueryBaseSchema = z.object({
  ...paginationQuerySchema,
  keyword: z.string().trim().max(100).optional(),
  categoryId: z.coerce.number().int().positive().optional(),
  shopId: z.coerce.number().int().positive().optional(),
  technicianId: z.coerce.number().int().positive().optional(),
  city: z.string().trim().max(100).optional(),
  serviceMode: z.string().trim().max(50).optional(),
  minPrice: z.coerce.number().nonnegative().optional(),
  maxPrice: z.coerce.number().nonnegative().optional(),
  sort: coreReadSortSchema
});

export const serviceListQuerySchema = serviceListQueryBaseSchema.refine(
  (value) =>
    value.minPrice === undefined ||
    value.maxPrice === undefined ||
    value.minPrice <= value.maxPrice,
  "minPrice must be less than or equal to maxPrice"
);

export const coreSearchQuerySchema = serviceListQueryBaseSchema
  .extend({
    keyword: z.string().trim().min(1).max(100).optional()
  })
  .refine(
    (value) =>
      value.minPrice === undefined ||
      value.maxPrice === undefined ||
      value.minPrice <= value.maxPrice,
    "minPrice must be less than or equal to maxPrice"
  );

export const homeRecommendationsQuerySchema = z.object({
  city: z.string().trim().max(100).optional(),
  limit: z.coerce.number().int().positive().max(20).optional()
});

export type CoreReadIdParams = z.infer<typeof coreReadIdParamSchema>;
export type CategoryListQuery = z.infer<typeof categoryListQuerySchema>;
export type ServiceListQuery = z.infer<typeof serviceListQuerySchema>;
export type CoreSearchQuery = z.infer<typeof coreSearchQuerySchema>;
export type HomeRecommendationsQuery = z.infer<typeof homeRecommendationsQuerySchema>;
