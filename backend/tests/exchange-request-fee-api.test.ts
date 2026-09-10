import { hash } from "bcryptjs";
import request from "supertest";
import { createApp } from "../src/app";
import { ERROR_CODES } from "../src/constants/error-codes";
import type { ExchangeRequestFeeService } from "../src/services/exchange-request-fee.service";
import { AppError } from "../src/utils/app-error";
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

const now = new Date("2026-08-30T03:00:00.000Z");
const authCodes = ["auth:me", "auth:refresh", "auth:logout"];
const feeRead = "backoffice:exchange-request-fee:read";
const feeWrite = "backoffice:exchange-request-fee:write";
const snapshot = {
  ruleSetId: 41,
  ruleSetVersion: 3,
  ruleId: 73,
  amountNdp: 1000,
  effectiveFrom: new Date("2026-08-30T00:00:00.000Z"),
  effectiveTo: null
};

const createFixture = async () => {
  const passwordHash = await hash("Abcd@1234", 12);
  const permissions = [...authCodes, feeRead, feeWrite].map((code, index) => ({
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
  const roles = {
    operator: createRole(1, "operator", [...authCodes, feeRead]),
    finance: createRole(2, "finance", [...authCodes, feeRead, feeWrite]),
    merchantStaff: createRole(3, "merchant_staff", authCodes)
  };
  const makeUser = (id: number, email: string, role: (typeof roles)[keyof typeof roles]) => ({
    id,
    needoId: `u${String(id).padStart(10, "0")}`,
    email,
    phone: null,
    passwordHash,
    username: email,
    avatarUrl: null,
    isActive: true,
    accessState: { disabled: false, restricted: false },
    lastLoginAt: null,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    identities: [
      {
        id: id + 10,
        userId: id,
        type: role.code,
        scopeType: role.code === "merchant_staff" ? "shop" : "platform",
        scopeId: role.code === "merchant_staff" ? id + 20 : null,
        displayName: email,
        isDefault: true,
        isActive: true,
        deletedAt: null
      }
    ],
    userRoles: [{ deletedAt: null, role }]
  });
  const users = [
    makeUser(7, "operator@example.test", roles.operator),
    makeUser(8, "finance@example.test", roles.finance),
    makeUser(9, "merchant-staff@example.test", roles.merchantStaff)
  ];
  const feeService = {
    resolveCurrent: jest.fn(async () => snapshot),
    listVersions: jest.fn(async () => ({ list: [snapshot], total: 1, page: 2, page_size: 10 })),
    createVersion: jest.fn(async () => ({ ...snapshot, ruleSetVersion: 4, amountNdp: 1200 }))
  } as unknown as jest.Mocked<ExchangeRequestFeeService>;
  const app = createApp(undefined, {
    redisHealthCheck: async () => ({ status: "ok", latencyMs: 1 }),
    authRepository: {
      findUserByEmail: jest.fn(
        async (email: string) => users.find((user) => user.email === email) ?? null
      ),
      findUserByLoginIdentifier: jest.fn(
        async (value: string) => users.find((user) => user.email === value) ?? null
      ),
      findUserById: jest.fn(async (id: number) => users.find((user) => user.id === id) ?? null),
      updateLastLoginAt: jest.fn(async () => undefined),
      createLoginLog: jest.fn(async () => undefined),
      createAuditLog: jest.fn(async () => undefined)
    },
    merchantShopContextRepository: createDirectShopContextRepository(),
    testOnlyAllowLegacyAuthAdapters: true,
    authSessionStore: new InMemoryAuthSessionStore(),
    otpDeliveryClient: { sendOtp: jest.fn(async () => undefined) },
    exchangeRequestFeeService: feeService
  } as never);
  const login = async (email: string) => {
    const response = await request(app)
      .post("/api/v1/auth/login")
      .send({ loginIdentifier: email, password: "Abcd@1234" })
      .expect(200);
    return response.body.data.accessToken as string;
  };
  return { app, login, feeService };
};

describe("Exchange Request fee administration APIs", () => {
  it("returns a public current fee and paginated versions to fee readers", async () => {
    const fixture = await createFixture();
    const token = await fixture.login("operator@example.test");

    const current = await request(fixture.app)
      .get("/api/v1/backoffice/exchange-request-fee/current")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    const versions = await request(fixture.app)
      .get("/api/v1/backoffice/exchange-request-fee/versions?page=2&page_size=10")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(current.body.data).toEqual({
      amountNdp: 1000,
      ruleSetVersion: 3,
      effectiveFrom: "2026-08-30T00:00:00.000Z",
      effectiveTo: null
    });
    expect(versions.body.data).toEqual({
      list: [current.body.data],
      total: 1,
      page: 2,
      page_size: 10
    });
    expect(JSON.stringify(versions.body.data)).not.toMatch(/ruleSetId|ruleId|actorUserId/);
    expect(fixture.feeService.listVersions).toHaveBeenCalledWith({ page: 2, pageSize: 10 });
  });

  it("permits version creation only to fee writers and validates the public body", async () => {
    const fixture = await createFixture();
    const operatorToken = await fixture.login("operator@example.test");
    const financeToken = await fixture.login("finance@example.test");
    const merchantStaffToken = await fixture.login("merchant-staff@example.test");
    const body = {
      amountNdp: 1200,
      effectiveFrom: "2026-09-01T00:00:00+09:00",
      expectedCurrentVersion: 3
    };

    await request(fixture.app)
      .post("/api/v1/backoffice/exchange-request-fee/versions")
      .set("Authorization", `Bearer ${operatorToken}`)
      .send(body)
      .expect(403);
    await request(fixture.app)
      .get("/api/v1/backoffice/exchange-request-fee/current")
      .set("Authorization", `Bearer ${merchantStaffToken}`)
      .expect(403);
    await request(fixture.app)
      .post("/api/v1/backoffice/exchange-request-fee/versions")
      .set("Authorization", `Bearer ${financeToken}`)
      .send({ ...body, unknown: true })
      .expect(400);
    await request(fixture.app)
      .post("/api/v1/backoffice/exchange-request-fee/versions")
      .set("Authorization", `Bearer ${financeToken}`)
      .send(body)
      .expect(201);
    expect(fixture.feeService.createVersion).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: 8,
        amountNdp: 1200,
        expectedCurrentVersion: 3,
        effectiveFrom: new Date("2026-08-31T15:00:00.000Z"),
        audit: expect.objectContaining({ actorId: 8 })
      })
    );
  });

  it("preserves conflict and unavailable AppError envelopes over HTTP", async () => {
    const fixture = await createFixture();
    const financeToken = await fixture.login("finance@example.test");
    const operatorToken = await fixture.login("operator@example.test");
    const body = {
      amountNdp: 1200,
      effectiveFrom: "2026-09-01T00:00:00+09:00",
      expectedCurrentVersion: 3
    };

    fixture.feeService.createVersion.mockRejectedValueOnce(
      new AppError({
        code: ERROR_CODES.EXCHANGE_REQUEST_FEE_VERSION_CONFLICT,
        message: "error.exchange.request_fee_version_conflict",
        statusCode: 409
      })
    );
    const conflict = await request(fixture.app)
      .post("/api/v1/backoffice/exchange-request-fee/versions")
      .set("Authorization", `Bearer ${financeToken}`)
      .send(body)
      .expect(409);
    expect(conflict.body).toEqual({
      code: ERROR_CODES.EXCHANGE_REQUEST_FEE_VERSION_CONFLICT,
      message: "error.exchange.request_fee_version_conflict",
      data: null
    });

    fixture.feeService.resolveCurrent.mockRejectedValueOnce(
      new AppError({
        code: ERROR_CODES.EXCHANGE_REQUEST_FEE_UNAVAILABLE,
        message: "error.exchange.request_fee_unavailable",
        statusCode: 503
      })
    );
    const unavailable = await request(fixture.app)
      .get("/api/v1/backoffice/exchange-request-fee/current")
      .set("Authorization", `Bearer ${operatorToken}`)
      .expect(503);
    expect(unavailable.body).toEqual({
      code: ERROR_CODES.EXCHANGE_REQUEST_FEE_UNAVAILABLE,
      message: "error.exchange.request_fee_unavailable",
      data: null
    });
  });
});
