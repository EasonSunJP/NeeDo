import request from "supertest";
import { createApp } from "../src/app";
import { env } from "../src/config/env";
import type {
  AffiliateAlliancePayload,
  AffiliateAllianceRepositoryPort
} from "../src/services/affiliate-alliance.service";
import { AuthTokenService } from "../src/services/auth-token.service";

const now = new Date("2026-08-28T12:00:00.000Z");

const permission = (code: string, id: number) => ({
  id,
  name: code,
  code,
  type: code.startsWith("page:") ? "page" : "button",
  module: "affiliate",
  description: code,
  isSystem: true,
  createdAt: now,
  updatedAt: now,
  deletedAt: null
});

const createUser = (id: number, identityType: "scout" | "customer", codes: string[]) => {
  const permissions = codes.map(permission);
  const role = {
    id,
    name: `affiliate_alliance_${id}`,
    code: `affiliate_alliance_${id}`,
    description: "Affiliate alliance API test role",
    isSystem: true,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    rolePermissions: permissions.map((item, index) => ({
      id: index + 1,
      roleId: id,
      permissionId: item.id,
      deletedAt: null,
      permission: item
    }))
  };
  return {
    id,
    needoId: `u${String(id).padStart(10, "0")}`,
    email: `affiliate-alliance-${id}@example.test`,
    phone: null,
    passwordHash: "unused",
    username: `Affiliate ${id}`,
    avatarUrl: null,
    isActive: true,
    lastLoginAt: null,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    identities: [
      {
        id: 100 + id,
        userId: id,
        type: identityType,
        scopeType: "global",
        scopeId: null,
        displayName: `Affiliate ${id}`,
        isDefault: true,
        isActive: true,
        deletedAt: null
      }
    ],
    userRoles: [
      {
        id,
        userId: id,
        roleId: id,
        scopeType: "global",
        scopeId: null,
        deletedAt: null,
        role
      }
    ]
  };
};

const createFixture = () => {
  const read = "page:affiliate-alliance";
  const create = "button:affiliate-alliance-create";
  const users = [
    createUser(7, "scout", [read, create]),
    createUser(8, "scout", [read]),
    createUser(9, "scout", [create]),
    createUser(10, "customer", [read, create]),
    createUser(11, "scout", [read, create])
  ];
  const alliances = new Map<number, AffiliateAlliancePayload>();
  const profileStatuses = new Map<number, "active" | "suspended" | "closed">(
    users.map((user) => [user.id, user.id === 11 ? "suspended" : "active"])
  );
  let nextAllianceId = 42;
  const repository: jest.Mocked<AffiliateAllianceRepositoryPort> = {
    findMine: jest.fn(async (userId) => alliances.get(userId) ?? null),
    findCreationEligibility: jest.fn(async (userId) => ({
      affiliateStatus: profileStatuses.get(userId) ?? null,
      hasActiveMembership: alliances.has(userId)
    })),
    createOwned: jest.fn(async (input) => {
      const user = users.find((item) => item.id === input.userId)!;
      const alliance: AffiliateAlliancePayload = {
        allianceId: nextAllianceId++,
        name: input.name,
        description: input.description,
        status: "active",
        version: 1,
        defaultPromoterShareBps: input.defaultPromoterShareBps,
        owner: {
          needoId: user.needoId,
          displayName: user.username,
          avatarUrl: null
        },
        membership: {
          memberId: 91,
          role: "owner",
          managerNeedoId: null,
          promoterShareBpsOverride: null,
          permissions: {
            canClaimTasks: true,
            canViewAllianceOverview: true,
            canViewMemberDetails: true,
            canManageOwnSubordinates: true,
            canViewAllianceWallet: true
          }
        },
        wallet: { currency: "NDP", availableBalance: 0, frozenBalance: 0 },
        createdAt: now.toISOString(),
        updatedAt: now.toISOString()
      };
      alliances.set(input.userId, alliance);
      return alliance;
    })
  };

  const app = createApp(undefined, {
    redisHealthCheck: async () => ({ status: "ok", latencyMs: 1 }),
    testOnlyAllowLegacyAuthAdapters: true,
    authRepository: {
      findUserById: jest.fn(async (id: number) => users.find((user) => user.id === id) ?? null)
    },
    authSessionStore: { isAccessTokenBlacklisted: jest.fn(async () => false) },
    otpDeliveryClient: { sendOtp: jest.fn(async () => undefined) },
    auditLogRepository: { create: jest.fn(async () => undefined) },
    affiliateAllianceRepository: repository
  } as never);
  const tokens = Object.fromEntries(
    users.map((user) => [
      user.id,
      new AuthTokenService(env).issueAccessToken({
        id: user.id,
        email: user.email,
        currentIdentityId: user.identities[0].id
      }).token
    ])
  ) as Record<number, string>;

  return { app, alliances, repository, tokens };
};

describe("affiliate alliance HTTP API", () => {
  it("creates, reloads, and redacts the authenticated Affiliate's real alliance", async () => {
    const fixture = createFixture();
    const authorization = `Bearer ${fixture.tokens[7]}`;

    await request(fixture.app)
      .get("/api/v1/affiliate/alliances/me")
      .set("Authorization", authorization)
      .expect(200)
      .expect(({ body }) => expect(body).toEqual({ code: 0, message: "success", data: { alliance: null } }));

    await request(fixture.app)
      .post("/api/v1/affiliate/alliances")
      .set("Authorization", authorization)
      .send({
        name: "东京美容联盟",
        description: "面向东京地区",
        defaultPromoterShareBps: 8000
      })
      .expect(201)
      .expect(({ body }) => {
        expect(body).toMatchObject({
          code: 0,
          message: "success",
          data: {
            alliance: {
              allianceId: 42,
              owner: { needoId: "u0000000007" },
              membership: {
                role: "owner",
                permissions: {
                  canClaimTasks: true,
                  canViewAllianceOverview: true,
                  canViewMemberDetails: true,
                  canManageOwnSubordinates: true,
                  canViewAllianceWallet: true
                }
              },
              wallet: { currency: "NDP", availableBalance: 0, frozenBalance: 0 }
            }
          }
        });
        expect(JSON.stringify(body.data)).not.toMatch(/userId|identityId|scout/);
      });

    await request(fixture.app)
      .get("/api/v1/affiliate/alliances/me")
      .set("Authorization", authorization)
      .expect(200)
      .expect(({ body }) => expect(body.data.alliance).toMatchObject({ allianceId: 42 }));
    expect(fixture.repository.createOwned).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 7,
        auditLog: expect.objectContaining({ action: "affiliate_alliance.created" })
      })
    );
  });

  it("enforces authentication, separate read/create permissions, and Affiliate identity", async () => {
    const fixture = createFixture();
    const validBody = { name: "东京联盟", defaultPromoterShareBps: 8000 };

    await request(fixture.app).get("/api/v1/affiliate/alliances/me").expect(401);
    await request(fixture.app)
      .post("/api/v1/affiliate/alliances")
      .set("Authorization", `Bearer ${fixture.tokens[8]}`)
      .send(validBody)
      .expect(403);
    await request(fixture.app)
      .get("/api/v1/affiliate/alliances/me")
      .set("Authorization", `Bearer ${fixture.tokens[9]}`)
      .expect(403);
    await request(fixture.app)
      .get("/api/v1/affiliate/alliances/me")
      .set("Authorization", `Bearer ${fixture.tokens[10]}`)
      .expect(403)
      .expect(({ body }) =>
        expect(body).toMatchObject({ message: "error.affiliate_alliance.identity_required" })
      );
  });

  it("rejects unknown fields, inactive profiles, and repeated membership", async () => {
    const fixture = createFixture();

    await request(fixture.app)
      .post("/api/v1/affiliate/alliances")
      .set("Authorization", `Bearer ${fixture.tokens[7]}`)
      .send({ name: "东京联盟", defaultPromoterShareBps: 8000, ownerUserId: 7 })
      .expect(400);
    await request(fixture.app)
      .post("/api/v1/affiliate/alliances")
      .set("Authorization", `Bearer ${fixture.tokens[11]}`)
      .send({ name: "东京联盟", defaultPromoterShareBps: 8000 })
      .expect(403)
      .expect(({ body }) =>
        expect(body).toMatchObject({ message: "error.affiliate_alliance.profile_inactive" })
      );

    const authorization = `Bearer ${fixture.tokens[7]}`;
    await request(fixture.app)
      .post("/api/v1/affiliate/alliances")
      .set("Authorization", authorization)
      .send({ name: "东京联盟", defaultPromoterShareBps: 8000 })
      .expect(201);
    await request(fixture.app)
      .post("/api/v1/affiliate/alliances")
      .set("Authorization", authorization)
      .send({ name: "第二联盟", defaultPromoterShareBps: 7000 })
      .expect(409)
      .expect(({ body }) =>
        expect(body).toMatchObject({ message: "error.affiliate_alliance.already_joined" })
      );
  });
});
