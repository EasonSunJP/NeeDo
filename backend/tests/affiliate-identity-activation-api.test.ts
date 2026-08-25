import request from "supertest";
import { createApp } from "../src/app";
import { env } from "../src/config/env";
import { AuthTokenService } from "../src/services/auth-token.service";

const contract = {
  type: "affiliate" as const,
  version: "affiliate-2026-08-26-v1",
  effectiveAt: new Date("2026-08-26T00:00:00.000Z"),
  language: "zh-CN",
  text: "NeeDo 联盟营销规则及合同完整文本",
  contentHash: "a".repeat(64)
};

const createFixture = (
  permissions = ["contract:read", "contract:accept", "bank-account:own"]
) => {
  const user = {
    id: 7,
    email: "customer@example.test",
    phone: null,
    passwordHash: "unused",
    username: "Customer",
    avatarUrl: null,
    isActive: true,
    lastLoginAt: null,
    deletedAt: null,
    identities: [
      {
        id: 70,
        userId: 7,
        type: "customer",
        scopeType: "global",
        scopeId: null,
        displayName: "Customer",
        isDefault: true,
        isActive: true,
        deletedAt: null
      }
    ],
    identityApplications: [],
    userRoles: [
      {
        deletedAt: null,
        role: {
          code: "customer",
          deletedAt: null,
          rolePermissions: permissions.map((code) => ({
            deletedAt: null,
            permission: { code, type: "api", deletedAt: null }
          }))
        }
      }
    ]
  };
  const affiliateIdentityActivationService = {
    getCurrentContract: jest.fn(async () => contract),
    activate: jest.fn(async (input: Record<string, unknown>) => {
      void input;
      return {
        contractAcceptance: {
          id: 91,
          contractType: "affiliate",
          contractVersion: contract.version,
          contentHash: contract.contentHash,
          acceptedAt: new Date("2026-08-26T05:00:00.000Z"),
          receiptId: "receipt-91"
        },
        identity: {
          identityId: 81,
          userId: 7,
          identityType: "scout",
          roleCode: "scout",
          scopeType: "global",
          scopeId: null
        }
      };
    })
  };
  const affiliateBankAccountService = {
    bind: jest.fn(async (input: Record<string, unknown>) => {
      void input;
      return {
        id: 21,
        bankCode: "0001",
        bankName: "みずほ銀行",
        branchCode: "001",
        branchName: "銀座支店",
        accountType: "ordinary",
        verifiedAt: new Date("2026-08-26T05:00:00.000Z"),
        accountNumberMasked: "•••4567",
        holderMatched: true
      };
    })
  };
  const merchantContractAcceptanceService = {
    accept: jest.fn(async (input: Record<string, unknown>) => ({
      id: 92,
      applicationId: input.applicationId,
      applicationVersion: 4,
      contractType: "merchant",
      contractVersion: "merchant-2026-08-26-v1",
      contentHash: "b".repeat(64),
      acceptedAt: new Date("2026-08-26T05:00:00.000Z"),
      receiptId: "receipt-92"
    }))
  };
  const app = createApp(undefined, {
    redisHealthCheck: async () => ({ status: "ok", latencyMs: 1 }),
    authRepository: { findUserById: jest.fn(async () => user) },
    authSessionStore: { isAccessTokenBlacklisted: jest.fn(async () => false) },
    otpDeliveryClient: { sendOtp: jest.fn(async () => undefined) },
    affiliateIdentityActivationService,
    affiliateBankAccountService,
    merchantContractAcceptanceService
  } as never);
  const token = new AuthTokenService(env).issueAccessToken({
    id: user.id,
    email: user.email,
    currentIdentityId: 70
  }).token;
  return {
    app,
    token,
    affiliateIdentityActivationService,
    affiliateBankAccountService,
    merchantContractAcceptanceService
  };
};

describe("affiliate identity activation HTTP API", () => {
  it("returns the complete current rules and NeeDo contract", async () => {
    const fixture = createFixture();
    await request(fixture.app)
      .get("/api/v1/contracts/affiliate/current?language=zh-CN")
      .set("Authorization", `Bearer ${fixture.token}`)
      .expect(200)
      .expect((response) => {
        expect(response.body.data).toEqual({
          ...contract,
          effectiveAt: contract.effectiveAt.toISOString()
        });
        expect(response.body.data.text).toContain("联盟营销规则及合同");
      });
    expect(fixture.affiliateIdentityActivationService.getCurrentContract).toHaveBeenCalledWith(
      "zh-CN"
    );
  });

  it("requires both acknowledgements and the current version/hash", async () => {
    const fixture = createFixture();
    const authorization = `Bearer ${fixture.token}`;
    await request(fixture.app)
      .post("/api/v1/identity-activations/affiliate")
      .set("Authorization", authorization)
      .send({
        contractVersion: contract.version,
        contentHash: contract.contentHash,
        language: "zh-CN",
        hasRead: true,
        hasAgreed: false
      })
      .expect(400);
    expect(fixture.affiliateIdentityActivationService.activate).not.toHaveBeenCalled();
  });

  it("activates immediately, is retry-safe, and never sends IP evidence to the service", async () => {
    const fixture = createFixture();
    const body = {
      contractVersion: contract.version,
      contentHash: contract.contentHash,
      language: "zh-CN",
      hasRead: true,
      hasAgreed: true
    };
    for (let attempt = 0; attempt < 2; attempt += 1) {
      await request(fixture.app)
        .post("/api/v1/identity-activations/affiliate")
        .set("Authorization", `Bearer ${fixture.token}`)
        .send(body)
        .expect(200)
        .expect((response) =>
          expect(response.body.data.identity).toMatchObject({
            identityType: "scout",
            roleCode: "scout"
          })
        );
    }
    expect(fixture.affiliateIdentityActivationService.activate).toHaveBeenCalledTimes(2);
    const activationInput =
      fixture.affiliateIdentityActivationService.activate.mock.calls[0]?.[0];
    expect(activationInput).toMatchObject({
      userId: 7,
      contractVersion: contract.version,
      contentHash: contract.contentHash,
      language: "zh-CN",
      hasRead: true,
      hasAgreed: true
    });
    expect(activationInput).not.toHaveProperty("ip");
    expect(activationInput).not.toHaveProperty("ipAddress");
    expect(activationInput.sessionId).toEqual(expect.any(String));
  });

  it("enforces contract read and affiliate activation permissions independently", async () => {
    const noPermissions = createFixture([]);
    await request(noPermissions.app)
      .get("/api/v1/contracts/affiliate/current?language=zh-CN")
      .set("Authorization", `Bearer ${noPermissions.token}`)
      .expect(403);
    await request(noPermissions.app)
      .post("/api/v1/identity-activations/affiliate")
      .set("Authorization", `Bearer ${noPermissions.token}`)
      .send({
        contractVersion: contract.version,
        contentHash: contract.contentHash,
        language: "zh-CN",
        hasRead: true,
        hasAgreed: true
      })
      .expect(403);
  });

  it("binds only a validated affiliate-withdrawal bank account and returns masked data", async () => {
    const fixture = createFixture();
    await request(fixture.app)
      .put("/api/v1/bank-accounts/affiliate-withdrawal")
      .set("Authorization", `Bearer ${fixture.token}`)
      .send({
        bankCode: "0001",
        bankName: "みずほ銀行",
        branchCode: "001",
        branchName: "銀座支店",
        accountType: "ordinary",
        accountNumber: "1234567",
        accountHolderName: "ヤマモトタロウ"
      })
      .expect(200)
      .expect((response) => {
        expect(response.body.data).toMatchObject({
          accountNumberMasked: "•••4567",
          holderMatched: true
        });
        expect(JSON.stringify(response.body)).not.toContain("1234567");
      });
    expect(fixture.affiliateBankAccountService.bind).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 7,
        accountNumber: "1234567",
        accountHolderName: "ヤマモトタロウ"
      })
    );
  });

  it("accepts and binds the merchant contract before final application submission", async () => {
    const fixture = createFixture();
    await request(fixture.app)
      .post("/api/v1/identity-applications/41/merchant-contract-acceptance")
      .set("Authorization", `Bearer ${fixture.token}`)
      .send({
        expectedVersion: 3,
        contractVersion: "merchant-2026-08-26-v1",
        contentHash: "b".repeat(64),
        language: "zh-CN",
        hasRead: true,
        hasAgreed: true
      })
      .expect(200)
      .expect((response) =>
        expect(response.body.data).toMatchObject({
          applicationId: 41,
          applicationVersion: 4,
          contractType: "merchant"
        })
      );
    expect(fixture.merchantContractAcceptanceService.accept).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 7,
        applicationId: 41,
        expectedVersion: 3,
        sessionId: expect.any(String)
      })
    );
  });
});
