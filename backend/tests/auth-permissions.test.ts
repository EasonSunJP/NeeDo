import request from "supertest";
import { createApp } from "../src/app";
import { env } from "../src/config/env";
import {
  SYSTEM_PERMISSION_CODES,
  SYSTEM_ROLE_CODES,
  buildRolePermissionAssignments
} from "../src/constants/permissions.constants";
import { AUTH_ROUTE_PERMISSIONS } from "../src/routes/auth.routes";
import { AuthTokenService } from "../src/services/auth-token.service";

const accountSecurityPermissions = [
  "auth:google:read",
  "auth:google:link",
  "auth:google:unlink",
  "auth:password:setup"
] as const;

const makeUser = (permissions: readonly string[], hasPassword = true) => ({
  id: 77,
  needoId: "u0000000077",
  email: "route-permission@example.com",
  emailVerifiedAt: new Date("2026-08-26T00:00:00.000Z"),
  phone: null,
  passwordHash: hasPassword ? "$2b$12$unused-but-never-returned" : null,
  username: "Route Permission User",
  avatarUrl: null,
  isActive: true,
  sessionGeneration: 0,
  accessState: { disabled: false, restricted: false },
  lastLoginAt: null,
  deletedAt: null,
  identities: [
    {
      id: 770,
      userId: 77,
      type: "customer",
      scopeType: "customer_profile",
      scopeId: 77,
      displayName: "Route Permission User",
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
});

const issueAccessToken = () =>
  new AuthTokenService(env).issueAccessToken({
    id: 77,
    email: "route-permission@example.com",
    currentIdentityId: 770,
    sessionGeneration: 0
  }).token;

const protectedRequests = [
  { method: "get" as const, path: "/api/v1/auth/google/link" },
  { method: "post" as const, path: "/api/v1/auth/google/link/init", body: {} },
  {
    method: "post" as const,
    path: "/api/v1/auth/google/link",
    body: {
      credential: "bounded-google-credential",
      nonceChallengeId: "00000000-0000-4000-8000-000000000001"
    }
  },
  {
    method: "post" as const,
    path: "/api/v1/auth/google/link/verify",
    body: { challengeId: "00000000-0000-4000-8000-000000000002", otp: "123456" }
  },
  { method: "post" as const, path: "/api/v1/auth/google/unlink", body: {} },
  {
    method: "post" as const,
    path: "/api/v1/auth/google/unlink/verify",
    body: { challengeId: "00000000-0000-4000-8000-000000000003", otp: "123456" }
  },
  {
    method: "post" as const,
    path: "/api/v1/auth/password/setup",
    body: { password: "Stronger.2026!" }
  },
  {
    method: "post" as const,
    path: "/api/v1/auth/password/setup/verify",
    body: { challengeId: "00000000-0000-4000-8000-000000000004", otp: "123456" }
  }
];

const createPermissionApp = (input: {
  permissions: readonly string[];
  blacklisted?: boolean;
  completedChallengeId?: string;
  googleLinked?: boolean;
  hasPassword?: boolean;
}) => {
  const user = makeUser(input.permissions, input.hasPassword);
  const repository = {
    findUserById: jest.fn(async (id: number) => (id === user.id ? user : null)),
    findGoogleBindingBySubject: jest.fn(async () => null),
    getGoogleBindingStatus: jest.fn(async () => ({
      linked: Boolean(input.googleLinked),
      providerEmail: input.googleLinked ? "linked-google@example.com" : null,
      lastUsedAt: null
    })),
    completeAuthenticatedGoogleLink: jest.fn(),
    completePasswordSetup: jest.fn(),
    completeGoogleUnlink: jest.fn(),
    hasGoogleUnlinkCompletion: jest.fn(
      async ({ challengeId }: { challengeId: string }) => challengeId === input.completedChallengeId
    )
  };
  const sessionStore = {
    isAccessTokenBlacklisted: jest.fn(async () => Boolean(input.blacklisted)),
    getGoogleUnlinkCompletion: jest.fn(
      async ({ challengeId }: { challengeId: string }) => challengeId === input.completedChallengeId
    )
  };
  const verificationChallengeStore = {
    createGoogleNonce: jest.fn(async () => ({
      challengeId: "00000000-0000-4000-8000-000000000010",
      nonce: "route-wiring-nonce",
      expiresInSeconds: 600
    })),
    createEmailChallenge: jest.fn(async () => ({
      challengeId: "00000000-0000-4000-8000-000000000011",
      maskedEmail: "ro***@example.com",
      expiresInSeconds: 600
    })),
    cancelEmailChallenge: jest.fn(async () => true)
  };

  return createApp(env, {
    redisHealthCheck: async () => ({ status: "ok", latencyMs: 1 }),
    authRepository: repository,
    authSessionStore: sessionStore,
    verificationChallengeStore,
    otpDeliveryClient: { sendOtp: jest.fn(async () => undefined) }
  } as never);
};

describe("formal Auth account-security permissions", () => {
  it("declares the granular route permissions and assigns them to every active system role", () => {
    expect(AUTH_ROUTE_PERMISSIONS).toEqual({
      logout: "auth:logout",
      me: "auth:me",
      googleRead: "auth:google:read",
      googleLink: "auth:google:link",
      googleUnlink: "auth:google:unlink",
      passwordSetup: "auth:password:setup"
    });
    expect(SYSTEM_PERMISSION_CODES).toEqual(expect.arrayContaining(accountSecurityPermissions));

    const assignments = buildRolePermissionAssignments();
    for (const roleCode of SYSTEM_ROLE_CODES) {
      expect(assignments[roleCode]).toEqual(expect.arrayContaining(accountSecurityPermissions));
    }
  });

  it("requires authentication on every account-security route", async () => {
    const app = createApp();

    for (const endpoint of protectedRequests) {
      const pending = request(app)[endpoint.method](endpoint.path);
      if (endpoint.method === "post") pending.send(endpoint.body);
      await pending.expect(401);
    }
  });

  it("does not let an authenticated user without the route permission reach account security", async () => {
    const app = createPermissionApp({ permissions: ["auth:me"] });
    const token = issueAccessToken();

    for (const endpoint of protectedRequests) {
      const pending = (
        endpoint.method === "get"
          ? request(app).get(endpoint.path)
          : request(app).post(endpoint.path)
      ).set("Authorization", `Bearer ${token}`);
      if (endpoint.method === "post") pending.send(endpoint.body);
      await pending.expect(403);
    }
  });

  it("wires each granted account-security permission to its intended route group", async () => {
    const token = issueAccessToken();

    await request(createPermissionApp({ permissions: ["auth:google:read"] }))
      .get("/api/v1/auth/google/link")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    await request(createPermissionApp({ permissions: ["auth:google:link"] }))
      .post("/api/v1/auth/google/link/init")
      .set("Authorization", `Bearer ${token}`)
      .send({})
      .expect(200);
    await request(createPermissionApp({ permissions: ["auth:google:unlink"], googleLinked: true }))
      .post("/api/v1/auth/google/unlink")
      .set("Authorization", `Bearer ${token}`)
      .send({})
      .expect(200);
    await request(createPermissionApp({ permissions: ["auth:password:setup"], hasPassword: false }))
      .post("/api/v1/auth/password/setup")
      .set("Authorization", `Bearer ${token}`)
      .send({ password: "Stronger.2026!" })
      .expect(200);
  });

  it("recovers only a completed unlink for the same challenge without creating a reusable auth context", async () => {
    const completedChallengeId = "00000000-0000-4000-8000-000000000005";
    const otherChallengeId = "00000000-0000-4000-8000-000000000006";
    const token = issueAccessToken();
    const app = createPermissionApp({
      permissions: accountSecurityPermissions,
      blacklisted: true,
      completedChallengeId
    });

    await request(app)
      .post("/api/v1/auth/google/unlink/verify")
      .set("Authorization", `Bearer ${token}`)
      .send({ challengeId: completedChallengeId, otp: "123456" })
      .expect(200)
      .expect({ code: 0, message: "success", data: { signedOut: true } });

    await request(app)
      .post("/api/v1/auth/google/unlink/verify")
      .set("Authorization", `Bearer ${token}`)
      .send({ challengeId: otherChallengeId, otp: "123456" })
      .expect(401);
    await request(app)
      .get("/api/v1/auth/google/link")
      .set("Authorization", `Bearer ${token}`)
      .expect(401);
  });
});
