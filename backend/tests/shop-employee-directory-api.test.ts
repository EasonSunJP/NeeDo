import request from "supertest";
import { createMerchantApp } from "../src/apps/merchant-app";
import { createOpsApp } from "../src/apps/ops-app";
import { createApp } from "../src/app";
import { env } from "../src/config/env";
import { AuthTokenService } from "../src/services/auth-token.service";
import type {
  ShopEmployeeDirectoryItem,
  ShopEmployeeDirectoryRepositoryPort
} from "../src/services/shop-employee-directory.service";
import { createDirectShopContextRepository } from "./helpers/merchant-shop-context";

const employee: ShopEmployeeDirectoryItem = {
  needoId: "u0000000047",
  displayName: "斋藤 花子",
  avatarUrl: null,
  email: "staff@example.com",
  phone: null,
  status: "active",
  startsAt: "2026-08-28T00:00:00.000Z",
  endsAt: null,
  roles: [
    {
      code: "TECHNICIAN",
      names: {
        zhHans: "技师",
        zhHant: "技師",
        ja: "技術者",
        en: "Technician",
        ko: "기술자"
      },
      isTechnicianRole: true
    }
  ],
  technician: {
    needoId: "s0000000047",
    relationshipType: "partner",
    workStatus: "active"
  }
};

const createRepository = (): jest.Mocked<ShopEmployeeDirectoryRepositoryPort> => ({
  listCurrentShopEmployees: jest.fn(async (input) => {
    void input;
    return {
      list: [employee],
      total: 1,
      page: 2,
      page_size: 30
    };
  })
});

const merchantConfig = {
  ...env,
  AUTH_TOKEN_AUDIENCE: "needo-merchant-api",
  SERVICE_NAME: "needo-merchant-api"
};

const createFixture = (
  permissions: string[] = ["merchant-admin:employee-affiliation:read"],
  repository = createRepository()
) => {
  const shopId = 16;
  const userId = 7;
  const identityId = 70;
  const user = {
    id: userId,
    email: "merchant@example.test",
    phone: null,
    passwordHash: "unused",
    username: "LifeDance 管理员",
    avatarUrl: null,
    isActive: true,
    lastLoginAt: null,
    deletedAt: null,
    identities: [
      {
        id: identityId,
        userId,
        type: "merchant_owner",
        scopeType: "shop",
        scopeId: shopId,
        displayName: "LifeDance 管理员",
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
  const auditLogRepository = { create: jest.fn(async () => undefined) };
  const dependencies = {
    redisHealthCheck: async () => ({ status: "ok" as const, latencyMs: 1 }),
    testOnlyAllowLegacyAuthAdapters: true,
    authRepository: { findUserById: jest.fn(async () => user) },
    authSessionStore: { isAccessTokenBlacklisted: jest.fn(async () => false) },
    otpDeliveryClient: { sendOtp: jest.fn(async () => undefined) },
    shopEmployeeDirectoryRepository: repository,
    auditLogRepository,
    merchantShopContextRepository: createDirectShopContextRepository()
  };
  const token = new AuthTokenService(env).issueAccessToken({
    id: user.id,
    email: user.email,
    currentIdentityId: identityId
  }).token;
  const merchantToken = new AuthTokenService(merchantConfig).issueAccessToken({
    id: user.id,
    email: user.email,
    currentIdentityId: identityId
  }).token;
  return { auditLogRepository, dependencies, merchantToken, repository, token };
};

describe("shop employee directory HTTP API", () => {
  it("requires authentication and the existing employee-affiliation read permission", async () => {
    const fixture = createFixture([]);
    const app = createApp(undefined, fixture.dependencies as never);

    await request(app).get("/api/v1/merchant-admin/employee-directory").expect(401);
    await request(app)
      .get("/api/v1/merchant-admin/employee-directory")
      .set("Authorization", `Bearer ${fixture.token}`)
      .expect(403);
  });

  it("returns all current-shop employees with parsed filters and no client shopId", async () => {
    const fixture = createFixture();
    const app = createApp(undefined, fixture.dependencies as never);

    await request(app)
      .get(
        "/api/v1/merchant-admin/employee-directory?page=2&pageSize=30&keyword=%E6%96%8B%E8%97%A4&status=active&roleCode=technician"
      )
      .set("Authorization", `Bearer ${fixture.token}`)
      .expect(200)
      .expect((response) => {
        expect(response.body).toEqual({
          code: 0,
          message: "success",
          data: { list: [employee], total: 1, page: 2, page_size: 30 }
        });
      });

    expect(fixture.repository.listCurrentShopEmployees).toHaveBeenCalledWith({
      shopId: 16,
      page: 2,
      pageSize: 30,
      keyword: "斋藤",
      status: "active",
      roleCode: "technician"
    });
    expect(fixture.auditLogRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "merchant_admin.employee_directory.list",
        targetType: "shop_employee",
        metadata: { shopId: 16 }
      })
    );
  });

  it("strictly rejects a caller-supplied shop scope and invalid filters", async () => {
    const fixture = createFixture();
    const app = createApp(undefined, fixture.dependencies as never);
    const authorization = `Bearer ${fixture.token}`;

    for (const query of [
      "shopId=99",
      "status=ended",
      "pageSize=101",
      `roleCode=${"x".repeat(65)}`
    ]) {
      await request(app)
        .get(`/api/v1/merchant-admin/employee-directory?${query}`)
        .set("Authorization", authorization)
        .expect(400);
    }
    expect(fixture.repository.listCurrentShopEmployees).not.toHaveBeenCalled();
  });

  it("is mounted only by the merchant backend application", async () => {
    const fixture = createFixture();
    const merchantApp = createMerchantApp(env, fixture.dependencies as never);

    await request(merchantApp).get("/api/v1/merchant-admin/employee-directory").expect(401);
    await request(merchantApp)
      .get("/api/v1/merchant-admin/employee-directory")
      .set("Authorization", `Bearer ${fixture.merchantToken}`)
      .expect(200);
    await request(createOpsApp(env, fixture.dependencies as never))
      .get("/api/v1/merchant-admin/employee-directory")
      .expect(404);
  });
});
