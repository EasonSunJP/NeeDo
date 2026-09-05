import { z } from "zod";

export const travelFarePolicyListQuerySchema = z
  .object({
    page: z.coerce.number().int().positive().optional(),
    pageSize: z.coerce.number().int().positive().max(100).optional(),
    city: z.string().trim().min(1).max(100).optional(),
    shopKeyword: z.string().trim().min(1).max(160).optional()
  })
  .strict();

export type TravelFarePolicyListQuery = z.infer<typeof travelFarePolicyListQuerySchema>;
