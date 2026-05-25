import { hash } from "bcryptjs";
import request from "supertest";
import { createApp } from "../src/app";

const now = new Date("2026-05-25T00:00:00.000Z");

class InMemoryAuthSessionStore {
  private readonly values = new Map<string, { value: string; expiresAt: number }>();

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
      return null;
    }

    return stored.value;
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
  const permissions = [
    "auth:me",
    "auth:refresh",
    "auth:logout",
    "wallet:read",
    "wallet:ledger:list",
    "finance:ledger:list",
    "finance:reconciliation:list",
    "finance:reconciliation:export"
  ].map(makePermission);
  const role = {
    id: 1,
    name: "Finance",
    code: "finance",
    description: "Finance role",
    isSystem: true,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    rolePermissions: permissions.map((permission, index) => ({
      id: index + 1,
      roleId: 1,
      permissionId: permission.id,
      deletedAt: null,
      permission
    }))
  };
  const user = {
    id: 7,
    email: "finance@example.com",
    phone: null,
    passwordHash,
    username: "Finance User",
    avatarUrl: null,
    isActive: true,
    lastLoginAt: null as Date | null,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    identities: [
      {
        id: 1,
        userId: 7,
        type: "platform_admin",
        scopeType: "platform",
        scopeId: null,
        displayName: "Finance User",
        isDefault: true,
        isActive: true,
        deletedAt: null
      }
    ],
    userRoles: [
      {
        id: 1,
        userId: 7,
        roleId: 1,
        scopeType: "platform",
        scopeId: null,
        deletedAt: null,
        role
      }
    ]
  };
  const ledgerRepository = {
    findWallet: jest.fn(async () => ({
      id: 1,
      ownerType: "user",
      ownerId: 7,
      currency: "NDP",
      availableBalance: 100,
      frozenBalance: 0,
      createdAt: now,
      updatedAt: now
    })),
    listWalletLedger: jest.fn(async () => ({
      list: [],
      total: 0,
      page: 1,
      page_size: 20
    })),
    listLedgerTransactions: jest.fn(async () => ({
      list: [
        {
          id: 1,
          transactionNo: "LT202605250001",
          idempotencyKey: "booking:1:complete",
          type: "booking_complete_settlement",
          status: "applied",
          referenceType: "booking_order",
          referenceId: 1,
          actorUserId: 2,
          amount: 600,
          currency: "NDP",
          metadata: null,
          createdAt: now,
          updatedAt: now,
          entries: []
        }
      ],
      total: 1,
      page: 1,
      page_size: 20
    })),
    listFinanceReconciliation: jest.fn(async () => ({
      list: [
        {
          id: 1,
          transactionId: 1,
          transactionNo: "LT202605250001",
          referenceType: "booking_order",
          referenceId: 1,
          status: "pending",
          currency: "NDP",
          expectedAmount: 600,
          actualAmount: 600,
          differenceAmount: 0,
          exportedAt: null,
          createdAt: now,
          updatedAt: now
        }
      ],
      total: 1,
      page: 1,
      page_size: 20
    })),
    exportFinanceReconciliation: jest.fn(async () => ({
      filename: "finance-reconciliation-2026-05-25.csv",
      contentType: "text/csv",
      csv: "transaction_no,reference_type,reference_id,status,expected_amount,actual_amount,difference_amount\nLT202605250001,booking_order,1,pending,600,600,0\n"
    }))
  };
  const app = createApp(undefined, {
    redisHealthCheck: async () => ({ status: "ok", latencyMs: 1 }),
    authRepository: {
      findUserByEmail: jest.fn(async (email: string) => (email === user.email ? user : null)),
      findUserByLoginIdentifier: jest.fn(async (identifier: string) =>
        identifier === user.email || identifier === user.username ? user : null
      ),
      findUserById: jest.fn(async (id: number) => (id === user.id ? user : null)),
      updateLastLoginAt: jest.fn(async (_id: number, loggedInAt: Date) => {
        user.lastLoginAt = loggedInAt;
      }),
      createLoginLog: jest.fn(async () => undefined),
      createAuditLog: jest.fn(async () => undefined)
    },
    authSessionStore: new InMemoryAuthSessionStore(),
    otpDeliveryClient: { sendOtp: jest.fn(async () => undefined) },
    ledgerRepository
  } as never);
  const login = async () => {
    const response = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: user.email, password: "Abcd@1234" })
      .expect(200);

    return response.body.data.accessToken as string;
  };

  return { app, login };
};

describe("Step 11 wallet ledger and finance APIs", () => {
  it("returns wallet, ledger transactions, reconciliation rows, and export content through RBAC APIs", async () => {
    const fixture = await createFixture();
    const token = await fixture.login();

    await request(fixture.app)
      .get("/api/v1/wallets/me")
      .set("Authorization", `Bearer ${token}`)
      .expect(200)
      .expect((response) => {
        expect(response.body.data).toMatchObject({
          ownerType: "user",
          ownerId: 7,
          currency: "NDP",
          availableBalance: 100
        });
      });

    await request(fixture.app)
      .get("/api/v1/finance/ledger/transactions?page=1&pageSize=20&referenceType=booking_order")
      .set("Authorization", `Bearer ${token}`)
      .expect(200)
      .expect((response) => {
        expect(response.body.data.list[0]).toMatchObject({
          transactionNo: "LT202605250001",
          referenceType: "booking_order",
          amount: 600
        });
      });

    await request(fixture.app)
      .get("/api/v1/finance/reconciliation?page=1&pageSize=20")
      .set("Authorization", `Bearer ${token}`)
      .expect(200)
      .expect((response) => {
        expect(response.body.data.list[0]).toMatchObject({
          transactionNo: "LT202605250001",
          expectedAmount: 600,
          differenceAmount: 0
        });
      });

    await request(fixture.app)
      .get("/api/v1/finance/reconciliation/export")
      .set("Authorization", `Bearer ${token}`)
      .expect(200)
      .expect((response) => {
        expect(response.body.data).toMatchObject({
          filename: "finance-reconciliation-2026-05-25.csv",
          contentType: "text/csv"
        });
        expect(response.body.data.csv).toContain(
          "LT202605250001,booking_order,1,pending,600,600,0"
        );
      });
  });
});
