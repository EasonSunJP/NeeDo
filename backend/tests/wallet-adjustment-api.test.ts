import { hash } from "bcryptjs";
import request from "supertest";
import { createApp } from "../src/app";

class InMemorySessionStore {
  private readonly values = new Map<string, string>();
  public async getLoginLock(): Promise<boolean> {
    return false;
  }
  public async recordFailedLogin(): Promise<{ count: number; locked: boolean }> {
    return { count: 1, locked: false };
  }
  public async clearFailedLogin(): Promise<void> {
    return undefined;
  }
  public async storeOtp(email: string, otp: string): Promise<void> {
    this.values.set(`otp:${email}`, otp);
  }
  public async getOtp(email: string): Promise<string | null> {
    return this.values.get(`otp:${email}`) ?? null;
  }
  public async deleteOtp(email: string): Promise<void> {
    this.values.delete(`otp:${email}`);
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
  public async storeRefreshToken(userId: number, jti: string): Promise<void> {
    this.values.set(`refresh:${userId}:${jti}`, "1");
  }
  public async hasRefreshToken(userId: number, jti: string): Promise<boolean> {
    return this.values.has(`refresh:${userId}:${jti}`);
  }
  public async revokeRefreshToken(userId: number, jti: string): Promise<void> {
    this.values.delete(`refresh:${userId}:${jti}`);
  }
  public async blacklistAccessToken(jti: string): Promise<void> {
    this.values.set(`blacklist:${jti}`, "1");
  }
  public async isAccessTokenBlacklisted(jti: string): Promise<boolean> {
    return this.values.has(`blacklist:${jti}`);
  }
}

const now = new Date("2026-08-25T00:00:00.000Z");

const createFixture = async () => {
  const passwordHash = await hash("Abcd@1234", 12);
  const role = (code: string, permissionCodes: string[]) => ({
    code,
    deletedAt: null,
    rolePermissions: permissionCodes.map((permission, index) => ({
      deletedAt: null,
      permission: { id: index + 1, code: permission, type: "api", deletedAt: null }
    }))
  });
  const users = [
    {
      id: 1,
      email: "merchant@example.com",
      phone: null,
      passwordHash,
      username: "Merchant",
      avatarUrl: null,
      isActive: true,
      lastLoginAt: null,
      deletedAt: null,
      identities: [
        {
          id: 1,
          userId: 1,
          type: "merchant_owner",
          scopeType: "shop",
          scopeId: 11,
          displayName: "Merchant",
          isDefault: true,
          isActive: true,
          deletedAt: null
        }
      ],
      userRoles: [
        {
          deletedAt: null,
          role: role("merchant_owner", ["wallet:adjustment:create", "wallet:adjustment:list"])
        }
      ]
    },
    {
      id: 2,
      email: "operator@example.com",
      phone: null,
      passwordHash,
      username: "Operator",
      avatarUrl: null,
      isActive: true,
      lastLoginAt: null,
      deletedAt: null,
      identities: [
        {
          id: 2,
          userId: 2,
          type: "platform_admin",
          scopeType: "global",
          scopeId: null,
          displayName: "Operator",
          isDefault: true,
          isActive: true,
          deletedAt: null
        }
      ],
      userRoles: [
        {
          deletedAt: null,
          role: role("operator", [
            "backoffice:wallet-adjustment:list",
            "backoffice:wallet-adjustment:review"
          ])
        }
      ]
    }
  ];
  let wallet = {
    id: 3,
    ownerType: "shop",
    ownerId: 11,
    currency: "NDP",
    availableBalance: 1000,
    frozenBalance: 0,
    createdAt: now,
    updatedAt: now
  };
  let adjustment: Record<string, unknown> | null = null;
  const ledgerRepository: Record<string, jest.Mock> = {};
  Object.assign(ledgerRepository, {
    runInTransaction: jest.fn(async (handler: (repository: unknown) => Promise<unknown>) =>
      handler(ledgerRepository)
    ),
    findWalletAdjustmentByIdempotencyKey: jest.fn(async (key: string) =>
      adjustment?.idempotencyKey === key ? adjustment : null
    ),
    createWalletAdjustmentRequest: jest.fn(async (input: Record<string, unknown>) => {
      adjustment = {
        id: 41,
        status: "pending",
        bankReference: null,
        note: null,
        reviewedById: null,
        reviewedAt: null,
        reviewNote: null,
        ledgerTransactionId: null,
        createdAt: now,
        updatedAt: now,
        ...input
      };
      return adjustment;
    }),
    listWalletAdjustmentRequests: jest.fn(async () => ({
      list: adjustment ? [adjustment] : [],
      total: adjustment ? 1 : 0,
      page: 1,
      page_size: 20
    })),
    lockWalletAdjustmentRequest: jest.fn(async (id: number) =>
      adjustment?.id === id ? adjustment : null
    ),
    approveWalletAdjustmentRequest: jest.fn(async (input: Record<string, unknown>) => {
      adjustment = {
        ...adjustment,
        status: "approved",
        reviewedById: input.reviewedById,
        reviewedAt: now,
        reviewNote: input.reviewNote,
        ledgerTransactionId: input.ledgerTransactionId
      };
      return adjustment;
    }),
    rejectWalletAdjustmentRequest: jest.fn(async () => adjustment),
    getOrCreateWallet: jest.fn(async () => wallet),
    applyWalletDelta: jest.fn(async (input: { availableDelta: number }) => {
      wallet = { ...wallet, availableBalance: wallet.availableBalance + input.availableDelta };
      return wallet;
    }),
    createTransaction: jest.fn(async (input: Record<string, unknown>) => ({
      id: 51,
      transactionNo: "LT202608250051",
      status: "applied",
      currency: "NDP",
      metadata: null,
      createdAt: now,
      updatedAt: now,
      entries: [],
      ...input
    })),
    createLedgerEntry: jest.fn(async (input: Record<string, unknown>) => ({
      id: 61,
      createdAt: now,
      ...input
    })),
    createFinanceReconciliation: jest.fn(async () => undefined),
    createAuditLog: jest.fn(async () => undefined),
    listOutstandingPlatformFeeDebtIds: jest.fn(async () => []),
    lockPlatformFeeDebt: jest.fn(async () => null),
    updatePlatformFeeDebt: jest.fn(async () => true),
    getDatabaseNow: jest.fn(async () => now)
  });
  const app = createApp(undefined, {
    redisHealthCheck: async () => ({ status: "ok", latencyMs: 1 }),
    authRepository: {
      findUserByEmail: jest.fn(
        async (email: string) => users.find((user) => user.email === email) ?? null
      ),
      findUserByLoginIdentifier: jest.fn(
        async (identifier: string) => users.find((user) => user.email === identifier) ?? null
      ),
      findUserById: jest.fn(async (id: number) => users.find((user) => user.id === id) ?? null),
      updateLastLoginAt: jest.fn(async () => undefined),
      createLoginLog: jest.fn(async () => undefined),
      createAuditLog: jest.fn(async () => undefined)
    },
    testOnlyAllowLegacyAuthAdapters: true,
    authSessionStore: new InMemorySessionStore(),
    otpDeliveryClient: { sendOtp: jest.fn(async () => undefined) },
    ledgerRepository
  } as never);
  const login = async (email: string) => {
    const response = await request(app)
      .post("/api/v1/auth/login")
      .send({ loginIdentifier: email, password: "Abcd@1234" })
      .expect(200);
    return response.body.data.accessToken as string;
  };

  return { app, ledgerRepository, login };
};

describe("wallet adjustment API", () => {
  it("lets a merchant submit and list a shop wallet top-up request", async () => {
    const fixture = await createFixture();
    const token = await fixture.login("merchant@example.com");

    const response = await request(fixture.app)
      .post("/api/v1/wallet-adjustments")
      .set("Authorization", `Bearer ${token}`)
      .send({
        type: "topup",
        amountNdp: 5000,
        idempotencyKey: "topup-api-001",
        bankReference: "BANK-001"
      })
      .expect(201);

    expect(response.body.data).toMatchObject({
      ownerType: "shop",
      ownerId: 11,
      amountNdp: 5000,
      status: "pending"
    });

    await request(fixture.app)
      .get("/api/v1/wallet-adjustments/me?page=1&pageSize=20")
      .set("Authorization", `Bearer ${token}`)
      .expect(200)
      .expect((listResponse) => expect(listResponse.body.data.total).toBe(1));
  });

  it("lets platform operations list and approve a pending request", async () => {
    const fixture = await createFixture();
    const merchantToken = await fixture.login("merchant@example.com");
    const operatorToken = await fixture.login("operator@example.com");
    await request(fixture.app)
      .post("/api/v1/wallet-adjustments")
      .set("Authorization", `Bearer ${merchantToken}`)
      .send({ type: "topup", amountNdp: 5000, idempotencyKey: "topup-api-002" })
      .expect(201);

    await request(fixture.app)
      .get("/api/v1/backoffice/wallet-adjustments?status=pending&page=1&pageSize=20")
      .set("Authorization", `Bearer ${operatorToken}`)
      .expect(200);

    const response = await request(fixture.app)
      .post("/api/v1/backoffice/wallet-adjustments/41/review")
      .set("Authorization", `Bearer ${operatorToken}`)
      .send({ action: "approve", note: "银行到账" })
      .expect(200);

    expect(response.body.data).toMatchObject({
      id: 41,
      status: "approved",
      ledgerTransactionId: 51
    });
    expect(fixture.ledgerRepository.createTransaction).toHaveBeenCalledTimes(1);
  });

  it("validates positive amounts and required review notes", async () => {
    const fixture = await createFixture();
    const merchantToken = await fixture.login("merchant@example.com");
    const operatorToken = await fixture.login("operator@example.com");

    await request(fixture.app)
      .post("/api/v1/wallet-adjustments")
      .set("Authorization", `Bearer ${merchantToken}`)
      .send({ type: "topup", amountNdp: 0, idempotencyKey: "invalid" })
      .expect(400);
    await request(fixture.app)
      .post("/api/v1/backoffice/wallet-adjustments/41/review")
      .set("Authorization", `Bearer ${operatorToken}`)
      .send({ action: "reject", note: "" })
      .expect(400);
  });
});
