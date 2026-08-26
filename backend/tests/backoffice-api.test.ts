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
    "backoffice:merchant-accounts:read",
    "merchant-admin:dashboard:read",
    "merchant-admin:orders:list",
    "merchant-admin:schedule:list",
    "merchant-admin:finance:list",
    "merchant-admin:finance:export",
    "merchant-admin:technicians:list",
    "merchant-admin:shop:read",
    "merchant-admin:shop:write",
    "menu:dashboard",
    "page:dashboard"
  ].map(makePermission);
  const readOnlyPermissions = ["auth:me", "auth:refresh", "auth:logout", "backoffice:merchant-accounts:read"].map((code, index) =>
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
      .filter(
        (permission) =>
          permission.code.startsWith("merchant-admin:") || permission.code.startsWith("auth:")
      )
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
  const backofficeRepository = {
    getDashboard: jest.fn(async () => ({
      metrics: [{ label: "今日订单", value: "2", change: "真实数据库", tone: "good" }],
      orders: [{ id: 31, orderNo: "ND202605250001", status: "pending", shopId: 11 }],
      schedule: { total: 2, available: 1, booked: 1 },
      finance: {
        estimatedServiceGmvJpy: 8800,
        platformNdpRevenue: 700,
        requestFeeNdpRevenue: 300,
        userRewardNdpCost: 100,
        pendingHoldNdp: 0,
        campaignDiscountNdp: 0,
        unknownOrUnreportedServiceAmountJpy: 8800
      },
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
      list: [
        {
          id: 51,
          bookingOrderId: 31,
          orderType: "request",
          orderNo: "ND202605250001",
          referenceType: "booking_order",
          referenceId: 31,
          status: "settled",
          shopId: 11,
          shopName: "Aoyama Care Studio",
          estimatedServiceGmvJpy: 8800,
          platformCollectedServiceAmountJpy: 0,
          offlineReportedServiceAmountJpy: 0,
          unknownOrUnreportedServiceAmountJpy: 8800,
          platformNdpRevenue: 700,
          cRequestFeeHoldNdp: 300,
          cRequestFeeActualNdp: 300,
          requestFeeNdpRevenue: 300,
          userRewardNdpCost: 100,
          pendingHoldNdp: 0,
          campaignDiscountNdp: 0,
          releasedNdp: 0,
          penaltyNdp: 0,
          compensationToUserNdp: 0,
          appliedFeeRuleIds: ["rule_set:1:rule:1"],
          moneyTimeline: [],
          createdAt: now.toISOString()
        }
      ],
      total: 1,
      page: 1,
      page_size: 20
    })),
    exportFinanceSettlements: jest.fn(async () => ({
      filename: "merchant-finance-settlements.csv",
      contentType: "text/csv; charset=utf-8",
      content:
        "id,orderType,orderNo,platformNdpRevenue,requestFeeNdpRevenue\n51,request,ND202605250001,700,300"
    })),
    listTechnicians: jest.fn(async () => ({
      list: [{ id: 7, displayName: "Mika Tanaka", shopId: 11 }],
      total: 1,
      page: 1,
      page_size: 20
    })),
    listTechnicianRankings: jest.fn(async () => ({
      list: [
        {
          rank: 1,
          technicianProfileId: 7,
          userId: 17,
          displayName: "Mika Tanaka",
          email: "mika@example.com",
          avatarUrl: null,
          shopId: 11,
          shopName: "Aoyama Care Studio",
          city: "Tokyo",
          serviceArea: "Minato",
          status: "published",
          verifiedAt: now.toISOString(),
          completedServiceAmountJpy: 15_000,
          completedOrderCount: 2,
          workingDayCount: 1
        }
      ],
      summary: {
        technicianCount: 1,
        completedServiceAmountJpy: 15_000,
        completedOrderCount: 2,
        workingDayCount: 1
      },
      total: 1,
      page: 1,
      page_size: 20
    })),
    listShops: jest.fn(async () => ({
      list: [{ id: 11, name: "Aoyama Care Studio", status: "published" }],
      total: 1,
      page: 1,
      page_size: 20
    })),
    updateShop: jest.fn(async (id: number, input: { name?: string }) => ({
      id,
      name: input.name ?? "Aoyama Care Studio",
      status: "published"
    }))
  };
  const app = createApp(undefined, {
    redisHealthCheck: async () => ({ status: "ok", latencyMs: 1 }),
    authRepository,
    testOnlyAllowLegacyAuthAdapters: true,
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
  it("serves the completed-order technician leaderboard in a Tokyo custom period", async () => {
    const fixture = await createFixture();
    const token = await fixture.login("admin@example.com");

    const response = await request(fixture.app)
      .get(
        "/api/v1/backoffice/technician-rankings?period=custom&from=2026-08-01&to=2026-08-31&sortBy=revenue&sortOrder=desc"
      )
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(response.body.data).toMatchObject({
      list: [
        {
          rank: 1,
          displayName: "Mika Tanaka",
          completedServiceAmountJpy: 15_000,
          completedOrderCount: 2,
          workingDayCount: 1
        }
      ],
      summary: {
        completedServiceAmountJpy: 15_000,
        completedOrderCount: 2,
        workingDayCount: 1
      },
      period: {
        key: "custom",
        timeZone: "Asia/Tokyo",
        from: "2026-08-01",
        to: "2026-08-31"
      }
    });
    expect(fixture.backofficeRepository.listTechnicianRankings).toHaveBeenCalledWith(
      expect.objectContaining({
        scope: "platform",
        period: "custom",
        from: "2026-08-01",
        to: "2026-08-31",
        window: expect.objectContaining({
          fromInclusive: new Date("2026-07-31T15:00:00.000Z"),
          toExclusive: new Date("2026-08-31T15:00:00.000Z")
        })
      })
    );
    expect(fixture.auditLogs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          actorId: 1,
          action: "backoffice.technician_rankings.list",
          targetType: "technician_ranking"
        })
      ])
    );
  });

  it("validates, protects, and exports technician rankings with the same read permission", async () => {
    const fixture = await createFixture();
    const adminToken = await fixture.login("admin@example.com");
    const viewerToken = await fixture.login("viewer@example.com");

    await request(fixture.app)
      .get("/api/v1/backoffice/technician-rankings?period=custom&from=2026-08-01")
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(400)
      .expect((response) => expect(response.body.code).toBe(ERROR_CODES.VALIDATION));

    await request(fixture.app)
      .get("/api/v1/backoffice/technician-rankings")
      .set("Authorization", `Bearer ${viewerToken}`)
      .expect(403)
      .expect((response) => expect(response.body.code).toBe(ERROR_CODES.FORBIDDEN));

    const repositoryCallsBeforeDeniedExport =
      fixture.backofficeRepository.listTechnicianRankings.mock.calls.length;
    await request(fixture.app)
      .get("/api/v1/backoffice/technician-rankings/export")
      .set("Authorization", `Bearer ${viewerToken}`)
      .expect(403)
      .expect((response) => expect(response.body.code).toBe(ERROR_CODES.FORBIDDEN));
    expect(fixture.backofficeRepository.listTechnicianRankings).toHaveBeenCalledTimes(
      repositoryCallsBeforeDeniedExport
    );

    const listResponse = await request(fixture.app)
      .get("/api/v1/backoffice/technician-rankings?period=month&sortBy=revenue")
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(200);

    const exportResponse = await request(fixture.app)
      .get("/api/v1/backoffice/technician-rankings/export?period=month&sortBy=revenue")
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(200);

    expect(exportResponse.body.data).toMatchObject({
      contentType: "text/csv; charset=utf-8"
    });
    expect(exportResponse.body.data.filename).toContain("technician-rankings-month");
    expect(listResponse.body.data.period).toMatchObject({ key: "month", timeZone: "Asia/Tokyo" });
    expect(exportResponse.body.data.content.replace(/^\uFEFF/, "").split("\n")).toEqual([
      "rank,technicianProfileId,displayName,shopName,city,completedServiceAmountJpy,completedOrderCount,workingDayCount,averageOrderValueJpy",
      "1,7,Mika Tanaka,Aoyama Care Studio,Tokyo,15000,2,1,7500"
    ]);
    expect(fixture.auditLogs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          actorId: 1,
          action: "backoffice.technician_rankings.export",
          targetType: "technician_ranking_export"
        })
      ])
    );
  });

  it("neutralizes spreadsheet formulas and escapes CSV delimiter characters in technician ranking exports", async () => {
    const fixture = await createFixture();
    const adminToken = await fixture.login("admin@example.com");

    fixture.backofficeRepository.listTechnicianRankings.mockResolvedValue({
      list: [
        {
          rank: 1,
          technicianProfileId: 7,
          userId: 17,
          displayName: '=SUM(1,1)',
          email: "mika@example.com",
          avatarUrl: null,
          shopId: 11,
          shopName: '+Aoyama "Care"',
          city: "@Tokyo",
          serviceArea: "Minato",
          status: "published",
          verifiedAt: now.toISOString(),
          completedServiceAmountJpy: 15_000,
          completedOrderCount: 2,
          workingDayCount: 1
        }
      ],
      summary: {
        technicianCount: 1,
        completedServiceAmountJpy: 15_000,
        completedOrderCount: 2,
        workingDayCount: 1
      },
      total: 1,
      page: 1,
      page_size: 100
    });

    const response = await request(fixture.app)
      .get("/api/v1/backoffice/technician-rankings/export?period=month")
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(200);

    expect(response.body.data.content).toBe(
      '\uFEFFrank,technicianProfileId,displayName,shopName,city,completedServiceAmountJpy,completedOrderCount,workingDayCount,averageOrderValueJpy\n1,7,"\'=SUM(1,1)","\'+Aoyama ""Care""",\'@Tokyo,15000,2,1,7500'
    );
  });

  it("forwards the full custom ranking filter to list and export while preserving CSV order", async () => {
    const fixture = await createFixture();
    const adminToken = await fixture.login("admin@example.com");
    const rows = [
      {
        rank: 1,
        technicianProfileId: 31,
        userId: 131,
        displayName: "Kiko Arai",
        email: "kiko@example.com",
        avatarUrl: null,
        shopId: 11,
        shopName: "Aoyama Care Studio",
        city: "Tokyo",
        serviceArea: "Minato",
        status: "published",
        verifiedAt: now.toISOString(),
        completedServiceAmountJpy: 10_000,
        completedOrderCount: 3,
        workingDayCount: 1
      },
      {
        rank: 2,
        technicianProfileId: 32,
        userId: 132,
        displayName: "Riku Sato",
        email: "riku@example.com",
        avatarUrl: null,
        shopId: 11,
        shopName: "Aoyama Care Studio",
        city: "Tokyo",
        serviceArea: "Minato",
        status: "published",
        verifiedAt: now.toISOString(),
        completedServiceAmountJpy: 9_000,
        completedOrderCount: 2,
        workingDayCount: 2
      },
      {
        rank: 3,
        technicianProfileId: 33,
        userId: 133,
        displayName: "Yui Mori",
        email: "yui@example.com",
        avatarUrl: null,
        shopId: 11,
        shopName: "Aoyama Care Studio",
        city: "Tokyo",
        serviceArea: "Minato",
        status: "published",
        verifiedAt: now.toISOString(),
        completedServiceAmountJpy: 6_000,
        completedOrderCount: 1,
        workingDayCount: 3
      }
    ];
    (fixture.backofficeRepository.listTechnicianRankings as jest.Mock).mockImplementation(
      async (input: { page: number; pageSize: number }) => ({
        list: input.page === 1 ? rows.slice(0, 2) : rows.slice(2),
        summary: {
          technicianCount: 3,
          completedServiceAmountJpy: 25_000,
          completedOrderCount: 6,
          workingDayCount: 6
        },
        total: 3,
        page: input.page,
        page_size: input.pageSize
      })
    );
    const query =
      "period=custom&from=2026-08-01&to=2026-08-31&keyword=Kiko&shopId=11&city=Tokyo&sortBy=workingDays&sortOrder=asc&page=1&pageSize=2";

    const listResponse = await request(fixture.app)
      .get(`/api/v1/backoffice/technician-rankings?${query}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(200);
    const exportResponse = await request(fixture.app)
      .get(`/api/v1/backoffice/technician-rankings/export?${query}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(200);

    const expectedInput = {
      scope: "platform",
      period: "custom",
      from: "2026-08-01",
      to: "2026-08-31",
      keyword: "Kiko",
      shopId: 11,
      city: "Tokyo",
      sortBy: "workingDays",
      sortOrder: "asc",
      window: expect.objectContaining({
        period: "custom",
        fromInclusive: new Date("2026-07-31T15:00:00.000Z"),
        toExclusive: new Date("2026-08-31T15:00:00.000Z")
      })
    };
    expect(fixture.backofficeRepository.listTechnicianRankings).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ ...expectedInput, page: 1, pageSize: 2 })
    );
    expect(fixture.backofficeRepository.listTechnicianRankings).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ ...expectedInput, page: 1, pageSize: 100 })
    );
    expect(fixture.backofficeRepository.listTechnicianRankings).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({ ...expectedInput, page: 2, pageSize: 100 })
    );
    expect(listResponse.body.data).toMatchObject({
      period: { key: "custom", from: "2026-08-01", to: "2026-08-31" },
      list: [{ technicianProfileId: 31 }, { technicianProfileId: 32 }]
    });
    expect(exportResponse.body.data.filename).toBe(
      "technician-rankings-custom-2026-08-01_2026-08-31.csv"
    );
    expect(exportResponse.body.data.content.replace(/^\uFEFF/, "").split("\n")).toEqual([
      "rank,technicianProfileId,displayName,shopName,city,completedServiceAmountJpy,completedOrderCount,workingDayCount,averageOrderValueJpy",
      "1,31,Kiko Arai,Aoyama Care Studio,Tokyo,10000,3,1,3333",
      "2,32,Riku Sato,Aoyama Care Studio,Tokyo,9000,2,2,4500",
      "3,33,Yui Mori,Aoyama Care Studio,Tokyo,6000,1,3,6000"
    ]);
  });

  it("stops a technician ranking export when a later page is empty despite its total", async () => {
    const fixture = await createFixture();
    const adminToken = await fixture.login("admin@example.com");
    const firstPage = {
      list: [
        {
          rank: 1,
          technicianProfileId: 7,
          userId: 17,
          displayName: "Mika Tanaka",
          email: "mika@example.com",
          avatarUrl: null,
          shopId: 11,
          shopName: "Aoyama Care Studio",
          city: "Tokyo",
          serviceArea: "Minato",
          status: "published",
          verifiedAt: now.toISOString(),
          completedServiceAmountJpy: 15_000,
          completedOrderCount: 2,
          workingDayCount: 1
        }
      ],
      summary: {
        technicianCount: 5_001,
        completedServiceAmountJpy: 15_000,
        completedOrderCount: 2,
        workingDayCount: 1
      },
      total: 5_001,
      page: 1,
      page_size: 100
    };
    fixture.backofficeRepository.listTechnicianRankings
      .mockResolvedValueOnce(firstPage)
      .mockResolvedValueOnce({ ...firstPage, list: [], page: 2 });

    const response = await request(fixture.app)
      .get("/api/v1/backoffice/technician-rankings/export?period=month")
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(200);

    expect(fixture.backofficeRepository.listTechnicianRankings).toHaveBeenCalledTimes(2);
    expect(response.body.data.content.replace(/^\uFEFF/, "").split("\n")).toHaveLength(2);
  });

  it("caps technician ranking CSV exports at 5,000 rows", async () => {
    const fixture = await createFixture();
    const adminToken = await fixture.login("admin@example.com");
    (fixture.backofficeRepository.listTechnicianRankings as jest.Mock).mockImplementation(
      async (input: { page: number; pageSize: number }) => ({
        list:
          input.page <= 50
            ? Array.from({ length: 100 }, (_, index) => ({
                rank: (input.page - 1) * 100 + index + 1,
                technicianProfileId: (input.page - 1) * 100 + index + 1,
                userId: (input.page - 1) * 100 + index + 101,
                displayName: `Technician ${input.page}-${index + 1}`,
                email: `technician-${input.page}-${index + 1}@example.com`,
                avatarUrl: null,
                shopId: 11,
                shopName: "Aoyama Care Studio",
                city: "Tokyo",
                serviceArea: "Minato",
                status: "published",
                verifiedAt: now.toISOString(),
                completedServiceAmountJpy: 1_000,
                completedOrderCount: 1,
                workingDayCount: 1
              }))
            : [],
        summary: {
          technicianCount: 5_001,
          completedServiceAmountJpy: 5_001_000,
          completedOrderCount: 5_001,
          workingDayCount: 5_001
        },
        total: 5_001,
        page: input.page,
        page_size: input.pageSize
      })
    );

    const response = await request(fixture.app)
      .get("/api/v1/backoffice/technician-rankings/export?period=all")
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(200);

    expect(fixture.backofficeRepository.listTechnicianRankings).toHaveBeenCalledTimes(50);
    expect(response.body.data.content.replace(/^\uFEFF/, "").split("\n")).toHaveLength(5_001);
  });

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
    expect(response.body.data.finance).toMatchObject({
      estimatedServiceGmvJpy: 8800,
      platformNdpRevenue: 700,
      requestFeeNdpRevenue: 300,
      userRewardNdpCost: 100
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

    expect(exportResponse.body.data.content).toContain("ND202605250001");
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

  it("lets an operations administrator preview a selected shop through merchant-admin reads", async () => {
    const fixture = await createFixture();
    const token = await fixture.login("viewer@example.com");

    await request(fixture.app)
      .get("/api/v1/merchant-admin/orders")
      .set("Authorization", `Bearer ${token}`)
      .set("X-NeeDo-Merchant-Preview-Shop-Id", "22")
      .expect(200);

    expect(fixture.backofficeRepository.listOrders).toHaveBeenCalledWith(
      expect.objectContaining({
        scope: "merchant",
        shopId: 22
      })
    );
  });

  it("rejects every write attempted from an operations read-only merchant preview", async () => {
    const fixture = await createFixture();
    const token = await fixture.login("admin@example.com");

    await request(fixture.app)
      .patch("/api/v1/merchant-admin/shop")
      .set("Authorization", `Bearer ${token}`)
      .set("X-NeeDo-Merchant-Preview-Shop-Id", "22")
      .send({ name: "Must not be saved" })
      .expect(403)
      .expect((response) => {
        expect(response.body).toMatchObject({
          code: ERROR_CODES.FORBIDDEN,
          message: "error.merchant_preview.read_only"
        });
      });

    expect(fixture.backofficeRepository.updateShop).not.toHaveBeenCalled();
  });
});
