import { z } from "zod";
import { CONTENT_LOCALES } from "../constants/content-locales";

const trimmedText = (max: number) => z.string().trim().max(max);
const requiredText = (max: number) => trimmedText(max).min(1);
const mediaPublicIdSchema = z.string().regex(/^[a-f0-9]{64}$/u);
const stringListSchema = z.array(requiredText(80)).max(10);

const carouselItemSchema = z.object({
  mediaAssetPublicId: mediaPublicIdSchema,
  altText: requiredText(255)
}).strict();

const serviceMenuSchema = z.object({
  serviceId: z.number().int().positive(),
  name: requiredText(160),
  description: trimmedText(5000),
  audience: trimmedText(160),
  tags: stringListSchema,
  highlights: stringListSchema,
  coverMediaAssetPublicId: mediaPublicIdSchema.nullable()
}).strict();

export const shopPresentationContentSchema = z.object({
  storeName: requiredText(160),
  description: trimmedText(5000),
  address: requiredText(255),
  area: requiredText(100),
  rankLabel: trimmedText(160),
  businessHours: trimmedText(160),
  subtitle: trimmedText(1000),
  station: trimmedText(255),
  distance: trimmedText(255),
  parking: trimmedText(500),
  routeGuide: trimmedText(2000),
  paymentMethods: stringListSchema,
  equipment: stringListSchema,
  carousel: z.array(carouselItemSchema).min(1).max(5),
  serviceMenus: z.array(serviceMenuSchema).max(5)
}).strict().superRefine((value, context) => {
  const mediaIds = value.carousel.map((item) => item.mediaAssetPublicId);
  if (new Set(mediaIds).size !== mediaIds.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["carousel"],
      message: "error.shop_presentation.carousel_duplicate"
    });
  }
  const serviceIds = value.serviceMenus.map((item) => item.serviceId);
  if (new Set(serviceIds).size !== serviceIds.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["serviceMenus"],
      message: "error.shop_presentation.service_duplicate"
    });
  }
});

export const shopPresentationLocaleParamSchema = z.object({
  locale: z.enum(CONTENT_LOCALES)
}).strict();

export const shopPresentationLocaleUpdateBodySchema = z.object({
  expectedLockVersion: z.number().int().nonnegative(),
  content: shopPresentationContentSchema
}).strict();

export const shopPresentationLocaleSyncBodySchema = z.object({
  expectedLockVersions: z.object({
    "zh-CN": z.number().int().nonnegative(),
    "zh-TW": z.number().int().nonnegative(),
    en: z.number().int().nonnegative(),
    ja: z.number().int().nonnegative(),
    ko: z.number().int().nonnegative()
  }).strict(),
  content: shopPresentationContentSchema
}).strict();

export const shopPresentationMediaQuerySchema = z.object({
  alt_text: requiredText(255).optional()
}).strict();

export type ShopPresentationContent = z.infer<typeof shopPresentationContentSchema>;
export type ShopPresentationLocaleUpdateBody = z.infer<typeof shopPresentationLocaleUpdateBodySchema>;
export type ShopPresentationLocaleSyncBody = z.infer<typeof shopPresentationLocaleSyncBodySchema>;
