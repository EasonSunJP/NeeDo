import { hash } from "bcryptjs";
import request from "supertest";
import { createApp } from "../src/app";
import { ERROR_CODES } from "../src/constants/error-codes";

const now = new Date("2026-06-03T00:00:00.000Z");

class InMemoryAuthSessionStore {
  public async getLoginLock(): Promise<boolean> {
    return false;
  }
  public async recordFailedLogin(): Promise<{ count: number; locked: boolean }> {
    return { count: 1, locked: false };
  }
  public async clearFailedLogin(): Promise<void> {
    return undefined;
  }
  public async storeOtp(): Promise<void> {
    return undefined;
  }
  public async getOtp(): Promise<string | null> {
    return null;
  }
  public async deleteOtp(): Promise<void> {
    return undefined;
  }
  public async hasOtpCooldown(): Promise<boolean> {
    return false;
  }
  public async storeOtpCooldown(): Promise<void> {
    return undefined;
  }
  public async clearOtpCooldown(): Promise<void> {
    return undefined;
  }
  public async storeRefreshToken(): Promise<void> {
    return undefined;
  }
  public async hasRefreshToken(): Promise<boolean> {
    return true;
  }
  public async revokeRefreshToken(): Promise<void> {
    return undefined;
  }
  public async blacklistAccessToken(): Promise<void> {
    return undefined;
  }
  public async isAccessTokenBlacklisted(): Promise<boolean> {
    return false;
  }
}

const makePermission = (code: string, index: number) => ({
  id: index + 1,
  name: code,
  code,
  type: "api",
  module: code.split(":")[0],
  description: code,
  isSystem: true,
  createdAt: now,
  updatedAt: now,
  deletedAt: null
});

const createFixture = async () => {
  const passwordHash = await hash("Abcd@1234", 12);
  const financePermissions = [
    "auth:me",
    "auth:refresh",
    "auth:logout",
    "finance:fee-rule:list",
    "finance:fee-rule:preview",
    "finance:calculation-log:list"
  ].map(makePermission);
  const viewerPermissions = ["auth:me", "auth:refresh", "auth:logout"].map((code, index) =>
    makePermission(code, 100 + index)
  );
  const financeRole = {
    id: 1,
    name: "Finance",
    code: "finance",
    description: "Finance",
    isSystem: true,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    rolePermissions: financePermissions.map((permission, index) => ({
      id: index + 1,
      roleId: 1,
      permissionId: permission.id,
      deletedAt: null,
      permission
    }))
  };
  const viewerRole = {
    id: 2,
    name: "Viewer",
    code: "viewer",
    description: "Viewer",
    isSystem: true,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    rolePermissions: viewerPermissions.map((permission, index) => ({
      id: index + 20,
      roleId: 2,
      permissionId: permission.id,
      deletedAt: null,
      permission
    }))
  };
  const users = [
    {
      id: 1,
      email: "finance@example.com",
      phone: null,
      passwordHash,
      username: "Finance",
      avatarUrl: null,
      isActive: true,
      lastLoginAt: null as Date | null,
      deletedAt: null,
      identities: [
        {
          id: 1,
          userId: 1,
          type: "platform_admin",
          scopeType: "global",
          scopeId: null,
          displayName: "Finance",
          isDefault: true,
          isActive: true,
          deletedAt: null
        }
      ],
      userRoles: [{ deletedAt: null, role: financeRole }]
    },
    {
      id: 2,
      email: "viewer@example.com",
      phone: null,
      passwordHash,
      username: "Viewer",
      avatarUrl: null,
      isActive: true,
      lastLoginAt: null as Date | null,
      deletedAt: null,
      identities: [
        {
          id: 2,
          userId: 2,
          type: "viewer",
          scopeType: "global",
          scopeId: null,
          displayName: "Viewer",
          isDefault: true,
          isActive: true,
          deletedAt: null
        }
      ],
      userRoles: [{ deletedAt: null, role: viewerRole }]
    }
  ];
  const feeRuleRepository = {
    listRuleSets: jest.fn(async () => ({
      list: [
        {
          id: 1,
          name: "Default Booking NDP Rules",
          status: "active",
          rules: [],
          createdAt: now,
          updatedAt: now
        }
      ],
      total: 1,
      page: 1,
      page_size: 20
    })),
    createRuleSet: jest.fn(),
    updateRuleSet: jest.fn(),
    setRuleSetStatus: jest.fn(),
    findActiveRuleSets: jest.fn(async () => []),
    listActiveCampaigns: jest.fn(async () => []),
    countCompletedOrdersForPeriod: jest.fn(async () => 0),
    createCalculationLog: jest.fn(async (input: unknown) => ({
      ...(input as object),
      id: 1,
      createdAt: now,
      updatedAt: now
    })),
    listCalculationLogs: jest.fn(async () => ({
      list: [{ id: 1, feeType: "b_platform_fee", finalFeeNdp: 500 }],
      total: 1,
      page: 1,
      page_size: 20
    }))
  };
  const app = createApp(undefined, {
    redisHealthCheck: async () => ({ status: "ok", latencyMs: 1 }),
    authRepository: {
      findUserByEmail: jest.fn(
        async (email: string) => users.find((user) => user.email === email) ?? null
      ),
      findUserByLoginIdentifier: jest.fn(
        async (identifier: string) =>
          users.find((user) => user.email === identifier || user.username === identifier) ?? null
      ),
      findUserById: jest.fn(async (id: number) => users.find((user) => user.id === id) ?? null),
      updateLastLoginAt: jest.fn(async () => undefined),
      createLoginLog: jest.fn(async () => undefined),
      createAuditLog: jest.fn(async () => undefined)
    },
    authSessionStore: new InMemoryAuthSessionStore(),
    otpDeliveryClient: { sendOtp: jest.fn(async () => undefined) },
    feeRuleRepository
  } as never);
  const login = async (email: string) => {
    const response = await request(app)
      .post("/api/v1/auth/login")
      .send({ email, password: "Abcd@1234" })
      .expect(200);

    return response.body.data.accessToken as string;
  };

  return { app, feeRuleRepository, login };
};

describe("finance fee-rule APIs", () => {
  it("lists rule sets, previews fees, and lists calculation logs for finance users", async () => {
    const fixture = await createFixture();
    const token = await fixture.login("finance@example.com");

    await request(fixture.app)
      .get("/api/v1/finance/fee-rule-sets")
      .set("Authorization", `Bearer ${token}`)
      .expect(200)
      .expect((response) => {
        expect(response.body.data.list[0]).toMatchObject({
          name: "Default Booking NDP Rules"
        });
      });

    await request(fixture.app)
      .post("/api/v1/finance/fee-rules/preview")
      .set("Authorization", `Bearer ${token}`)
      .send({
        orderType: "booking",
        feeType: "b_platform_fee",
        shopId: 10,
        scheduledStartAt: "2026-06-03T12:00:00.000Z"
      })
      .expect(200)
      .expect((response) => {
        expect(response.body.data).toMatchObject({
          finalFeeNdp: 0
        });
      });

    await request(fixture.app)
      .get("/api/v1/finance/fee-calculation-logs")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(fixture.feeRuleRepository.listRuleSets).toHaveBeenCalled();
    expect(fixture.feeRuleRepository.createCalculationLog).toHaveBeenCalled();
    expect(fixture.feeRuleRepository.listCalculationLogs).toHaveBeenCalled();
  });

  it("blocks users without finance fee-rule permissions", async () => {
    const fixture = await createFixture();
    const token = await fixture.login("viewer@example.com");

    await request(fixture.app)
      .get("/api/v1/finance/fee-rule-sets")
      .set("Authorization", `Bearer ${token}`)
      .expect(403)
      .expect((response) => {
        expect(response.body.code).toBe(ERROR_CODES.FORBIDDEN);
      });
  });
});
