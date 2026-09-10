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

export const createWalletAdjustmentRequestBodySchema = z.object({
  type: z.enum(["topup", "withdrawal"]),
  amountNdp: z.number().int().positive().max(100_000_000),
  idempotencyKey: z.string().trim().min(8).max(160),
  bankReference: z.string().trim().min(1).max(120).nullable().optional(),
  note: z.string().trim().min(1).max(500).nullable().optional()
});

export const walletAdjustmentIdParamSchema = z.object({
  id: z.coerce.number().int().positive()
});

export const walletAdjustmentMineQuerySchema = z.object({
  ...paginationQuerySchema
});

export const walletAdjustmentListQuerySchema = z.object({
  ...paginationQuerySchema,
  ownerType: z.enum(["user", "shop", "platform"]).optional(),
  ownerId: z.coerce.number().int().positive().optional(),
  type: z.enum(["topup", "withdrawal"]).optional(),
  status: z.enum(["pending", "approved", "rejected"]).optional()
});

export const reviewWalletAdjustmentRequestBodySchema = z.object({
  action: z.enum(["approve", "reject"]),
  note: z.string().trim().min(1).max(500)
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
        "manual_topup_approved",
        "manual_withdrawal_approved",
        "seed_credit",
        "affiliate_task_budget_freeze",
        "affiliate_task_budget_release",
        "affiliate_reward_settlement",
        "shop_membership_reward_settlement",
        "shop_membership_reward_reversal",
        "service_consumption_settlement",
        "product_consumption_settlement",
        "platform_membership_purchase",
        "booking_consumption_refund",
        "service_consumption_refund",
        "product_consumption_refund"
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
export type CreateWalletAdjustmentRequestBody = z.infer<
  typeof createWalletAdjustmentRequestBodySchema
>;
export type WalletAdjustmentIdParams = z.infer<typeof walletAdjustmentIdParamSchema>;
export type WalletAdjustmentMineQuery = z.infer<typeof walletAdjustmentMineQuerySchema>;
export type WalletAdjustmentListQuery = z.infer<typeof walletAdjustmentListQuerySchema>;
export type ReviewWalletAdjustmentRequestBody = z.infer<
  typeof reviewWalletAdjustmentRequestBodySchema
>;
export type LedgerTransactionListQuery = z.infer<typeof ledgerTransactionListQuerySchema>;
export type FinanceReconciliationListQuery = z.infer<typeof financeReconciliationListQuerySchema>;
