import { hash } from "bcryptjs";
import request from "supertest";
import { createApp } from "../src/app";
import type { CompensationProfileRepositoryPort } from "../src/services/compensation-profile.service";
import type {
  OrderFinanceRecord,
  OrderFinanceRepositoryPort
} from "../src/services/order-finance.service";

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

const orderRecord: OrderFinanceRecord = {
  bookingOrderId: 101,
  orderType: "booking",
  orderNo: "BK-20260603-0001",
  orderStatus: "COMPLETED",
  customerUserId: 4,
  shopId: 11,
  shopName: "GINZA Calm Body Lab",
  technicianProfileId: 21,
  technicianName: "Misaki",
  serviceName: "Aroma Treatment",
  priceAmountJpy: 8800,
  startsAt: "2026-06-03T10:00:00.000Z",
  endsAt: "2026-06-03T11:00:00.000Z",
  financial: {
    id: 301,
    serviceAmountJpy: 8800,
    platformCollectedServiceAmountJpy: 0,
    offlineReportedServiceAmountJpy: 0,
    unknownOrUnreportedServiceAmountJpy: 8800,
    paymentChannel: "unknown",
    serviceIncomeStatus: "unreported",
    bPlatformFeeHoldNdp: 500,
    bPlatformFeeActualNdp: 500,
    cRequestFeeHoldNdp: 0,
    cRequestFeeActualNdp: 0,
    userRewardNdp: 100,
    campaignDiscountNdp: 0,
    releasedNdp: 0,
    penaltyNdp: 0,
    compensationToUserNdp: 0,
    appliedFeeRuleIds: ["booking-default"],
    moneyTimeline: [],
    serviceIncomeReportedById: null,
    serviceIncomeReportedAt: null,
    serviceIncomeConfirmedById: null,
    serviceIncomeConfirmedAt: null,
    serviceIncomeNote: null,
    serviceIncomeProofUrl: null,
    settlementStatus: "pending",
    createdAt: "2026-06-03T11:05:00.000Z",
    updatedAt: "2026-06-03T11:05:00.000Z"
  },
  activeCompensationRule: {
    id: 1,
    sourceType: "shop_default",
    shopId: 11,
    technicianProfileId: null,
    name: "Default shop rules",
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
    deductionRules: []
  },
  createdAt: "2026-06-03T09:50:00.000Z",
  updatedAt: "2026-06-03T11:05:00.000Z"
};

const createFixture = async () => {
  const passwordHash = await hash("Abcd@1234", 12);
  const auditLogs: unknown[] = [];
  const merchantPermissions = [
    "auth:me",
    "auth:refresh",
    "auth:logout",
    "merchant-admin:finance-order:read",
    "merchant-admin:finance-income-report:write",
    "merchant-admin:compensation-profile:read",
    "merchant-admin:compensation-profile:write",
    "merchant-admin:compensation-profile:preview",
    "backoffice:finance-order:read",
    "menu:merchant-admin"
  ].map(makePermission);
  const merchantRole = {
    id: 2,
    name: "Merchant Owner",
    code: "merchant_owner",
    description: "Merchant finance center",
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
  const orderFinanceRepository: jest.Mocked<OrderFinanceRepositoryPort> = {
    findOrderFinance: jest.fn(async () => orderRecord),
    upsertServiceIncomeReport: jest.fn(async (input) => ({
      ...orderRecord,
      financial: {
        ...orderRecord.financial!,
        serviceAmountJpy: input.serviceAmountJpy,
        platformCollectedServiceAmountJpy: input.platformCollectedServiceAmountJpy,
        offlineReportedServiceAmountJpy: input.offlineReportedServiceAmountJpy,
        unknownOrUnreportedServiceAmountJpy: input.unknownOrUnreportedServiceAmountJpy,
        paymentChannel: input.paymentChannel,
        serviceIncomeStatus: input.serviceIncomeStatus,
        serviceIncomeReportedById: input.reportedById,
        serviceIncomeReportedAt: now.toISOString(),
        serviceIncomeConfirmedById: input.confirmedById,
        serviceIncomeConfirmedAt: input.confirmedById ? now.toISOString() : null,
        serviceIncomeNote: input.note,
        serviceIncomeProofUrl: input.proofUrl,
        moneyTimeline: input.moneyTimeline
      }
    }))
  } as unknown as jest.Mocked<OrderFinanceRepositoryPort>;
  const compensationProfileRepository: jest.Mocked<CompensationProfileRepositoryPort> = {
    findActiveProfile: jest.fn(async () => null),
    findShopFallbackRule: jest.fn(async () => orderRecord.activeCompensationRule),
    replaceActiveProfile: jest.fn(async (_shopId, technicianProfileId, input, actorUserId) => ({
      id: 8,
      sourceType: "technician_override",
      shopId: 11,
      technicianProfileId,
      version: 1,
      status: "active",
      createdById: actorUserId,
      updatedById: actorUserId,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      ...input
    }))
  } as unknown as jest.Mocked<CompensationProfileRepositoryPort>;
  const app = createApp(undefined, {
    redisHealthCheck: async () => ({ status: "ok", latencyMs: 1 }),
    authRepository,
    authSessionStore: new InMemoryAuthSessionStore(),
    otpDeliveryClient: { sendOtp: jest.fn(async () => undefined) },
    auditLogRepository,
    orderFinanceRepository,
    compensationProfileRepository
  } as never);
  const login = async () => {
    const response = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "merchant@example.com", password: "Abcd@1234" })
      .expect(200);

    return response.body.data.accessToken as string;
  };

  return { app, auditLogs, login, orderFinanceRepository, compensationProfileRepository };
};

describe("finance center API", () => {
  it("exposes order money timeline, service income reporting, and technician compensation profile preview", async () => {
    const fixture = await createFixture();
    const token = await fixture.login();

    const detailResponse = await request(fixture.app)
      .get("/api/v1/merchant-admin/finance/orders/101")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    expect(detailResponse.body.data).toMatchObject({
      bookingOrderId: 101,
      orderNo: "BK-20260603-0001",
      serviceIncomeStatus: "unreported",
      technicianIncomePreview: {
        technicianNetIncomeJpy: 5250
      }
    });

    const reportResponse = await request(fixture.app)
      .put("/api/v1/merchant-admin/finance/orders/101/service-income-report")
      .set("Authorization", `Bearer ${token}`)
      .send({
        serviceAmountJpy: 8800,
        platformCollectedServiceAmountJpy: 0,
        offlineReportedServiceAmountJpy: 8800,
        paymentChannel: "offline_cash",
        confirmNow: true,
        note: "店铺现金收款",
        proofUrl: "https://example.test/proof/BK-20260603-0001"
      })
      .expect(200);
    expect(reportResponse.body.data).toMatchObject({
      serviceIncomeStatus: "confirmed",
      offlineReportedServiceAmountJpy: 8800,
      unknownOrUnreportedServiceAmountJpy: 0
    });

    const profileResponse = await request(fixture.app)
      .put("/api/v1/merchant-admin/shops/11/technicians/21/compensation-profile")
      .set("Authorization", `Bearer ${token}`)
      .send({
        name: "Misaki hybrid compensation",
        wageMode: "base_plus_commission",
        fixedOrderPayJpy: 1000,
        commissionRatePercent: 50,
        guaranteedMinimumJpy: 0,
        ndpFeeBearer: "split",
        technicianNdpSharePercent: 30,
        bonusRules: [],
        deductionRules: []
      })
      .expect(200);
    expect(profileResponse.body.data).toMatchObject({
      id: 8,
      sourceType: "technician_override",
      technicianProfileId: 21,
      name: "Misaki hybrid compensation"
    });

    const previewResponse = await request(fixture.app)
      .post("/api/v1/merchant-admin/shops/11/technicians/21/compensation-profile/preview")
      .set("Authorization", `Bearer ${token}`)
      .send({
        serviceAmountJpy: 8800,
        platformFeeNdp: 500,
        workedMinutes: 60
      })
      .expect(200);
    expect(previewResponse.body.data.preview).toMatchObject({
      technicianNetIncomeJpy: 5250,
      shopEstimatedGrossProfitJpy: 3050
    });
    expect(fixture.auditLogs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          actorId: 2,
          action: "merchant_admin.finance_order.service_income_report",
          targetType: "booking_order",
          targetId: 101
        }),
        expect.objectContaining({
          actorId: 2,
          action: "merchant_admin.compensation_profile.update",
          targetType: "technician_profile",
          targetId: 21
        })
      ])
    );
  });
});
