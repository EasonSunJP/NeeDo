import { z } from "zod";

export const affiliateAllianceCreateBodySchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    description: z.string().trim().min(1).max(500).nullable().optional(),
    defaultPromoterShareBps: z.number().int().min(0).max(10_000)
  })
  .strict();

export type AffiliateAllianceCreateBody = z.infer<typeof affiliateAllianceCreateBodySchema>;
