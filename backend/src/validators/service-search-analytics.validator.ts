import { z } from "zod";
import type { TaxonomyLocale } from "@prisma/client";
import { normalizeSearchKeyword } from "../services/search-query-recorder.service";

const localeMap = {
  "zh-CN": "ZH_CN",
  "zh-TW": "ZH_TW",
  ja: "JA",
  en: "EN",
  ko: "KO"
} as const satisfies Record<string, TaxonomyLocale>;
const localeSchema = z.union([
  z.enum(["zh-CN", "zh-TW", "ja", "en", "ko"]).transform((value): TaxonomyLocale => localeMap[value]),
  z.enum(["ZH_CN", "ZH_TW", "JA", "EN", "KO"])
]);
const reasonSchema = z.string().trim().min(1).max(500);
const codeSchema = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .regex(/^[a-z0-9][a-z0-9._-]*$/u);
const translationsSchema = z
  .array(
    z.object({ locale: localeSchema, value: z.string().trim().min(1).max(120) }).strict()
  )
  .min(1)
  .max(5)
  .superRefine((values, context) => {
    if (new Set(values.map((item) => item.locale)).size !== values.length) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "Duplicate locale" });
    }
  });

export const taxonomyIdParamSchema = z.object({ id: z.coerce.number().int().positive() }).strict();
export const taxonomyCategoryIdParamSchema = z
  .object({ categoryId: z.coerce.number().int().positive() })
  .strict();
export const taxonomyKeywordIdParamSchema = z
  .object({ keywordId: z.coerce.number().int().positive() })
  .strict();

export const taxonomyListQuerySchema = z
  .object({
    page: z.coerce.number().int().positive().optional(),
    pageSize: z.coerce.number().int().positive().max(100).optional(),
    keyword: z.string().trim().max(120).optional()
  })
  .strict();

const categoryFields = {
  code: codeSchema,
  sortOrder: z.number().int().min(0).max(100_000),
  isActive: z.boolean(),
  translations: translationsSchema,
  reason: reasonSchema
} as const;

export const categoryCreateBodySchema = z.object(categoryFields).strict();
export const categoryUpdateBodySchema = z
  .object({ ...categoryFields, expectedVersion: z.number().int().positive() })
  .strict();

const keywordFields = {
  categoryId: z.number().int().positive(),
  code: codeSchema,
  sortOrder: z.number().int().min(0).max(100_000),
  isActive: z.boolean(),
  translations: translationsSchema,
  reason: reasonSchema
} as const;

export const keywordCreateBodySchema = z.object(keywordFields).strict();
export const keywordUpdateBodySchema = z
  .object({ ...keywordFields, expectedVersion: z.number().int().positive() })
  .strict();

const aliasFields = {
  categoryId: z.number().int().positive(),
  businessKeywordId: z.number().int().positive(),
  alias: z.string().trim().min(1).max(191),
  isActive: z.boolean(),
  reason: reasonSchema
} as const;

export const aliasCreateBodySchema = z.object(aliasFields).strict();
export const aliasUpdateBodySchema = z
  .object({ ...aliasFields, expectedVersion: z.number().int().positive() })
  .strict();

const analyticsDateSchema = z
  .union([z.date(), z.string().datetime({ offset: true })])
  .transform((value) => (value instanceof Date ? value : new Date(value)));
const analyticsFilterFields = {
  startAt: analyticsDateSchema,
  endAt: analyticsDateSchema,
  city: z.string().trim().min(1).max(120).optional(),
  categoryId: z.coerce.number().int().positive().optional()
} as const;

export const searchAnalyticsTopQuerySchema = z
  .object(analyticsFilterFields)
  .strict()
  .refine((value) => value.startAt < value.endAt, { message: "Invalid analytics range" });

const keywordsQuerySchema = z.preprocess(
  (value) => (Array.isArray(value) ? value : typeof value === "string" ? value.split(",") : value),
  z.array(z.string().trim().min(1).max(100)).min(1).max(5)
);

export const searchAnalyticsTrendQuerySchema = z
  .object({ ...analyticsFilterFields, keywords: keywordsQuerySchema })
  .strict()
  .refine((value) => value.startAt < value.endAt, { message: "Invalid analytics range" })
  .transform((value) => ({
    ...value,
    keywords: [...new Set(value.keywords.map(normalizeSearchKeyword))]
  }));

export type CategoryCreateBody = z.output<typeof categoryCreateBodySchema>;
export type CategoryUpdateBody = z.output<typeof categoryUpdateBodySchema>;
export type KeywordCreateBody = z.output<typeof keywordCreateBodySchema>;
export type KeywordUpdateBody = z.output<typeof keywordUpdateBodySchema>;
export type AliasCreateBody = z.output<typeof aliasCreateBodySchema>;
export type AliasUpdateBody = z.output<typeof aliasUpdateBodySchema>;
export type SearchAnalyticsTopQuery = z.output<typeof searchAnalyticsTopQuerySchema>;
export type SearchAnalyticsTrendQuery = z.output<typeof searchAnalyticsTrendQuerySchema>;
