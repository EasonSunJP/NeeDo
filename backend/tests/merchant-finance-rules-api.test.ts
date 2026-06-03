import { hash } from "bcryptjs";
import request from "supertest";
import { createApp } from "../src/app";
import type {
  MerchantFinanceRulesRepositoryPort,
  ShopFinanceRuleSetPayload
} from "../src/services/merchant-finance-rules.service";

interface StoredValue {
  value: string;
  expiresAt: number;
}

class InMemoryAuthSessionStore {
  private readonly values = new Map<string, StoredValue>();
  private readonly failureCounts = new Map<string, number>();

  public async getLoginLock(email: string): Promise<boolean> {
    return this.getValue(`login:lock:${email}`) !== null;
  }

  public async recordFailedLogin(
    ip: string,
    email: string,
    options: { failureLimit: number; windowSeconds: number; lockSeconds: number }
  ): Promise<{ count: number; locked: boolean }> {
    const key = `login:fail:${ip}:${email}`;
    const nextCount = (this.failureCounts.get(key) ?? 0) + 1;
    this.failureCounts.set(key, nextCount);
    this.setValue(key, String(nextCount), options.windowSeconds);

    if (nextCount >= options.failureLimit) {
      this.setValue(`login:lock:${email}`, "1", options.lockSeconds);
      return { count: nextCount, locked: true };
    }

    return { count: nextCount, locked: false };
  }

  public async clearFailedLogin(ip: string, email: string): Promise<void> {
    this.failureCounts.delete(`login:fail:${ip}:${email}`);
    this.values.delete(`login:fail:${ip}:${email}`);
    this.values.delete(`login:lock:${email}`);
  }

  public async storeOtp(email: string, otp: string, ttlSeconds: number): Promise<void> {
    this.setValue(`otp:${email}`, otp, ttlSeconds);
  }

  public async getOtp(email: string): Promise<string | null> {
    return this.getValue(`otp:${email}`);
  }

  public async deleteOtp(email: string): Promise<void> {
    this.values.delete(`otp:${email}`);
  }

  public async hasOtpCooldown(email: string): Promise<boolean> {
    return this.getValue(`otp:cooldown:${email}`) !== null;
  }

  public async storeOtpCooldown(email: string, ttlSeconds: number): Promise<void> {
    this.setValue(`otp:cooldown:${email}`, "1", ttlSeconds);
  }

  public async clearOtpCooldown(email: string): Promise<void> {
    this.values.delete(`otp:cooldown:${email}`);
  }

  public async storeRefreshToken(userId: number, jti: string, ttlSeconds: number): Promise<void> {
    this.setValue(`refresh:${userId}:${jti}`, "1", ttlSeconds);
  }

  public async hasRefreshToken(userId: number, jti: string): Promise<boolean> {
    return this.getValue(`refresh:${userId}:${jti}`) !== null;
  }

  public async revokeRefreshToken(userId: number, jti: string): Promise<void> {
    this.values.delete(`refresh:${userId}:${jti}`);
  }

  public async blacklistAccessToken(jti: string, ttlSeconds: number): Promise<void> {
    this.setValue(`token:blacklist:${jti}`, "1", ttlSeconds);
  }

  public async isAccessTokenBlacklisted(jti: string): Promise<boolean> {
    return this.getValue(`token:blacklist:${jti}`) !== null;
  }

  private setValue(key: string, value: string, ttlSeconds: number): void {
    this.values.set(key, {
      value,
      expiresAt: Date.now() + ttlSeconds * 1000
    });
  }

  private getValue(key: string): string | null {
    const stored = this.values.get(key);
    if (!stored) {
      return null;
    }
    if (stored.expiresAt <= Date.now()) {
      this.values.delete(key);
      return null;
    }
    return stored.value;
  }
}

const now = new Date("2026-06-03T00:00:00.000Z");

const makePermission = (code: string, index: number) => ({
  id: index + 1,
  name: code,
  code,
  type: code.startsWith("menu:") ? "menu" : "api",
  module: code.split(":")[0],
  description: code,
  isSystem: true,
  createdAt: now,
  updatedAt: now,
  deletedAt: null
});

const activeRuleSet: ShopFinanceRuleSetPayload = {
  id: 1,
  shopId: 11,
  name: "Aoyama finance rules",
  status: "active",
  wageMode: "base_plus_commission",
  baseSalaryJpy: 0,
  hourlyRateJpy: 0,
  dailyRateJpy: 0,
  fixedOrderPayJpy: 1000,
  commissionRatePercent: 50,
  guaranteedMinimumJpy: 0,
  ndpFeeBearer: "split",
  technicianNdpSharePercent: 30,
  bonusRules: [],
  deductionRules: [],
  effectiveFrom: null,
  effectiveTo: null,
  createdById: 2,
  updatedById: 2,
  createdAt: now.toISOString(),
  updatedAt: now.toISOString()
};

const createFixture = async () => {
  const passwordHash = await hash("Abcd@1234", 12);
  const auditLogs: unknown[] = [];
  const merchantPermissions = [
    "auth:me",
    "auth:refresh",
    "auth:logout",
    "merchant-admin:finance-rules:read",
    "merchant-admin:finance-rules:write",
    "merchant-admin:finance-rules:preview",
    "menu:merchant-admin"
  ].map(makePermission);
  const readOnlyPermissions = ["auth:me", "auth:refresh", "auth:logout"].map((code, index) =>
    makePermission(code, 100 + index)
  );
  const merchantRole = {
    id: 2,
    name: "Merchant Owner",
    code: "merchant_owner",
    description: "Merchant permissions",
    isSystem: true,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    rolePermissions: merchantPermissions.map((permission, index) => ({
      id: 100 + index,
      roleId: 2,
      permissionId: permission.id,
      deletedAt: null,
      permission
    }))
  };
  const viewerRole = {
    id: 3,
    name: "Viewer",
    code: "viewer",
    description: "Read only",
    isSystem: true,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    rolePermissions: readOnlyPermissions.map((permission, index) => ({
      id: 200 + index,
      roleId: 3,
      permissionId: permission.id,
      deletedAt: null,
      permission
    }))
  };
  const users = [
    {
      id: 2,
      email: "merchant@example.com",
      phone: null,
      passwordHash,
      username: "Aoyama Owner",
      avatarUrl: null,
      isActive: true,
      lastLoginAt: null as Date | null,
      deletedAt: null,
      identities: [
        {
          id: 2,
          userId: 2,
          type: "merchant_owner",
          scopeType: "shop",
          scopeId: 11,
          displayName: "Aoyama Owner",
          isDefault: true,
          isActive: true,
          deletedAt: null
        }
      ],
      userRoles: [{ deletedAt: null, role: merchantRole }]
    },
    {
      id: 3,
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
          id: 3,
          userId: 3,
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
  const authRepository = {
    findUserByEmail: jest.fn(
      async (email: string) =>
        users.find((user) => user.email === email && user.deletedAt === null) ?? null
    ),
    findUserByLoginIdentifier: jest.fn(
      async (identifier: string) =>
        users.find(
          (user) =>
            (user.email === identifier || user.username === identifier) && user.deletedAt === null
        ) ?? null
    ),
    findUserById: jest.fn(
      async (id: number) => users.find((user) => user.id === id && user.deletedAt === null) ?? null
    ),
    updateLastLoginAt: jest.fn(async (id: number, loggedInAt: Date) => {
      const user = users.find((item) => item.id === id);
      if (user) {
        user.lastLoginAt = loggedInAt;
      }
    }),
    createLoginLog: jest.fn(async () => undefined),
    createAuditLog: jest.fn(async (entry: unknown) => {
      auditLogs.push(entry);
    })
  };
  const auditLogRepository = {
    create: jest.fn(async (entry: unknown) => {
      auditLogs.push(entry);
    })
  };
  const merchantFinanceRulesRepository: jest.Mocked<MerchantFinanceRulesRepositoryPort> = {
    findActiveRuleSet: jest.fn(async () => activeRuleSet),
    replaceActiveRuleSet: jest.fn(async (_shopId, input, actorUserId) => ({
      ...activeRuleSet,
      ...input,
      id: 2,
      createdById: actorUserId,
      updatedById: actorUserId
    }))
  } as unknown as jest.Mocked<MerchantFinanceRulesRepositoryPort>;
  const app = createApp(undefined, {
    redisHealthCheck: async () => ({ status: "ok", latencyMs: 1 }),
    authRepository,
    authSessionStore: new InMemoryAuthSessionStore(),
    otpDeliveryClient: { sendOtp: jest.fn(async () => undefined) },
    auditLogRepository,
    merchantFinanceRulesRepository
  } as never);
  const login = async (email: string) => {
    const response = await request(app)
      .post("/api/v1/auth/login")
      .send({ email, password: "Abcd@1234" })
      .expect(200);

    return response.body.data.accessToken as string;
  };

  return { app, auditLogs, login, merchantFinanceRulesRepository };
};

describe("merchant finance rules API", () => {
  it("allows a merchant owner to read, update, and preview the current shop finance rules", async () => {
    const fixture = await createFixture();
    const token = await fixture.login("merchant@example.com");

    const readResponse = await request(fixture.app)
      .get("/api/v1/merchant-admin/shops/11/finance/rules")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    expect(readResponse.body.data).toMatchObject({
      shopId: 11,
      wageMode: "base_plus_commission",
      ndpFeeBearer: "split"
    });

    const updateResponse = await request(fixture.app)
      .put("/api/v1/merchant-admin/shops/11/finance/rules")
      .set("Authorization", `Bearer ${token}`)
      .send({
        name: "Commission 62.5",
        wageMode: "commission",
        commissionRatePercent: 62.5,
        fixedOrderPayJpy: 0,
        guaranteedMinimumJpy: 4200,
        ndpFeeBearer: "technician",
        technicianNdpSharePercent: 100,
        bonusRules: [],
        deductionRules: []
      })
      .expect(200);
    expect(updateResponse.body.data).toMatchObject({
      id: 2,
      name: "Commission 62.5",
      commissionRatePercent: 62.5
    });

    const previewResponse = await request(fixture.app)
      .post("/api/v1/merchant-admin/shops/11/finance/rules/preview")
      .set("Authorization", `Bearer ${token}`)
      .send({
        serviceAmountJpy: 8800,
        platformFeeNdp: 500,
        monthlyCompletedOrders: 101
      })
      .expect(200);
    expect(previewResponse.body.data.preview).toMatchObject({
      serviceAmountJpy: 8800,
      platformFeeNdp: 500,
      commissionPayJpy: 4400,
      technicianNdpShareNdp: 150
    });
    expect(fixture.merchantFinanceRulesRepository.replaceActiveRuleSet).toHaveBeenCalledWith(
      11,
      expect.objectContaining({ name: "Commission 62.5" }),
      2
    );
    expect(fixture.auditLogs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          actorId: 2,
          action: "merchant_admin.finance_rules.update",
          targetType: "shop",
          targetId: 11
        })
      ])
    );
  });

  it("keeps finance rule APIs behind merchant finance permissions", async () => {
    const fixture = await createFixture();
    const token = await fixture.login("viewer@example.com");

    const response = await request(fixture.app)
      .get("/api/v1/merchant-admin/shops/11/finance/rules")
      .set("Authorization", `Bearer ${token}`)
      .expect(403);

    expect(response.body).toMatchObject({
      code: 40301,
      message: "error.forbidden",
      data: null
    });
  });
});
