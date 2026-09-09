import request from "supertest";
import { createApp } from "../src/app";
import { env } from "../src/config/env";
import { AuthTokenService } from "../src/services/auth-token.service";

const content = {
  storeName: "日本語店名",
  description: "説明",
  address: "東京都港区",
  area: "港区",
  rankLabel: "おすすめ",
  businessHours: "11:00-23:00",
  subtitle: "すぐ予約可能",
  station: "麻布十番駅",
  distance: "徒歩3分",
  parking: "近隣駐車場",
  routeGuide: "A9出口",
  paymentMethods: ["Visa"],
  equipment: ["個室"],
  carousel: [{ mediaAssetPublicId: "a".repeat(64), altText: "店舗" }],
  serviceMenus: []
};

const createFixture = () => {
  const permissions = ["merchant-admin:shop:read", "merchant-admin:shop:write"];
  const user = {
    id: 7,
    email: "merchant@example.test",
    phone: null,
    passwordHash: "unused",
    username: "Merchant",
    avatarUrl: null,
    isActive: true,
    lastLoginAt: null,
    deletedAt: null,
    identities: [{ id: 70, userId: 7, type: "merchant_owner", scopeType: "shop", scopeId: 16, displayName: "Merchant", isDefault: true, isActive: true, deletedAt: null }],
    identityApplications: [],
    userRoles: [{ deletedAt: null, role: { code: "merchant_owner", deletedAt: null, rolePermissions: permissions.map((code) => ({ deletedAt: null, permission: { code, type: "api", deletedAt: null } })) } }]
  };
  const localePayload = { locale: "ja", lockVersion: 1, content, updatedAt: "2026-09-10T00:00:00.000Z" };
  const service = {
    getWorkspace: jest.fn(async () => ({ shopId: 16, locales: { ja: localePayload }, media: {}, services: [] })),
    updateLocale: jest.fn(async () => ({ ...localePayload, lockVersion: 2 })),
    uploadMedia: jest.fn(async () => ({ publicId: "a".repeat(64), mediaAssetId: 101, url: "/media/content/a.png", mimeType: "image/png", width: null, height: null, checksumSha256: "a".repeat(64) }))
  };
  const app = createApp(env, {
    redisHealthCheck: async () => ({ status: "ok", latencyMs: 0 }),
    testOnlyAllowLegacyAuthAdapters: true,
    authRepository: { findUserById: jest.fn(async () => user) },
    authSessionStore: { isAccessTokenBlacklisted: jest.fn(async () => false) },
    otpDeliveryClient: { sendOtp: jest.fn(async () => undefined) },
    merchantShopContextRepository: {
      listManageableShops: jest.fn(async ({ page, pageSize }: { page: number; pageSize: number }) => ({
        list: [{ publicId: "shop0000000016", name: "Authenticated shop", city: "Tokyo", status: "published", selected: true }],
        total: 1,
        page,
        page_size: pageSize
      })),
      resolveShop: jest.fn(),
      resolveDefaultShop: jest.fn()
    },
    shopPresentationService: service
  } as never);
  const token = new AuthTokenService(env).issueAccessToken({ id: 7, email: user.email, currentIdentityId: 70 }).token;
  return { app, service, token };
};

describe("merchant shop presentation HTTP API", () => {
  it("reads and updates a single locale under merchant shop permissions", async () => {
    const fixture = createFixture();
    await request(fixture.app).get("/api/v1/merchant-admin/shop/presentation").set("Authorization", `Bearer ${fixture.token}`).expect(200);
    await request(fixture.app)
      .put("/api/v1/merchant-admin/shop/presentation/locales/ja")
      .set("Authorization", `Bearer ${fixture.token}`)
      .send({ expectedLockVersion: 1, content })
      .expect(200)
      .expect(({ body }) => expect(body.data.lockVersion).toBe(2));
    expect(fixture.service.updateLocale).toHaveBeenCalledWith(expect.objectContaining({ userId: 7, currentIdentityId: 70 }), expect.any(Object), "ja", { expectedLockVersion: 1, content });
  });

  it("uploads raw carousel bytes after auth and query validation", async () => {
    const fixture = createFixture();
    const bytes = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from("shop")]);
    await request(fixture.app)
      .post("/api/v1/merchant-admin/shop/presentation/media?alt_text=Store")
      .set("Authorization", `Bearer ${fixture.token}`)
      .set("Content-Type", "image/png")
      .send(bytes)
      .expect(201)
      .expect(({ body }) => expect(body.data.publicId).toBe("a".repeat(64)));
    expect(fixture.service.uploadMedia).toHaveBeenCalledWith(expect.objectContaining({ userId: 7 }), expect.any(Object), expect.objectContaining({ bytes, mimeType: "image/png", altText: "Store" }));
  });
});
