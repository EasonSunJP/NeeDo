import request from "supertest";
import { createApp } from "../src/app";
import { env } from "../src/config/env";
import { AuthTokenService } from "../src/services/auth-token.service";
import { OfficialAnnouncementService } from "../src/services/official-announcement.service";

const now = new Date("2026-08-29T03:00:00.000Z");
const publicId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const idempotencyKey = "11111111-1111-4111-8111-111111111111";

const protectedPayload = {
  publicId,
  releaseId: 71,
  version: 1,
  status: "draft",
  lockVersion: 1,
  announcementType: "affiliate_notice",
  visibilityScope: "all_affiliates",
  affiliateTaskId: 29,
  publishAt: null,
  visibleFrom: null,
  visibleUntil: null,
  activatedAt: null,
  disabledAt: null,
  archivedAt: null,
  sourceReleaseId: null,
  translations: {
    "zh-CN": {
      title: "通知",
      summary: null,
      body: "正文",
      sourceLocale: "ja",
      isInitialCopy: true
    },
    "zh-TW": {
      title: "通知",
      summary: null,
      body: "正文",
      sourceLocale: "ja",
      isInitialCopy: true
    },
    en: { title: "Notice", summary: null, body: "Body", sourceLocale: "en", isInitialCopy: false },
    ja: {
      title: "お知らせ",
      summary: null,
      body: "本文",
      sourceLocale: "ja",
      isInitialCopy: false
    },
    ko: { title: "공지", summary: null, body: "본문", sourceLocale: "ja", isInitialCopy: true }
  },
  createdAt: now,
  updatedAt: now
};

const createUser = (id: number, permissions: string[]) => ({
  id,
  email: `announcement-${id}@example.test`,
  phone: null,
  passwordHash: "unused",
  username: `Announcement ${id}`,
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
      type: id === 8 ? "scout" : id === 11 ? "customer" : "admin",
      scopeType: "global",
      scopeId: null,
      displayName: `Announcement ${id}`,
      isDefault: true,
      isActive: true,
      deletedAt: null
    }
  ],
  userRoles: [
    {
      deletedAt: null,
      role: {
        code: id === 8 || id === 11 ? "scout" : "operator",
        deletedAt: null,
        rolePermissions: permissions.map((code) => ({
          deletedAt: null,
          permission: {
            code,
            type: code.startsWith("page:") ? "page" : "button",
            deletedAt: null
          }
        }))
      }
    }
  ]
});

const createFixture = () => {
  const users = [
    createUser(7, [
      "page:backoffice-affiliate-announcement",
      "button:backoffice-affiliate-announcement-edit",
      "button:backoffice-affiliate-announcement-publish"
    ]),
    createUser(8, ["page:affiliate-marketplace"]),
    createUser(9, ["page:backoffice-affiliate-announcement"]),
    createUser(10, ["button:backoffice-affiliate-announcement-edit"]),
    createUser(11, ["page:affiliate-marketplace"])
  ];
  const service = {
    list: jest.fn(async () => ({ list: [protectedPayload], total: 1, page: 1, page_size: 20 })),
    createDraft: jest.fn(async () => protectedPayload),
    history: jest.fn(async () => ({ list: [protectedPayload], total: 1, page: 1, page_size: 20 })),
    getRelease: jest.fn(async () => protectedPayload),
    updateLocale: jest.fn(async () => ({ ...protectedPayload, lockVersion: 2 })),
    copyLocaleToAll: jest.fn(async () => ({ ...protectedPayload, lockVersion: 2 })),
    preview: jest.fn(async () => ({ ...protectedPayload, taskAction: null })),
    publish: jest.fn(async () => ({ ...protectedPayload, status: "published" })),
    schedule: jest.fn(async () => ({ ...protectedPayload, status: "scheduled" })),
    disable: jest.fn(async () => ({ ...protectedPayload, status: "disabled" })),
    rollback: jest.fn(async () => ({ ...protectedPayload, releaseId: 72, version: 2 })),
    getPublishedForAffiliate: jest.fn(
      async (_actor: unknown, _publicId: string, locale: string) => ({
        publicId,
        version: 1,
        locale,
        title: "お知らせ",
        summary: null,
        body: "本文",
        visibleFrom: null,
        visibleUntil: null,
        activatedAt: now,
        taskAction: {
          taskCode: "AFF-PUBLIC-29",
          label: "Visible task",
          claimable: true
        } as { taskCode: string; label: string; claimable: boolean } | null
      })
    )
  };
  const app = createApp(undefined, {
    redisHealthCheck: async () => ({ status: "ok", latencyMs: 1 }),
    testOnlyAllowLegacyAuthAdapters: true,
    authRepository: {
      findUserById: jest.fn(async (id: number) => users.find((user) => user.id === id) ?? null)
    },
    authSessionStore: { isAccessTokenBlacklisted: jest.fn(async () => false) },
    otpDeliveryClient: { sendOtp: jest.fn(async () => undefined) },
    officialAnnouncementService: service
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

describe("official Affiliate announcement HTTP API", () => {
  it("creates a strict five-locale backoffice draft with edit permission", async () => {
    const fixture = createFixture();
    const response = await request(fixture.app)
      .post("/api/v1/backoffice/affiliate/announcements")
      .set("Authorization", `Bearer ${fixture.tokens[7]}`)
      .set("User-Agent", "announcement-api-test")
      .send({
        idempotencyKey,
        sourceLocale: "ja",
        affiliateTaskId: 29,
        translation: { title: "お知らせ", summary: null, body: "本文" }
      })
      .expect(201);

    expect(Object.keys(response.body.data.translations)).toHaveLength(5);
    expect(response.body.data.translations.ja).toMatchObject({
      sourceLocale: "ja",
      isInitialCopy: false
    });
    expect(fixture.service.createDraft).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 7 }),
      expect.objectContaining({ ip: expect.any(String), userAgent: "announcement-api-test" }),
      expect.objectContaining({
        idempotencyKey,
        sourceLocale: "ja",
        affiliateTaskId: 29,
        visibleFrom: null,
        visibleUntil: null
      })
    );
  });

  it("uses the publication validation mapper and rejects malformed path values", async () => {
    const fixture = createFixture();
    await request(fixture.app)
      .post("/api/v1/backoffice/affiliate/announcements")
      .set("Authorization", `Bearer ${fixture.tokens[7]}`)
      .send({
        idempotencyKey,
        sourceLocale: "fr",
        affiliateTaskId: null,
        translation: { title: "Notice", summary: null, body: "Body" }
      })
      .expect(400)
      .expect((response) => expect(response.body.message).toBe("error.content.locale_invalid"));
    await request(fixture.app)
      .get("/api/v1/backoffice/affiliate/announcements/not-a-uuid/releases/0")
      .set("Authorization", `Bearer ${fixture.tokens[7]}`)
      .expect(400);
    expect(fixture.service.createDraft).not.toHaveBeenCalled();
    expect(fixture.service.getRelease).not.toHaveBeenCalled();
  });

  it("enforces separate read, edit, and publish permissions", async () => {
    const fixture = createFixture();
    const readOnly = `Bearer ${fixture.tokens[9]}`;
    await request(fixture.app)
      .get("/api/v1/backoffice/affiliate/announcements?page=1&pageSize=20")
      .set("Authorization", readOnly)
      .expect(200);
    await request(fixture.app)
      .post("/api/v1/backoffice/affiliate/announcements")
      .set("Authorization", readOnly)
      .send({
        idempotencyKey,
        sourceLocale: "ja",
        affiliateTaskId: null,
        translation: { title: "お知らせ", summary: null, body: "本文" }
      })
      .expect(403);
    await request(fixture.app)
      .post(`/api/v1/backoffice/affiliate/announcements/${publicId}/releases/71/publish`)
      .set("Authorization", readOnly)
      .send({ idempotencyKey, expectedLockVersion: 1 })
      .expect(403);
  });

  it("registers every protected lifecycle route with the exact command bodies", async () => {
    const fixture = createFixture();
    const authorization = `Bearer ${fixture.tokens[7]}`;
    await request(fixture.app)
      .get(`/api/v1/backoffice/affiliate/announcements/${publicId}/history?page=1&pageSize=20`)
      .set("Authorization", authorization)
      .expect(200);
    await request(fixture.app)
      .get(`/api/v1/backoffice/affiliate/announcements/${publicId}/releases/71`)
      .set("Authorization", authorization)
      .expect(200);
    await request(fixture.app)
      .patch(`/api/v1/backoffice/affiliate/announcements/${publicId}/releases/71`)
      .set("Authorization", authorization)
      .send({
        expectedLockVersion: 1,
        locale: "en",
        title: "Notice",
        summary: null,
        body: "Body"
      })
      .expect(200);
    await request(fixture.app)
      .patch(`/api/v1/backoffice/affiliate/announcements/${publicId}/releases/71`)
      .set("Authorization", authorization)
      .send({ operation: "copy_to_all", expectedLockVersion: 2, sourceLocale: "en" })
      .expect(200);
    await request(fixture.app)
      .get(`/api/v1/backoffice/affiliate/announcements/${publicId}/releases/71/preview`)
      .set("Authorization", authorization)
      .expect(200);
    await request(fixture.app)
      .post(`/api/v1/backoffice/affiliate/announcements/${publicId}/releases/71/publish`)
      .set("Authorization", authorization)
      .send({ idempotencyKey, expectedLockVersion: 1 })
      .expect(200);
    await request(fixture.app)
      .post(`/api/v1/backoffice/affiliate/announcements/${publicId}/releases/71/schedule`)
      .set("Authorization", authorization)
      .send({
        idempotencyKey,
        expectedLockVersion: 1,
        publishAt: "2099-08-30T03:00:00.000Z"
      })
      .expect(200);
    await request(fixture.app)
      .post(`/api/v1/backoffice/affiliate/announcements/${publicId}/releases/71/disable`)
      .set("Authorization", authorization)
      .send({ idempotencyKey, expectedLockVersion: 1, reason: "Expired" })
      .expect(200);
    await request(fixture.app)
      .post(`/api/v1/backoffice/affiliate/announcements/${publicId}/releases/71/rollback`)
      .set("Authorization", authorization)
      .send({ idempotencyKey, expectedCurrentVersion: 1, reason: "Restore" })
      .expect(200);

    expect(fixture.service.rollback).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 7 }),
      expect.any(Object),
      publicId,
      71,
      expect.objectContaining({ expectedCurrentVersion: 1, idempotencyKey })
    );
    expect(fixture.service.copyLocaleToAll).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 7 }),
      expect.any(Object),
      publicId,
      71,
      { expectedLockVersion: 2, locale: "en" }
    );
  });

  it("requires publish permission for rollback even when the actor can edit", async () => {
    const fixture = createFixture();
    await request(fixture.app)
      .post(`/api/v1/backoffice/affiliate/announcements/${publicId}/releases/71/rollback`)
      .set("Authorization", `Bearer ${fixture.tokens[10]}`)
      .send({ idempotencyKey, expectedCurrentVersion: 1, reason: "Restore" })
      .expect(403);
    expect(fixture.service.rollback).not.toHaveBeenCalled();
  });

  it("returns one locale through Affiliate visibility without internal IDs or Prisma fields", async () => {
    const fixture = createFixture();
    const response = await request(fixture.app)
      .get(`/api/v1/affiliate/announcements/${publicId}?locale=ja`)
      .set("Authorization", `Bearer ${fixture.tokens[8]}`)
      .expect(200);

    expect(response.body.data).toMatchObject({
      publicId,
      locale: "ja",
      title: "お知らせ",
      taskAction: { taskCode: "AFF-PUBLIC-29", label: "Visible task", claimable: true }
    });
    expect(response.body.data).not.toHaveProperty("translations");
    expect(response.body.data).not.toHaveProperty("affiliateTaskId");
    expect(response.body.data).not.toHaveProperty("releaseId");
    expect(response.body.data.taskAction).not.toHaveProperty("id");
    expect(JSON.stringify(response.body.data)).not.toContain("createdBy");
    expect(fixture.service.getPublishedForAffiliate).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 8 }),
      publicId,
      "ja"
    );
  });

  it.each(["zh-CN", "zh-TW", "en", "ja", "ko"])(
    "accepts the canonical public announcement locale %s",
    async (locale) => {
      const fixture = createFixture();
      const response = await request(fixture.app)
        .get(`/api/v1/affiliate/announcements/${publicId}?locale=${encodeURIComponent(locale)}`)
        .set("Authorization", `Bearer ${fixture.tokens[8]}`)
        .expect(200);

      expect(response.body.data.locale).toBe(locale);
      expect(response.body.data).not.toHaveProperty("translations");
      expect(fixture.service.getPublishedForAffiliate).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 8, currentIdentityType: "scout" }),
        publicId,
        locale
      );
    }
  );

  it.each(["zh", "zh_CN", "jp", "en-US"])(
    "rejects announcement locale alias %s at the API boundary",
    async (locale) => {
      const fixture = createFixture();
      await request(fixture.app)
        .get(`/api/v1/affiliate/announcements/${publicId}?locale=${encodeURIComponent(locale)}`)
        .set("Authorization", `Bearer ${fixture.tokens[8]}`)
        .expect(400)
        .expect((response) => expect(response.body.message).toBe("error.content.locale_invalid"));
      expect(fixture.service.getPublishedForAffiliate).not.toHaveBeenCalled();
    }
  );

  it("requires authentication and Affiliate marketplace page permission", async () => {
    const fixture = createFixture();
    await request(fixture.app)
      .get(`/api/v1/affiliate/announcements/${publicId}?locale=ja`)
      .expect(401);
    await request(fixture.app)
      .get(`/api/v1/affiliate/announcements/${publicId}?locale=ja`)
      .set("Authorization", `Bearer ${fixture.tokens[9]}`)
      .expect(403);
    expect(fixture.service.getPublishedForAffiliate).not.toHaveBeenCalled();
  });

  it("requires the active identity to be Affiliate even when the page permission is present", async () => {
    const repository = {
      findPublished: jest.fn(async () => ({
        publicId,
        releaseId: 71,
        version: 1,
        locale: "ja",
        title: "お知らせ",
        summary: null,
        body: "本文",
        visibleFrom: null,
        visibleUntil: null,
        activatedAt: now,
        affiliateTaskId: null
      }))
    };
    const service = new OfficialAnnouncementService(
      repository as never,
      {
        getTask: jest.fn()
      } as never
    );
    const app = createApp(undefined, {
      redisHealthCheck: async () => ({ status: "ok", latencyMs: 1 }),
      testOnlyAllowLegacyAuthAdapters: true,
      authRepository: {
        findUserById: jest.fn(async (id: number) =>
          id === 11
            ? {
                ...createUser(11, ["page:affiliate-marketplace"]),
                identities: [createUser(11, []).identities[0]]
              }
            : null
        )
      },
      authSessionStore: { isAccessTokenBlacklisted: jest.fn(async () => false) },
      otpDeliveryClient: { sendOtp: jest.fn(async () => undefined) },
      officialAnnouncementService: service
    } as never);
    const token = new AuthTokenService(env).issueAccessToken({
      id: 11,
      email: "announcement-11@example.test",
      currentIdentityId: 111
    }).token;

    await request(app)
      .get(`/api/v1/affiliate/announcements/${publicId}?locale=ja`)
      .set("Authorization", `Bearer ${token}`)
      .expect(403)
      .expect((response) =>
        expect(response.body.message).toBe("error.affiliate_profile.identity_required")
      );
    expect(repository.findPublished).not.toHaveBeenCalled();
  });

  it("hides unavailable task actions and excludes internal publication metadata", async () => {
    const fixture = createFixture();
    fixture.service.getPublishedForAffiliate.mockResolvedValueOnce({
      publicId,
      version: 1,
      locale: "ja",
      title: "お知らせ",
      summary: null,
      body: "本文",
      visibleFrom: null,
      visibleUntil: null,
      activatedAt: now,
      taskAction: null
    });

    const response = await request(fixture.app)
      .get(`/api/v1/affiliate/announcements/${publicId}?locale=ja`)
      .set("Authorization", `Bearer ${fixture.tokens[8]}`)
      .expect(200);
    const payload = JSON.stringify(response.body.data);

    expect(response.body.data.taskAction).toBeNull();
    expect(payload).not.toMatch(
      /releaseId|affiliateTaskId|translations|publishedSlotKey|sourceLocale|isInitialCopy|createdBy|updatedBy|publishedBy|disabledBy|userId/
    );
  });
});
