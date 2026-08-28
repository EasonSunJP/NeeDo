import { z } from "zod";

const paginationQuerySchema = {
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().max(100).optional()
};

const isoDateSchema = z.union([
  z.date(),
  z.string().datetime({ offset: true })
]).transform((value) => value instanceof Date ? value : new Date(value));
const boundedDateRange = <TSchema extends z.ZodTypeAny>(schema: TSchema) => schema;

export const availabilityListQuerySchema = z
  .object({
    ...paginationQuerySchema,
    serviceId: z.coerce.number().int().positive().optional(),
    technicianServiceId: z.coerce.number().int().positive().optional(),
    shopId: z.coerce.number().int().positive().optional(),
    technicianId: z.coerce.number().int().positive().optional(),
    from: isoDateSchema,
    to: isoDateSchema
  })
  .superRefine((value, context) => {
    if (value.serviceId && value.technicianServiceId) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "serviceId and technicianServiceId are mutually exclusive",
        path: ["serviceId"]
      });
    }
    if (!value.serviceId && !value.technicianServiceId && !value.technicianId) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "serviceId, technicianServiceId, or technicianId is required",
        path: ["technicianId"]
      });
    }
    if (value.to.getTime() - value.from.getTime() > 93 * 24 * 60 * 60 * 1000) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "date range must not exceed 93 days",
        path: ["to"]
      });
    }
  })
  .refine((value) => value.from.getTime() < value.to.getTime(), {
    message: "from must be earlier than to",
    path: ["to"]
  });

export const bookingCreateBodySchema = z
  .object({
    serviceId: z.coerce.number().int().positive().optional(),
    technicianServiceId: z.coerce.number().int().positive().optional(),
    scheduleSlotId: z.coerce.number().int().positive(),
    orderType: z.enum(["booking", "request"]).optional(),
    fulfillmentMode: z.enum(["home", "store"]),
    paymentMethod: z.enum(["onsite", "bank_transfer"]).default("onsite"),
    note: z.string().trim().max(500).optional(),
    affiliateCode: z.string().trim().min(1).max(40).optional(),
    affiliatePublicToken: z.string().trim().min(1).max(512).optional()
  })
  .strict()
  .refine((value) => Boolean(value.serviceId) !== Boolean(value.technicianServiceId), {
    message: "Exactly one of serviceId or technicianServiceId is required",
    path: ["serviceId"]
  });

export const orderIdParamSchema = z.object({
  id: z.coerce.number().int().positive()
});

export const orderConfirmBodySchema = z
  .object({
    insufficientBalanceConfirmation: z
      .object({
        confirmed: z.literal(true),
        idempotencyKey: z.string().trim().min(16).max(160),
        previewVersion: z.string().regex(/^sha256:[a-f0-9]{64}$/)
      })
      .strict()
      .optional()
  })
  .strict();

export const orderListQuerySchema = z.object({
  ...paginationQuerySchema,
  customerUserId: z.coerce.number().int().positive().optional(),
  status: z.enum(["pending", "confirmed", "inService", "completed", "cancelled"]).optional(),
  from: isoDateSchema.optional(),
  to: isoDateSchema.optional()
}).superRefine((value, context) => {
  if (Boolean(value.from) !== Boolean(value.to)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "from and to must be provided together",
      path: [value.from ? "to" : "from"]
    });
    return;
  }
  if (!value.from || !value.to) return;
  if (value.from.getTime() >= value.to.getTime()) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "from must be earlier than to",
      path: ["to"]
    });
  }
  if (value.to.getTime() - value.from.getTime() > 93 * 24 * 60 * 60 * 1000) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "date range must not exceed 93 days",
      path: ["to"]
    });
  }
});

export const orderCancelBodySchema = z.object({
  reason: z.string().trim().max(500).optional()
});

export const manualPaymentConfirmBodySchema = z.object({
  method: z.enum(["onsite", "bank_transfer"]),
  amountJpy: z.coerce.number().int().positive().max(100_000_000),
  reference: z.string().trim().min(1).max(120).nullable().optional(),
  note: z.string().trim().min(1).max(500).nullable().optional()
});

export const manualPaymentRefundBodySchema = z.object({
  reason: z.string().trim().min(1).max(500),
  reference: z.string().trim().min(1).max(120).nullable().optional()
});

export const scheduleSlotListQuerySchema = boundedDateRange(z.object({
  ...paginationQuerySchema,
  from: isoDateSchema,
  to: isoDateSchema,
  serviceId: z.coerce.number().int().positive().optional(),
  technicianServiceId: z.coerce.number().int().positive().optional(),
  technicianProfileId: z.coerce.number().int().positive().optional(),
  status: z.enum(["available", "booked", "blocked"]).optional()
}).superRefine((value, context) => {
  if (value.from.getTime() >= value.to.getTime()) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "from must be earlier than to", path: ["to"] });
  }
  if (value.to.getTime() - value.from.getTime() > 93 * 24 * 60 * 60 * 1000) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "date range must not exceed 93 days", path: ["to"] });
  }
}));

export const scheduleSlotCreateBodySchema = z.object({
  serviceId: z.coerce.number().int().positive().optional(),
  technicianServiceId: z.coerce.number().int().positive().optional(),
  technicianProfileId: z.coerce.number().int().positive().nullable().optional(),
  startsAt: isoDateSchema,
  endsAt: isoDateSchema,
  capacity: z.coerce.number().int().positive().max(100).default(1)
}).superRefine((value, context) => {
  if (Boolean(value.serviceId) === Boolean(value.technicianServiceId)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Exactly one of serviceId or technicianServiceId is required", path: ["serviceId"] });
  }
  const duration = value.endsAt.getTime() - value.startsAt.getTime();
  if (duration <= 0) context.addIssue({ code: z.ZodIssueCode.custom, message: "startsAt must be earlier than endsAt", path: ["endsAt"] });
  if (duration > 24 * 60 * 60 * 1000) context.addIssue({ code: z.ZodIssueCode.custom, message: "slot duration must not exceed 24 hours", path: ["endsAt"] });
});

export const scheduleSlotUpdateBodySchema = z.object({
  startsAt: isoDateSchema.optional(),
  endsAt: isoDateSchema.optional(),
  capacity: z.coerce.number().int().positive().max(100).optional(),
  status: z.enum(["available", "blocked"]).optional()
}).superRefine((value, context) => {
  if (Object.keys(value).length === 0) context.addIssue({ code: z.ZodIssueCode.custom, message: "At least one field is required" });
  if (value.startsAt && value.endsAt && value.startsAt.getTime() >= value.endsAt.getTime()) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "startsAt must be earlier than endsAt", path: ["endsAt"] });
  }
});

export type AvailabilityListQuery = z.infer<typeof availabilityListQuerySchema>;
export type BookingCreateBody = z.infer<typeof bookingCreateBodySchema>;
export type OrderIdParams = z.infer<typeof orderIdParamSchema>;
export type OrderConfirmBody = z.infer<typeof orderConfirmBodySchema>;
export type OrderListQuery = z.infer<typeof orderListQuerySchema>;
export type OrderCancelBody = z.infer<typeof orderCancelBodySchema>;
export type ManualPaymentConfirmBody = z.infer<typeof manualPaymentConfirmBodySchema>;
export type ManualPaymentRefundBody = z.infer<typeof manualPaymentRefundBodySchema>;
export type ScheduleSlotListQuery = z.infer<typeof scheduleSlotListQuerySchema>;
export type ScheduleSlotCreateBody = z.infer<typeof scheduleSlotCreateBodySchema>;
export type ScheduleSlotUpdateBody = z.infer<typeof scheduleSlotUpdateBodySchema>;
