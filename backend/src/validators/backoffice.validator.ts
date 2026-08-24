import { z } from "zod";

const paginationQuerySchema = {
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().max(100).optional()
};

const isoDateSchema = z.coerce.date();

export const backofficeListQuerySchema = z.object({
  ...paginationQuerySchema,
  keyword: z.string().trim().max(100).optional(),
  status: z.string().trim().max(80).optional(),
  from: isoDateSchema.optional(),
  to: isoDateSchema.optional(),
  shopId: z.coerce.number().int().positive().optional(),
  categoryId: z.coerce.number().int().positive().optional()
});

const emailSchema = z.string().trim().email().max(255).transform((email) => email.toLowerCase());
const passwordSchema = z.string().min(8).max(128)
  .regex(/[a-z]/, "password must include a lowercase letter")
  .regex(/[A-Z]/, "password must include an uppercase letter")
  .regex(/[0-9]/, "password must include a number")
  .regex(/[^A-Za-z0-9]/, "password must include a symbol");

export const backofficeEntityIdParamSchema = z.object({
  id: z.coerce.number().int().positive()
});

export const backofficeShopIdParamSchema = z.object({
  shopId: z.coerce.number().int().positive()
});

export const backofficeShopCreateBodySchema = z.object({
  ownerEmail: emailSchema,
  ownerUsername: z.string().trim().min(1).max(100),
  ownerPassword: passwordSchema,
  name: z.string().trim().min(1).max(160),
  description: z.string().trim().max(5000).nullable().optional(),
  city: z.string().trim().min(1).max(100),
  address: z.string().trim().min(1).max(255),
  phone: z.string().trim().min(5).max(32).nullable().optional(),
  isRecommended: z.boolean().optional()
});

const merchantShopUpdateFields = {
  name: z.string().trim().min(1).max(160).optional(),
  description: z.string().trim().max(5000).nullable().optional(),
  city: z.string().trim().min(1).max(100).optional(),
  address: z.string().trim().min(1).max(255).optional(),
  phone: z.string().trim().min(5).max(32).nullable().optional()
};

export const backofficeShopUpdateBodySchema = z.object({
  ...merchantShopUpdateFields,
  isRecommended: z.boolean().optional()
}).refine((value) => Object.keys(value).length > 0, "At least one field is required");

export const merchantShopUpdateBodySchema = z.object(merchantShopUpdateFields)
  .strict()
  .refine((value) => Object.keys(value).length > 0, "At least one field is required");

export const backofficeTechnicianUpdateBodySchema = z.object({
  displayName: z.string().trim().min(1).max(120).optional(),
  city: z.string().trim().min(1).max(100).optional(),
  serviceArea: z.string().trim().max(255).nullable().optional(),
  shopId: z.number().int().positive().nullable().optional(),
  isRecommended: z.boolean().optional()
}).refine((value) => Object.keys(value).length > 0, "At least one field is required");

export const backofficeTechnicianApproveBodySchema = z.object({
  shopId: z.number().int().positive().optional()
});

export const backofficeCustomerUpdateBodySchema = z.object({
  displayName: z.string().trim().min(1).max(120).optional(),
  bio: z.string().trim().max(5000).nullable().optional(),
  city: z.string().trim().max(100).nullable().optional(),
  membershipLevel: z.string().trim().min(1).max(50).optional(),
  isPublic: z.boolean().optional()
}).refine((value) => Object.keys(value).length > 0, "At least one field is required");

const serviceFields = {
  categoryId: z.number().int().positive(),
  technicianProfileId: z.number().int().positive().nullable().optional(),
  name: z.string().trim().min(1).max(160),
  description: z.string().trim().max(5000).nullable().optional(),
  city: z.string().trim().min(1).max(100),
  serviceMode: z.enum(["store", "home"]),
  priceAmount: z.number().nonnegative().max(99_999_999),
  durationMinutes: z.number().int().positive().max(1440),
  status: z.enum(["draft", "published", "paused"]).optional(),
  isRecommended: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(1_000_000).optional()
};

export const backofficeServiceCreateBodySchema = z.object(serviceFields);
export const backofficeServiceUpdateBodySchema = z.object({
  categoryId: serviceFields.categoryId.optional(),
  technicianProfileId: serviceFields.technicianProfileId,
  name: serviceFields.name.optional(),
  description: serviceFields.description,
  city: serviceFields.city.optional(),
  serviceMode: serviceFields.serviceMode.optional(),
  priceAmount: serviceFields.priceAmount.optional(),
  durationMinutes: serviceFields.durationMinutes.optional(),
  status: serviceFields.status,
  isRecommended: serviceFields.isRecommended,
  sortOrder: serviceFields.sortOrder
}).refine((value) => Object.keys(value).length > 0, "At least one field is required");

export type BackofficeListQuery = z.infer<typeof backofficeListQuerySchema>;
export type BackofficeShopCreateBody = z.infer<typeof backofficeShopCreateBodySchema>;
export type BackofficeShopUpdateBody = z.infer<typeof backofficeShopUpdateBodySchema>;
export type MerchantShopUpdateBody = z.infer<typeof merchantShopUpdateBodySchema>;
export type BackofficeTechnicianUpdateBody = z.infer<typeof backofficeTechnicianUpdateBodySchema>;
export type BackofficeTechnicianApproveBody = z.infer<typeof backofficeTechnicianApproveBodySchema>;
export type BackofficeCustomerUpdateBody = z.infer<typeof backofficeCustomerUpdateBodySchema>;
export type BackofficeServiceCreateBody = z.infer<typeof backofficeServiceCreateBodySchema>;
export type BackofficeServiceUpdateBody = z.infer<typeof backofficeServiceUpdateBodySchema>;
