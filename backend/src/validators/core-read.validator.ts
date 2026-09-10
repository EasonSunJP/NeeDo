import { z } from "zod";
import { CONTENT_LOCALES } from "../constants/content-locales";

const paginationQuerySchema = {
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().max(100).optional()
};

export const coreReadIdParamSchema = z.object({
  id: z.coerce.number().int().positive()
});

export const coreReadServiceIdParamSchema = z.object({
  id: z.union([z.coerce.number().int().positive(), z.string().uuid()])
});

export const coreReadShopIdParamSchema = z.object({
  id: z.union([z.coerce.number().int().positive(), z.string().regex(/^shop\d{10}$/)])
});

export const coreReadShopDetailQuerySchema = z.object({
  locale: z.enum(CONTENT_LOCALES).optional()
}).strict();

export const coreReadTechnicianIdParamSchema = z.object({
  id: z.union([z.coerce.number().int().positive(), z.string().regex(/^s\d{10}$/)])
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
  sort: coreReadSortSchema,
  latitude: z.coerce.number().min(-90).max(90).optional(),
  longitude: z.coerce.number().min(-180).max(180).optional()
});

const requireCoordinatePair = (
  value: { latitude?: number; longitude?: number },
  context: z.RefinementCtx
) => {
  if ((value.latitude === undefined) !== (value.longitude === undefined)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "latitude and longitude must be provided together",
      path: value.latitude === undefined ? ["latitude"] : ["longitude"]
    });
  }
};

const repeatedQueryValues = (value: unknown): unknown[] =>
  value === undefined ? [] : Array.isArray(value) ? value : [value];

const uniqueTrimmedStrings = z.preprocess(
  repeatedQueryValues,
  z
    .array(z.string().trim().min(1).max(100))
    .transform((values) => Array.from(new Set(values)))
    .pipe(z.array(z.string()).max(20))
);

const uniquePositiveIntegers = z.preprocess(
  repeatedQueryValues,
  z
    .array(z.coerce.number().int().positive())
    .transform((values) => Array.from(new Set(values)))
    .pipe(z.array(z.number().int().positive()).max(20))
);

export const serviceListQuerySchema = serviceListQueryBaseSchema
  .superRefine(requireCoordinatePair)
  .refine(
    (value) =>
      value.minPrice === undefined ||
      value.maxPrice === undefined ||
      value.minPrice <= value.maxPrice,
    "minPrice must be less than or equal to maxPrice"
  );

export const serviceReviewListQuerySchema = z.object({
  ...paginationQuerySchema
});

export const coreSearchQuerySchema = serviceListQueryBaseSchema
  .extend({
    entityType: z.enum(["service", "shop", "technician"]).default("service"),
    keyword: z.string().trim().min(1).max(100).optional(),
    keywords: uniqueTrimmedStrings,
    categoryIds: uniquePositiveIntegers
  })
  .superRefine(requireCoordinatePair)
  .refine(
    (value) =>
      value.minPrice === undefined ||
      value.maxPrice === undefined ||
      value.minPrice <= value.maxPrice,
    "minPrice must be less than or equal to maxPrice"
  );

export const homeRecommendationsQuerySchema = z
  .object({
    city: z.string().trim().max(100).optional(),
    limit: z.coerce.number().int().positive().max(20).optional(),
    latitude: z.coerce.number().min(-90).max(90).optional(),
    longitude: z.coerce.number().min(-180).max(180).optional()
  })
  .superRefine(requireCoordinatePair);

export const coreReadCoordinateQuerySchema = z
  .object({
    latitude: z.coerce.number().min(-90).max(90).optional(),
    longitude: z.coerce.number().min(-180).max(180).optional()
  })
  .superRefine(requireCoordinatePair);

export type CoreReadIdParams = z.infer<typeof coreReadIdParamSchema>;
export type CoreReadServiceIdParams = z.infer<typeof coreReadServiceIdParamSchema>;
export type CoreReadShopIdParams = z.infer<typeof coreReadShopIdParamSchema>;
export type CoreReadTechnicianIdParams = z.infer<typeof coreReadTechnicianIdParamSchema>;
export type CategoryListQuery = z.infer<typeof categoryListQuerySchema>;
export type ServiceListQuery = z.infer<typeof serviceListQuerySchema>;
export type ServiceReviewListQuery = z.infer<typeof serviceReviewListQuerySchema>;
export type CoreSearchQuery = z.infer<typeof coreSearchQuerySchema>;
export type HomeRecommendationsQuery = z.infer<typeof homeRecommendationsQuerySchema>;
export type CoreReadCoordinateQuery = z.infer<typeof coreReadCoordinateQuerySchema>;
