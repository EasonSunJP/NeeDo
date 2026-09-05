import { z } from "zod";
import { PRISMA_INT_MAX } from "../constants/database";

export const shopTravelFareBandInputSchema = z
  .object({
    maximumDistanceMeters: z.number().int().positive().max(PRISMA_INT_MAX),
    fareAmountJpy: z.number().int().min(0).max(PRISMA_INT_MAX)
  })
  .strict();

export const shopTravelFarePolicyPublishBodySchema = z
  .object({
    expectedVersion: z.number().int().min(0),
    effectiveFrom: z.string().datetime({ offset: true }),
    reason: z.string().trim().min(1).max(500),
    bands: z.array(shopTravelFareBandInputSchema).min(1).max(50)
  })
  .strict();

export const shopTravelFarePolicyHistoryQuerySchema = z
  .object({
    page: z.coerce.number().int().positive().optional(),
    pageSize: z.coerce.number().int().positive().max(100).optional()
  })
  .strict();

export type ShopTravelFarePolicyPublishBody = z.infer<
  typeof shopTravelFarePolicyPublishBodySchema
>;
export type ShopTravelFarePolicyHistoryQuery = z.infer<
  typeof shopTravelFarePolicyHistoryQuerySchema
>;
