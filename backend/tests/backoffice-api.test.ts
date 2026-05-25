import { hash } from "bcryptjs";
import request from "supertest";
import { createApp } from "../src/app";
import { ERROR_CODES } from "../src/constants/error-codes";

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

const now = new Date("2026-05-25T00:00:00.000Z");

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

const createFixture = async () => {
  const passwordHash = await hash("Abcd@1234", 12);
  const auditLogs: unknown[] = [];
  const backofficePermissions = [
    "auth:me",
    "auth:refresh",
    "auth:logout",
    "backoffice:dashboard:read",
    "backoffice:orders:list",
    "backoffice:schedule:list",
    "backoffice:finance:list",
    "backoffice:finance:export",
    "backoffice:technicians:list",
    "backoffice:shops:list",
    "merchant-admin:dashboard:read",
    "merchant-admin:orders:list",
    "merchant-admin:schedule:list",
    "merchant-admin:finance:list",
    "merchant-admin:finance:export",
    "merchant-admin:technicians:list",
    "merchant-admin:shop:read",
    "menu:dashboard",
    "page:dashboard"
  ].map(makePermission);
  const readOnlyPermissions = ["auth:me", "auth:refresh", "auth:logout"].map((code, index) =>
    makePermission(code, 100 + index)
  );
  const adminRole = {
    id: 1,
    name: "Admin",
    code: "admin",
    description: "All permissions",
    isSystem: true,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    rolePermissions: backofficePermissions.map((permission, index) => ({
      id: index + 1,
      roleId: 1,
      permissionId: permission.id,
      deletedAt: null,
      permission
    }))
  };
  const merchantRole = {
    id: 2,
    name: "Merchant Owner",
    code: "merchant_owner",
    description: "Merchant permissions",
    isSystem: true,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    rolePermissions: backofficePermissions
      .filter((permission) => permission.code.startsWith("merchant-admin:") || permission.code.startsWith("auth:"))
      .map((permission, index) => ({
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
      id: 1,
      email: "admin@example.com",
      phone: null,
      passwordHash,
      username: "NeeDo Admin",
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
          displayName: "NeeDo Admin",
          isDefault: true,
          isActive: true,
          deletedAt: null
        }
      ],
      userRoles: [{ deletedAt: null, role: adminRole }]
    },
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
      async (email: string) => users.find((user) => user.email === email && user.deletedAt === null) ?? null
    ),
    findUserById: jest.fn(async (id: number) => users.find((user) => user.id === id && user.deletedAt === null) ?? null),
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
  const backofficeRepository = {
    getDashboard: jest.fn(async () => ({
      metrics: [{ label: "今日订单", value: "2", change: "真实数据库", tone: "good" }],
      orders: [{ id: 31, orderNo: "ND202605250001", status: "pending", shopId: 11 }],
      schedule: { total: 2, available: 1, booked: 1 },
      finance: { grossAmount: 8800, pendingSettlementAmount: 500, refundAmount: 0 },
      technicians: [{ id: 7, displayName: "Mika Tanaka", shopId: 11 }],
      shops: [{ id: 11, name: "Aoyama Care Studio", status: "published" }]
    })),
    listOrders: jest.fn(async (input: unknown) => ({
      list: [{ id: 31, orderNo: "ND202605250001", status: "pending", shopId: 11 }],
      total: 1,
      page: 1,
      page_size: 20,
      input
    })),
    listSchedule: jest.fn(async () => ({
      list: [{ id: 41, shopId: 11, status: "available" }],
      total: 1,
      page: 1,
      page_size: 20
    })),
    listFinanceSettlements: jest.fn(async () => ({
      list: [{ id: 51, transactionNo: "NDP202605250001", shopId: 11, actualAmount: 500 }],
      total: 1,
      page: 1,
      page_size: 20
    })),
    exportFinanceSettlements: jest.fn(async () => ({
      filename: "merchant-finance-settlements.csv",
      contentType: "text/csv; charset=utf-8",
      content: "id,transactionNo,actualAmount\n51,NDP202605250001,500"
    })),
    listTechnicians: jest.fn(async () => ({
      list: [{ id: 7, displayName: "Mika Tanaka", shopId: 11 }],
      total: 1,
      page: 1,
      page_size: 20
    })),
    listShops: jest.fn(async () => ({
      list: [{ id: 11, name: "Aoyama Care Studio", status: "published" }],
      total: 1,
      page: 1,
      page_size: 20
    }))
  };
  const app = createApp(undefined, {
    redisHealthCheck: async () => ({ status: "ok", latencyMs: 1 }),
    authRepository,
    authSessionStore: new InMemoryAuthSessionStore(),
    otpDeliveryClient: { sendOtp: jest.fn(async () => undefined) },
    auditLogRepository,
    backofficeRepository
  } as never);
  const login = async (email: string) => {
    const response = await request(app)
      .post("/api/v1/auth/login")
      .send({ email, password: "Abcd@1234" })
      .expect(200);

    return response.body.data.accessToken as string;
  };

  return { app, auditLogs, backofficeRepository, login };
};

describe("Step 12 backoffice and merchant-admin real data APIs", () => {
  it("serves the operations dashboard from the repository and records an audit log", async () => {
    const fixture = await createFixture();
    const token = await fixture.login("admin@example.com");

    const response = await request(fixture.app)
      .get("/api/v1/backoffice/dashboard")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(response.body.data.metrics[0]).toMatchObject({
      label: "今日订单",
      value: "2"
    });
    expect(fixture.backofficeRepository.getDashboard).toHaveBeenCalledWith({
      scope: "platform"
    });
    expect(fixture.auditLogs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          actorId: 1,
          action: "backoffice.dashboard.read",
          targetType: "backoffice_dashboard"
        })
      ])
    );
  });

  it("blocks users without the matching backoffice permission", async () => {
    const fixture = await createFixture();
    const token = await fixture.login("viewer@example.com");

    await request(fixture.app)
      .get("/api/v1/backoffice/orders")
      .set("Authorization", `Bearer ${token}`)
      .expect(403)
      .expect((response) => {
        expect(response.body.code).toBe(ERROR_CODES.FORBIDDEN);
      });
    expect(fixture.backofficeRepository.listOrders).not.toHaveBeenCalled();
  });

  it("scopes merchant-admin orders and exports to the authenticated shop", async () => {
    const fixture = await createFixture();
    const token = await fixture.login("merchant@example.com");

    await request(fixture.app)
      .get("/api/v1/merchant-admin/orders")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(fixture.backofficeRepository.listOrders).toHaveBeenCalledWith(
      expect.objectContaining({
        scope: "merchant",
        shopId: 11
      })
    );

    const exportResponse = await request(fixture.app)
      .get("/api/v1/merchant-admin/finance/settlements/export")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(exportResponse.body.data.content).toContain("NDP202605250001");
    expect(fixture.backofficeRepository.exportFinanceSettlements).toHaveBeenCalledWith(
      expect.objectContaining({
        scope: "merchant",
        shopId: 11
      })
    );
    expect(fixture.auditLogs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          actorId: 2,
          action: "merchant_admin.finance.export",
          targetType: "finance_settlement_export",
          metadata: { shopId: 11 }
        })
      ])
    );
  });
});
