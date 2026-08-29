import { z } from "zod";
import { CONTENT_LOCALES } from "../constants/content-locales";

const MAX_MONEY_JPY = 1_000_000_000;

const authoredText = (maximum: number) => z.string().trim().min(1).max(maximum);
const moneyJpy = z.coerce.number().int().nonnegative().max(MAX_MONEY_JPY);
const explicitOffsetDate = z
  .string()
  .datetime({ offset: true })
  .transform((value) => new Date(value));

const commonPostShape = {
  title: authoredText(120),
  detail: authoredText(10_000),
  contentLocale: z.enum(CONTENT_LOCALES),
  areaLabel: authoredText(120),
  serviceStartAt: explicitOffsetDate,
  serviceEndAt: explicitOffsetDate,
  expiresAt: explicitOffsetDate
};

const demandPostSchema = z
  .object({
    type: z.literal("demand"),
    ...commonPostShape,
    budgetMinJpy: moneyJpy,
    budgetMaxJpy: moneyJpy
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
    serviceMode: z.enum(["store", "onsite", "flexible"]),
    addressLabel: authoredText(255).nullable().optional().default(null),
    serviceAreas: serviceAreasSchema,
    originalPriceJpy: moneyJpy.nullable().optional().default(null),
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
    if (value.serviceEndAt.getTime() > value.expiresAt.getTime()) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "serviceEndAt must not be later than expiresAt",
        path: ["expiresAt"]
      });
    }
    if (value.type === "demand" && value.budgetMinJpy > value.budgetMaxJpy) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "budgetMinJpy must not exceed budgetMaxJpy",
        path: ["budgetMaxJpy"]
      });
    }
    if (
      value.type === "intelligence" &&
      value.originalPriceJpy !== null &&
      value.campaignPriceJpy > value.originalPriceJpy
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "campaignPriceJpy must not exceed originalPriceJpy",
        path: ["campaignPriceJpy"]
      });
    }
  });

export const createExchangeCommentSchema = z.object({ content: authoredText(1_000) }).strict();

export type ExchangeListQuery = z.infer<typeof exchangeListQuerySchema>;
export type ExchangePostIdParams = z.infer<typeof exchangePostIdParamSchema>;
export type PublishExchangePostBody = z.infer<typeof publishExchangePostSchema>;
export type CreateExchangeCommentBody = z.infer<typeof createExchangeCommentSchema>;
