import { z } from "zod";

const paginationFields = {
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().max(100).optional()
};

const positiveId = z.coerce.number().int().positive();
const version = z.number().int().positive();
const isoDate = z.coerce.date();

export const billingSubjectTypeSchema = z.enum(["merchant_account", "shop"]);
export const billingCadenceSchema = z.enum(["monthly", "annual", "free"]);
export const paymentResponsibilitySchema = z.enum([
  "group_consolidated",
  "shops_individual"
]);

export const merchantAccountListQuerySchema = z.object({
  ...paginationFields,
  status: z.string().trim().min(1).max(40).optional(),
  query: z.string().trim().min(1).max(160).optional()
});

export const merchantAccountIdParamSchema = z.object({ id: positiveId });

export const merchantMembershipParamSchema = z.object({
  id: positiveId,
  shopId: positiveId
});

export const shopBillingParamSchema = z.object({ id: positiveId });

export const billingSubjectParamSchema = z.object({
  subjectType: billingSubjectTypeSchema,
  subjectId: positiveId
});

export const invoiceIdParamSchema = z.object({ id: positiveId });

export const createMerchantAccountBodySchema = z.object({
  code: z.string().trim().min(2).max(100).regex(/^[a-z0-9][a-z0-9-]*$/),
  name: z.string().trim().min(1).max(160),
  ownerUserId: z.number().int().positive().nullable().optional(),
  paymentResponsibility: paymentResponsibilitySchema.default("group_consolidated")
});

export const updateBillingProfileBodySchema = z.object({
  billingCadence: billingCadenceSchema,
  monthlyFeeJpy: z.number().int().nonnegative().max(10_000_000),
  cadenceLocked: z.boolean(),
  amountLocked: z.boolean(),
  paymentProvider: z.enum(["manual", "stripe"]).optional(),
  version
});

export const updatePaymentResponsibilityBodySchema = z.object({
  paymentResponsibility: paymentResponsibilitySchema,
  effectiveFrom: isoDate.optional()
});

export const linkMerchantShopBodySchema = z.object({
  shopId: z.number().int().positive(),
  startsAt: isoDate.optional()
});

export const extendTrialBodySchema = z
  .object({
    quickMonths: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional(),
    days: z.number().int().positive().max(1095).optional(),
    paidFrom: isoDate.optional(),
    reason: z.string().trim().min(1).max(500),
    version
  })
  .refine(
    (value) => value.quickMonths !== undefined || value.days !== undefined || value.paidFrom,
    { message: "Provide quickMonths, days, or paidFrom" }
  );

export const interruptTrialBodySchema = z.object({
  reason: z.string().trim().min(1).max(500),
  version
});

export const freePeriodListQuerySchema = z.object({ ...paginationFields });

export const saasInvoiceListQuerySchema = z.object({
  ...paginationFields,
  status: z.string().trim().min(1).max(40).optional(),
  payerType: billingSubjectTypeSchema.optional(),
  from: isoDate.optional(),
  to: isoDate.optional()
});

export const manualPaymentBodySchema = z.object({
  amountJpy: z.number().int().positive().max(100_000_000),
  receivedAt: isoDate,
  reference: z.string().trim().min(1).max(191),
  idempotencyKey: z.string().trim().min(8).max(191),
  coverageStartsAt: isoDate.optional(),
  coverageEndsAt: isoDate.optional()
});

export const suspensionReasonCodeSchema = z.enum([
  "overdue_payment",
  "qualification_or_fraud",
  "serious_service_violation",
  "customer_complaints",
  "safety_risk",
  "account_abuse",
  "merchant_requested_closure",
  "other"
]);

export const createSuspensionBodySchema = z.object({
  reasonCodes: z.array(suspensionReasonCodeSchema).min(1).max(8),
  note: z.string().trim().min(1).max(1000),
  scope: z.enum(["subject_only", "merchant_and_shops", "merchant_detach_shops"])
});

export const releaseSuspensionParamSchema = billingSubjectParamSchema.extend({
  suspensionId: positiveId
});

export const releaseSuspensionBodySchema = z.object({
  reason: z.string().trim().min(1).max(500)
});

export const dissolveMerchantBodySchema = z.object({
  strategy: z.enum(["detach_shops", "delete_eligible_shops"])
});

export type MerchantAccountListQuery = z.infer<typeof merchantAccountListQuerySchema>;
export type CreateMerchantAccountBody = z.infer<typeof createMerchantAccountBodySchema>;
export type UpdateBillingProfileBody = z.infer<typeof updateBillingProfileBodySchema>;
export type UpdatePaymentResponsibilityBody = z.infer<
  typeof updatePaymentResponsibilityBodySchema
>;
export type LinkMerchantShopBody = z.infer<typeof linkMerchantShopBodySchema>;
export type ExtendTrialBody = z.infer<typeof extendTrialBodySchema>;
export type InterruptTrialBody = z.infer<typeof interruptTrialBodySchema>;
export type FreePeriodListQuery = z.infer<typeof freePeriodListQuerySchema>;
export type SaasInvoiceListQuery = z.infer<typeof saasInvoiceListQuerySchema>;
export type ManualPaymentBody = z.infer<typeof manualPaymentBodySchema>;
export type CreateSuspensionBody = z.infer<typeof createSuspensionBodySchema>;
export type ReleaseSuspensionBody = z.infer<typeof releaseSuspensionBodySchema>;
export type DissolveMerchantBody = z.infer<typeof dissolveMerchantBodySchema>;
