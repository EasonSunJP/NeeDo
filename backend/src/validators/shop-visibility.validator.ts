import { z } from "zod";

export const shopVisibilityParamsSchema = z.object({
  shopId: z.coerce.number().int().positive()
});

export const shopVisibilityBodySchema = z
  .object({
    visibility: z.enum(["public", "privateAll", "limited", "network"])
  })
  .strict();

export type ShopVisibilityBody = z.infer<typeof shopVisibilityBodySchema>;
