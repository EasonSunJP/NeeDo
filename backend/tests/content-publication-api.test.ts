import request from "supertest";
import { createApp } from "../src/app";
import { env } from "../src/config/env";
import { AuthTokenService } from "../src/services/auth-token.service";

const now = new Date("2026-08-29T06:00:00.000Z");
const idempotencyKey = "11111111-1111-4111-8111-111111111111";
const release = {
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
  slides: [],
  createdAt: now,
  updatedAt: now
};

const createUser = (id: number, permissions: string[]) => ({
  id,
  email: `carousel-${id}@example.test`,
  phone: null,
  passwordHash: "unused",
  username: `Carousel ${id}`,
  avatarUrl: null,
  isActive: true,
  lastLoginAt: null,
  createdAt: now,
  updatedAt: now,
  deletedAt: null,
  identities: [
    {
      id: 100 + id,
      userId: id,
      type: "admin",
      scopeType: "global",
      scopeId: null,
      displayName: `Carousel ${id}`,
      isDefault: true,
      isActive: true,
      deletedAt: null
    }
  ],
  userRoles: [
    {
      deletedAt: null,
      role: {
        code: "operator",
        deletedAt: null,
        rolePermissions: permissions.map((code) => ({
          deletedAt: null,
          permission: { code, type: code.startsWith("page:") ? "page" : "button", deletedAt: null }
        }))
      }
    }
  ]
});

const fixture = () => {
  const users = [
    createUser(7, [
      "page:backoffice-user-home-carousel",
      "button:backoffice-user-home-carousel-edit",
      "button:backoffice-user-home-carousel-publish",
      "page:backoffice-affiliate-notice-carousel",
      "button:backoffice-affiliate-notice-carousel-edit",
      "button:backoffice-affiliate-notice-carousel-publish",
      "page:affiliate-marketplace"
    ]),
    createUser(8, [
      "page:backoffice-user-home-carousel",
      "button:backoffice-user-home-carousel-edit"
    ])
  ];
  const service = {
    getBackofficeScene: jest.fn(async (scene: string) => ({ ...release, scene })),
    createDraft: jest.fn(async (scene: string) => ({ ...release, scene })),
    getRelease: jest.fn(async (scene: string) => ({ ...release, scene })),
    replaceDraft: jest.fn(async (scene: string) => ({ ...release, scene, lockVersion: 2 })),
    updateLocale: jest.fn(async (scene: string) => ({ ...release, scene, lockVersion: 2 })),
    copyLocaleToAll: jest.fn(async (scene: string) => ({ ...release, scene, lockVersion: 2 })),
    preview: jest.fn(async (scene: string) => ({ ...release, scene })),
    publish: jest.fn(async (scene: string) => ({ ...release, scene, status: "published" })),
    schedule: jest.fn(async (scene: string) => ({ ...release, scene, status: "scheduled" })),
    disable: jest.fn(async (scene: string) => ({ ...release, scene, status: "disabled" })),
    rollback: jest.fn(async (scene: string) => ({ ...release, scene, releaseId: 72, version: 2 })),
    history: jest.fn(async () => ({ list: [release], total: 1, page: 1, page_size: 20 })),
    searchTargets: jest.fn(async () => ({
      list: [{ type: "shop", publicId: "shop0000000001", label: "Shop", status: "published" }],
      total: 1,
      page: 1,
      page_size: 20
    })),
    getPublishedScene: jest.fn(async (scene: string, locale: string) => ({
      scene,
      locale,
      releaseVersion: 1 as number | null,
      generatedAt: now.toISOString(),
      slides: [
        {
          id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          badge: null,
          title: "Title",
          caption: null,
          ctaLabel: null,
          imageAltText: "Image",
          imageUrl: "/media/content/a.png",
          target: { type: "shop", publicId: "shop0000000001" }
        }
      ]
    }))
  };
  const app = createApp(undefined, {
    redisHealthCheck: async () => ({ status: "ok", latencyMs: 1 }),
    testOnlyAllowLegacyAuthAdapters: true,
    authRepository: {
      findUserById: jest.fn(async (id: number) => users.find((user) => user.id === id) ?? null)
    },
    authSessionStore: { isAccessTokenBlacklisted: jest.fn(async () => false) },
    otpDeliveryClient: { sendOtp: jest.fn(async () => undefined) },
    carouselPublicationService: service
  } as never);
  const tokens = Object.fromEntries(
    users.map((user) => [
      user.id,
      new AuthTokenService(env).issueAccessToken({
        id: user.id,
        email: user.email,
        currentIdentityId: user.identities[0].id
      }).token
    ])
  ) as Record<number, string>;
  return { app, service, tokens };
};

describe("formal carousel publication HTTP API", () => {
  it("fixes scenes in route registration and never accepts request-selected scenes", async () => {
    const f = fixture();
    const auth = `Bearer ${f.tokens[7]}`;
    await request(f.app)
      .post("/api/v1/backoffice/content/carousels/user-home/releases")
      .set("Authorization", auth)
      .send({ idempotencyKey, sourceLocale: "ja", scene: "affiliate-home-notice", slides: [] })
      .expect(400);
    await request(f.app)
      .get("/api/v1/backoffice/content/carousels/user-home")
      .set("Authorization", auth)
      .expect(200);
    await request(f.app)
      .get("/api/v1/backoffice/content/carousels/affiliate-home-notice")
      .set("Authorization", auth)
      .expect(200);
    expect(f.service.getBackofficeScene).toHaveBeenNthCalledWith(
      1,
      "USER_HOME",
      expect.objectContaining({ userId: 7 })
    );
    expect(f.service.getBackofficeScene).toHaveBeenNthCalledWith(
      2,
      "AFFILIATE_HOME_NOTICE",
      expect.objectContaining({ userId: 7 })
    );
  });

  it("registers target search, full lifecycle, locale update, and copy-to-all routes", async () => {
    const f = fixture();
    const auth = `Bearer ${f.tokens[7]}`;
    const base = "/api/v1/backoffice/content/carousels/user-home";
    await request(f.app)
      .get(`${base}/targets?type=shop&q=Shop&page=1&pageSize=20`)
      .set("Authorization", auth)
      .expect(200);
    await request(f.app)
      .get(`${base}/history?page=1&pageSize=20`)
      .set("Authorization", auth)
      .expect(200);
    await request(f.app).get(`${base}/releases/71`).set("Authorization", auth).expect(200);
    await request(f.app)
      .patch(`${base}/releases/71`)
      .set("Authorization", auth)
      .send({
        expectedLockVersion: 1,
        sourceLocale: "ja",
        slides: [
          {
            publicId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
            mediaAssetPublicId: "a".repeat(64),
            sortOrder: 0,
            isEnabled: true,
            visibleFrom: null,
            visibleUntil: null,
            target: { type: "shop", publicId: "shop0000000007" },
            translations: ["zh-CN", "zh-TW", "en", "ja", "ko"].map((locale) => ({
              locale,
              badge: null,
              title: `Title ${locale}`,
              caption: null,
              ctaLabel: null,
              imageAltText: `Image ${locale}`,
              sourceLocale: "en",
              isInitialCopy: false
            }))
          }
        ]
      })
      .expect(200);
    await request(f.app)
      .patch(`${base}/releases/71/slides/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/locales/en`)
      .set("Authorization", auth)
      .send({
        expectedLockVersion: 1,
        badge: null,
        title: "Title",
        caption: null,
        ctaLabel: null,
        imageAltText: "Image"
      })
      .expect(200);
    await request(f.app)
      .patch(`${base}/releases/71/slides/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/locales/en`)
      .set("Authorization", auth)
      .send({ operation: "copy_to_all", expectedLockVersion: 2, sourceLocale: "en" })
      .expect(200);
    await request(f.app)
      .post(`${base}/releases/71/slides/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/copy-to-all`)
      .set("Authorization", auth)
      .send({ expectedLockVersion: 2, sourceLocale: "en" })
      .expect(200);
    await request(f.app).get(`${base}/releases/71/preview`).set("Authorization", auth).expect(200);
    await request(f.app)
      .post(`${base}/releases/71/publish`)
      .set("Authorization", auth)
      .send({ idempotencyKey, expectedLockVersion: 1 })
      .expect(200);
    await request(f.app)
      .post(`${base}/releases/71/schedule`)
      .set("Authorization", auth)
      .send({ idempotencyKey, expectedLockVersion: 1, publishAt: "2099-08-30T03:00:00.000Z" })
      .expect(200);
    await request(f.app)
      .post(`${base}/releases/71/disable`)
      .set("Authorization", auth)
      .send({ idempotencyKey, expectedLockVersion: 1, reason: "Stop" })
      .expect(200);
    await request(f.app)
      .post(`${base}/releases/71/rollback`)
      .set("Authorization", auth)
      .send({ idempotencyKey, expectedCurrentVersion: 1, reason: "Restore" })
      .expect(200);
    expect(f.service.copyLocaleToAll).toHaveBeenCalledWith(
      "USER_HOME",
      expect.objectContaining({ userId: 7 }),
      expect.any(Object),
      71,
      "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      { expectedLockVersion: 2, sourceLocale: "en" }
    );
    expect(f.service.copyLocaleToAll).toHaveBeenCalledTimes(2);
  });

  it("requires publish permission for rollback and isolates the two permission domains", async () => {
    const f = fixture();
    await request(f.app)
      .post("/api/v1/backoffice/content/carousels/user-home/releases/71/rollback")
      .set("Authorization", `Bearer ${f.tokens[8]}`)
      .send({ idempotencyKey, expectedCurrentVersion: 1, reason: "Restore" })
      .expect(403);
    await request(f.app)
      .get("/api/v1/backoffice/content/carousels/affiliate-home-notice")
      .set("Authorization", `Bearer ${f.tokens[8]}`)
      .expect(403);
  });

  it("serves public one-locale payloads with no internal numeric IDs", async () => {
    const f = fixture();
    const auth = `Bearer ${f.tokens[7]}`;
    const user = await request(f.app)
      .get("/api/v1/content/carousels/user-home?locale=ja")
      .set("Authorization", auth)
      .expect(200);
    const affiliate = await request(f.app)
      .get("/api/v1/affiliate/content/carousel?locale=ja")
      .set("Authorization", auth)
      .expect(200);
    for (const response of [user, affiliate]) {
      expect(response.body.data.slides[0].target).toHaveProperty("publicId");
      expect(JSON.stringify(response.body.data)).not.toMatch(
        /shopId|technicianProfileId|serviceId|announcementId|affiliateTaskId|releaseId/
      );
    }
  });

  it.each(["zh-CN", "zh-TW", "en", "ja", "ko"])(
    "accepts only the canonical public locale %s and fixes the scene in the route",
    async (locale) => {
      const f = fixture();
      const authorization = `Bearer ${f.tokens[7]}`;

      const user = await request(f.app)
        .get(`/api/v1/content/carousels/user-home?locale=${encodeURIComponent(locale)}`)
        .set("Authorization", authorization)
        .expect(200);
      const affiliate = await request(f.app)
        .get(`/api/v1/affiliate/content/carousel?locale=${encodeURIComponent(locale)}`)
        .set("Authorization", authorization)
        .expect(200);

      expect(user.body.data).toMatchObject({ scene: "USER_HOME", locale });
      expect(affiliate.body.data).toMatchObject({ scene: "AFFILIATE_HOME_NOTICE", locale });
      expect(f.service.getPublishedScene).toHaveBeenNthCalledWith(
        1,
        "USER_HOME",
        locale,
        expect.objectContaining({ userId: 7 })
      );
      expect(f.service.getPublishedScene).toHaveBeenNthCalledWith(
        2,
        "AFFILIATE_HOME_NOTICE",
        locale,
        expect.objectContaining({ userId: 7 })
      );
    }
  );

  it.each(["zh", "zh_CN", "jp", "en-US"])(
    "rejects locale alias %s at both public API boundaries",
    async (locale) => {
      const f = fixture();
      const authorization = `Bearer ${f.tokens[7]}`;
      for (const path of [
        "/api/v1/content/carousels/user-home",
        "/api/v1/affiliate/content/carousel"
      ]) {
        await request(f.app)
          .get(`${path}?locale=${encodeURIComponent(locale)}`)
          .set("Authorization", authorization)
          .expect(400)
          .expect((response) => expect(response.body.message).toBe("error.content.locale_invalid"));
      }
      expect(f.service.getPublishedScene).not.toHaveBeenCalled();
    }
  );

  it("requires authentication and the Affiliate marketplace page permission", async () => {
    const f = fixture();
    await request(f.app).get("/api/v1/content/carousels/user-home?locale=ja").expect(401);
    await request(f.app).get("/api/v1/affiliate/content/carousel?locale=ja").expect(401);
    await request(f.app)
      .get("/api/v1/affiliate/content/carousel?locale=ja")
      .set("Authorization", `Bearer ${f.tokens[8]}`)
      .expect(403);
    expect(f.service.getPublishedScene).not.toHaveBeenCalled();
  });

  it("returns a successful minimal zero-slide payload without historical fallback", async () => {
    const f = fixture();
    f.service.getPublishedScene.mockResolvedValueOnce({
      scene: "USER_HOME",
      locale: "ja",
      releaseVersion: null,
      generatedAt: now.toISOString(),
      slides: []
    });

    const response = await request(f.app)
      .get("/api/v1/content/carousels/user-home?locale=ja")
      .set("Authorization", `Bearer ${f.tokens[7]}`)
      .expect(200);

    expect(response.body.data).toEqual({
      scene: "USER_HOME",
      locale: "ja",
      releaseVersion: null,
      generatedAt: now.toISOString(),
      slides: []
    });
  });

  it("does not expose draft translations, slot keys, audit metadata, or numeric target IDs", async () => {
    const f = fixture();
    const response = await request(f.app)
      .get("/api/v1/content/carousels/user-home?locale=ja")
      .set("Authorization", `Bearer ${f.tokens[7]}`)
      .expect(200);
    const payload = JSON.stringify(response.body.data);

    expect(payload).not.toMatch(
      /releaseId|publishedSlotKey|translations|sourceLocale|isInitialCopy|createdBy|updatedBy|publishedBy|disabledBy|userId|shopId|technicianProfileId|serviceId|announcementId|affiliateTaskId/
    );
    expect(response.body.data.slides[0].target).toEqual({
      type: "shop",
      publicId: "shop0000000001"
    });
  });
});
