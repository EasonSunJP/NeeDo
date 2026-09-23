import { z } from "zod";

const paginationShape = {
  page: z.coerce.number().int().positive().default(1),
  page_size: z.coerce.number().int().positive().max(100).default(20)
};

const serviceRefSchema = z.string()
  .regex(/^(?:shop|technician):[1-9]\d*$/u)
  .refine((value) => {
    const id = Number(value.split(":")[1]);
    return Number.isSafeInteger(id) && id <= 2_147_483_647;
  });

export const createExchangeClaimSchema = z
  .object({
    scheduleSlotId: z.coerce.number().int().safe().refine((value) => value !== 0),
    serviceRef: serviceRefSchema.optional(),
    quoteAmountJpy: z.coerce.number().int().positive().max(1_000_000_000),
    message: z.string().trim().max(1_000).nullable().optional().default(null)
  })
  .strict()
  .refine((value) => value.scheduleSlotId > 0 || Boolean(value.serviceRef), {
    path: ["serviceRef"]
  });

export const exchangeClaimListQuerySchema = z.object(paginationShape).strict();

export const exchangeClaimOptionListQuerySchema = z
  .object({
    ...paginationShape,
    shop_id: z.coerce.number().int().positive().optional(),
    technician_profile_id: z.coerce.number().int().positive().optional(),
    service_ref: serviceRefSchema.optional()
  })
  .strict();

export const exchangeClaimPostIdParamSchema = z
  .object({ id: z.coerce.number().int().positive() })
  .strict();

export const exchangeClaimIdParamSchema = z
  .object({ claimId: z.coerce.number().int().positive() })
  .strict();

export type CreateExchangeClaimBody = z.infer<typeof createExchangeClaimSchema>;
export type ExchangeClaimListQuery = z.infer<typeof exchangeClaimListQuerySchema>;
export type ExchangeClaimOptionListQuery = z.infer<typeof exchangeClaimOptionListQuerySchema>;
