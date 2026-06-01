import { z } from "zod";

const paginationQuerySchema = {
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().max(100).optional()
};

export const shopIdParamSchema = z.object({
  shopId: z.coerce.number().int().positive()
});

export const technicianServiceIdParamSchema = shopIdParamSchema.extend({
  serviceId: z.coerce.number().int().positive()
});

export const publicTechnicianServicesParamSchema = shopIdParamSchema.extend({
  technicianId: z.coerce.number().int().positive()
});

export const pricingModeBodySchema = z.object({
  pricingMode: z.enum(["merchant", "technician"])
});

export const technicianServiceListQuerySchema = z.object({
  ...paginationQuerySchema,
  activeOnly: z.coerce.boolean().optional()
});

export const bookingNavigationQuerySchema = z.object({
  ...paginationQuerySchema
});

export const technicianServiceBodySchema = z.object({
  sourceShopServiceId: z.number().int().positive().nullable().optional(),
  name: z.string().trim().min(1).max(160),
  description: z.string().trim().max(2000).nullable().optional(),
  categoryId: z.number().int().positive(),
  priceAmount: z.number().int().nonnegative().max(10_000_000),
  currency: z.string().trim().length(3).default("JPY"),
  durationMinutes: z.number().int().positive().max(1440),
  coverImageUrl: z.string().trim().url().max(500).nullable().optional(),
  images: z.array(z.string().trim().url().max(500)).max(10).optional(),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
  isActive: z.boolean().optional(),
  isBookable: z.boolean().optional(),
  isRecommended: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(999_999).optional()
});

export type ShopIdParams = z.infer<typeof shopIdParamSchema>;
export type TechnicianServiceIdParams = z.infer<typeof technicianServiceIdParamSchema>;
export type PublicTechnicianServicesParams = z.infer<
  typeof publicTechnicianServicesParamSchema
>;
export type PricingModeBody = z.infer<typeof pricingModeBodySchema>;
export type TechnicianServiceListQuery = z.infer<typeof technicianServiceListQuerySchema>;
export type BookingNavigationQuery = z.infer<typeof bookingNavigationQuerySchema>;
export type TechnicianServiceBody = z.infer<typeof technicianServiceBodySchema>;
