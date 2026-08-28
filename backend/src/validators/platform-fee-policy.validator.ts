import { z } from "zod";

const booleanQuerySchema = z.enum(["true", "false"]).transform((value) => value === "true");

export const globalPlatformFeeUpdateBodySchema = z
  .object({
    amountNdp: z.number().int().min(0).max(10_000_000),
    expectedVersion: z.number().int().positive()
  })
  .strict();

export const shopFeeEnabledUpdateBodySchema = z
  .object({
    feeEnabled: z.boolean(),
    expectedVersion: z.number().int().min(0)
  })
  .strict();

export const shopPlatformFeePolicyListQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().max(100).optional(),
  keyword: z.string().trim().min(1).max(160).optional(),
  feeEnabled: booleanQuerySchema.optional()
});

export const platformFeeShopIdParamSchema = z.object({
  shopId: z.coerce.number().int().positive()
});

export type GlobalPlatformFeeUpdateBody = z.infer<typeof globalPlatformFeeUpdateBodySchema>;
export type ShopFeeEnabledUpdateBody = z.infer<typeof shopFeeEnabledUpdateBodySchema>;
export type ShopPlatformFeePolicyListQuery = z.infer<typeof shopPlatformFeePolicyListQuerySchema>;
