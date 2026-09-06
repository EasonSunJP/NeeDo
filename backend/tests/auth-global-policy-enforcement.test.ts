import { hash } from "bcryptjs";
import { createOpenApiDocument } from "../src/api/openapi";
import { env } from "../src/config/env";
import { ERROR_CODES } from "../src/constants/error-codes";
import type { UserPolicyComplianceDecision } from "../src/domain/user-policy-enforcement";
import type { AuthUserRecord } from "../src/repositories/auth.repository";
import { AuthService } from "../src/services/auth.service";

const nowIso = "2026-09-01T10:00:00.000Z";
const allowedRoutes = [
  "/api/v1/auth/me",
  "/api/v1/auth/logout",
  "/api/v1/auth/account-compliance/phone",
  "/api/v1/auth/google/link",
  "/api/v1/auth/google/link/init",
  "/api/v1/auth/google/link/verify",
  "/api/v1/auth/password/setup",
  "/api/v1/auth/password/setup/verify"
];

const user = async (): Promise<AuthUserRecord> => ({
  id: 41,
  needoId: "u0000000041",
  email: "member@example.com",
  emailVerifiedAt: new Date(nowIso),
  phone: null,
  passwordHash: await hash("Abcd@1234", 12),
  username: "Member",
  avatarUrl: null,
  isActive: true,
  isTestAccount: false,
  sessionGeneration: 0,
  accessState: { disabled: false, restricted: false },
  lastLoginAt: null,
  deletedAt: null,
  identities: [
    {
      id: 410,
      userId: 41,
      type: "customer",
      scopeType: "customer_profile",
      scopeId: 41,
      displayName: "Member",
      isDefault: true,
      isActive: true,
      deletedAt: null,
      publicIdentifier: {
        publicId: "u0000000041",
        kind: "U",
        loginAllowed: true,
        status: "ACTIVE",
        deletedAt: null
      }
    }
  ],
  userRoles: [
    {
      deletedAt: null,
      role: {
        code: "customer",
        deletedAt: null,
        rolePermissions: ["auth:me", "auth:logout"].map((code) => ({
          deletedAt: null,
          permission: { code, type: "api", deletedAt: null }
        }))
      }
    }
  ]
});

const restrictedDecision = (): UserPolicyComplianceDecision => ({
  compliant: false,
  requirements: ["phone_binding_required"],
  policyVersionPublicId: "policy-v2",
  effectiveAt: nowIso
});

const compliantDecision = (): UserPolicyComplianceDecision => ({
  compliant: true,
  requirements: [],
  policyVersionPublicId: "policy-v2",
  effectiveAt: nowIso
});

async function fixture() {
  const account = await user();
  const refreshTokens = new Set<string>();
  let decision = restrictedDecision();
  const repository = {
    findUserByEmail: jest.fn(async () => account),
    findUserByLoginIdentifier: jest.fn(async () => account),
    findUserById: jest.fn(async () => account),
    createVerifiedBaselineCustomer: jest.fn(),
    findVerifiedRegistrationByChallenge: jest.fn(),
    updateLastLoginAt: jest.fn(async () => undefined),
    createLoginLog: jest.fn(async () => undefined),
    getSuccessfulLoginEvidence: jest.fn(async () => ({
      hasAnySuccessfulLogin: false, hasSuccessfulLoginInPeriod: false, hasSuccessfulLoginFromIp: false
    })),
    createAuditLog: jest.fn(async () => undefined),
    completePhoneBinding: jest.fn(async ({ phone }: { phone: string }) => ({
      ...account,
      phone
    }))
  };
  const sessionStore = {
    getLoginLock: jest.fn(async () => false),
    getAccountLoginLock: jest.fn(async () => false),
    recordFailedLogin: jest.fn(),
    clearFailedLogin: jest.fn(async () => undefined),
    recordFailedLoginForAccount: jest.fn(),
    clearFailedLoginForAccount: jest.fn(async () => undefined),
    storeOtp: jest.fn(),
    getOtp: jest.fn(),
    deleteOtp: jest.fn(),
    hasOtpCooldown: jest.fn(),
    storeOtpCooldown: jest.fn(),
    clearOtpCooldown: jest.fn(),
    storeRefreshToken: jest.fn(async (userId: number, jti: string) => {
      refreshTokens.add(`${userId}:${jti}`);
      return true;
    }),
    hasRefreshToken: jest.fn(async (userId: number, jti: string) =>
      refreshTokens.has(`${userId}:${jti}`)
    ),
    revokeRefreshToken: jest.fn(async (userId: number, jti: string) => {
      refreshTokens.delete(`${userId}:${jti}`);
    }),
    revokeAllRefreshTokens: jest.fn(),
    blacklistAccessToken: jest.fn(),
    isAccessTokenBlacklisted: jest.fn(async () => false)
  };
  const enforcement = {
    evaluateAccountCompliance: jest.fn(async () => decision)
  };
  const service = new AuthService(
    env,
    repository,
    sessionStore as never,
    { sendOtp: jest.fn() },
    {} as never,
    false,
    {} as never,
    { listEligibleShops: jest.fn() } as never,
    undefined,
    undefined,
    enforcement
  );
  return {
    repository,
    service,
    refreshTokens,
    setDecision: (next: UserPolicyComplianceDecision) => {
      decision = next;
    }
  };
}

describe("auth global-policy enforcement", () => {
  it("documents compliance requirements and permitted next routes", async () => {
    const document = createOpenApiDocument(env) as {
      components: { schemas: Record<string, Record<string, unknown>> };
      paths: Record<string, Record<string, unknown>>;
    };
    const schemas = document.components.schemas;
    expect(schemas.UserPolicyComplianceRequirement.enum).toEqual([
      "phone_binding_required",
      "email_binding_required",
      "ekyc_required"
    ]);
    expect(schemas.UserPolicyComplianceErrorData.required).toContain("permittedNextRoutes");
    expect(schemas.AuthMe.properties).toHaveProperty("complianceRequirements");
    expect(document.paths["/api/v1/auth/account-compliance/phone"]).toHaveProperty("put");
  });

  it("issues a limited existing-user session and exposes only safe compliance data", async () => {
    const { service } = await fixture();
    const tokens = await service.login("member@example.com", "Abcd@1234", { ip: "127.0.0.1" });

    if (!("accessToken" in tokens)) throw new Error("unexpected verification challenge");
    await expect(service.authenticateAccessToken(tokens.accessToken)).rejects.toMatchObject({
      code: ERROR_CODES.USER_POLICY_COMPLIANCE_REQUIRED,
      statusCode: 403,
      data: {
        complianceRequirements: ["phone_binding_required"],
        policyVersionPublicId: "policy-v2",
        effectiveAt: nowIso,
        permittedNextRoutes: allowedRoutes
      }
    });
    const limited = await service.authenticateAccessToken(tokens.accessToken, undefined, {
      allowDuringCompliance: true
    });
    expect(limited.complianceRequirements).toEqual(["phone_binding_required"]);
    await expect(service.getMe(limited)).resolves.toMatchObject({
      complianceRequirements: ["phone_binding_required"],
      compliancePermittedNextRoutes: allowedRoutes
    });
  });

  it("re-evaluates a published policy on the next protected action without revoking refresh", async () => {
    const state = await fixture();
    state.setDecision(compliantDecision());
    const tokens = await state.service.login("member@example.com", "Abcd@1234", {
      ip: "127.0.0.1"
    });
    if (!("accessToken" in tokens)) throw new Error("unexpected verification challenge");
    await expect(state.service.authenticateAccessToken(tokens.accessToken)).resolves.toMatchObject({
      userId: 41,
      complianceRequirements: []
    });

    state.setDecision(restrictedDecision());
    await expect(state.service.authenticateAccessToken(tokens.accessToken)).rejects.toMatchObject({
      code: ERROR_CODES.USER_POLICY_COMPLIANCE_REQUIRED
    });
    await expect(state.service.refresh(tokens.refreshToken)).resolves.toMatchObject({
      accessToken: expect.any(String),
      expiresIn: env.AUTH_ACCESS_TOKEN_TTL_SECONDS
    });
    expect(state.refreshTokens.size).toBe(1);
  });

  it("stores a normalized phone through the audited account-binding path without claiming SMS verification", async () => {
    const state = await fixture();
    state.setDecision(compliantDecision());

    await expect(
      state.service.bindCompliancePhone(
        "+819012345678",
        {
          userId: 41,
          email: "member@example.com",
          accessTokenJti: "access-41",
          accessTokenExpiresAt: Math.floor(Date.now() / 1000) + 900,
          currentIdentityId: 410,
          currentIdentityType: "customer",
          currentIdentityScopeType: "customer_profile",
          currentIdentityScopeId: 41,
          roles: ["customer"],
          permissions: ["auth:me"]
        },
        { ip: "127.0.0.1" }
      )
    ).resolves.toEqual({
      phone: "+819012345678",
      complianceRequirements: [],
      smsVerified: false
    });
    expect(state.repository.completePhoneBinding).toHaveBeenCalledWith({
      userId: 41,
      phone: "+819012345678",
      context: { ip: "127.0.0.1" }
    });
  });
});
