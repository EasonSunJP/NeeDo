import type { AuthenticatedAccessContext } from "../src/services/auth.service";
import { CarouselPublicationRepository } from "../src/repositories/carousel-publication.repository";
import {
  CarouselPublicationService,
  type CarouselPublicationPayload,
  type CarouselPublicationRepositoryPort
} from "../src/services/carousel-publication.service";

const actor: AuthenticatedAccessContext = {
  userId: 41,
  email: "carousel-operator@example.test",
  accessTokenJti: "carousel-service-test",
  accessTokenExpiresAt: 1_800_000_000,
  currentIdentityType: "platform",
  currentIdentityScopeType: "global",
  currentIdentityScopeId: null,
  roles: ["operator"],
  permissions: []
};
const context = { ip: "203.0.113.12", userAgent: "carousel-service-test" };
const now = new Date("2026-08-29T06:00:00.000Z");
const idempotencyKey = "11111111-1111-4111-8111-111111111111";
const mediaPublicId = "a".repeat(64);

const translations = {
  "zh-CN": {
    badge: null,
    title: "首页",
    caption: null,
    ctaLabel: "查看",
    imageAltText: "首页图片",
    sourceLocale: "ja",
    isInitialCopy: true
  },
  "zh-TW": {
    badge: null,
    title: "首頁",
    caption: null,
    ctaLabel: "查看",
    imageAltText: "首頁圖片",
    sourceLocale: "ja",
    isInitialCopy: true
  },
  en: {
    badge: null,
    title: "Home",
    caption: null,
    ctaLabel: "View",
    imageAltText: "Home image",
    sourceLocale: "ja",
    isInitialCopy: true
  },
  ja: {
    badge: null,
    title: "ホーム",
    caption: null,
    ctaLabel: "見る",
    imageAltText: "ホーム画像",
    sourceLocale: "ja",
    isInitialCopy: false
  },
  ko: {
    badge: null,
    title: "홈",
    caption: null,
    ctaLabel: "보기",
    imageAltText: "홈 이미지",
    sourceLocale: "ja",
    isInitialCopy: true
  }
} as const;

const payload = (
  overrides: Partial<CarouselPublicationPayload> = {}
): CarouselPublicationPayload => ({
  scene: "USER_HOME",
  releaseId: 71,
  version: 1,
  status: "draft",
  lockVersion: 1,
  publishAt: null,
  activatedAt: null,
  disabledAt: null,
  archivedAt: null,
  sourceReleaseId: null,
  slides: [
    {
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      mediaAssetPublicId: mediaPublicId,
      imageUrl: "/media/content/a.png",
      sortOrder: 0,
      isEnabled: true,
      visibleFrom: null,
      visibleUntil: null,
      target: { type: "shop", shopId: 7 },
      translations: { ...translations }
    }
  ],
  createdAt: now,
  updatedAt: now,
  ...overrides
});

const repository = (): jest.Mocked<CarouselPublicationRepositoryPort> => ({
  getScene: jest.fn(),
  createDraft: jest.fn(),
  findRelease: jest.fn(),
  replaceDraft: jest.fn(),
  updateLocale: jest.fn(),
  publish: jest.fn(),
  schedule: jest.fn(),
  disable: jest.fn(),
  cloneForRollback: jest.fn(),
  listHistory: jest.fn(),
  findPublishedScene: jest.fn(),
  searchTargets: jest.fn(),
  listDueScheduledReleases: jest.fn(),
  activateDueScheduledRelease: jest.fn(),
  recordDueScheduledReleaseFailure: jest.fn()
});

const marketplace = () => ({
  getTask: jest.fn(async () => ({ taskCode: "AFF-29", name: "Visible task", claimable: true }))
});

describe("CarouselPublicationService", () => {
  it("enforces the exact target matrix for the two fixed scenes", () => {
    const service = new CarouselPublicationService(repository(), marketplace());
    expect(() => service.assertTarget("USER_HOME", { type: "shop", shopId: 7 })).not.toThrow();
    expect(() =>
      service.assertTarget("USER_HOME", {
        type: "affiliate_announcement",
        announcementPublicId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        affiliateTaskId: null
      })
    ).toThrow("error.carousel.target_invalid");
    expect(() =>
      service.assertTarget("AFFILIATE_HOME_NOTICE", { type: "service", serviceId: 4 })
    ).toThrow("error.carousel.target_invalid");
  });

  it("initializes all five locales with provenance and contiguous slide order", async () => {
    const repo = repository();
    repo.createDraft.mockImplementation(async (input) =>
      payload({
        slides: input.slides.map((slide) => ({
          ...slide,
          id: slide.publicId,
          imageUrl: "/media/content/a.png",
          target: { type: "shop", shopId: 7 }
        }))
      })
    );
    const service = new CarouselPublicationService(repo, marketplace(), {
      now: () => now,
      createPublicId: () => "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
    });

    const result = await service.createDraft("USER_HOME", actor, context, {
      idempotencyKey,
      sourceLocale: "ja",
      slides: [
        {
          mediaAssetPublicId: mediaPublicId,
          sortOrder: 0,
          isEnabled: true,
          visibleFrom: null,
          visibleUntil: null,
          target: { type: "shop", shopId: 7 },
          translations: [
            {
              locale: "ja",
              badge: null,
              title: "ホーム",
              caption: null,
              ctaLabel: "見る",
              imageAltText: "ホーム画像"
            }
          ]
        }
      ]
    });

    expect(Object.keys(result.slides[0].translations).sort()).toEqual(
      ["en", "ja", "ko", "zh-CN", "zh-TW"].sort()
    );
    expect(result.slides[0].translations.ja).toMatchObject({
      sourceLocale: "ja",
      isInitialCopy: false
    });
    expect(result.slides[0].translations.en).toMatchObject({
      sourceLocale: "ja",
      isInitialCopy: true
    });
    expect(repo.createDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        scene: "USER_HOME",
        actorUserId: 41,
        requestFingerprint: expect.stringMatching(/^[a-f0-9]{64}$/),
        slides: [
          expect.objectContaining({
            publicId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
            sortOrder: 0
          })
        ]
      })
    );
  });

  it("rejects non-contiguous order, incomplete publish content, dead windows, and an all-hidden draft", async () => {
    const service = new CarouselPublicationService(repository(), marketplace(), { now: () => now });
    const base = {
      idempotencyKey,
      sourceLocale: "ja" as const,
      slides: [
        {
          mediaAssetPublicId: mediaPublicId,
          sortOrder: 1,
          isEnabled: false,
          visibleFrom: null,
          visibleUntil: "2026-08-29T05:00:00.000Z",
          target: { type: "shop" as const, shopId: 7 },
          translations: [
            {
              locale: "ja" as const,
              badge: null,
              title: " ",
              caption: null,
              ctaLabel: null,
              imageAltText: " "
            }
          ]
        }
      ]
    };
    await expect(service.createDraft("USER_HOME", actor, context, base)).rejects.toMatchObject({
      message: "error.carousel.sort_invalid"
    });
  });

  it("rejects duplicate submitted slide public IDs before repository work", async () => {
    const repo = repository();
    const service = new CarouselPublicationService(repo, marketplace(), { now: () => now });
    const publicId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const slide = (sortOrder: number) => ({
      publicId,
      mediaAssetPublicId: mediaPublicId,
      sortOrder,
      isEnabled: true,
      visibleFrom: null,
      visibleUntil: null,
      target: { type: "shop" as const, shopId: 7 },
      translations: [
        {
          locale: "ja" as const,
          badge: null,
          title: `ホーム-${sortOrder}`,
          caption: null,
          ctaLabel: null,
          imageAltText: `ホーム画像-${sortOrder}`
        }
      ]
    });

    await expect(
      service.createDraft("USER_HOME", actor, context, {
        idempotencyKey,
        sourceLocale: "ja",
        slides: [slide(0), slide(1)]
      })
    ).rejects.toMatchObject({ message: "error.carousel.sort_invalid" });
    expect(repo.createDraft).not.toHaveBeenCalled();
  });

  it("preserves explicit copy-to-all provenance when replacing carousel structure", async () => {
    const repo = repository();
    repo.replaceDraft.mockImplementation(async (input) =>
      payload({ lockVersion: 3, slides: input.slides as never })
    );
    const service = new CarouselPublicationService(repo, marketplace(), { now: () => now });
    const explicitCopies = (["zh-CN", "zh-TW", "en", "ja", "ko"] as const).map((locale) => ({
      locale,
      badge: null,
      title: `Copied ${locale}`,
      caption: null,
      ctaLabel: null,
      imageAltText: `Copied image ${locale}`,
      sourceLocale: "en" as const,
      isInitialCopy: false
    }));

    await service.replaceDraft("USER_HOME", actor, context, 71, {
      expectedLockVersion: 2,
      sourceLocale: "en",
      slides: [
        {
          publicId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          mediaAssetPublicId: mediaPublicId,
          sortOrder: 0,
          isEnabled: true,
          visibleFrom: null,
          visibleUntil: null,
          target: { type: "shop", shopId: 7 },
          translations: explicitCopies
        }
      ]
    });

    expect(repo.replaceDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        slides: [
          expect.objectContaining({
            translations: expect.objectContaining({
              "zh-CN": expect.objectContaining({ sourceLocale: "en", isInitialCopy: false }),
              ja: expect.objectContaining({ sourceLocale: "en", isInitialCopy: false })
            })
          })
        ]
      })
    );
  });

  it("round-trips explicit and initial-copy provenance through the real replacement repository", async () => {
    const dbLocales = ["ZH_CN", "ZH_TW", "EN", "JA", "KO"] as const;
    const localeInput = ["zh-CN", "zh-TW", "en", "ja", "ko"] as const;
    const explicitTranslations = localeInput.map((locale, index) => ({
      locale,
      badge: null,
      title: `Round trip ${locale}`,
      caption: null,
      ctaLabel: null,
      imageAltText: `Round trip image ${locale}`,
      sourceLocale: index < 3 ? ("en" as const) : ("ja" as const),
      isInitialCopy: locale === "zh-TW" || locale === "ko"
    }));
    const storedTranslations = dbLocales.map((locale) => ({
      id: dbLocales.indexOf(locale) + 1,
      slideId: 901,
      locale,
      badge: null,
      title: `Before ${locale}`,
      caption: null,
      ctaLabel: null,
      imageAltText: `Before image ${locale}`,
      sourceLocale: locale,
      isInitialCopy: false,
      deletedAt: null,
      createdAt: now,
      updatedAt: now
    }));
    const releaseRecord = (lockVersion: number) => ({
      id: 71,
      scene: "USER_HOME",
      version: 1,
      status: "DRAFT",
      lockVersion,
      draftSlotKey: "carousel:USER_HOME:draft",
      scheduledSlotKey: null,
      publishedSlotKey: null,
      publishAt: null,
      activatedAt: null,
      disabledAt: null,
      archivedAt: null,
      sourceReleaseId: null,
      createdAt: now,
      updatedAt: now,
      slides: [
        {
          id: 901,
          publicId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          releaseId: 71,
          mediaAssetId: 501,
          sortOrder: 0,
          isEnabled: true,
          visibleFrom: null,
          visibleUntil: null,
          targetType: "SHOP",
          shopId: 7,
          technicianProfileId: null,
          serviceId: null,
          announcementId: null,
          affiliateTaskId: null,
          deletedAt: null,
          createdAt: now,
          updatedAt: now,
          mediaAsset: {
            id: 501,
            entityType: "content_publication_upload",
            usageType: "content_publication_public",
            isActive: true,
            purgedAt: null,
            deletedAt: null,
            checksumSha256: mediaPublicId,
            url: "/media/content/a.png"
          },
          shop: null,
          technicianProfile: null,
          service: null,
          announcement: null,
          translations: storedTranslations.map((translation) => ({ ...translation }))
        }
      ]
    });
    let releaseRead = 0;
    const upsert = jest.fn(
      async (query: {
        where: { slideId_locale: { locale: (typeof dbLocales)[number] } };
        update: Record<string, unknown>;
      }) => {
        const row = storedTranslations.find(
          (translation) => translation.locale === query.where.slideId_locale.locale
        );
        Object.assign(row ?? {}, query.update);
        return row;
      }
    );
    const transaction = {
      carouselRelease: {
        findFirst: jest.fn(async () => releaseRecord(releaseRead++ === 0 ? 2 : 3)),
        updateMany: jest.fn(async () => ({ count: 1 }))
      },
      carouselSlide: {
        aggregate: jest.fn(async () => ({ _max: { sortOrder: 0 } })),
        update: jest.fn(async () => ({})),
        updateMany: jest.fn(async () => ({ count: 1 }))
      },
      carouselSlideTranslation: {
        upsert,
        updateMany: jest.fn(async () => ({ count: 1 }))
      },
      mediaAsset: { findFirst: jest.fn(async () => ({ id: 501 })) },
      shop: { findFirst: jest.fn(async () => ({ id: 7 })) },
      auditLog: { create: jest.fn(async () => ({})) }
    };
    const realRepository = new CarouselPublicationRepository({
      $transaction: jest.fn(async (operation: (tx: unknown) => Promise<unknown>) =>
        operation(transaction)
      )
    } as never);
    const service = new CarouselPublicationService(realRepository, marketplace(), {
      now: () => now
    });

    const result = await service.replaceDraft("USER_HOME", actor, context, 71, {
      expectedLockVersion: 2,
      sourceLocale: "en",
      slides: [
        {
          publicId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          mediaAssetPublicId: mediaPublicId,
          sortOrder: 0,
          isEnabled: true,
          visibleFrom: null,
          visibleUntil: null,
          target: { type: "shop", shopId: 7 },
          translations: explicitTranslations
        }
      ]
    });

    expect(upsert).toHaveBeenCalledTimes(5);
    expect(result.slides[0].translations).toMatchObject({
      "zh-CN": { sourceLocale: "en", isInitialCopy: false },
      "zh-TW": { sourceLocale: "en", isInitialCopy: true },
      en: { sourceLocale: "en", isInitialCopy: false },
      ja: { sourceLocale: "ja", isInitialCopy: false },
      ko: { sourceLocale: "ja", isInitialCopy: true }
    });
  });

  it("keeps independent scenes and passes target revalidation into publish and schedule transactions", async () => {
    const repo = repository();
    repo.publish.mockResolvedValue(payload({ status: "published", lockVersion: 2 }));
    repo.schedule.mockResolvedValue(
      payload({ scene: "AFFILIATE_HOME_NOTICE", status: "scheduled", lockVersion: 2 })
    );
    const service = new CarouselPublicationService(repo, marketplace(), { now: () => now });

    await service.publish("USER_HOME", actor, context, 71, {
      idempotencyKey,
      expectedLockVersion: 1,
      reason: "Ready"
    });
    await service.schedule("AFFILIATE_HOME_NOTICE", actor, context, 72, {
      idempotencyKey: "22222222-2222-4222-8222-222222222222",
      expectedLockVersion: 1,
      publishAt: "2099-08-30T03:00:00.000Z",
      reason: "Later"
    });

    expect(repo.publish).toHaveBeenCalledWith(
      expect.objectContaining({ scene: "USER_HOME", validateAffiliateTask: expect.any(Function) })
    );
    expect(repo.schedule).toHaveBeenCalledWith(
      expect.objectContaining({
        scene: "AFFILIATE_HOME_NOTICE",
        validateAffiliateTask: expect.any(Function)
      })
    );
  });

  it("updates one locale and explicitly copies it to all locales with provenance", async () => {
    const repo = repository();
    repo.updateLocale.mockResolvedValue(payload({ lockVersion: 2 }));
    const service = new CarouselPublicationService(repo, marketplace(), { now: () => now });
    await service.updateLocale(
      "USER_HOME",
      actor,
      context,
      71,
      "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      {
        expectedLockVersion: 1,
        locale: "en",
        badge: null,
        title: "Changed",
        caption: null,
        ctaLabel: null,
        imageAltText: "Changed image"
      }
    );
    await service.copyLocaleToAll(
      "USER_HOME",
      actor,
      context,
      71,
      "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      {
        expectedLockVersion: 2,
        sourceLocale: "en"
      }
    );
    expect(repo.updateLocale).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ copyToAll: false, locale: "en" })
    );
    expect(repo.updateLocale).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ copyToAll: true, locale: "en" })
    );
  });

  it("returns standard pagination for protected target search without changing allowed types", async () => {
    const repo = repository();
    repo.searchTargets.mockResolvedValue({
      list: [
        {
          type: "shop",
          publicId: "shop0000000001",
          label: "Shibuya",
          status: "published",
          target: { type: "shop", publicId: "shop0000000001" }
        }
      ],
      total: 1
    });
    const service = new CarouselPublicationService(repo, marketplace(), { now: () => now });
    const result = await service.searchTargets("USER_HOME", actor, {
      type: "shop",
      q: "Shibu",
      page: 2,
      pageSize: 5
    });
    expect(result).toMatchObject({ total: 1, page: 2, page_size: 5 });
    expect(JSON.stringify(result)).not.toMatch(
      /shopId|technicianProfileId|serviceId|announcementId|affiliateTaskId/
    );
    expect(repo.searchTargets).toHaveBeenCalledWith(
      expect.objectContaining({ scene: "USER_HOME", type: "shop", q: "Shibu", scopeShopId: null })
    );
  });

  it("accepts a public-safe picker target without a hidden numeric lookup in the controller", async () => {
    const repo = repository();
    repo.createDraft.mockResolvedValue(payload());
    const service = new CarouselPublicationService(repo, marketplace(), { now: () => now });
    await service.createDraft("USER_HOME", actor, context, {
      idempotencyKey,
      sourceLocale: "ja",
      slides: [
        {
          mediaAssetPublicId: mediaPublicId,
          sortOrder: 0,
          isEnabled: true,
          visibleFrom: null,
          visibleUntil: null,
          target: { type: "shop", publicId: "shop0000000007" },
          translations: [
            {
              locale: "ja",
              badge: null,
              title: "ホーム",
              caption: null,
              ctaLabel: null,
              imageAltText: "ホーム画像"
            }
          ]
        }
      ]
    });
    expect(repo.createDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        slides: [expect.objectContaining({ target: { type: "shop", publicId: "shop0000000007" } })]
      })
    );
  });

  it("returns a one-locale public payload and omits internal IDs", async () => {
    const repo = repository();
    repo.findPublishedScene.mockResolvedValue({
      scene: "USER_HOME",
      locale: "ja",
      releaseVersion: 3,
      generatedAt: now.toISOString(),
      slides: [
        {
          id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          badge: null,
          title: "ホーム",
          caption: null,
          ctaLabel: "見る",
          imageAltText: "ホーム画像",
          imageUrl: "/media/content/a.png",
          target: { type: "shop", publicId: "shop0000000001" }
        }
      ]
    });
    const service = new CarouselPublicationService(repo, marketplace(), { now: () => now });
    const result = await service.getPublishedScene("USER_HOME", "ja", actor, now);
    expect(result.slides[0].target).toEqual({ type: "shop", publicId: "shop0000000001" });
    expect(JSON.stringify(result)).not.toMatch(
      /releaseId|shopId|technicianProfileId|serviceId|affiliateTaskId/
    );
  });
});
