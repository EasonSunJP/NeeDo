import request from "supertest";
import { createApp } from "../src/app";
import { env } from "../src/config/env";
import { AuthTokenService } from "../src/services/auth-token.service";
import { createDirectShopContextRepository } from "./helpers/merchant-shop-context";

const now = new Date("2026-09-05T00:00:00.000Z");
const publicId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const noticeTranslations = {
  "zh-CN": { title: "营业时间变更", summary: "通知", blocks: [{ id: "p-zh-cn", type: "paragraph", content: "正文" }] },
  "zh-TW": { title: "營業時間變更", summary: "通知", blocks: [{ id: "p-zh-tw", type: "paragraph", content: "正文" }] },
  en: { title: "Hours changed", summary: "Notice", blocks: [{ id: "p-en", type: "paragraph", content: "Body" }] },
  ja: { title: "営業時間変更", summary: "お知らせ", blocks: [{ id: "p-ja", type: "paragraph", content: "本文" }] },
  ko: { title: "영업시간 변경", summary: "알림", blocks: [{ id: "p-ko", type: "paragraph", content: "본문" }] }
};
const notice = {
  publicId,
  level: "important",
  status: "scheduled",
  sourceLocale: "ja",
  targetSummary: "本店の従業員",
  scheduledAt: now,
  sentAt: null,
  cancelledAt: null,
  archivedAt: null,
  lockVersion: 1,
  translations: {},
  audienceCount: 2,
  delivery: { pending: 2, delivered: 0, failed: 0, read: 0 },
  createdAt: now,
  updatedAt: now
};

const merchantUser = {
  id: 7,
  email: "merchant-notice@example.test",
  phone: null,
  passwordHash: "unused",
  username: "Merchant Notice",
  avatarUrl: null,
  isActive: true,
  lastLoginAt: null,
  createdAt: now,
  updatedAt: now,
  deletedAt: null,
  identities: [
    {
      id: 17,
      userId: 7,
      type: "merchant_owner",
      scopeType: "shop",
      scopeId: 11,
      displayName: "Merchant Notice",
      isDefault: true,
      isActive: true,
      deletedAt: null
    }
  ],
  userRoles: [
    {
      deletedAt: null,
      role: {
        code: "merchant_owner",
        deletedAt: null,
        rolePermissions: ["read", "create", "review", "send"].map((action) => ({
          deletedAt: null,
          permission: {
            code: `merchant-admin:notice:${action}`,
            type: "api",
            deletedAt: null
          }
        }))
      }
    }
  ]
};

const operationsUser = {
  ...merchantUser,
  id: 8,
  email: "merchant-notice-ops@example.test",
  identities: [{ ...merchantUser.identities[0], id: 18, userId: 8, type: "platform_admin", scopeType: "global", scopeId: null }],
  userRoles: [{
    deletedAt: null,
    role: {
      code: "admin",
      deletedAt: null,
      rolePermissions: [{
        deletedAt: null,
        permission: { code: "backoffice:merchant-accounts:read", type: "api", deletedAt: null }
      }]
    }
  }]
};

const createFixture = (user: typeof merchantUser | typeof operationsUser = merchantUser) => {
  const service = {
    createAndPlanMerchant: jest.fn(async () => notice),
    listMerchant: jest.fn(async () => ({ list: [notice], total: 1, page: 1, page_size: 20 })),
    cancelMerchant: jest.fn(async () => ({ ...notice, status: "cancelled" })),
    archiveMerchant: jest.fn(async () => ({ ...notice, status: "archived" })),
    retryMerchantFailures: jest.fn(async () => notice)
  };
  const app = createApp(undefined, {
    redisHealthCheck: async () => ({ status: "ok", latencyMs: 1 }),
    testOnlyAllowLegacyAuthAdapters: true,
    authRepository: { findUserById: jest.fn(async () => user) },
    authSessionStore: { isAccessTokenBlacklisted: jest.fn(async () => false) },
    otpDeliveryClient: { sendOtp: jest.fn(async () => undefined) },
    merchantShopContextRepository: createDirectShopContextRepository(),
    officialNoticeService: service
  } as never);
  const token = new AuthTokenService(env).issueAccessToken({
    id: user.id,
    email: user.email,
    currentIdentityId: user.identities[0].id
  }).token;
  return { app, service, token };
};

describe("merchant notice HTTP API", () => {
  it("publishes only a strict server-derived shop audience", async () => {
    const fixture = createFixture();
    const body = {
      sourceLocale: "ja",
      level: "important",
      translations: noticeTranslations,
      audience: { type: "shop_employees" },
      sendMode: "now",
      scheduledAt: null,
      idempotencyKey: "merchant-notice-create"
    };

    await request(fixture.app)
      .post("/api/v1/merchant-admin/official-notices")
      .set("Authorization", `Bearer ${fixture.token}`)
      .send(body)
      .expect(201);
    expect(fixture.service.createAndPlanMerchant).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 7, currentIdentityId: 17 }),
      expect.any(Object),
      expect.objectContaining({ audience: { type: "shop_employees" } })
    );

    await request(fixture.app)
      .post("/api/v1/merchant-admin/official-notices")
      .set("Authorization", `Bearer ${fixture.token}`)
      .send({ ...body, audience: { type: "all" }, shopId: 11 })
      .expect(400);
  });

  it("lists and manages only through merchant-scoped service methods", async () => {
    const fixture = createFixture();
    const lifecycle = {
      expectedLockVersion: 1,
      reason: "merchant request",
      idempotencyKey: "merchant-notice-lifecycle"
    };
    await request(fixture.app)
      .get("/api/v1/merchant-admin/official-notices?page=1&pageSize=20")
      .set("Authorization", `Bearer ${fixture.token}`)
      .expect(200);
    await request(fixture.app)
      .post(`/api/v1/merchant-admin/official-notices/${publicId}/cancel`)
      .set("Authorization", `Bearer ${fixture.token}`)
      .send(lifecycle)
      .expect(200);
    await request(fixture.app)
      .post(`/api/v1/merchant-admin/official-notices/${publicId}/archive`)
      .set("Authorization", `Bearer ${fixture.token}`)
      .send(lifecycle)
      .expect(200);
    await request(fixture.app)
      .post(`/api/v1/merchant-admin/official-notices/${publicId}/retry-failures`)
      .set("Authorization", `Bearer ${fixture.token}`)
      .send(lifecycle)
      .expect(200);

    expect(fixture.service.listMerchant).toHaveBeenCalled();
    expect(fixture.service.cancelMerchant).toHaveBeenCalled();
    expect(fixture.service.archiveMerchant).toHaveBeenCalled();
    expect(fixture.service.retryMerchantFailures).toHaveBeenCalled();
  });

  it("allows operations preview to list one shop but keeps every write read-only", async () => {
    const fixture = createFixture(operationsUser);
    await request(fixture.app)
      .get("/api/v1/merchant-admin/official-notices?page=1&pageSize=20")
      .set("Authorization", `Bearer ${fixture.token}`)
      .set("X-NeeDo-Merchant-Preview-Shop-Id", "22")
      .expect(200);
    expect(fixture.service.listMerchant).toHaveBeenCalledWith(
      expect.objectContaining({ isReadOnlyMerchantPreview: true, merchantPreviewShopId: 22 }),
      expect.any(Object)
    );

    await request(fixture.app)
      .post("/api/v1/merchant-admin/official-notices")
      .set("Authorization", `Bearer ${fixture.token}`)
      .set("X-NeeDo-Merchant-Preview-Shop-Id", "22")
      .send({})
      .expect(403);
    expect(fixture.service.createAndPlanMerchant).not.toHaveBeenCalled();
  });
});
