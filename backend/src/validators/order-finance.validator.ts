import { z } from "zod";

export const orderFinanceBookingOrderIdParamSchema = z.object({
  bookingOrderId: z.coerce.number().int().positive()
});

export const serviceIncomeReportBodySchema = z
  .object({
    serviceAmountJpy: z.number().int().nonnegative().max(100_000_000),
    baseServiceAmountJpy: z.number().int().nonnegative().max(100_000_000).optional(),
    extensionAmountJpy: z.number().int().nonnegative().max(100_000_000).optional(),
    nominationChargeAmountJpy: z.number().int().nonnegative().max(100_000_000).optional(),
    wasTechnicianNominated: z.boolean().optional(),
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
  )
  .superRefine((input, context) => {
    const componentValues = [
      input.baseServiceAmountJpy,
      input.extensionAmountJpy,
      input.nominationChargeAmountJpy,
      input.wasTechnicianNominated
    ];
    const hasAnyComponent = componentValues.some((value) => value !== undefined);
    if (!hasAnyComponent) return;
    if (componentValues.some((value) => value === undefined)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["baseServiceAmountJpy"],
        message: "all service income component fields are required together"
      });
      return;
    }
    if (
      input.baseServiceAmountJpy! + input.extensionAmountJpy! + input.nominationChargeAmountJpy! !==
      input.serviceAmountJpy
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["nominationChargeAmountJpy"],
        message: "service income components must equal serviceAmountJpy"
      });
    }
  });

export type OrderFinanceBookingOrderIdParams = z.infer<
  typeof orderFinanceBookingOrderIdParamSchema
>;
export type ServiceIncomeReportBody = z.input<typeof serviceIncomeReportBodySchema>;
export type ParsedServiceIncomeReportBody = z.output<typeof serviceIncomeReportBodySchema>;
