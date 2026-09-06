import request from "supertest";
import { createApp } from "../src/app";
import { env } from "../src/config/env";
import { AuthTokenService } from "../src/services/auth-token.service";

const now = new Date("2026-09-02T12:00:00.000Z");
const publicId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const idempotencyKey = "11111111-1111-4111-8111-111111111111";
const noticeTranslations = {
  "zh-CN": { title: "维护通知", summary: "服务维护", blocks: [{ id: "paragraph-zh-cn", type: "paragraph", content: "正文" }] },
  "zh-TW": { title: "維護通知", summary: "服務維護", blocks: [{ id: "paragraph-zh-tw", type: "paragraph", content: "正文" }] },
  en: { title: "Maintenance", summary: "Service maintenance", blocks: [{ id: "paragraph-en", type: "paragraph", content: "Body" }] },
  ja: { title: "メンテナンス", summary: "サービス保守", blocks: [{ id: "paragraph-ja", type: "paragraph", content: "本文" }] },
  ko: { title: "유지 보수", summary: "서비스 점검", blocks: [{ id: "paragraph-ko", type: "paragraph", content: "본문" }] }
};
const draftTranslations = {
  "zh-CN": { title: "", summary: "", blocks: [], isInitialCopy: true },
  "zh-TW": { title: "", summary: "", blocks: [], isInitialCopy: true },
  en: { title: "", summary: "", blocks: [], isInitialCopy: true },
  ja: { title: "編集中", summary: "", blocks: [], isInitialCopy: false },
  ko: { title: "", summary: "", blocks: [], isInitialCopy: true }
};

const notice = {
  publicId,
  level: "important",
  status: "sent",
  sourceLocale: "zh-CN",
  targetSummary: "用户端",
  scheduledAt: now,
  sentAt: now,
  cancelledAt: null,
  archivedAt: null,
  lockVersion: 2,
  translations: {},
  audienceCount: 1,
  delivery: { pending: 0, delivered: 1, failed: 0, read: 0 },
  createdAt: now,
  updatedAt: now
};

const createUser = (id: number, type: string, permissions: string[]) => ({
  id,
  email: `official-notice-${id}@example.test`,
  phone: null,
  passwordHash: "unused",
  username: `Official Notice ${id}`,
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
      type,
      scopeType: "global",
      scopeId: null,
      displayName: `Official Notice ${id}`,
      isDefault: true,
      isActive: true,
      deletedAt: null
    }
  ],
  userRoles: [
    {
      deletedAt: null,
      role: {
        code: type === "customer" ? "customer" : "operator",
        deletedAt: null,
        rolePermissions: permissions.map((code) => ({
          deletedAt: null,
          permission: { code, type: code.startsWith("page:") ? "page" : "button", deletedAt: null }
        }))
      }
    }
  ]
});

const createFixture = () => {
  const users = [
    createUser(7, "platform", [
      "page:backoffice-official-notice",
      "button:backoffice-official-notice-create",
      "button:backoffice-official-notice-review",
      "button:backoffice-official-notice-send"
    ]),
    createUser(8, "platform", ["page:backoffice-official-notice"]),
    createUser(9, "customer", []),
    createUser(10, "platform", [
      "page:backoffice-official-notice",
      "button:backoffice-official-notice-create"
    ])
  ];
  const service = {
    createDraft: jest.fn(async () => ({ ...notice, status: "draft", scheduledAt: null })),
    getDraft: jest.fn(async () => ({ ...notice, status: "draft", scheduledAt: null })),
    updateDraft: jest.fn(async () => ({ ...notice, status: "draft", scheduledAt: null, lockVersion: 2 })),
    planDraft: jest.fn(async () => ({ ...notice, status: "sent" })),
    createAndPlan: jest.fn(async () => notice),
    listBackoffice: jest.fn(async () => ({ list: [notice], total: 1, page: 1, page_size: 20 })),
    cancel: jest.fn(async () => ({ ...notice, status: "cancelled" })),
    archive: jest.fn(async () => ({ ...notice, status: "archived" })),
    retryFailures: jest.fn(async () => ({ ...notice, status: "scheduled" })),
    listMine: jest.fn(async () => ({
      list: [
        {
          publicId,
          level: "important",
          title: "维护通知",
          summary: "服务维护",
          blocks: [{ id: "paragraph-1", type: "paragraph", content: "正文" }],
          targetSummary: "用户端",
          sentAt: now,
          readAt: null
        }
      ],
      total: 1,
      page: 1,
      page_size: 20
    })),
    markRead: jest.fn(async () => ({ publicId, readAt: now }))
  };
  const app = createApp(undefined, {
    redisHealthCheck: async () => ({ status: "ok", latencyMs: 1 }),
    testOnlyAllowLegacyAuthAdapters: true,
    authRepository: {
      findUserById: jest.fn(async (id: number) => users.find((user) => user.id === id) ?? null)
    },
    authSessionStore: { isAccessTokenBlacklisted: jest.fn(async () => false) },
    otpDeliveryClient: { sendOtp: jest.fn(async () => undefined) },
    officialNoticeService: service
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

describe("official notice HTTP API", () => {
  it("lets creators save and continue drafts without granting send permission", async () => {
    const fixture = createFixture();
    const draftBody = {
      sourceLocale: "ja",
      level: "general",
      translations: draftTranslations,
      audience: { type: "all" },
      idempotencyKey: "draft-api-create"
    };

    await request(fixture.app)
      .post("/api/v1/backoffice/official-notices/drafts")
      .set("Authorization", `Bearer ${fixture.tokens[10]}`)
      .send(draftBody)
      .expect(201);
    await request(fixture.app)
      .get(`/api/v1/backoffice/official-notices/${publicId}`)
      .set("Authorization", `Bearer ${fixture.tokens[8]}`)
      .expect(200);
    await request(fixture.app)
      .put(`/api/v1/backoffice/official-notices/${publicId}/draft`)
      .set("Authorization", `Bearer ${fixture.tokens[10]}`)
      .send({
        ...draftBody,
        expectedLockVersion: 1,
        idempotencyKey: "draft-api-update"
      })
      .expect(200);
    await request(fixture.app)
      .post(`/api/v1/backoffice/official-notices/${publicId}/plan`)
      .set("Authorization", `Bearer ${fixture.tokens[10]}`)
      .send({
        expectedLockVersion: 2,
        sendMode: "now",
        scheduledAt: null,
        idempotencyKey: "draft-api-plan"
      })
      .expect(403);

    expect(fixture.service.createDraft).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 10 }),
      expect.any(Object),
      expect.objectContaining({ translations: draftTranslations })
    );
    expect(fixture.service.getDraft).toHaveBeenCalledWith(expect.objectContaining({ userId: 8 }), publicId);
    expect(fixture.service.updateDraft).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 10 }),
      expect.any(Object),
      publicId,
      expect.objectContaining({ expectedLockVersion: 1 })
    );
    expect(fixture.service.planDraft).not.toHaveBeenCalled();
  });

  it("creates an immediate formal notice with the dedicated create permission", async () => {
    const fixture = createFixture();
    await request(fixture.app)
      .post("/api/v1/backoffice/official-notices")
      .set("Authorization", `Bearer ${fixture.tokens[7]}`)
      .set("User-Agent", "official-notice-api-test")
      .send({
        sourceLocale: "zh-CN",
        level: "important",
        translations: noticeTranslations,
        audience: { type: "identity_types", identityTypes: ["customer"] },
        sendMode: "now",
        scheduledAt: null,
        idempotencyKey
      })
      .expect(201)
      .expect((response) => expect(response.body.data.publicId).toBe(publicId));

    expect(fixture.service.createAndPlan).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 7 }),
      expect.objectContaining({ userAgent: "official-notice-api-test" }),
      expect.objectContaining({ audience: { type: "identity_types", identityTypes: ["customer"] } })
    );
  });

  it("separates backoffice read/create permissions and validates persisted media URLs", async () => {
    const fixture = createFixture();
    await request(fixture.app)
      .get("/api/v1/backoffice/official-notices?page=1&pageSize=20")
      .set("Authorization", `Bearer ${fixture.tokens[8]}`)
      .expect(200);
    await request(fixture.app)
      .post("/api/v1/backoffice/official-notices")
      .set("Authorization", `Bearer ${fixture.tokens[8]}`)
      .send({
        sourceLocale: "zh-CN",
        level: "general",
        translations: {
          ...noticeTranslations,
          "zh-CN": {
            title: "通知",
            summary: "摘要",
            blocks: [{ id: "image-1", type: "image", content: "data:image/png;base64,AA==" }]
          }
        },
        audience: { type: "all" },
        sendMode: "now",
        scheduledAt: null,
        idempotencyKey
      })
      .expect(403);
  });

  it("returns and marks notices only through the authenticated current identity", async () => {
    const fixture = createFixture();
    await request(fixture.app)
      .get("/api/v1/official-notices?locale=ja&unreadOnly=true&page=1&pageSize=20")
      .set("Authorization", `Bearer ${fixture.tokens[9]}`)
      .expect(200)
      .expect((response) => expect(response.body.data.list[0].title).toBe("维护通知"));
    await request(fixture.app)
      .post(`/api/v1/official-notices/${publicId}/read`)
      .set("Authorization", `Bearer ${fixture.tokens[9]}`)
      .send({})
      .expect(200);
    expect(fixture.service.listMine).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 9, currentIdentityId: 109 }),
      expect.objectContaining({ locale: "ja", unreadOnly: true })
    );
    expect(fixture.service.markRead).toHaveBeenCalledWith(
      expect.objectContaining({ currentIdentityId: 109 }),
      expect.any(Object),
      publicId
    );
  });
});
