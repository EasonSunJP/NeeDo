import { z } from "zod";

export const CONTENT_PUBLICATION_ERROR_MESSAGES = [
  "error.content.locale_invalid",
  "error.content.media_invalid",
  "error.content.media_too_large",
  "error.content.not_found",
  "error.content.release_not_found",
  "error.content.draft_exists",
  "error.content.lock_conflict",
  "error.content.incomplete_translations",
  "error.content.schedule_conflict",
  "error.content.target_invalid",
  "error.content.target_unavailable",
  "error.content.invalid_state_transition",
  "error.idempotency_key_reused"
] as const;

export type ContentPublicationErrorMessage = (typeof CONTENT_PUBLICATION_ERROR_MESSAGES)[number];

const localeSchema = z.enum(["zh-CN", "zh-TW", "en", "ja", "ko"], {
  errorMap: () => ({ message: "error.content.locale_invalid" })
});

const idempotencyKeySchema = z.string().uuid();
const positiveVersionSchema = z.number().int().positive();
const optionalReasonSchema = z.string().trim().min(1).max(500).optional();
const requiredReasonSchema = z.string().trim().min(1).max(500);
const utcDateTimeSchema = z
  .string()
  .datetime({ offset: false })
  .refine((value) => value.endsWith("Z"), "UTC date-time is required");
const nullableUtcDateTimeSchema = utcDateTimeSchema.nullable().default(null);

const addOrderedWindowIssue = (
  value: { visibleFrom: string | null; visibleUntil: string | null },
  context: z.RefinementCtx
): void => {
  if (
    value.visibleFrom !== null &&
    value.visibleUntil !== null &&
    Date.parse(value.visibleFrom) >= Date.parse(value.visibleUntil)
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["visibleUntil"],
      message: "error.content.schedule_conflict"
    });
  }
};

export const carouselSceneParamSchema = z
  .object({ scene: z.enum(["user-home", "affiliate-home-notice"]) })
  .strict();

const userTargetSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("shop"), shopId: z.number().int().positive() }).strict(),
  z
    .object({
      type: z.literal("technician"),
      technicianProfileId: z.number().int().positive()
    })
    .strict(),
  z.object({ type: z.literal("service"), serviceId: z.number().int().positive() }).strict()
]);

const affiliateTargetSchema = z
  .object({
    type: z.literal("affiliate_announcement"),
    announcementPublicId: z.string().uuid(),
    affiliateTaskId: z.number().int().positive().nullable().default(null)
  })
  .strict();

export const translationBodySchema = z
  .object({
    locale: localeSchema,
    badge: z.string().trim().max(40).nullable(),
    title: z.string().trim().min(1).max(160),
    caption: z.string().trim().max(500).nullable(),
    ctaLabel: z.string().trim().max(60).nullable(),
    imageAltText: z.string().trim().min(1).max(255)
  })
  .strict();

const translationsSchema = z
  .array(translationBodySchema)
  .min(1)
  .max(5)
  .superRefine((translations, context) => {
    const seenLocales = new Set<string>();
    translations.forEach((translation, index) => {
      if (seenLocales.has(translation.locale)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: [index, "locale"],
          message: "error.content.locale_invalid"
        });
      }
      seenLocales.add(translation.locale);
    });
  });

const slideBaseShape = {
  publicId: z.string().uuid().optional(),
  mediaAssetPublicId: z.string().regex(/^[a-f0-9]{64}$/, "error.content.media_invalid"),
  sortOrder: z.number().int().nonnegative(),
  isEnabled: z.boolean().default(true),
  visibleFrom: nullableUtcDateTimeSchema,
  visibleUntil: nullableUtcDateTimeSchema,
  translations: translationsSchema
};

const userHomeSlideSchema = z
  .object({ ...slideBaseShape, target: userTargetSchema })
  .strict()
  .superRefine(addOrderedWindowIssue);

const affiliateNoticeSlideSchema = z
  .object({ ...slideBaseShape, target: affiliateTargetSchema })
  .strict()
  .superRefine(addOrderedWindowIssue);

const createDraftCommandShape = {
  idempotencyKey: idempotencyKeySchema,
  sourceLocale: localeSchema
};

const updateDraftCommandShape = {
  expectedLockVersion: positiveVersionSchema,
  sourceLocale: localeSchema
};

export const userHomeCarouselDraftCreateBodySchema = z
  .object({ ...createDraftCommandShape, slides: z.array(userHomeSlideSchema).min(1).max(50) })
  .strict();

export const userHomeCarouselDraftUpdateBodySchema = z
  .object({ ...updateDraftCommandShape, slides: z.array(userHomeSlideSchema).min(1).max(50) })
  .strict();

export const affiliateNoticeCarouselDraftCreateBodySchema = z
  .object({
    ...createDraftCommandShape,
    slides: z.array(affiliateNoticeSlideSchema).min(1).max(50)
  })
  .strict();

export const affiliateNoticeCarouselDraftUpdateBodySchema = z
  .object({
    ...updateDraftCommandShape,
    slides: z.array(affiliateNoticeSlideSchema).min(1).max(50)
  })
  .strict();

export const carouselDraftBodySchemaByScene = {
  "user-home": {
    create: userHomeCarouselDraftCreateBodySchema,
    update: userHomeCarouselDraftUpdateBodySchema
  },
  "affiliate-home-notice": {
    create: affiliateNoticeCarouselDraftCreateBodySchema,
    update: affiliateNoticeCarouselDraftUpdateBodySchema
  }
} as const;

export const carouselDraftBodySchema = z.union([
  userHomeCarouselDraftCreateBodySchema,
  userHomeCarouselDraftUpdateBodySchema,
  affiliateNoticeCarouselDraftCreateBodySchema,
  affiliateNoticeCarouselDraftUpdateBodySchema
]);

const announcementTranslationBodySchema = z
  .object({
    title: z.string().trim().min(1).max(160),
    summary: z.string().trim().max(500).nullable(),
    body: z.string().trim().min(1).max(50_000)
  })
  .strict();

export const announcementDraftCreateBodySchema = z
  .object({
    idempotencyKey: idempotencyKeySchema,
    sourceLocale: localeSchema,
    affiliateTaskId: z.number().int().positive().nullable().default(null),
    visibleFrom: nullableUtcDateTimeSchema,
    visibleUntil: nullableUtcDateTimeSchema,
    translation: announcementTranslationBodySchema
  })
  .strict()
  .superRefine(addOrderedWindowIssue);

export const announcementDraftUpdateBodySchema = z
  .object({
    expectedLockVersion: positiveVersionSchema,
    locale: localeSchema,
    title: z.string().trim().min(1).max(160),
    summary: z.string().trim().max(500).nullable(),
    body: z.string().trim().min(1).max(50_000)
  })
  .strict();

export const announcementDraftBodySchema = z.union([
  announcementDraftCreateBodySchema,
  announcementDraftUpdateBodySchema
]);

export const publishBodySchema = z
  .object({
    idempotencyKey: idempotencyKeySchema,
    expectedLockVersion: positiveVersionSchema,
    reason: optionalReasonSchema
  })
  .strict();

export const scheduleBodySchema = z
  .object({
    idempotencyKey: idempotencyKeySchema,
    expectedLockVersion: positiveVersionSchema,
    publishAt: utcDateTimeSchema.refine(
      (value) => Date.parse(value) > Date.now(),
      "error.content.schedule_conflict"
    ),
    reason: optionalReasonSchema
  })
  .strict();

export const disableBodySchema = z
  .object({
    idempotencyKey: idempotencyKeySchema,
    expectedLockVersion: positiveVersionSchema,
    reason: requiredReasonSchema
  })
  .strict();

export const rollbackBodySchema = z
  .object({
    idempotencyKey: idempotencyKeySchema,
    expectedCurrentVersion: positiveVersionSchema,
    reason: requiredReasonSchema
  })
  .strict();

const paginationShape = {
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20)
};

export const contentHistoryQuerySchema = z.object(paginationShape).strict();

const targetSearchBaseShape = {
  ...paginationShape,
  q: z.string().trim().min(1).max(160).optional()
};

const userHomeCarouselTargetSearchQuerySchema = z
  .object({
    ...targetSearchBaseShape,
    type: z.enum(["shop", "technician", "service"]).optional()
  })
  .strict();

const affiliateNoticeCarouselTargetSearchQuerySchema = z
  .object({
    ...targetSearchBaseShape,
    type: z.literal("affiliate_announcement").optional()
  })
  .strict();

export const carouselTargetSearchQuerySchemaByScene = {
  "user-home": userHomeCarouselTargetSearchQuerySchema,
  "affiliate-home-notice": affiliateNoticeCarouselTargetSearchQuerySchema
} as const;

export type CarouselSceneParam = z.infer<typeof carouselSceneParamSchema>;
export type CarouselDraftBody = z.infer<typeof carouselDraftBodySchema>;
export type AnnouncementDraftBody = z.infer<typeof announcementDraftBodySchema>;
export type PublishBody = z.infer<typeof publishBodySchema>;
export type ScheduleBody = z.infer<typeof scheduleBodySchema>;
export type DisableBody = z.infer<typeof disableBodySchema>;
export type RollbackBody = z.infer<typeof rollbackBodySchema>;
export type ContentHistoryQuery = z.infer<typeof contentHistoryQuerySchema>;
export type CarouselTargetSearchQuery =
  | z.infer<typeof userHomeCarouselTargetSearchQuerySchema>
  | z.infer<typeof affiliateNoticeCarouselTargetSearchQuerySchema>;
