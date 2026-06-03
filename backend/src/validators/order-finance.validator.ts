import { z } from "zod";

export const orderFinanceBookingOrderIdParamSchema = z.object({
  bookingOrderId: z.coerce.number().int().positive()
});

export const serviceIncomeReportBodySchema = z
  .object({
    serviceAmountJpy: z.number().int().nonnegative().max(100_000_000),
    platformCollectedServiceAmountJpy: z.number().int().nonnegative().max(100_000_000).default(0),
    offlineReportedServiceAmountJpy: z.number().int().nonnegative().max(100_000_000).default(0),
    paymentChannel: z
      .enum([
        "unknown",
        "platform_online",
        "offline_cash",
        "offline_card",
        "bank_transfer",
        "other"
      ])
      .default("unknown"),
    confirmNow: z.boolean().default(false),
    note: z.string().trim().max(500).nullable().optional(),
    proofUrl: z.string().trim().url().max(500).nullable().optional()
  })
  .refine(
    (input) =>
      input.platformCollectedServiceAmountJpy + input.offlineReportedServiceAmountJpy <=
      input.serviceAmountJpy,
    {
      message: "reported income cannot exceed serviceAmountJpy",
      path: ["offlineReportedServiceAmountJpy"]
    }
  );

export type OrderFinanceBookingOrderIdParams = z.infer<
  typeof orderFinanceBookingOrderIdParamSchema
>;
export type ServiceIncomeReportBody = z.input<typeof serviceIncomeReportBodySchema>;
export type ParsedServiceIncomeReportBody = z.output<typeof serviceIncomeReportBodySchema>;
