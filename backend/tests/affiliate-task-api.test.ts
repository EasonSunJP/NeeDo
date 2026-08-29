import request from "supertest";
import { createOpenApiDocument } from "../src/api/openapi";
import { createApp } from "../src/app";
import { env } from "../src/config/env";
import { AuthTokenService } from "../src/services/auth-token.service";

const now = new Date("2026-08-26T00:00:00.000Z");
const task = {
  id: 81,
  taskCode: "AFF-TEST-81",
  lineageKey: "AFF-TEST-81",
  version: 1,
  lockVersion: 2,
  publisherType: "shop",
  publisherMerchantAccountId: null,
  publisherShopId: 11,
  translations: Object.fromEntries(
    ["zh-CN", "zh-TW", "en", "ja", "ko"].map((locale) => [
      locale,
      {
        name: "Shibuya completed-service campaign",
        description: "Formal affiliate task",
        sourceLocale: "ja",
        isInitialCopy: locale !== "ja"
      }
    ])
  ),
  name: "Shibuya completed-service campaign",
  description: "Formal affiliate task",
  coverMediaAssetId: null,
  rewardNdpPerCompletedOrder: 1_000,
  totalBudgetNdp: 2_000_000,
  reservedBudgetNdp: 0,
  allocatedBudgetNdp: 0,
  settledBudgetNdp: 0,
  releasedBudgetNdp: 0,
  customerDiscountType: "fixed_jpy",
  fixedDiscountJpy: 500,
  discountRateBps: 0,
  discountCapJpy: 0,
  minimumOrderAmountJpy: 5_000,
  claimStartsAt: new Date("2026-09-01T00:00:00.000Z"),
  claimEndsAt: new Date("2026-09-20T00:00:00.000Z"),
  taskStartsAt: new Date("2026-09-01T00:00:00.000Z"),
  taskEndsAt: new Date("2026-09-30T00:00:00.000Z"),
  attributionWindowDays: 30,
  maxCompletedOrdersPerClaim: 20,
  maxCompletedOrdersPerCustomer: 1,
  serviceScopeMode: "selected_services",
  status: "draft",
  reviewedById: null,
  reviewedAt: null,
  rejectionReason: null,
  submittedAt: null,
  activatedAt: null,
  createdAt: now,
  updatedAt: now,
  shops: [{ id: 1, shopId: 11, shopNameSnapshot: "Shibuya Shop" }],
  services: [
    {
      id: 1,
      shopId: 11,
      serviceId: 101,
      serviceNameSnapshot: "Aroma 60",
      servicePriceJpySnapshot: 8_800
    }
  ],
  budgetReservation: null
};

const editableBody = {
  name: task.name,
  description: task.description,
  coverMediaAssetId: null,
  rewardNdpPerCompletedOrder: task.rewardNdpPerCompletedOrder,
  totalBudgetNdp: task.totalBudgetNdp,
  customerDiscountType: task.customerDiscountType,
  fixedDiscountJpy: task.fixedDiscountJpy,
  discountRateBps: task.discountRateBps,
  discountCapJpy: task.discountCapJpy,
  minimumOrderAmountJpy: task.minimumOrderAmountJpy,
  claimStartsAt: task.claimStartsAt.toISOString(),
  claimEndsAt: task.claimEndsAt.toISOString(),
  taskStartsAt: task.taskStartsAt.toISOString(),
  taskEndsAt: task.taskEndsAt.toISOString(),
  attributionWindowDays: task.attributionWindowDays,
  maxCompletedOrdersPerClaim: task.maxCompletedOrdersPerClaim,
  maxCompletedOrdersPerCustomer: task.maxCompletedOrdersPerCustomer,
  serviceScopeMode: task.serviceScopeMode,
  selectedServiceIds: [101]
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

const createUser = (input: {
  id: number;
  email: string;
  identityId: number;
  scopeType: "shop" | "platform";
  scopeId: number | null;
  roleCode: string;
  permissionCodes: string[];
}) => {
  const permissions = input.permissionCodes.map(permission);
  const role = {
    id: input.id,
    name: input.roleCode,
    code: input.roleCode,
    description: input.roleCode,
    isSystem: true,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    rolePermissions: permissions.map((item, index) => ({
      id: index + 1,
      roleId: input.id,
      permissionId: item.id,
      deletedAt: null,
      permission: item
    }))
  };
  return {
    id: input.id,
    email: input.email,
    phone: null,
    passwordHash: "unused",
    username: input.email,
    avatarUrl: null,
    isActive: true,
    lastLoginAt: null,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    identities: [
      {
        id: input.identityId,
        userId: input.id,
        type: input.scopeType === "platform" ? "operator" : "merchant",
        scopeType: input.scopeType,
        scopeId: input.scopeId,
        displayName: input.email,
        isDefault: true,
        isActive: true,
        deletedAt: null
      }
    ],
    userRoles: [
      {
        id: input.id,
        userId: input.id,
        roleId: input.id,
        scopeType: input.scopeType,
        scopeId: input.scopeId,
        deletedAt: null,
        role
      }
    ]
  };
};

const createFixture = () => {
  const users = [
    createUser({
      id: 7,
      email: "merchant@example.test",
      identityId: 21,
      scopeType: "shop",
      scopeId: 11,
      roleCode: "merchant_owner",
      permissionCodes: [
        "page:merchant-affiliate-task",
        "button:merchant-affiliate-task-create",
        "button:merchant-affiliate-task-submit"
      ]
    }),
    createUser({
      id: 9,
      email: "readonly@example.test",
      identityId: 22,
      scopeType: "shop",
      scopeId: 11,
      roleCode: "merchant_staff",
      permissionCodes: ["page:merchant-affiliate-task"]
    }),
    createUser({
      id: 99,
      email: "ops@example.test",
      identityId: 23,
      scopeType: "platform",
      scopeId: null,
      roleCode: "operator",
      permissionCodes: ["page:backoffice-affiliate", "button:backoffice-affiliate-review"]
    })
  ];
  const affiliateTaskService = {
    listPublisherTasks: jest.fn(async () => ({
      list: [task],
      total: 1,
      page: 1,
      page_size: 20
    })),
    createDraft: jest.fn(async () => task),
    getPublisherTask: jest.fn(async () => task),
    updateDraft: jest.fn(async () => task),
    updateDraftLocale: jest.fn(async () => task),
    submit: jest.fn(async () => ({ ...task, status: "pending_review" })),
    listBackofficeTasks: jest.fn(async () => ({
      list: [task],
      total: 1,
      page: 1,
      page_size: 20
    })),
    getBackofficeTask: jest.fn(async () => task),
    approve: jest.fn(async () => ({ ...task, status: "scheduled" })),
    reject: jest.fn(async () => ({ ...task, status: "rejected" }))
  };
  const app = createApp(undefined, {
    redisHealthCheck: async () => ({ status: "ok", latencyMs: 1 }),
    testOnlyAllowLegacyAuthAdapters: true,
    authRepository: {
      findUserById: jest.fn(async (id: number) => users.find((user) => user.id === id) ?? null)
    },
    authSessionStore: {
      isAccessTokenBlacklisted: jest.fn(async () => false)
    },
    otpDeliveryClient: { sendOtp: jest.fn(async () => undefined) },
    affiliateTaskService
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

  return { app, affiliateTaskService, tokens };
};

describe("affiliate task publishing HTTP API", () => {
  it("exposes the merchant/shop task endpoints with validated envelopes", async () => {
    const fixture = createFixture();
    const authorization = `Bearer ${fixture.tokens[7]}`;

    await request(fixture.app)
      .get("/api/v1/merchant-admin/affiliate/tasks?page=1&pageSize=20&status=draft")
      .set("Authorization", authorization)
      .expect(200)
      .expect((response) => {
        expect(response.body).toMatchObject({
          code: 0,
          message: "success",
          data: { total: 1, page: 1, page_size: 20 }
        });
      });

    await request(fixture.app)
      .post("/api/v1/merchant-admin/affiliate/tasks")
      .set("Authorization", authorization)
      .send({ publisherType: "shop", sourceLocale: "ja", ...editableBody })
      .expect(201);
    expect(fixture.affiliateTaskService.createDraft).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 7, currentIdentityScopeId: 11 }),
      expect.objectContaining({
        publisherType: "shop",
        sourceLocale: "ja",
        claimStartsAt: task.claimStartsAt,
        selectedServiceIds: [101]
      })
    );

    await request(fixture.app)
      .get(`/api/v1/merchant-admin/affiliate/tasks/${task.id}`)
      .set("Authorization", authorization)
      .expect(200);
    await request(fixture.app)
      .patch(`/api/v1/merchant-admin/affiliate/tasks/${task.id}`)
      .set("Authorization", authorization)
      .send({ ...editableBody, lockVersion: 2 })
      .expect(200);
    await request(fixture.app)
      .put(`/api/v1/merchant-admin/affiliate/tasks/${task.id}/locales/en`)
      .set("Authorization", authorization)
      .send({
        lockVersion: 2,
        name: "English campaign",
        description: "English instructions",
        syncToAll: false
      })
      .expect(200);
    expect(fixture.affiliateTaskService.updateDraftLocale).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 7, currentIdentityScopeId: 11 }),
      task.id,
      "en",
      {
        lockVersion: 2,
        name: "English campaign",
        description: "English instructions",
        syncToAll: false
      }
    );
    await request(fixture.app)
      .post(`/api/v1/merchant-admin/affiliate/tasks/${task.id}/submit`)
      .set("Authorization", authorization)
      .send({})
      .expect(200)
      .expect((response) => expect(response.body.data.status).toBe("pending_review"));
  });

  it("exposes the four operations review endpoints with separate permissions", async () => {
    const fixture = createFixture();
    const authorization = `Bearer ${fixture.tokens[99]}`;

    await request(fixture.app)
      .get("/api/v1/backoffice/affiliate/tasks?page=1&pageSize=20&status=pending_review")
      .set("Authorization", authorization)
      .expect(200);
    await request(fixture.app)
      .get(`/api/v1/backoffice/affiliate/tasks/${task.id}`)
      .set("Authorization", authorization)
      .expect(200);
    await request(fixture.app)
      .post(`/api/v1/backoffice/affiliate/tasks/${task.id}/approve`)
      .set("Authorization", authorization)
      .send({})
      .expect(200)
      .expect((response) => expect(response.body.data.status).toBe("scheduled"));
    await request(fixture.app)
      .post(`/api/v1/backoffice/affiliate/tasks/${task.id}/reject`)
      .set("Authorization", authorization)
      .send({ reason: "Campaign proof is incomplete" })
      .expect(200)
      .expect((response) => expect(response.body.data.status).toBe("rejected"));
    expect(fixture.affiliateTaskService.reject).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 99, currentIdentityScopeType: "platform" }),
      task.id,
      "Campaign proof is incomplete"
    );
  });

  it("enforces authentication and least-privilege RBAC before service execution", async () => {
    const fixture = createFixture();

    await request(fixture.app)
      .get("/api/v1/merchant-admin/affiliate/tasks")
      .expect(401);
    await request(fixture.app)
      .post("/api/v1/merchant-admin/affiliate/tasks")
      .set("Authorization", `Bearer ${fixture.tokens[9]}`)
      .send({ publisherType: "shop", ...editableBody })
      .expect(403);
    await request(fixture.app)
      .get("/api/v1/backoffice/affiliate/tasks")
      .set("Authorization", `Bearer ${fixture.tokens[7]}`)
      .expect(403);
    expect(fixture.affiliateTaskService.createDraft).not.toHaveBeenCalled();
    expect(fixture.affiliateTaskService.listBackofficeTasks).not.toHaveBeenCalled();
  });

  it("rejects malformed publisher, discount, scope, and path contracts before service execution", async () => {
    const fixture = createFixture();
    const authorization = `Bearer ${fixture.tokens[7]}`;

    await request(fixture.app)
      .post("/api/v1/merchant-admin/affiliate/tasks")
      .set("Authorization", authorization)
      .send({
        publisherType: "shop",
        shopIds: [12],
        ...editableBody
      })
      .expect(400);
    await request(fixture.app)
      .post("/api/v1/merchant-admin/affiliate/tasks")
      .set("Authorization", authorization)
      .send({
        publisherType: "shop",
        ...editableBody,
        customerDiscountType: "percent",
        fixedDiscountJpy: 500,
        discountRateBps: 1_000,
        discountCapJpy: 0
      })
      .expect(400);
    await request(fixture.app)
      .post("/api/v1/merchant-admin/affiliate/tasks")
      .set("Authorization", authorization)
      .send({
        publisherType: "shop",
        ...editableBody,
        serviceScopeMode: "all_current_services",
        selectedServiceIds: [101]
      })
      .expect(400);
    await request(fixture.app)
      .get("/api/v1/merchant-admin/affiliate/tasks/not-an-id")
      .set("Authorization", authorization)
      .expect(400);
    await request(fixture.app)
      .put(`/api/v1/merchant-admin/affiliate/tasks/${task.id}/locales/fr`)
      .set("Authorization", authorization)
      .send({
        lockVersion: 2,
        name: "Unsupported locale",
        description: null,
        syncToAll: false
      })
      .expect(400);
    await request(fixture.app)
      .put(`/api/v1/merchant-admin/affiliate/tasks/${task.id}/locales/en`)
      .set("Authorization", authorization)
      .send({ lockVersion: 2, name: "", description: null, syncToAll: false })
      .expect(400);
    expect(fixture.affiliateTaskService.createDraft).not.toHaveBeenCalled();
    expect(fixture.affiliateTaskService.getPublisherTask).not.toHaveBeenCalled();
    expect(fixture.affiliateTaskService.updateDraftLocale).not.toHaveBeenCalled();
  });
});

describe("affiliate task OpenAPI contract", () => {
  it("documents every runtime route", () => {
    const document = createOpenApiDocument(env) as {
      paths: Record<string, Record<string, unknown>>;
      components: { schemas: Record<string, { required?: string[]; properties?: Record<string, unknown> }> };
    };
    const paths = [
      "/api/v1/merchant-admin/affiliate/tasks",
      "/api/v1/merchant-admin/affiliate/tasks/{taskId}",
      "/api/v1/merchant-admin/affiliate/tasks/{taskId}/locales/{locale}",
      "/api/v1/merchant-admin/affiliate/tasks/{taskId}/submit",
      "/api/v1/backoffice/affiliate/tasks",
      "/api/v1/backoffice/affiliate/tasks/{taskId}",
      "/api/v1/backoffice/affiliate/tasks/{taskId}/approve",
      "/api/v1/backoffice/affiliate/tasks/{taskId}/reject"
    ];

    expect(paths.every((path) => document.paths[path])).toBe(true);
    expect(document.paths[paths[0]]).toEqual(
      expect.objectContaining({ get: expect.any(Object), post: expect.any(Object) })
    );
    expect(document.paths[paths[1]]).toEqual(
      expect.objectContaining({ get: expect.any(Object), patch: expect.any(Object) })
    );
    expect(document.paths[paths[2]]).toEqual(
      expect.objectContaining({ put: expect.any(Object) })
    );
    expect(document.components.schemas.AffiliateTask.required).toContain("translations");
    expect(document.components.schemas.AffiliateMarketplaceTask.required).toContain(
      "translations"
    );
    expect(document.components.schemas).toHaveProperty("AffiliateTaskTranslation");
  });
});
