import { z } from "zod";

export const exchangeOperationsPostTypeSchema = z.enum(["demand", "intelligence"]);
export const exchangeOperationsPostStatusSchema = z.enum([
  "published",
  "matched",
  "expired",
  "withdrawn",
  "closed"
]);
export const exchangeOperationsMatchModeSchema = z.enum(["quick", "selective"]);

export const exchangeOperationsListQuerySchema = z
  .object({
    type: exchangeOperationsPostTypeSchema.optional(),
    status: exchangeOperationsPostStatusSchema.optional(),
    match_mode: exchangeOperationsMatchModeSchema.optional(),
    publisher_identity_type: z.string().trim().min(1).max(50).optional(),
    keyword: z.string().trim().min(1).max(120).optional(),
    page: z.coerce.number().int().positive().default(1),
    page_size: z.coerce.number().int().min(1).max(100).default(20)
  })
  .strict()
  .transform(({ match_mode, publisher_identity_type, ...value }) => ({
    ...value,
    matchMode: match_mode,
    publisherIdentityType: publisher_identity_type
  }));

export const exchangeOperationsPostIdParamSchema = z
  .object({ id: z.coerce.number().int().positive() })
  .strict();

export type ExchangeOperationsListQuery = z.infer<typeof exchangeOperationsListQuerySchema>;

