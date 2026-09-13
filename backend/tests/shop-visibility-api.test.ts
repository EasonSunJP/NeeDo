import request from "supertest";
import { createApp } from "../src/app";
import { env } from "../src/config/env";
import { AuthTokenService } from "../src/services/auth-token.service";
import { createDirectShopContextRepository } from "./helpers/merchant-shop-context";

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
    identities: [
      {
        id: 70,
        userId: 7,
        type: "merchant_owner",
        scopeType: "shop",
        scopeId: 16,
        displayName: "Merchant",
        isDefault: true,
        isActive: true,
        deletedAt: null
      }
    ],
    identityApplications: [],
    userRoles: [
      {
        deletedAt: null,
        role: {
          code: "merchant_owner",
          deletedAt: null,
          rolePermissions: permissions.map((code) => ({
            deletedAt: null,
            permission: { code, type: "api", deletedAt: null }
          }))
        }
      }
    ]
  };
  const repository = {
    buildVisibilityWhere: jest.fn(async () => ({ visibility: "public" })),
    canView: jest.fn(async () => true),
    canViewTarget: jest.fn(async () => true),
    findVisibility: jest.fn(async () => ({
      shopId: 16,
      visibility: "public" as const,
      updatedAt: null,
      updatedBy: null
    })),
    updateVisibility: jest.fn(async (input) => ({
      shopId: input.shopId,
      visibility: input.visibility,
      updatedAt: input.updatedAt,
      updatedBy: input.actorUserId
    }))
  };
  const app = createApp(env, {
    redisHealthCheck: async () => ({ status: "ok", latencyMs: 0 }),
    testOnlyAllowLegacyAuthAdapters: true,
    authRepository: { findUserById: jest.fn(async () => user) },
    authSessionStore: { isAccessTokenBlacklisted: jest.fn(async () => false) },
    otpDeliveryClient: { sendOtp: jest.fn(async () => undefined) },
    merchantShopContextRepository: createDirectShopContextRepository({ shopId: 16 }),
    shopVisibilityRepository: repository
  } as never);
  const token = new AuthTokenService(env).issueAccessToken({
    id: 7,
    email: user.email,
    currentIdentityId: 70
  }).token;
  return { app, repository, token };
};

describe("merchant shop visibility HTTP API", () => {
  it("reads and atomically updates the selected shop visibility", async () => {
    const fixture = createFixture();

    await request(fixture.app)
      .get("/api/v1/merchant-admin/shops/16/visibility")
      .set("Authorization", `Bearer ${fixture.token}`)
      .expect(200)
      .expect(({ body }) => expect(body.data.visibility).toBe("public"));

    await request(fixture.app)
      .put("/api/v1/merchant-admin/shops/16/visibility")
      .set("Authorization", `Bearer ${fixture.token}`)
      .send({ visibility: "network" })
      .expect(200)
      .expect(({ body }) => expect(body.data.visibility).toBe("network"));

    expect(fixture.repository.updateVisibility).toHaveBeenCalledWith(
      expect.objectContaining({
        shopId: 16,
        visibility: "network",
        actorUserId: 7,
        auditLog: expect.objectContaining({
          action: "merchant_admin.shop.visibility.update",
          targetType: "shop",
          targetId: 16
        })
      })
    );
  });

  it("rejects missing auth, invalid enum values, and cross-shop scope", async () => {
    const fixture = createFixture();

    await request(fixture.app)
      .get("/api/v1/merchant-admin/shops/16/visibility")
      .expect(401);
    await request(fixture.app)
      .put("/api/v1/merchant-admin/shops/16/visibility")
      .set("Authorization", `Bearer ${fixture.token}`)
      .send({ visibility: "friendsOnly" })
      .expect(400);
    await request(fixture.app)
      .get("/api/v1/merchant-admin/shops/17/visibility")
      .set("Authorization", `Bearer ${fixture.token}`)
      .expect(403);

    expect(fixture.repository.updateVisibility).not.toHaveBeenCalled();
  });
});
