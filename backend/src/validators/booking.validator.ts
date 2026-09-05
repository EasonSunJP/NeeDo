import { z } from "zod";
import { japaneseRouteAddressSchema } from "./route-estimate.validator";
import {
  canonicalizeTechnicianReviewTag,
  isTechnicianReviewSpecialTag,
  technicianReviewTagKey
} from "../domain/technician-review-tags";
import { unicodeDefaultCaseFoldKey } from "../utils/unicode-default-case-fold";

const paginationQuerySchema = {
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().max(100).optional()
};
const strictBooleanQuerySchema = z
  .union([z.enum(["true", "false"]), z.boolean()])
  .transform((value) => value === "true" || value === true);

const isoDateSchema = z
  .union([z.date(), z.string().datetime({ offset: true })])
  .transform((value) => (value instanceof Date ? value : new Date(value)));
const boundedDateRange = <TSchema extends z.ZodTypeAny>(schema: TSchema) => schema;
const hasVisibleCodePoint = (value: string): boolean => /[\p{L}\p{N}\p{P}\p{S}]/u.test(value);
const visibleTextSchema = (maximumLength: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(maximumLength)
    .refine(hasVisibleCodePoint, { message: "value must contain a visible character" });
const idempotencyKeySchema = z
  .string()
  .trim()
  .min(16)
  .max(160)
  .refine(hasVisibleCodePoint, { message: "idempotency key must contain a visible character" });
const fulfillmentReasonSchema = visibleTextSchema(500);
const serviceCatalogIdSchema = z.number().int().positive().max(2_147_483_647);
const routeIdSchema = z.coerce.number().int().positive().max(2_147_483_647);
const normalizeReviewText = (value: string): string => value.normalize("NFKC").trim();
const unicodeCodePointLength = (value: string): number => Array.from(value).length;
const reviewTagSchema = z
  .string()
  .transform(normalizeReviewText)
  .superRefine((value, context) => {
    if (!hasVisibleCodePoint(value)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "tag must contain a visible character"
      });
    }
    if (unicodeCodePointLength(value) > 40) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "tag must not exceed 40 code points"
      });
    }
  });
const reviewCommentSchema = z
  .union([
    z.null(),
    z.string().transform((value) => {
      const normalized = normalizeReviewText(value);
      return normalized.length === 0 ? null : normalized;
    })
  ])
  .superRefine((value, context) => {
    if (value === null) return;
    if (!hasVisibleCodePoint(value)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "comment must contain a visible character"
      });
    }
    if (unicodeCodePointLength(value) > 1000) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "comment must not exceed 1000 code points"
      });
    }
  });

export const availabilityListQuerySchema = z
  .object({
    ...paginationQuerySchema,
    serviceId: z.coerce.number().int().positive().optional(),
    technicianServiceId: z.coerce.number().int().positive().optional(),
    shopId: z.coerce.number().int().positive().optional(),
    technicianId: z.coerce.number().int().positive().optional(),
    includeUnavailable: strictBooleanQuerySchema.optional(),
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
    fulfillmentAddress: japaneseRouteAddressSchema.optional(),
    travelEstimatePublicId: z.string().uuid().optional(),
    affiliateCode: z.string().trim().min(1).max(40).optional(),
    affiliatePublicToken: z.string().trim().min(1).max(512).optional()
  })
  .strict()
  .refine((value) => Boolean(value.serviceId) !== Boolean(value.technicianServiceId), {
    message: "Exactly one of serviceId or technicianServiceId is required",
    path: ["serviceId"]
  })
  .superRefine((value, context) => {
    if (value.fulfillmentMode === "home") {
      if (!value.fulfillmentAddress) {
        context.addIssue({ code: z.ZodIssueCode.custom, message: "fulfillmentAddress is required for home service", path: ["fulfillmentAddress"] });
      }
      if (!value.travelEstimatePublicId) {
        context.addIssue({ code: z.ZodIssueCode.custom, message: "travelEstimatePublicId is required for home service", path: ["travelEstimatePublicId"] });
      }
    } else if (value.fulfillmentAddress || value.travelEstimatePublicId) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "travel estimate fields are not allowed for store service", path: ["travelEstimatePublicId"] });
    }
  });

export const orderIdParamSchema = z.object({
  id: z.coerce.number().int().positive()
});

export const orderAddOnIdParamsSchema = z
  .object({
    id: routeIdSchema,
    addOnId: routeIdSchema
  })
  .strict();

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

export const startServiceBodySchema = z.discriminatedUnion("actor", [
  z
    .object({
      actor: z.literal("customer"),
      idempotencyKey: idempotencyKeySchema
    })
    .strict(),
  z
    .object({
      actor: z.literal("technician"),
      verificationCode: z.string().regex(/^\d{6}$/),
      idempotencyKey: idempotencyKeySchema
    })
    .strict()
]);

export const createOrderAddOnBodySchema = z
  .object({
    serviceId: serviceCatalogIdSchema,
    idempotencyKey: idempotencyKeySchema
  })
  .strict();

export const orderAddOnDecisionBodySchema = z
  .object({
    idempotencyKey: idempotencyKeySchema
  })
  .strict();

export const endServiceBodySchema = z
  .object({
    reason: fulfillmentReasonSchema,
    idempotencyKey: idempotencyKeySchema
  })
  .strict();

export const selectPaymentMethodBodySchema = z.discriminatedUnion("method", [
  z
    .object({
      method: z.literal("cash"),
      idempotencyKey: idempotencyKeySchema
    })
    .strict(),
  z
    .object({
      method: z.literal("ndp"),
      idempotencyKey: idempotencyKeySchema
    })
    .strict(),
  z
    .object({
      method: z.literal("other"),
      otherMethodCode: visibleTextSchema(40),
      otherMethodLabel: visibleTextSchema(80),
      idempotencyKey: idempotencyKeySchema
    })
    .strict()
]);

export const payWithNdpBodySchema = z
  .object({
    idempotencyKey: idempotencyKeySchema
  })
  .strict();

export const confirmReceiptBodySchema = z
  .object({
    reason: fulfillmentReasonSchema,
    idempotencyKey: idempotencyKeySchema
  })
  .strict();

export const orderReviewCreateBodySchema = z
  .object({
    targetType: z.enum(["technician", "customer"]),
    rating: z.number().int().min(1).max(5),
    tags: z.array(reviewTagSchema).max(8),
    comment: reviewCommentSchema,
    idempotencyKey: idempotencyKeySchema
  })
  .strict()
  .superRefine((value, context) => {
    const seen = new Set<string>();
    value.tags.forEach((tag, index) => {
      const folded =
        value.targetType === "technician"
          ? technicianReviewTagKey(tag)
          : unicodeDefaultCaseFoldKey(tag);
      if (seen.has(folded)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "review tags must be unique after Unicode normalization and case folding",
          path: ["tags", index]
        });
      }
      seen.add(folded);
    });

    if (
      value.targetType === "technician" &&
      value.tags.filter((tag) => !isTechnicianReviewSpecialTag(tag)).length > 1
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "technician review accepts at most one custom tag",
        path: ["tags"]
      });
    }
  })
  .transform((value) =>
    value.targetType === "technician"
      ? { ...value, tags: value.tags.map(canonicalizeTechnicianReviewTag) }
      : value
  );

export const orderTimelineCommentBodySchema = z.object({ body: visibleTextSchema(1000) }).strict();

export const orderListQuerySchema = z
  .object({
    ...paginationQuerySchema,
    customerUserId: z.coerce.number().int().positive().optional(),
    status: z
      .enum([
        "pending",
        "confirmed",
        "inService",
        "awaitingCheckout",
        "awaitingPaymentConfirmation",
        "completed",
        "cancelled"
      ])
      .optional(),
    from: isoDateSchema.optional(),
    to: isoDateSchema.optional()
  })
  .superRefine((value, context) => {
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

export const scheduleSlotListQuerySchema = boundedDateRange(
  z
    .object({
      ...paginationQuerySchema,
      from: isoDateSchema,
      to: isoDateSchema,
      serviceId: z.coerce.number().int().positive().optional(),
      technicianServiceId: z.coerce.number().int().positive().optional(),
      technicianProfileId: z.coerce.number().int().positive().optional(),
      status: z.enum(["available", "booked", "blocked"]).optional()
    })
    .superRefine((value, context) => {
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
    })
);

export const scheduleSlotCreateBodySchema = z
  .object({
    serviceId: z.coerce.number().int().positive().optional(),
    technicianServiceId: z.coerce.number().int().positive().optional(),
    technicianProfileId: z.coerce.number().int().positive().nullable().optional(),
    startsAt: isoDateSchema,
    endsAt: isoDateSchema,
    capacity: z.coerce.number().int().positive().max(100).default(1)
  })
  .superRefine((value, context) => {
    if (Boolean(value.serviceId) === Boolean(value.technicianServiceId)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Exactly one of serviceId or technicianServiceId is required",
        path: ["serviceId"]
      });
    }
    const duration = value.endsAt.getTime() - value.startsAt.getTime();
    if (duration <= 0)
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "startsAt must be earlier than endsAt",
        path: ["endsAt"]
      });
    if (duration > 24 * 60 * 60 * 1000)
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "slot duration must not exceed 24 hours",
        path: ["endsAt"]
      });
  });

export const scheduleSlotUpdateBodySchema = z
  .object({
    startsAt: isoDateSchema.optional(),
    endsAt: isoDateSchema.optional(),
    capacity: z.coerce.number().int().positive().max(100).optional(),
    status: z.enum(["available", "blocked"]).optional()
  })
  .superRefine((value, context) => {
    if (Object.keys(value).length === 0)
      context.addIssue({ code: z.ZodIssueCode.custom, message: "At least one field is required" });
    if (value.startsAt && value.endsAt && value.startsAt.getTime() >= value.endsAt.getTime()) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "startsAt must be earlier than endsAt",
        path: ["endsAt"]
      });
    }
  });

export type AvailabilityListQuery = z.infer<typeof availabilityListQuerySchema>;
export type BookingCreateBody = z.infer<typeof bookingCreateBodySchema>;
export type OrderIdParams = z.infer<typeof orderIdParamSchema>;
export type OrderAddOnIdParams = z.infer<typeof orderAddOnIdParamsSchema>;
export type OrderConfirmBody = z.infer<typeof orderConfirmBodySchema>;
export type StartServiceInput = z.infer<typeof startServiceBodySchema>;
export type CreateOrderAddOnInput = z.infer<typeof createOrderAddOnBodySchema>;
export type OrderAddOnDecisionInput = z.infer<typeof orderAddOnDecisionBodySchema>;
export type EndServiceInput = z.infer<typeof endServiceBodySchema>;
export type SelectPaymentMethodInput = z.infer<typeof selectPaymentMethodBodySchema>;
export type PayWithNdpInput = z.infer<typeof payWithNdpBodySchema>;
export type ConfirmReceiptInput = z.infer<typeof confirmReceiptBodySchema>;
export type OrderReviewCreateInput = z.infer<typeof orderReviewCreateBodySchema>;
export type OrderListQuery = z.infer<typeof orderListQuerySchema>;
export type OrderCancelBody = z.infer<typeof orderCancelBodySchema>;
export type ManualPaymentConfirmBody = z.infer<typeof manualPaymentConfirmBodySchema>;
export type ManualPaymentRefundBody = z.infer<typeof manualPaymentRefundBodySchema>;
export type ScheduleSlotListQuery = z.infer<typeof scheduleSlotListQuerySchema>;
export type ScheduleSlotCreateBody = z.infer<typeof scheduleSlotCreateBodySchema>;
export type ScheduleSlotUpdateBody = z.infer<typeof scheduleSlotUpdateBodySchema>;
