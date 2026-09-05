import { z } from "zod";

export const japaneseRouteAddressSchema = z
  .object({
    countryCode: z.literal("JP"),
    postalCode: z.string().trim().regex(/^\d{3}-?\d{4}$/u),
    prefecture: z.string().trim().min(1).max(32),
    city: z.string().trim().min(1).max(100),
    addressLine1: z.string().trim().min(1).max(255),
    addressLine2: z.string().trim().max(255).optional(),
    building: z.string().trim().max(255).optional()
  })
  .strict();

export const routeEstimateCreateBodySchema = z
  .object({
    servicePublicId: z.string().trim().min(1).max(160),
    destination: japaneseRouteAddressSchema
  })
  .strict();

export type RouteEstimateCreateBody = z.infer<typeof routeEstimateCreateBodySchema>;
