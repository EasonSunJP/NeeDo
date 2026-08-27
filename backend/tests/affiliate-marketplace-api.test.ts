import request from "supertest";
import { createApp } from "../src/app";
import { env } from "../src/config/env";
import { AuthTokenService } from "../src/services/auth-token.service";

const now = new Date("2026-09-05T00:00:00.000Z");
const publicToken = `${"A".repeat(24)}.${"B".repeat(43)}`;
const publicTask = {
  id: 22,
  taskCode: "AFF-PUBLIC-22",
  name: "Shibuya completed-service reward",
  description: "Earn after the referred service is completed.",
  coverMediaAssetId: null,
  rewardNdpPerCompletedOrder: 1_000,
  customerDiscountType: "fixed_jpy",
  fixedDiscountJpy: 500,
  discountRateBps: 0,
  discountCapJpy: 0,
  minimumOrderAmountJpy: 5_000,
  claimStartsAt: new Date("2026-09-01T00:00:00.000Z"),
  claimEndsAt: new Date("2026-09-20T00:00:00.000Z"),
  taskStartsAt: new Date("2026-09-10T00:00:00.000Z"),
  taskEndsAt: new Date("2026-09-30T00:00:00.000Z"),
  attributionWindowDays: 30,
  maxCompletedOrdersPerClaim: 20,
  maxCompletedOrdersPerCustomer: 1,
  status: "scheduled",
  claimable: true,
  shops: [{ id: 1, shopId: 11, shopNameSnapshot: "Shibuya Relax" }],
  services: [
    {
      id: 2,
      shopId: 11,
      serviceId: 101,
      serviceNameSnapshot: "Aroma 60",
      servicePriceJpySnapshot: 8_000
    }
  ],
  createdAt: now,
  updatedAt: now
};
const claim = {
  id: 5,
  taskId: publicTask.id,
  publicCode: "NDO-7K4M9X2P8Q",
  promotionUrl: `https://app.needo.test/afirieito/r/${publicToken}`,
  status: "active",
  claimedAt: now,
  expiresAt: publicTask.taskEndsAt,
  clickCount: 0,
  codeUseCount: 0,
  attributedOrderCount: 0,
  completedOrderCount: 0,
  settledRewardNdp: 0,
  task: publicTask
};

const permission = (code: string, id: number) => ({
  id,
  name: code,
  code,
  type: code.startsWith("page:") ? "page" : "button",
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
    name: `affiliate_user_${id}`,
    code: `affiliate_user_${id}`,
    description: "Affiliate marketplace test user",
    isSystem: true,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    rolePermissions: permissions.map((item, index) => ({
      id: index + 1,
      roleId: id,
      permissionId: item.id,
      deletedAt: null,
      permission: item
    }))
  };
  return {
    id,
    email: `affiliate-${id}@example.test`,
    phone: null,
    passwordHash: "unused",
    username: `affiliate-${id}`,
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
        type: "customer",
        scopeType: "global",
        scopeId: null,
        displayName: `Affiliate ${id}`,
        isDefault: true,
        isActive: true,
        deletedAt: null
      }
    ],
    userRoles: [
      {
        id,
        userId: id,
        roleId: id,
        scopeType: "global",
        scopeId: null,
        deletedAt: null,
        role
      }
    ]
  };
};

const createFixture = () => {
  const users = [
    createUser(7, [
      "page:affiliate-marketplace",
      "button:affiliate-claim",
      "booking:create"
    ]),
    createUser(8, ["page:affiliate-marketplace"]),
    createUser(9, ["button:affiliate-claim"])
  ];
  const affiliateMarketplaceService = {
    listTasks: jest.fn(async () => ({
      list: [publicTask],
      total: 1,
      page: 1,
      page_size: 20
    })),
    getTask: jest.fn(async () => publicTask),
    claimTask: jest
      .fn()
      .mockResolvedValueOnce({ created: true, claim })
      .mockResolvedValueOnce({ created: false, claim }),
    listMyClaims: jest.fn(async () => ({
      list: [claim],
      total: 1,
      page: 1,
      page_size: 20
    })),
    getMyClaim: jest.fn(async () => claim),
    resolveLink: jest.fn(async () => ({
      claimId: claim.id,
      publicCode: claim.publicCode,
      expiresAt: claim.expiresAt,
      task: publicTask
    }))
  };
  const affiliateCheckoutService = {
    validateCode: jest.fn(async () => ({
      taskId: publicTask.id,
      publicCode: claim.publicCode,
      source: "code",
      originalPriceJpy: 8_000,
      customerDiscountJpy: 500,
      finalPriceJpy: 7_500,
      rewardAllocatedNdp: 1_000,
      taskStartsAt: publicTask.taskStartsAt,
      taskEndsAt: publicTask.taskEndsAt
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
    affiliateMarketplaceService,
    affiliateCheckoutService
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
  return { app, affiliateMarketplaceService, affiliateCheckoutService, tokens };
};

describe("affiliate marketplace HTTP API", () => {
  it("lists public tasks and the current user's claims behind read permission", async () => {
    const fixture = createFixture();
    const authorization = `Bearer ${fixture.tokens[7]}`;

    await request(fixture.app)
      .get("/api/v1/affiliate/tasks?page=1&pageSize=20&keyword=Shibuya&shopId=11")
      .set("Authorization", authorization)
      .expect(200)
      .expect((response) => {
        expect(response.body).toMatchObject({
          code: 0,
          message: "success",
          data: { total: 1, page: 1, page_size: 20 }
        });
        expect(response.body.data.list[0]).not.toHaveProperty("publisherShopId");
        expect(response.body.data.list[0]).not.toHaveProperty("budgetReservation");
      });
    expect(fixture.affiliateMarketplaceService.listTasks).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 7 }),
      expect.objectContaining({ page: 1, pageSize: 20, keyword: "Shibuya", shopId: 11 })
    );

    await request(fixture.app)
      .get(`/api/v1/affiliate/tasks/${publicTask.id}`)
      .set("Authorization", authorization)
      .expect(200);
    await request(fixture.app)
      .get("/api/v1/affiliate/claims?status=active&page=1&pageSize=20")
      .set("Authorization", authorization)
      .expect(200);
    await request(fixture.app)
      .get(`/api/v1/affiliate/claims/${claim.id}`)
      .set("Authorization", authorization)
      .expect(200);
  });

  it("returns 201 for the first claim and 200 for an idempotent duplicate", async () => {
    const fixture = createFixture();
    const authorization = `Bearer ${fixture.tokens[7]}`;

    const first = await request(fixture.app)
      .post(`/api/v1/affiliate/tasks/${publicTask.id}/claims`)
      .set("Authorization", authorization)
      .send({})
      .expect(201);
    const duplicate = await request(fixture.app)
      .post(`/api/v1/affiliate/tasks/${publicTask.id}/claims`)
      .set("Authorization", authorization)
      .send({})
      .expect(200);

    expect(first.body.data.publicCode).toBe(claim.publicCode);
    expect(duplicate.body.data.id).toBe(first.body.data.id);
    expect(fixture.affiliateMarketplaceService.claimTask).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ userId: 7 }),
      publicTask.id
    );
  });

  it("prevalidates a code for the authenticated customer without allocating it", async () => {
    const fixture = createFixture();

    const response = await request(fixture.app)
      .post("/api/v1/affiliate/codes/validate")
      .set("Authorization", `Bearer ${fixture.tokens[7]}`)
      .send({ publicCode: claim.publicCode, scheduleSlotId: 1201 })
      .expect(200);

    expect(response.body.data).toMatchObject({
      taskId: publicTask.id,
      publicCode: claim.publicCode,
      originalPriceJpy: 8_000,
      customerDiscountJpy: 500,
      finalPriceJpy: 7_500,
      rewardAllocatedNdp: 1_000
    });
    expect(fixture.affiliateCheckoutService.validateCode).toHaveBeenCalledWith({
      customerUserId: 7,
      publicCode: claim.publicCode,
      scheduleSlotId: 1201
    });
  });

  it("protects code validation with booking permission and strict input", async () => {
    const fixture = createFixture();

    await request(fixture.app)
      .post("/api/v1/affiliate/codes/validate")
      .send({ publicCode: claim.publicCode, scheduleSlotId: 1201 })
      .expect(401);
    await request(fixture.app)
      .post("/api/v1/affiliate/codes/validate")
      .set("Authorization", `Bearer ${fixture.tokens[8]}`)
      .send({ publicCode: claim.publicCode, scheduleSlotId: 1201 })
      .expect(403);
    await request(fixture.app)
      .post("/api/v1/affiliate/codes/validate")
      .set("Authorization", `Bearer ${fixture.tokens[7]}`)
      .send({ publicCode: claim.publicCode, scheduleSlotId: 1201, customerUserId: 999 })
      .expect(400);
    expect(fixture.affiliateCheckoutService.validateCode).not.toHaveBeenCalled();
  });

  it("enforces authentication, distinct read/claim permissions, and strict validation", async () => {
    const fixture = createFixture();

    await request(fixture.app).get("/api/v1/affiliate/tasks").expect(401);
    await request(fixture.app)
      .post(`/api/v1/affiliate/tasks/${publicTask.id}/claims`)
      .set("Authorization", `Bearer ${fixture.tokens[8]}`)
      .send({})
      .expect(403);
    await request(fixture.app)
      .get("/api/v1/affiliate/tasks")
      .set("Authorization", `Bearer ${fixture.tokens[9]}`)
      .expect(403);
    await request(fixture.app)
      .post(`/api/v1/affiliate/tasks/${publicTask.id}/claims`)
      .set("Authorization", `Bearer ${fixture.tokens[7]}`)
      .send({ unexpected: true })
      .expect(400);
    await request(fixture.app)
      .get("/api/v1/affiliate/tasks?page=0")
      .set("Authorization", `Bearer ${fixture.tokens[7]}`)
      .expect(400);
    await request(fixture.app)
      .get("/api/v1/affiliate/claims/not-an-id")
      .set("Authorization", `Bearer ${fixture.tokens[7]}`)
      .expect(400);
  });

  it("resolves a well-formed signed token without authentication", async () => {
    const fixture = createFixture();

    await request(fixture.app)
      .get(`/api/v1/affiliate/resolve/${publicToken}`)
      .expect(200)
      .expect((response) => {
        expect(response.body.data).toMatchObject({
          claimId: claim.id,
          publicCode: claim.publicCode,
          task: { id: publicTask.id }
        });
        expect(response.body.data).not.toHaveProperty("userId");
      });
    expect(fixture.affiliateMarketplaceService.resolveLink).toHaveBeenCalledWith(publicToken);

    await request(fixture.app)
      .get("/api/v1/affiliate/resolve/not-a-token")
      .expect(400);
  });
});
