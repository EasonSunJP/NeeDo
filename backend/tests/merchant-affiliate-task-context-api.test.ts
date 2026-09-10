import request from "supertest";
import { createOpenApiDocument } from "../src/api/openapi";
import { createApp } from "../src/app";
import { env } from "../src/config/env";
import { AuthTokenService } from "../src/services/auth-token.service";
import { createDirectShopContextRepository } from "./helpers/merchant-shop-context";

const now = new Date("2026-08-30T02:00:00.000Z");
const readPermission = "page:merchant-affiliate-task";

const permission = (code: string, id: number) => ({
  id,
  name: code,
  code,
  type: "page",
  module: "affiliate",
  description: code,
  isSystem: true,
  createdAt: now,
  updatedAt: now,
  deletedAt: null
});

const createUser = (id: number, permissionCodes: string[]) => {
  const permissions = permissionCodes.map(permission);
  const role = {
    id,
    name: "merchant_owner",
    code: "merchant_owner",
    description: "merchant_owner",
    isSystem: true,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    rolePermissions: permissions.map((item, index) => ({
      id: id * 100 + index,
      roleId: id,
      permissionId: item.id,
      deletedAt: null,
      permission: item
    }))
  };
  return {
    id,
    email: `merchant-${id}@example.test`,
    phone: null,
    passwordHash: "unused",
    username: `merchant-${id}`,
    avatarUrl: null,
    isActive: true,
    lastLoginAt: null,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    identities: [
      {
        id,
        userId: id,
        type: "merchant",
        scopeType: "shop",
        scopeId: 11,
        displayName: "Shibuya Shop",
        isDefault: true,
        isActive: true,
        deletedAt: null
      }
    ],
    userRoles: [
      { id, userId: id, roleId: id, scopeType: "shop", scopeId: 11, deletedAt: null, role }
    ]
  };
};

const createFixture = () => {
  const users = [createUser(7, [readPermission]), createUser(8, [])];
  const merchantAffiliateTaskContextService = {
    listPublishers: jest.fn(async () => ({
      list: [
        {
          publisherType: "shop",
          merchantAccountId: null,
          shopId: 11,
          publicId: "shop0000000011",
          displayName: "Shibuya Shop",
          current: true,
          manageableShopCount: 1
        }
      ],
      total: 1,
      page: 1,
      page_size: 20
    })),
    listShops: jest.fn(async () => ({
      list: [
        {
          shopId: 11,
          publicId: "shop0000000011",
          name: "Shibuya Shop",
          city: "Tokyo",
          activeServiceCount: 1
        }
      ],
      total: 1,
      page: 1,
      page_size: 20
    })),
    listServices: jest.fn(async () => ({
      list: [
        {
          serviceId: 101,
          shopId: 11,
          serviceName: "Aroma 60",
          priceJpy: 8_800,
          shopName: "Shibuya Shop",
          shopPublicId: "shop0000000011"
        }
      ],
      total: 1,
      page: 1,
      page_size: 20
    })),
    previewFee: jest.fn(async () => ({
      evaluatedAt: now,
      effectiveAt: now,
      platformFeeBps: 1_000,
      commissionBudgetNdp: 2_000_000,
      platformFeeReserveNdp: 200_000,
      grossFreezeNdp: 2_200_000,
      shopRateStatus: "consistent"
    })),
    presentTask: jest.fn(async (task) => task),
    presentTaskPage: jest.fn(async (page) => page)
  };
  const app = createApp(undefined, {
    redisHealthCheck: async () => ({ status: "ok", latencyMs: 1 }),
    testOnlyAllowLegacyAuthAdapters: true,
    authRepository: {
      findUserById: jest.fn(async (id: number) => users.find((user) => user.id === id) ?? null)
    },
    authSessionStore: { isAccessTokenBlacklisted: jest.fn(async () => false) },
    otpDeliveryClient: { sendOtp: jest.fn(async () => undefined) },
    merchantShopContextRepository: createDirectShopContextRepository({ shopId: 11 }),
    merchantAffiliateTaskContextService
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

  return { app, merchantAffiliateTaskContextService, tokens };
};

describe("merchant Affiliate task context HTTP API", () => {
  it("exposes four permission-protected resource and fee-preview contracts", async () => {
    const fixture = createFixture();
    const authorization = `Bearer ${fixture.tokens[7]}`;

    await request(fixture.app)
      .get("/api/v1/merchant-admin/affiliate/publishers?page=1&pageSize=20")
      .set("Authorization", authorization)
      .expect(200);
    await request(fixture.app)
      .get(
        "/api/v1/merchant-admin/affiliate/shops?publisherType=merchant_account&merchantAccountId=31&page=1&pageSize=20"
      )
      .set("Authorization", authorization)
      .expect(200);
    await request(fixture.app)
      .get(
        "/api/v1/merchant-admin/affiliate/services?publisherType=merchant_account&merchantAccountId=31&shopIds=11,12&page=1&pageSize=20"
      )
      .set("Authorization", authorization)
      .expect(200);
    const response = await request(fixture.app)
      .post("/api/v1/merchant-admin/affiliate/tasks/fee-preview")
      .set("Authorization", authorization)
      .send({
        publisherType: "merchant_account",
        merchantAccountId: 31,
        shopIds: [11, 12],
        totalBudgetNdp: 2_000_000
      })
      .expect(200);

    expect(response.body.data).toMatchObject({
      platformFeeBps: 1_000,
      commissionBudgetNdp: 2_000_000,
      platformFeeReserveNdp: 200_000,
      grossFreezeNdp: 2_200_000
    });
    expect(fixture.merchantAffiliateTaskContextService.listServices).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 7, currentIdentityScopeId: 11 }),
      {
        publisherType: "merchant_account",
        merchantAccountId: 31,
        shopIds: [11, 12],
        page: 1,
        pageSize: 20
      }
    );
  });

  it("enforces authentication and the merchant Affiliate read permission", async () => {
    const fixture = createFixture();

    await request(fixture.app).get("/api/v1/merchant-admin/affiliate/publishers").expect(401);
    await request(fixture.app)
      .get("/api/v1/merchant-admin/affiliate/publishers")
      .set("Authorization", `Bearer ${fixture.tokens[8]}`)
      .expect(403);
    expect(fixture.merchantAffiliateTaskContextService.listPublishers).not.toHaveBeenCalled();
  });

  it("rejects malformed pagination, comma lists, duplicates, and unknown body keys", async () => {
    const fixture = createFixture();
    const authorization = `Bearer ${fixture.tokens[7]}`;

    await request(fixture.app)
      .get("/api/v1/merchant-admin/affiliate/publishers?pageSize=101")
      .set("Authorization", authorization)
      .expect(400);
    await request(fixture.app)
      .get(
        "/api/v1/merchant-admin/affiliate/services?publisherType=merchant_account&merchantAccountId=31&shopIds=11,,12"
      )
      .set("Authorization", authorization)
      .expect(400);
    await request(fixture.app)
      .get(
        "/api/v1/merchant-admin/affiliate/services?publisherType=merchant_account&merchantAccountId=31&shopIds=11,11"
      )
      .set("Authorization", authorization)
      .expect(400);
    await request(fixture.app)
      .post("/api/v1/merchant-admin/affiliate/tasks/fee-preview")
      .set("Authorization", authorization)
      .send({
        publisherType: "shop",
        shopIds: [11],
        totalBudgetNdp: 2_000_000,
        unknown: true
      })
      .expect(400);

    expect(fixture.merchantAffiliateTaskContextService.listServices).not.toHaveBeenCalled();
    expect(fixture.merchantAffiliateTaskContextService.previewFee).not.toHaveBeenCalled();
  });
});

describe("merchant Affiliate task context OpenAPI", () => {
  it("documents all four runtime paths and the read-only fee contract", () => {
    const document = createOpenApiDocument(env) as {
      paths: Record<string, Record<string, { description?: string }>>;
      components: { schemas: Record<string, unknown> };
    };
    const paths = [
      "/api/v1/merchant-admin/affiliate/publishers",
      "/api/v1/merchant-admin/affiliate/shops",
      "/api/v1/merchant-admin/affiliate/services",
      "/api/v1/merchant-admin/affiliate/tasks/fee-preview"
    ];

    expect(paths.every((path) => document.paths[path])).toBe(true);
    expect(document.components.schemas).toHaveProperty("MerchantAffiliatePublisherOption");
    expect(document.components.schemas).toHaveProperty("MerchantAffiliateShopOption");
    expect(document.components.schemas).toHaveProperty("MerchantAffiliateServiceOption");
    expect(document.components.schemas).toHaveProperty("MerchantAffiliateFeePreview");
    expect(document.paths[paths[3]].post.description).toMatch(/no wallet|does not mutate/i);
  });
});
