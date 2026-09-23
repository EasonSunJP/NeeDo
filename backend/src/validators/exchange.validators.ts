import { z } from "zod";
import { CONTENT_LOCALES } from "../constants/content-locales";
import type { ExchangeIntelligenceServiceRef } from "../types/exchange-intelligence-booking.types";

const MAX_MONEY_JPY = 1_000_000_000;

const authoredText = (maximum: number) => z.string().trim().min(1).max(maximum);
export const exchangeDemandCoverQuerySchema = z.object({
  alt_text: authoredText(255).optional()
}).strict();
const moneyJpy = z.coerce.number().int().nonnegative().max(MAX_MONEY_JPY);
const explicitOffsetDate = z
  .union([z.date(), z.string().datetime({ offset: true })])
  .transform((value) => (value instanceof Date ? value : new Date(value)));

const commonPostShape = {
  title: authoredText(120),
  detail: authoredText(10_000),
  contentLocale: z.enum(CONTENT_LOCALES),
  serviceStartAt: explicitOffsetDate,
  serviceEndAt: explicitOffsetDate,
  expiresAt: explicitOffsetDate
};

const demandPostSchema = z
  .object({
    type: z.literal("demand"),
    ...commonPostShape,
    serviceMode: z.enum(["home", "store"]),
    targetProviderCount: z.coerce.number().int().min(1).max(20),
    matchMode: z.enum(["quick", "selective"]),
    budgetMode: z.enum(["total", "per_provider"]),
    budgetMinJpy: moneyJpy.nullable().optional().default(null),
    budgetMaxJpy: moneyJpy,
    addressLine1: authoredText(255),
    addressLine2: authoredText(255).nullable().optional().default(null),
    addressLine3: authoredText(255).nullable().optional().default(null),
    addressLine2Public: z
      .boolean()
      .default(false)
      .refine((value) => !value, "Request address is private until matching"),
    addressLine3Public: z
      .boolean()
      .default(false)
      .refine((value) => !value, "Request address is private until matching"),
    publisherIdentityPublic: z.boolean().default(false)
  })
  .strict();

const serviceAreasSchema = z
  .array(authoredText(120))
  .min(1)
  .max(30)
  .superRefine((areas, context) => {
    if (new Set(areas).size !== areas.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "service areas must be unique"
      });
    }
  });

const intelligencePostSchema = z
  .object({
    type: z.literal("intelligence"),
    ...commonPostShape,
    serviceRef: z
      .string()
      .regex(/^(?:shop|technician):[1-9]\d*$/u)
      .transform((value) => value as ExchangeIntelligenceServiceRef),
    areaLabel: authoredText(120).optional(),
    serviceMode: z.enum(["store", "onsite", "flexible"]).optional(),
    addressLabel: authoredText(255).nullable().optional(),
    serviceAreas: serviceAreasSchema.optional(),
    originalPriceJpy: moneyJpy.nullable().optional(),
    campaignPriceJpy: moneyJpy
  })
  .strict();

export const exchangeListQuerySchema = z
  .object({
    type: z.enum(["demand", "intelligence"]),
    page: z.coerce.number().int().positive().default(1),
    page_size: z.coerce.number().int().positive().max(100).default(20)
  })
  .strict();

export const exchangeCommentListQuerySchema = z
  .object({
    page: z.coerce.number().int().positive().default(1),
    page_size: z.coerce.number().int().positive().max(100).default(20)
  })
  .strict();

export const exchangePostIdParamSchema = z
  .object({ id: z.coerce.number().int().positive() })
  .strict();

export const exchangeIdempotencyKeySchema = z.string().trim().min(16).max(191);

export const publishExchangePostSchema = z
  .discriminatedUnion("type", [demandPostSchema, intelligencePostSchema])
  .superRefine((value, context) => {
    if (value.serviceStartAt.getTime() >= value.serviceEndAt.getTime()) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "serviceStartAt must be earlier than serviceEndAt",
        path: ["serviceEndAt"]
      });
    }
    if (value.serviceEndAt.getTime() >= value.expiresAt.getTime()) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "expiresAt must be later than serviceEndAt",
        path: ["expiresAt"]
      });
    }
    if (
      value.type === "demand" &&
      value.budgetMinJpy !== null &&
      value.budgetMinJpy > value.budgetMaxJpy
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "budgetMinJpy must not exceed budgetMaxJpy",
        path: ["budgetMaxJpy"]
      });
    }
    if (value.type === "demand" && value.addressLine2 === null && value.addressLine2Public) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "addressLine2Public requires addressLine2",
        path: ["addressLine2Public"]
      });
    }
    if (value.type === "demand" && value.addressLine3 === null && value.addressLine3Public) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "addressLine3Public requires addressLine3",
        path: ["addressLine3Public"]
      });
    }
  });

export const createExchangeCommentSchema = z.object({ content: authoredText(1_000) }).strict();

export type ExchangeListQuery = z.infer<typeof exchangeListQuerySchema>;
export type ExchangeCommentListQuery = z.infer<typeof exchangeCommentListQuerySchema>;
export type ExchangePostIdParams = z.infer<typeof exchangePostIdParamSchema>;
export type PublishExchangePostBody = z.infer<typeof publishExchangePostSchema>;
export type CreateExchangeCommentBody = z.infer<typeof createExchangeCommentSchema>;
