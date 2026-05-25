import { z } from "zod";

const paginationQuerySchema = {
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().max(100).optional()
};

const dateRangeQuerySchema = {
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional()
};

const referenceQuerySchema = {
  referenceType: z.string().trim().min(1).max(80).optional(),
  referenceId: z.coerce.number().int().positive().optional()
};

const withValidDateRange = <TSchema extends z.ZodTypeAny>(schema: TSchema) =>
  schema.refine(
    (value: { from?: Date; to?: Date }) =>
      !value.from || !value.to || value.from.getTime() <= value.to.getTime(),
    {
      message: "from must be earlier than or equal to to",
      path: ["to"]
    }
  );

export const walletIdParamSchema = z.object({
  id: z.coerce.number().int().positive()
});

export const walletLedgerQuerySchema = z.object({
  ...paginationQuerySchema
});

export const ledgerTransactionListQuerySchema = withValidDateRange(
  z.object({
    ...paginationQuerySchema,
    ...dateRangeQuerySchema,
    ...referenceQuerySchema,
    type: z
      .enum([
        "booking_accept_freeze",
        "booking_cancel_unfreeze",
        "booking_complete_settlement",
        "booking_merchant_cancel_compensation",
        "seed_credit"
      ])
      .optional()
  })
);

export const financeReconciliationListQuerySchema = withValidDateRange(
  z.object({
    ...paginationQuerySchema,
    ...dateRangeQuerySchema,
    ...referenceQuerySchema,
    status: z.enum(["pending", "exported"]).optional()
  })
);

export type WalletIdParams = z.infer<typeof walletIdParamSchema>;
export type WalletLedgerQuery = z.infer<typeof walletLedgerQuerySchema>;
export type LedgerTransactionListQuery = z.infer<typeof ledgerTransactionListQuerySchema>;
export type FinanceReconciliationListQuery = z.infer<typeof financeReconciliationListQuerySchema>;
