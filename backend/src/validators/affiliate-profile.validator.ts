import { z } from "zod";

export const affiliateChannelPlatformSchema = z.enum([
  "x",
  "instagram",
  "youtube",
  "tiktok",
  "custom"
]);

const customLabelSchema = z.string().trim().min(1).max(60).nullable().optional();

const validateCustomLabel = (
  value: { platform?: z.infer<typeof affiliateChannelPlatformSchema>; customLabel?: string | null },
  context: z.RefinementCtx
): void => {
  if (!value.platform) return;

  if (value.platform === "custom" && !value.customLabel) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["customLabel"],
      message: "Custom channel label is required"
    });
    return;
  }

  if (value.platform !== "custom" && value.customLabel != null) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["customLabel"],
      message: "Custom channel label is only allowed for custom channels"
    });
  }
};

export const affiliateProfileUpdateBodySchema = z
  .object({
    expectedVersion: z.number().int().positive(),
    bio: z.string().trim().max(1000).nullable().optional(),
    strengths: z.array(z.string().trim().min(1).max(40)).max(10).optional(),
    serviceAreas: z.array(z.string().trim().min(1).max(80)).max(10).optional(),
    cooperationStatus: z.enum(["available", "selective", "unavailable"]).optional()
  })
  .strict()
  .refine((value) => Object.keys(value).some((key) => key !== "expectedVersion"), {
    message: "At least one mutable profile field is required"
  });

export const affiliateChannelCreateBodySchema = z
  .object({
    expectedProfileVersion: z.number().int().positive(),
    platform: affiliateChannelPlatformSchema,
    customLabel: customLabelSchema,
    homepageUrl: z.string().trim().min(1).max(500),
    sortOrder: z.number().int().min(0).max(1000).default(0)
  })
  .strict()
  .superRefine(validateCustomLabel);

export const affiliateChannelUpdateBodySchema = z
  .object({
    expectedProfileVersion: z.number().int().positive(),
    platform: affiliateChannelPlatformSchema.optional(),
    customLabel: customLabelSchema,
    homepageUrl: z.string().trim().min(1).max(500).optional(),
    sortOrder: z.number().int().min(0).max(1000).optional()
  })
  .strict()
  .refine((value) => Object.keys(value).some((key) => key !== "expectedProfileVersion"), {
    message: "At least one mutable channel field is required"
  })
  .superRefine(validateCustomLabel);

export const affiliateChannelIdParamSchema = z
  .object({
    channelId: z.coerce.number().int().positive()
  })
  .strict();

export const affiliateChannelDeleteQuerySchema = z
  .object({
    expected_profile_version: z.coerce.number().int().positive()
  })
  .strict();

export type AffiliateProfileUpdateBody = z.infer<typeof affiliateProfileUpdateBodySchema>;
export type AffiliateChannelCreateBody = z.infer<typeof affiliateChannelCreateBodySchema>;
export type AffiliateChannelUpdateBody = z.infer<typeof affiliateChannelUpdateBodySchema>;
export type AffiliateChannelIdParam = z.infer<typeof affiliateChannelIdParamSchema>;
export type AffiliateChannelDeleteQuery = z.infer<typeof affiliateChannelDeleteQuerySchema>;
