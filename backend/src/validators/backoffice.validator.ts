import { z } from "zod";

const paginationQuerySchema = {
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().max(100).optional()
};

const isoDateSchema = z.coerce.date();

export const backofficeListQuerySchema = z.object({
  ...paginationQuerySchema,
  status: z.string().trim().max(80).optional(),
  from: isoDateSchema.optional(),
  to: isoDateSchema.optional()
});

export type BackofficeListQuery = z.infer<typeof backofficeListQuerySchema>;
