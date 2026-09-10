import { z } from "zod";

const paginationFields = {
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().max(100).optional()
};

const keywordField = z.string().trim().min(1).max(160).optional();

const shopIdsQuerySchema = z.preprocess(
  (value) => (typeof value === "string" ? value.split(",") : value),
  z.array(z.coerce.number().int().positive()).min(1).max(1_000)
);

const uniqueShopIds = (shopIds: number[], context: z.RefinementCtx): void => {
  if (new Set(shopIds).size !== shopIds.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["shopIds"],
      message: "shopIds must be unique"
    });
  }
};

export const merchantAffiliatePublishersQuerySchema = z
  .object({ keyword: keywordField, ...paginationFields })
  .strict();

export const merchantAffiliateShopsQuerySchema = z.discriminatedUnion("publisherType", [
  z
    .object({
      publisherType: z.literal("shop"),
      keyword: keywordField,
      ...paginationFields
    })
    .strict(),
  z
    .object({
      publisherType: z.literal("merchant_account"),
      merchantAccountId: z.coerce.number().int().positive(),
      keyword: keywordField,
      ...paginationFields
    })
    .strict()
]);

export const merchantAffiliateServicesQuerySchema = z
  .discriminatedUnion("publisherType", [
    z
      .object({
        publisherType: z.literal("shop"),
        shopIds: shopIdsQuerySchema,
        keyword: keywordField,
        ...paginationFields
      })
      .strict(),
    z
      .object({
        publisherType: z.literal("merchant_account"),
        merchantAccountId: z.coerce.number().int().positive(),
        shopIds: shopIdsQuerySchema,
        keyword: keywordField,
        ...paginationFields
      })
      .strict()
  ])
  .superRefine((value, context) => uniqueShopIds(value.shopIds, context));

const feePreviewFields = {
  shopIds: z.array(z.number().int().positive()).min(1).max(1_000),
  totalBudgetNdp: z.number().int().min(1).max(2_000_000_000)
};

export const merchantAffiliateFeePreviewBodySchema = z
  .discriminatedUnion("publisherType", [
    z.object({ publisherType: z.literal("shop"), ...feePreviewFields }).strict(),
    z
      .object({
        publisherType: z.literal("merchant_account"),
        merchantAccountId: z.number().int().positive(),
        ...feePreviewFields
      })
      .strict()
  ])
  .superRefine((value, context) => uniqueShopIds(value.shopIds, context));

export type MerchantAffiliatePublishersQuery = z.infer<
  typeof merchantAffiliatePublishersQuerySchema
>;
export type MerchantAffiliateShopsQuery = z.infer<typeof merchantAffiliateShopsQuerySchema>;
export type MerchantAffiliateServicesQuery = z.infer<
  typeof merchantAffiliateServicesQuerySchema
>;
export type MerchantAffiliateFeePreviewBody = z.infer<
  typeof merchantAffiliateFeePreviewBodySchema
>;
