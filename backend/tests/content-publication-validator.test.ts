import {
  CONTENT_PUBLICATION_ERROR_MESSAGES,
  affiliateNoticeCarouselDraftCreateBodySchema,
  affiliateNoticeCarouselDraftUpdateBodySchema,
  announcementDraftCreateBodySchema,
  announcementDraftMetadataUpdateBodySchema,
  announcementDraftMutationBodySchema,
  announcementDraftUpdateBodySchema,
  carouselSceneParamSchema,
  carouselLocaleMutationBodySchema,
  carouselTargetSearchQuerySchemaByScene,
  contentHistoryQuerySchema,
  disableBodySchema,
  publishBodySchema,
  rollbackBodySchema,
  scheduleBodySchema,
  translationBodySchema,
  userHomeCarouselDraftCreateBodySchema,
  userHomeCarouselDraftUpdateBodySchema
} from "../src/validators/content-publication.validator";

const idempotencyKey = "c44f6308-7265-41b6-a938-b6615746b996";
const announcementPublicId = "3896f672-1e5a-4a88-a8b7-7a8ba38f13b8";
const slidePublicId = "558a67d2-65c9-49a4-a946-2bb2b9383dce";
const mediaAssetPublicId = "a".repeat(64);
const shopPublicId = "shop0000000007";
const servicePublicId = "558a67d2-65c9-49a4-a946-2bb2b9383dcf";

const translation = {
  locale: "ja",
  badge: "  重要  ",
  title: "  お知らせ  ",
  caption: "  詳細  ",
  ctaLabel: "  見る  ",
  imageAltText: "  お知らせ画像  "
};

const userSlide = {
  publicId: slidePublicId,
  defaultMediaAssetPublicId: mediaAssetPublicId,
  sortOrder: 0,
  isEnabled: true,
  visibleFrom: null,
  visibleUntil: null,
  target: { type: "shop", shopId: 7 },
  translations: [translation]
};

const affiliateSlide = {
  ...userSlide,
  target: {
    type: "affiliate_announcement",
    announcementPublicId,
    affiliateTaskId: null
  }
};

describe("content publication scene and translation validators", () => {
  it("accepts only fixed public scene slugs", () => {
    expect(carouselSceneParamSchema.parse({ scene: "user-home" })).toEqual({
      scene: "user-home"
    });
    expect(carouselSceneParamSchema.parse({ scene: "affiliate-home-notice" })).toEqual({
      scene: "affiliate-home-notice"
    });
    expect(carouselSceneParamSchema.safeParse({ scene: "USER_HOME" }).success).toBe(false);
    expect(
      carouselSceneParamSchema.safeParse({ scene: "user-home", internalScene: "USER_HOME" }).success
    ).toBe(false);
  });

  it("trims the exact translation contract and rejects unsupported locales or fields", () => {
    expect(translationBodySchema.parse(translation)).toEqual({
      locale: "ja",
      badge: "重要",
      title: "お知らせ",
      caption: "詳細",
      ctaLabel: "見る",
      imageAltText: "お知らせ画像",
      mediaAssetPublicId: null
    });
    expect(translationBodySchema.safeParse({ ...translation, locale: "fr" }).success).toBe(false);
    expect(translationBodySchema.safeParse({ ...translation, title: " " }).success).toBe(false);
    expect(translationBodySchema.safeParse({ ...translation, imageAltText: " " }).success).toBe(
      false
    );
    expect(translationBodySchema.safeParse({ ...translation, html: "<b>unsafe</b>" }).success).toBe(
      false
    );
  });
});

describe("strict scene-specific carousel draft validators", () => {
  it("accepts none only for user-home and normalizes an omitted locale image to null", () => {
    const parsed = userHomeCarouselDraftCreateBodySchema.parse({
      idempotencyKey,
      sourceLocale: "ja",
      slides: [
        {
          ...userSlide,
          target: { type: "none" },
          translations: [{ ...translation, ctaLabel: null }]
        }
      ]
    });

    expect(parsed.slides[0]?.target).toEqual({ type: "none" });
    expect(parsed.slides[0]?.translations[0]?.mediaAssetPublicId).toBeNull();

    expect(
      affiliateNoticeCarouselDraftCreateBodySchema.safeParse({
        idempotencyKey,
        sourceLocale: "ja",
        slides: [
          {
            ...affiliateSlide,
            target: { type: "none" }
          }
        ]
      }).success
    ).toBe(false);
  });

  it("accepts a per-locale media checksum and rejects invalid checksums", () => {
    expect(
      translationBodySchema.parse({
        ...translation,
        mediaAssetPublicId: "b".repeat(64)
      }).mediaAssetPublicId
    ).toBe("b".repeat(64));
    expect(
      translationBodySchema.safeParse({
        ...translation,
        mediaAssetPublicId: "not-a-checksum"
      }).success
    ).toBe(false);
  });

  it("accepts a user-home create draft with one valid user target", () => {
    const parsed = userHomeCarouselDraftCreateBodySchema.parse({
      idempotencyKey,
      sourceLocale: "ja",
      slides: [userSlide]
    });
    expect(parsed.slides[0]?.target).toEqual({ type: "shop", shopId: 7 });
    expect(parsed.slides[0]?.translations[0]?.title).toBe("お知らせ");
  });

  it("requires exactly one source-locale translation on first save", () => {
    expect(
      userHomeCarouselDraftCreateBodySchema.safeParse({
        idempotencyKey,
        sourceLocale: "en",
        slides: [userSlide]
      }).success
    ).toBe(false);
    expect(
      userHomeCarouselDraftCreateBodySchema.safeParse({
        idempotencyKey,
        sourceLocale: "ja",
        slides: [
          {
            ...userSlide,
            translations: [translation, { ...translation, locale: "en", title: "Notice" }]
          }
        ]
      }).success
    ).toBe(false);
  });

  it("requires replacement drafts to contain all five unique locales", () => {
    const allTranslations = ["zh-CN", "zh-TW", "en", "ja", "ko"].map((locale) => ({
      ...translation,
      locale,
      title: `Title ${locale}`,
      sourceLocale: "en",
      isInitialCopy: false
    }));
    expect(
      userHomeCarouselDraftUpdateBodySchema.safeParse({
        expectedLockVersion: 2,
        sourceLocale: "ja",
        slides: [
          {
            ...userSlide,
            translations: allTranslations
          }
        ]
      }).success
    ).toBe(true);
    expect(
      userHomeCarouselDraftUpdateBodySchema.safeParse({
        expectedLockVersion: 2,
        sourceLocale: "ja",
        slides: [{ ...userSlide, translations: allTranslations.slice(0, 4) }]
      }).success
    ).toBe(false);
    expect(
      userHomeCarouselDraftUpdateBodySchema.safeParse({
        expectedLockVersion: 2,
        sourceLocale: "ja",
        slides: [
          {
            ...userSlide,
            translations: [...allTranslations.slice(0, 4), allTranslations[0]]
          }
        ]
      }).success
    ).toBe(false);
    expect(
      userHomeCarouselDraftUpdateBodySchema.safeParse({
        expectedLockVersion: 2,
        sourceLocale: "ja",
        slides: [
          {
            ...userSlide,
            translations: allTranslations.map((value) => ({
              locale: value.locale,
              badge: value.badge,
              title: value.title,
              caption: value.caption,
              ctaLabel: value.ctaLabel,
              imageAltText: value.imageAltText,
              isInitialCopy: value.isInitialCopy
            }))
          }
        ]
      }).success
    ).toBe(false);
  });

  it.each([
    { type: "shop", shopId: 7 },
    { type: "technician", technicianProfileId: 8 },
    { type: "service", serviceId: 9 }
  ])("accepts the supported user-home target %#", (target) => {
    expect(
      userHomeCarouselDraftCreateBodySchema.safeParse({
        idempotencyKey,
        sourceLocale: "ja",
        slides: [{ ...userSlide, target }]
      }).success
    ).toBe(true);
  });

  it.each([
    { type: "shop", publicId: shopPublicId },
    { type: "technician", publicId: "s0000000007" },
    { type: "service", publicId: servicePublicId }
  ])("accepts a public-safe picker target %#", (target) => {
    expect(
      userHomeCarouselDraftCreateBodySchema.safeParse({
        idempotencyKey,
        sourceLocale: "ja",
        slides: [{ ...userSlide, target }]
      }).success
    ).toBe(true);
  });

  it("rejects cross-scene and mixed target fields before Service code", () => {
    expect(
      userHomeCarouselDraftCreateBodySchema.safeParse({
        idempotencyKey,
        sourceLocale: "ja",
        slides: [affiliateSlide]
      }).success
    ).toBe(false);
    expect(
      affiliateNoticeCarouselDraftCreateBodySchema.safeParse({
        idempotencyKey,
        sourceLocale: "ja",
        slides: [userSlide]
      }).success
    ).toBe(false);
    expect(
      userHomeCarouselDraftCreateBodySchema.safeParse({
        idempotencyKey,
        sourceLocale: "ja",
        slides: [
          {
            ...userSlide,
            target: { type: "shop", shopId: 7, serviceId: 9 }
          }
        ]
      }).success
    ).toBe(false);
  });

  it("accepts the Affiliate notice target and defaults its optional task to null", () => {
    const parsed = affiliateNoticeCarouselDraftCreateBodySchema.parse({
      idempotencyKey,
      sourceLocale: "ja",
      slides: [
        {
          ...affiliateSlide,
          target: { type: "affiliate_announcement", announcementPublicId }
        }
      ]
    });
    expect(parsed.slides[0]?.target).toEqual({
      type: "affiliate_announcement",
      announcementPublicId,
      affiliateTaskId: null
    });
  });

  it("accepts a safe Affiliate task code but rejects mixed numeric and safe task references", () => {
    expect(
      affiliateNoticeCarouselDraftCreateBodySchema.safeParse({
        idempotencyKey,
        sourceLocale: "ja",
        slides: [
          {
            ...affiliateSlide,
            target: {
              type: "affiliate_announcement",
              announcementPublicId,
              taskCode: "AFF-PUBLIC-29"
            }
          }
        ]
      }).success
    ).toBe(true);
    expect(
      affiliateNoticeCarouselDraftCreateBodySchema.safeParse({
        idempotencyKey,
        sourceLocale: "ja",
        slides: [
          {
            ...affiliateSlide,
            target: {
              type: "affiliate_announcement",
              announcementPublicId,
              affiliateTaskId: 29,
              taskCode: "AFF-PUBLIC-29"
            }
          }
        ]
      }).success
    ).toBe(false);
  });

  it("separates create idempotency from existing-draft optimistic locking", () => {
    expect(
      userHomeCarouselDraftCreateBodySchema.safeParse({
        idempotencyKey,
        sourceLocale: "ja",
        slides: [userSlide],
        expectedLockVersion: 1
      }).success
    ).toBe(false);
    expect(
      userHomeCarouselDraftUpdateBodySchema.safeParse({
        expectedLockVersion: 2,
        sourceLocale: "ja",
        slides: [
          {
            ...userSlide,
            translations: ["zh-CN", "zh-TW", "en", "ja", "ko"].map((locale) => ({
              ...translation,
              locale,
              sourceLocale: "en",
              isInitialCopy: false
            }))
          }
        ]
      }).success
    ).toBe(true);
    expect(
      affiliateNoticeCarouselDraftUpdateBodySchema.safeParse({
        expectedLockVersion: 2,
        sourceLocale: "ja",
        slides: [affiliateSlide],
        idempotencyKey
      }).success
    ).toBe(false);
  });

  it("requires strictly ordered optional slide visibility windows", () => {
    expect(
      userHomeCarouselDraftCreateBodySchema.safeParse({
        idempotencyKey,
        sourceLocale: "ja",
        slides: [
          {
            ...userSlide,
            visibleFrom: "2030-01-02T00:00:00.000Z",
            visibleUntil: "2030-01-01T00:00:00.000Z"
          }
        ]
      }).success
    ).toBe(false);
    expect(
      userHomeCarouselDraftCreateBodySchema.safeParse({
        idempotencyKey,
        sourceLocale: "ja",
        slides: [
          {
            ...userSlide,
            visibleFrom: "2030-01-01T00:00:00.000Z",
            visibleUntil: "2030-01-02T00:00:00.000Z"
          }
        ]
      }).success
    ).toBe(true);
  });
});

describe("announcement and lifecycle validators", () => {
  const announcementTranslation = {
    title: "  重要なお知らせ  ",
    summary: "  概要  ",
    body: "  本文  "
  };

  it("validates announcement create/update keys and ordered visibility", () => {
    expect(
      announcementDraftCreateBodySchema.parse({
        idempotencyKey,
        sourceLocale: "ja",
        affiliateTaskId: null,
        visibleFrom: "2030-01-01T00:00:00.000Z",
        visibleUntil: "2030-01-02T00:00:00.000Z",
        translation: announcementTranslation
      })
    ).toEqual({
      idempotencyKey,
      sourceLocale: "ja",
      affiliateTaskId: null,
      visibleFrom: "2030-01-01T00:00:00.000Z",
      visibleUntil: "2030-01-02T00:00:00.000Z",
      translation: { title: "重要なお知らせ", summary: "概要", body: "本文" }
    });
    expect(
      announcementDraftUpdateBodySchema.safeParse({
        expectedLockVersion: 3,
        locale: "en",
        title: "Important notice",
        summary: null,
        body: "Body"
      }).success
    ).toBe(true);
    expect(
      announcementDraftCreateBodySchema.safeParse({
        idempotencyKey,
        sourceLocale: "ja",
        visibleFrom: "2030-01-02T00:00:00.000Z",
        visibleUntil: "2030-01-01T00:00:00.000Z",
        translation: announcementTranslation
      }).success
    ).toBe(false);
  });

  it("accepts an explicit strict copy-to-all PATCH command", () => {
    expect(
      announcementDraftMutationBodySchema.parse({
        operation: "copy_to_all",
        expectedLockVersion: 3,
        sourceLocale: "en"
      })
    ).toEqual({ operation: "copy_to_all", expectedLockVersion: 3, sourceLocale: "en" });
    expect(
      announcementDraftMutationBodySchema.safeParse({
        operation: "copy_to_all",
        expectedLockVersion: 3,
        sourceLocale: "en",
        title: "must not be accepted"
      }).success
    ).toBe(false);
    expect(
      announcementDraftMutationBodySchema.safeParse({
        expectedLockVersion: 3,
        locale: "en",
        title: "Important notice",
        summary: null,
        body: "Body"
      }).success
    ).toBe(true);
  });

  it("accepts a strict draft metadata update and rejects an inverted visibility window", () => {
    expect(
      announcementDraftMetadataUpdateBodySchema.parse({
        operation: "update_metadata",
        expectedLockVersion: 3,
        affiliateTaskId: 29,
        visibleFrom: "2026-09-01T01:00:00.000Z",
        visibleUntil: "2026-09-30T01:00:00.000Z"
      })
    ).toEqual({
      operation: "update_metadata",
      expectedLockVersion: 3,
      affiliateTaskId: 29,
      visibleFrom: "2026-09-01T01:00:00.000Z",
      visibleUntil: "2026-09-30T01:00:00.000Z"
    });
    expect(
      announcementDraftMetadataUpdateBodySchema.safeParse({
        operation: "update_metadata",
        expectedLockVersion: 3,
        affiliateTaskId: null,
        visibleFrom: "2026-09-30T01:00:00.000Z",
        visibleUntil: "2026-09-01T01:00:00.000Z"
      }).success
    ).toBe(false);
  });

  it("requires idempotency plus optimistic locking for publication mutations", () => {
    expect(
      publishBodySchema.parse({
        idempotencyKey,
        expectedLockVersion: 4,
        reason: "  approved  "
      })
    ).toEqual({ idempotencyKey, expectedLockVersion: 4, reason: "approved" });
    expect(publishBodySchema.safeParse({ idempotencyKey, expectedLockVersion: 0 }).success).toBe(
      false
    );
    expect(publishBodySchema.safeParse({ expectedLockVersion: 4 }).success).toBe(false);
  });

  it("accepts only a future ISO 8601 UTC schedule time", () => {
    expect(
      scheduleBodySchema.safeParse({
        idempotencyKey,
        expectedLockVersion: 4,
        publishAt: "2999-01-01T00:00:00.000Z"
      }).success
    ).toBe(true);
    for (const publishAt of [
      "2000-01-01T00:00:00.000Z",
      "2999-01-01T09:00:00+09:00",
      "2999-01-01 00:00:00"
    ]) {
      expect(
        scheduleBodySchema.safeParse({ idempotencyKey, expectedLockVersion: 4, publishAt }).success
      ).toBe(false);
    }
  });

  it("requires a non-empty operator reason for disable and rollback", () => {
    expect(
      disableBodySchema.parse({
        idempotencyKey,
        expectedLockVersion: 4,
        reason: "  expired campaign  "
      }).reason
    ).toBe("expired campaign");
    expect(
      rollbackBodySchema.parse({
        idempotencyKey,
        expectedCurrentVersion: 8,
        reason: "  restore approved content  "
      }).reason
    ).toBe("restore approved content");
    expect(
      disableBodySchema.safeParse({ idempotencyKey, expectedLockVersion: 4, reason: " " }).success
    ).toBe(false);
    expect(
      rollbackBodySchema.safeParse({
        idempotencyKey,
        expectedCurrentVersion: 0,
        reason: "restore"
      }).success
    ).toBe(false);
  });
});

describe("carousel locale mutation union", () => {
  it("accepts exactly an update or explicit copy-to-all command", () => {
    expect(
      carouselLocaleMutationBodySchema.safeParse({
        expectedLockVersion: 2,
        badge: null,
        title: "Updated",
        caption: null,
        ctaLabel: null,
        imageAltText: "Updated image"
      }).success
    ).toBe(true);
    expect(
      carouselLocaleMutationBodySchema.safeParse({
        operation: "copy_to_all",
        expectedLockVersion: 3,
        sourceLocale: "en"
      }).success
    ).toBe(true);
    expect(
      carouselLocaleMutationBodySchema.safeParse({
        operation: "copy_to_all",
        expectedLockVersion: 3,
        sourceLocale: "en",
        title: "must be rejected"
      }).success
    ).toBe(false);
  });
});

describe("content publication queries and stable error contract", () => {
  it("normalizes strict pagination and scene-safe target filters", () => {
    expect(contentHistoryQuerySchema.parse({ page: "2", pageSize: "50" })).toEqual({
      page: 2,
      pageSize: 50
    });
    expect(
      carouselTargetSearchQuerySchemaByScene["user-home"].parse({
        q: "  东京  ",
        type: "service"
      })
    ).toEqual({ page: 1, pageSize: 20, q: "东京", type: "service" });
    expect(
      carouselTargetSearchQuerySchemaByScene["affiliate-home-notice"].parse({
        type: "announcement"
      })
    ).toEqual({ page: 1, pageSize: 20, type: "announcement" });
    expect(
      carouselTargetSearchQuerySchemaByScene["affiliate-home-notice"].parse({
        type: "affiliate_task"
      })
    ).toEqual({ page: 1, pageSize: 20, type: "affiliate_task" });
    for (const type of ["shop", "service", "affiliate_announcement"]) {
      expect(
        carouselTargetSearchQuerySchemaByScene["affiliate-home-notice"].safeParse({ type }).success
      ).toBe(false);
    }
    expect(contentHistoryQuerySchema.safeParse({ pageSize: 101 }).success).toBe(false);
    expect(contentHistoryQuerySchema.safeParse({ unknown: true }).success).toBe(false);
  });

  it("declares the complete stable content-publication error message contract", () => {
    expect(CONTENT_PUBLICATION_ERROR_MESSAGES).toEqual([
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
    ]);
  });
});
