import { hash } from "bcryptjs";
import request from "supertest";
import { createApp } from "../src/app";
import type { ExchangeClaimService } from "../src/services/exchange-claim.service";
import type {
  ExchangeClaimOptionPayload,
  ExchangeClaimPayload
} from "../src/types/exchange-claim.types";
import { createDirectShopContextRepository } from "./helpers/merchant-shop-context";

class InMemoryAuthSessionStore {
  private readonly values = new Map<string, string>();
  public async getLoginLock(): Promise<boolean> {
    return false;
  }
  public async getAccountLoginLock(): Promise<boolean> {
    return false;
  }
  public async recordFailedLogin(): Promise<{ count: number; locked: boolean }> {
    return { count: 1, locked: false };
  }
  public async recordFailedLoginForAccount(): Promise<{ count: number; locked: boolean }> {
    return { count: 1, locked: false };
  }
  public async clearFailedLogin(): Promise<void> {}
  public async clearFailedLoginForAccount(): Promise<void> {}
  public async storeOtp(): Promise<void> {}
  public async getOtp(): Promise<string | null> {
    return null;
  }
  public async deleteOtp(): Promise<void> {}
  public async hasOtpCooldown(): Promise<boolean> {
    return false;
  }
  public async storeOtpCooldown(): Promise<void> {}
  public async clearOtpCooldown(): Promise<void> {}
  public async storeRefreshToken(userId: number, jti: string): Promise<void> {
    this.values.set(`${userId}:${jti}`, "1");
  }
  public async hasRefreshToken(userId: number, jti: string): Promise<boolean> {
    return this.values.has(`${userId}:${jti}`);
  }
  public async revokeRefreshToken(userId: number, jti: string): Promise<void> {
    this.values.delete(`${userId}:${jti}`);
  }
  public async revokeAllRefreshTokens(): Promise<void> {
    this.values.clear();
  }
  public async rotateRefreshToken(): Promise<boolean> {
    return true;
  }
  public async blacklistAccessToken(): Promise<void> {}
  public async isAccessTokenBlacklisted(): Promise<boolean> {
    return false;
  }
}

const now = new Date("2026-09-01T00:00:00.000Z");
const claim: ExchangeClaimPayload = {
  id: 301,
  exchangePostId: 41,
  status: "active",
  source: "shop_dispatch",
  provider: { publicId: "B0000000017", displayName: "青山店", avatarUrl: null },
  shop: { id: 11, name: "Aoyama Care", publicId: "shop0000000011" },
  technician: { profileId: 81, publicId: "S0000000081", displayName: "山田 花子" },
  service: { ref: "shop:501", publicId: "service0000000501", name: "ヘアセット", durationMinutes: 60 },
  scheduleSlotId: 91,
  quoteAmountJpy: 15_000,
  currency: "JPY",
  message: null,
  estimatedStartsAt: "2026-09-02T01:00:00.000Z",
  estimatedEndsAt: "2026-09-02T02:00:00.000Z",
  createdAt: now.toISOString(),
  withdrawnAt: null,
  terminalAt: null
};

const option: ExchangeClaimOptionPayload = {
  scheduleSlotId: 91,
  shop: { id: 11, name: "Aoyama Care" },
  technician: { profileId: 81, publicId: "S0000000081", displayName: "山田 花子" },
  service: { ref: "shop:501", name: "ヘアセット", durationMinutes: 60 },
  startsAt: "2026-09-02T01:00:00.000Z",
  endsAt: "2026-09-02T02:00:00.000Z"
};

const authPermissions = ["auth:me", "auth:refresh", "auth:logout"];
const claimPermissions = [
  "exchange:claim-options:list",
  "exchange:claims:create",
  "exchange:claims:read-own",
  "exchange:claims:list-owned-request",
  "exchange:claims:withdraw-own"
];

const createFixture = async () => {
  const passwordHash = await hash("Abcd@1234", 12);
  const permissionCodes = [...authPermissions, ...claimPermissions];
  const permissions = permissionCodes.map((code, index) => ({
    id: index + 1,
    name: code,
    code,
    type: "api",
    module: "exchange",
    description: code,
    isSystem: true,
    createdAt: now,
    updatedAt: now,
    deletedAt: null
  }));
  const role = (id: number, code: string, allowed: string[]) => ({
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
  const permittedRole = role(1, "merchant_staff", permissionCodes);
  const deniedRole = role(2, "merchant_staff_no_claim", authPermissions);
  const user = (id: number, email: string, assignedRole: ReturnType<typeof role>) => ({
    id,
    needoId: `u${String(id).padStart(10, "0")}`,
    email,
    phone: null,
    passwordHash,
    username: email,
    avatarUrl: null,
    isActive: true,
    isTestAccount: true,
    accessState: { disabled: false, restricted: false },
    lastLoginAt: null,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    identities: [
      {
        id: id + 10,
        userId: id,
        type: "merchant_staff",
        scopeType: "shop",
        scopeId: 11,
        displayName: email,
        isDefault: true,
        isActive: true,
        deletedAt: null
      }
    ],
    userRoles: [{ deletedAt: null, role: assignedRole }]
  });
  const users = [
    user(7, "claim-enabled@example.test", permittedRole),
    user(8, "claim-denied@example.test", deniedRole)
  ];
  const service = {
    listOptions: jest.fn(async () => ({ list: [option], total: 1, page: 1, page_size: 20 })),
    createClaim: jest.fn(async () => claim),
    listReceived: jest.fn(async () => ({ list: [claim], total: 1, page: 1, page_size: 20 })),
    getMine: jest.fn(async () => claim),
    withdrawClaim: jest.fn(async () => ({
      ...claim,
      status: "withdrawn" as const,
      withdrawnAt: now.toISOString(),
      terminalAt: now.toISOString()
    }))
  } as unknown as jest.Mocked<ExchangeClaimService>;
  const app = createApp(undefined, {
    redisHealthCheck: async () => ({ status: "ok", latencyMs: 1 }),
    authRepository: {
      findUserByEmail: jest.fn(
        async (email: string) => users.find((candidate) => candidate.email === email) ?? null
      ),
      findUserByLoginIdentifier: jest.fn(
        async (value: string) => users.find((candidate) => candidate.email === value) ?? null
      ),
      findUserById: jest.fn(
        async (id: number) => users.find((candidate) => candidate.id === id) ?? null
      ),
      updateLastLoginAt: jest.fn(async () => undefined),
      createLoginLog: jest.fn(async () => undefined),
      createAuditLog: jest.fn(async () => undefined)
    },
    merchantShopContextRepository: createDirectShopContextRepository({ shopId: 11 }),
    testOnlyAllowLegacyAuthAdapters: true,
    authSessionStore: new InMemoryAuthSessionStore(),
    otpDeliveryClient: { sendOtp: jest.fn(async () => undefined) },
    exchangeClaimService: service
  } as never);
  const login = async (email: string): Promise<string> => {
    const response = await request(app)
      .post("/api/v1/auth/login")
      .send({ loginIdentifier: email, password: "Abcd@1234" })
      .expect(200);
    return response.body.data.accessToken as string;
  };
  return { app, login, service };
};

describe("formal Exchange claim routes", () => {
  it("requires JWT and the exact permission for claim option reads", async () => {
    const { app, login } = await createFixture();
    await request(app).get("/api/v1/exchange/posts/41/claim-options").expect(401);
    const denied = await login("claim-denied@example.test");
    await request(app)
      .get("/api/v1/exchange/posts/41/claim-options")
      .set("Authorization", `Bearer ${denied}`)
      .expect(403);
  });

  it("exposes all five authenticated paginated claim endpoints", async () => {
    const { app, login, service } = await createFixture();
    const token = await login("claim-enabled@example.test");
    const auth = { Authorization: `Bearer ${token}` };

    await request(app)
      .get("/api/v1/exchange/posts/41/claim-options?page=1&page_size=20")
      .set(auth)
      .expect(200);
    await request(app)
      .post("/api/v1/exchange/posts/41/claims")
      .set(auth)
      .set("Idempotency-Key", "claim-route-key-0001")
      .send({ scheduleSlotId: 91, quoteAmountJpy: 15_000, message: null })
      .expect(201);
    await request(app)
      .get("/api/v1/exchange/posts/41/claims?page=1&page_size=20")
      .set(auth)
      .expect(200);
    await request(app).get("/api/v1/exchange/posts/41/claims/mine").set(auth).expect(200);
    await request(app)
      .post("/api/v1/exchange/claims/301/withdraw")
      .set(auth)
      .set("Idempotency-Key", "claim-withdraw-route-0001")
      .expect(200);

    expect(service.createClaim).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 7, currentIdentityType: "merchant_staff" }),
      41,
      { scheduleSlotId: 91, quoteAmountJpy: 15_000, message: null },
      "claim-route-key-0001",
      expect.objectContaining({ ip: expect.any(String) })
    );
    expect(service.listReceived).toHaveBeenCalledWith(expect.any(Object), 41, {
      page: 1,
      page_size: 20
    });
    expect(service.withdrawClaim).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 7, currentIdentityType: "merchant_staff" }),
      301,
      "claim-withdraw-route-0001",
      expect.objectContaining({ ip: expect.any(String) })
    );
  });

  it("wraps an absent own claim in a non-null success payload", async () => {
    const { app, login, service } = await createFixture();
    service.getMine.mockResolvedValueOnce(null);
    const token = await login("claim-enabled@example.test");

    const response = await request(app)
      .get("/api/v1/exchange/posts/41/claims/mine")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(response.body).toEqual({
      code: 0,
      message: "success",
      data: { claim: null }
    });
  });

  it("requires a valid idempotency key for withdrawal", async () => {
    const { app, login, service } = await createFixture();
    const token = await login("claim-enabled@example.test");
    const endpoint = "/api/v1/exchange/claims/301/withdraw";
    const auth = { Authorization: `Bearer ${token}` };

    await request(app).post(endpoint).set(auth).expect(400);
    await request(app).post(endpoint).set(auth).set("Idempotency-Key", "short").expect(400);
    expect(service.withdrawClaim).not.toHaveBeenCalled();
  });

  it("rejects invalid create bodies and missing or short idempotency keys", async () => {
    const { app, login, service } = await createFixture();
    const token = await login("claim-enabled@example.test");
    const endpoint = "/api/v1/exchange/posts/41/claims";
    const auth = { Authorization: `Bearer ${token}` };

    await request(app)
      .post(endpoint)
      .set(auth)
      .set("Idempotency-Key", "claim-route-key-0002")
      .send({ scheduleSlotId: 0, quoteAmountJpy: 0 })
      .expect(400);
    await request(app)
      .post(endpoint)
      .set(auth)
      .send({ scheduleSlotId: 91, quoteAmountJpy: 15_000 })
      .expect(400);
    await request(app)
      .post(endpoint)
      .set(auth)
      .set("Idempotency-Key", "short")
      .send({ scheduleSlotId: 91, quoteAmountJpy: 15_000 })
      .expect(400);
    expect(service.createClaim).not.toHaveBeenCalled();
  });
});
