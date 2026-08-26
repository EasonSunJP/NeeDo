import { hash } from "bcryptjs";
import request from "supertest";
import { createApp } from "../src/app";
import { ERROR_CODES } from "../src/constants/error-codes";
import type { BillingReconciliationTransition } from "../src/services/merchant-saas-billing.service";

interface StoredValue {
  value: string;
  expiresAt: number;
}

class InMemoryAuthSessionStore {
  private readonly values = new Map<string, StoredValue>();

  public async getLoginLock(email: string): Promise<boolean> {
    return this.getValue(`login:lock:${email}`) !== null;
  }

  public async recordFailedLogin(): Promise<{ count: number; locked: boolean }> {
    return { count: 1, locked: false };
  }

  public async clearFailedLogin(): Promise<void> {}

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
    this.values.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
  }

  private getValue(key: string): string | null {
    const stored = this.values.get(key);

    if (!stored || stored.expiresAt <= Date.now()) {
      this.values.delete(key);
      return null;
    }

    return stored.value;
  }
}

const now = new Date("2026-08-25T00:00:00.000Z");
const makePermission = (code: string, index: number) => ({
  id: index + 1,
  name: code,
  code,
  type: "api",
  module: "backoffice",
  description: code,
  isSystem: true,
  createdAt: now,
  updatedAt: now,
  deletedAt: null
});

const createFixture = async () => {
  const passwordHash = await hash("Abcd@1234", 12);
  const auditLogs: unknown[] = [];
  const allCodes = [
    "auth:me",
    "auth:refresh",
    "auth:logout",
    "backoffice:merchant-accounts:list",
    "backoffice:merchant-accounts:read",
    "backoffice:merchant-accounts:manage",
    "backoffice:saas-billing:read",
    "backoffice:saas-billing:write",
    "backoffice:saas-payment:review",
    "backoffice:entity-suspension:write",
    "backoffice:entity-suspension:release",
    "backoffice:entity-dissolution:write"
  ];
  const permissions = allCodes.map(makePermission);
  const createRole = (id: number, code: string, allowed: string[]) => ({
    id,
    name: code,
    code,
    description: code,
    isSystem: true,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    rolePermissions: permissions
      .filter((permission) => allowed.includes(permission.code))
      .map((permission, index) => ({
        id: id * 100 + index,
        roleId: id,
        permissionId: permission.id,
        deletedAt: null,
        permission
      }))
  });
  const adminRole = createRole(1, "admin", allCodes);
  const viewerRole = createRole(2, "viewer", [
    "auth:me",
    "auth:refresh",
    "auth:logout",
    "backoffice:merchant-accounts:list",
    "backoffice:merchant-accounts:read"
  ]);
  const users = [
    { id: 1, email: "admin@example.com", username: "Admin", role: adminRole },
    { id: 2, email: "viewer@example.com", username: "Viewer", role: viewerRole }
  ].map((user) => ({
    ...user,
    phone: null,
    passwordHash,
    avatarUrl: null,
    isActive: true,
    lastLoginAt: null as Date | null,
    deletedAt: null,
    identities: [
      {
        id: user.id,
        userId: user.id,
        type: "platform",
        scopeType: "global",
        scopeId: null,
        displayName: user.username,
        isDefault: true,
        isActive: true,
        deletedAt: null
      }
    ],
    userRoles: [{ deletedAt: null, role: user.role }]
  }));
  const authRepository = {
    findUserByEmail: jest.fn(async (email: string) => users.find((user) => user.email === email)),
    findUserByLoginIdentifier: jest.fn(async (identifier: string) =>
      users.find((user) => user.email === identifier || user.username === identifier)
    ),
    findUserById: jest.fn(async (id: number) => users.find((user) => user.id === id)),
    updateLastLoginAt: jest.fn(async () => undefined),
    createLoginLog: jest.fn(async () => undefined),
    createAuditLog: jest.fn(async (entry: unknown) => auditLogs.push(entry))
  };
  const profile = {
    id: 20,
    subjectType: "merchant_account",
    subjectId: 5,
    billingCadence: "monthly",
    monthlyFeeJpy: 9800,
    cadenceLocked: false,
    amountLocked: false,
    trialStatus: "active",
    trialStartedAt: new Date("2026-07-31T15:00:00.000Z"),
    trialEndsAt: new Date("2026-10-31T15:00:00.000Z"),
    trialUsedAt: new Date("2026-07-31T15:00:00.000Z"),
    paidThrough: null,
    paymentProvider: "manual",
    version: 1,
    activeTechnicians: 2,
    freePeriods: [
      {
        id: 1,
        periodType: "initial_trial",
        startsAt: new Date("2026-07-31T15:00:00.000Z"),
        endsAt: new Date("2026-10-31T15:00:00.000Z"),
        extensionSequence: null,
        reason: "initial"
      }
    ]
  };
  const merchantRecord = {
    kind: "merchant_group",
    id: 5,
    code: "tokyo-group",
    name: "Tokyo Group",
    status: "active",
    paymentResponsibility: "group_consolidated",
    createdAt: now,
    billingProfile: profile,
    activeSuspension: null,
    shops: [
      {
        kind: "shop",
        id: 11,
        name: "Aoyama Care",
        city: "Tokyo",
        address: "Aoyama",
        phone: null,
        status: "published",
        ownerEmail: "owner@example.com",
        coverUrl: null,
        ratingAverage: 4.8,
        reviewCount: 12,
        technicianCount: 2,
        createdAt: now,
        billingProfile: { ...profile, id: 21, subjectType: "shop", subjectId: 11 },
        activeSuspension: null
      }
    ]
  };
  const invoiceRecord = {
    id: 30,
    invoiceNo: "SAAS-2026-0001",
    payerType: "merchant_account",
    payerId: 5,
    billingCadence: "monthly",
    periodStartsAt: "2026-11-01T00:00:00.000Z",
    periodEndsAt: "2026-12-01T00:00:00.000Z",
    dueAt: "2026-11-01T00:00:00.000Z",
    amountJpy: 19600,
    status: "paid",
    paymentProvider: "manual",
    lines: [],
    payments: [
      {
        id: 40,
        provider: "manual",
        externalReference: "BANK-001",
        amountJpy: 19600,
        receivedAt: "2026-10-28T00:00:00.000Z",
        status: "confirmed",
        reviewedById: 1,
        reviewedAt: "2026-10-28T00:00:00.000Z"
      }
    ]
  };
  const merchantSaasBillingRepository = {
    listAccounts: jest.fn(async () => ({
      list: [merchantRecord],
      total: 1,
      page: 1,
      page_size: 20
    })),
    getMerchantAccount: jest.fn(async () => merchantRecord),
    createMerchantAccount: jest.fn(async () => merchantRecord),
    findBillingProfile: jest.fn(async () => profile),
    reconcileShopBillingProfiles: jest.fn(
      async (): Promise<BillingReconciliationTransition[]> => []
    ),
    updateBillingProfile: jest.fn(
      async (input: { billingCadence: string; monthlyFeeJpy: number }) => ({
        before: { ...profile },
        after: {
          ...profile,
          billingCadence: input.billingCadence,
          monthlyFeeJpy: input.monthlyFeeJpy,
          version: 2
        }
      })
    ),
    updatePaymentResponsibility: jest.fn(async () => merchantRecord),
    linkShop: jest.fn(async () => merchantRecord),
    unlinkShop: jest.fn(async () => merchantRecord),
    addTrialExtension: jest.fn(async () => ({ ...profile, version: 2 })),
    interruptTrial: jest.fn(async () => ({ ...profile, trialStatus: "interrupted", version: 2 })),
    listFreePeriods: jest.fn(async () => ({
      list: profile.freePeriods,
      total: profile.freePeriods.length,
      page: 1,
      page_size: 20
    })),
    listInvoices: jest.fn(async () => ({ list: [], total: 0, page: 1, page_size: 20 })),
    materializeDueInvoices: jest.fn(async () => []),
    getInvoice: jest.fn(async () => invoiceRecord),
    recordManualPayment: jest.fn(async () => invoiceRecord),
    createSuspension: jest.fn(
      async (input: {
        subjectType: string;
        subjectId: number;
        scope: string;
        reasonCodes: string[];
        note: string;
      }) => ({
        id: 70,
        ...input,
        startsAt: now,
        affectedShopIds: [11],
        detachedShopIds: [],
        promotedAdminUserIds: []
      })
    ),
    releaseSuspension: jest.fn(async () => ({
      id: 70,
      subjectType: "shop",
      subjectId: 11,
      releasedAt: now
    })),
    softDeleteMerchant: jest.fn(async () => ({ deleted: true, blockedShopIds: [] })),
    softDeleteShop: jest.fn(async () => ({ deleted: true, activeOrderCount: 0 }))
  };
  const app = createApp(undefined, {
    redisHealthCheck: async () => ({ status: "ok", latencyMs: 1 }),
    authRepository,
    testOnlyAllowLegacyAuthAdapters: true,
    authSessionStore: new InMemoryAuthSessionStore(),
    otpDeliveryClient: { sendOtp: jest.fn(async () => undefined) },
    auditLogRepository: { create: jest.fn(async (entry: unknown) => auditLogs.push(entry)) },
    merchantSaasBillingRepository
  } as never);
  const login = async (email: string): Promise<string> => {
    const response = await request(app)
      .post("/api/v1/auth/login")
      .send({ email, password: "Abcd@1234" })
      .expect(200);

    return response.body.data.accessToken as string;
  };

  return { app, auditLogs, login, merchantSaasBillingRepository };
};

describe("merchant SaaS billing backoffice API", () => {
  it("returns grouped cards with nested shops and derived billing state", async () => {
    const fixture = await createFixture();
    const token = await fixture.login("admin@example.com");
    const response = await request(fixture.app)
      .get("/api/v1/backoffice/merchant-accounts?page=1&pageSize=20")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(response.body.data.list[0]).toMatchObject({
      type: "merchant_group",
      paymentResponsibility: "group_consolidated",
      billing: { state: "trial", annualFeeJpy: 98000 },
      shops: [expect.objectContaining({ type: "shop", technicianCount: 2 })]
    });
    expect(fixture.merchantSaasBillingRepository.listAccounts).toHaveBeenCalledWith({
      page: 1,
      pageSize: 20
    });
  });

  it("persists and audits technician-count trial transitions before returning cards", async () => {
    const fixture = await createFixture();
    fixture.merchantSaasBillingRepository.reconcileShopBillingProfiles.mockResolvedValueOnce([
      {
        subjectType: "shop",
        subjectId: 11,
        action: "trial_started",
        occurredAt: new Date("2026-08-24T15:00:00.000Z")
      }
    ]);
    const token = await fixture.login("admin@example.com");

    await request(fixture.app)
      .get("/api/v1/backoffice/merchant-accounts?page=1&pageSize=20")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(fixture.merchantSaasBillingRepository.reconcileShopBillingProfiles).toHaveBeenCalledWith(
      expect.objectContaining({ shopIds: [11], actorUserId: 1 })
    );
    expect(fixture.merchantSaasBillingRepository.listAccounts).toHaveBeenCalledTimes(2);
    expect(fixture.auditLogs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: "backoffice.saas_billing.trial_started",
          targetType: "shop",
          targetId: 11
        })
      ])
    );
  });

  it("rejects billing writes without backoffice:saas-billing:write", async () => {
    const fixture = await createFixture();
    const token = await fixture.login("viewer@example.com");

    await request(fixture.app)
      .patch("/api/v1/backoffice/shops/11/billing-profile")
      .set("Authorization", `Bearer ${token}`)
      .send({
        billingCadence: "annual",
        monthlyFeeJpy: 9800,
        cadenceLocked: true,
        amountLocked: true,
        version: 1
      })
      .expect(403)
      .expect((response) => expect(response.body.code).toBe(ERROR_CODES.FORBIDDEN));
    expect(fixture.merchantSaasBillingRepository.updateBillingProfile).not.toHaveBeenCalled();
  });

  it("loads trial and payment history with merchant-account detail read access", async () => {
    const fixture = await createFixture();
    const token = await fixture.login("viewer@example.com");

    await request(fixture.app)
      .get("/api/v1/backoffice/billing-subjects/merchant_account/5/free-periods?page=1&pageSize=100")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    await request(fixture.app)
      .get("/api/v1/backoffice/saas-invoices?page=1&pageSize=100&payerType=merchant_account")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
  });

  it("validates and audits an optimistic billing-profile update", async () => {
    const fixture = await createFixture();
    const token = await fixture.login("admin@example.com");
    const response = await request(fixture.app)
      .patch("/api/v1/backoffice/shops/11/billing-profile")
      .set("Authorization", `Bearer ${token}`)
      .send({
        billingCadence: "annual",
        monthlyFeeJpy: 9800,
        cadenceLocked: true,
        amountLocked: true,
        version: 1
      })
      .expect(200);

    expect(response.body.data).toMatchObject({
      cadence: "annual",
      monthlyFeeJpy: 9800,
      annualFeeJpy: 98000,
      version: 2
    });
    expect(fixture.auditLogs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: "backoffice.saas_billing.profile.update",
          targetType: "shop",
          targetId: 11
        })
      ])
    );
  });

  it("returns validation errors before repository writes", async () => {
    const fixture = await createFixture();
    const token = await fixture.login("admin@example.com");

    await request(fixture.app)
      .patch("/api/v1/backoffice/shops/11/billing-profile")
      .set("Authorization", `Bearer ${token}`)
      .send({ billingCadence: "weekly", monthlyFeeJpy: -1, version: 0 })
      .expect(400)
      .expect((response) => expect(response.body.code).toBe(ERROR_CODES.VALIDATION));
    expect(fixture.merchantSaasBillingRepository.updateBillingProfile).not.toHaveBeenCalled();
  });

  it("calculates a quick trial extension and records the authoritative end date", async () => {
    const fixture = await createFixture();
    const token = await fixture.login("admin@example.com");

    await request(fixture.app)
      .post("/api/v1/backoffice/billing-subjects/merchant_account/5/trial/extensions")
      .set("Authorization", `Bearer ${token}`)
      .send({ quickMonths: 1, reason: "Retention approval", version: 1 })
      .expect(200);

    expect(fixture.merchantSaasBillingRepository.addTrialExtension).toHaveBeenCalledWith(
      expect.objectContaining({
        subjectType: "merchant_account",
        subjectId: 5,
        expectedVersion: 1,
        expectedExtensionCount: 0,
        endsAt: new Date("2026-11-30T15:00:00.000Z"),
        addedMonths: 1,
        addedDays: 0
      })
    );
  });

  it("reviews a manual payment through the provider boundary and audit log", async () => {
    const fixture = await createFixture();
    const token = await fixture.login("admin@example.com");
    const response = await request(fixture.app)
      .post("/api/v1/backoffice/saas-invoices/30/manual-payments")
      .set("Authorization", `Bearer ${token}`)
      .send({
        amountJpy: 19600,
        receivedAt: "2026-10-28T00:00:00.000Z",
        reference: "BANK-001",
        idempotencyKey: "payment-review-0001"
      })
      .expect(200);

    expect(response.body.data).toMatchObject({ id: 30, status: "paid" });
    expect(fixture.merchantSaasBillingRepository.recordManualPayment).toHaveBeenCalledWith(
      expect.objectContaining({
        invoiceId: 30,
        actorUserId: 1,
        provider: "manual",
        idempotencyKey: "payment-review-0001"
      })
    );
    expect(fixture.auditLogs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: "backoffice.saas_payment.review",
          targetType: "saas_invoice",
          targetId: 30
        })
      ])
    );
  });

  it("creates and releases a manual shop suspension without a login-disable side effect", async () => {
    const fixture = await createFixture();
    const token = await fixture.login("admin@example.com");
    const created = await request(fixture.app)
      .post("/api/v1/backoffice/entities/shop/11/suspensions")
      .set("Authorization", `Bearer ${token}`)
      .send({
        reasonCodes: ["overdue_payment", "customer_complaints"],
        note: "Manual review",
        scope: "subject_only"
      })
      .expect(200);

    expect(created.body.data).toMatchObject({
      id: 70,
      subjectType: "shop",
      subjectId: 11,
      affectedShopIds: [11]
    });
    await request(fixture.app)
      .post("/api/v1/backoffice/entities/shop/11/suspensions/70/release")
      .set("Authorization", `Bearer ${token}`)
      .send({ reason: "Review completed" })
      .expect(200)
      .expect((response) => expect(response.body.data.releasedAt).toBe(now.toISOString()));

    expect(fixture.auditLogs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: "backoffice.entity_suspension.create",
          metadata: expect.objectContaining({
            loginDisabled: false,
            existingBookingsCancelled: false
          })
        }),
        expect.objectContaining({
          action: "backoffice.entity_suspension.release",
          metadata: expect.objectContaining({ blockedAvailabilityRestored: false })
        })
      ])
    );
  });
});
