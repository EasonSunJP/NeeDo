import request from "supertest";
import { createApp } from "../src/app";
import { env } from "../src/config/env";
import type {
  AffiliateAllianceInvitationPayload,
  AffiliateAllianceMemberPayload,
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
  const members = "affiliate-alliance:members:list";
  const candidates = "affiliate-alliance:candidates:list";
  const invitations = "affiliate-alliance:invitations:list";
  const invite = "button:affiliate-alliance-invite";
  const respond = "button:affiliate-alliance-invitation-respond";
  const users = [
    createUser(7, "scout", [read, create, members, candidates, invitations, invite, respond]),
    createUser(8, "scout", [read, invitations, respond]),
    createUser(9, "scout", [create]),
    createUser(10, "customer", [read, create, members, candidates, invitations, invite, respond]),
    createUser(11, "scout", [read, create, members, candidates, invitations, invite, respond])
  ];
  const alliances = new Map<number, AffiliateAlliancePayload>();
  const invitationRecords: AffiliateAllianceInvitationPayload[] = [];
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
    }),
    listMembers: jest.fn(async (input) => {
      const alliance = [...alliances.values()].find((item) => item.allianceId === input.allianceId)!;
      const owner: AffiliateAllianceMemberPayload = {
        memberId: alliance.membership.memberId,
        person: alliance.owner,
        role: "owner",
        parent: null,
        promoterShareBpsOverride: null,
        permissions: alliance.membership.permissions,
        joinedAt: alliance.createdAt
      };
      return { list: [owner], total: 1, page: input.page, page_size: input.pageSize };
    }),
    listEligibleContacts: jest.fn(async (input) => ({
      list: [{ needoId: "u0000000008", displayName: "Affiliate 8", avatarUrl: null }],
      total: 1,
      page: input.page,
      page_size: input.pageSize
    })),
    listSentInvitations: jest.fn(async (input) => {
      const list = invitationRecords.filter((item) => item.alliance.allianceId === input.allianceId);
      return { list, total: list.length, page: input.page, page_size: input.pageSize };
    }),
    createInvitation: jest.fn(async (input) => {
      const alliance = [...alliances.values()].find((item) => item.allianceId === input.allianceId)!;
      const invitation: AffiliateAllianceInvitationPayload = {
        invitationId: 70 + invitationRecords.length + 1,
        alliance: { allianceId: alliance.allianceId, name: alliance.name },
        inviter: alliance.owner,
        invitee: { needoId: input.inviteeNeedoId, displayName: "Affiliate 8", avatarUrl: null },
        role: input.role,
        proposedParent: null,
        status: "pending",
        expiresAt: input.expiresAt.toISOString(),
        respondedAt: null,
        createdAt: input.now.toISOString()
      };
      invitationRecords.push(invitation);
      return { kind: "created" as const, invitation };
    }),
    listReceivedInvitations: jest.fn(async (input) => {
      const needoId = users.find((user) => user.id === input.inviteeUserId)!.needoId;
      const list = invitationRecords.filter((item) => item.invitee.needoId === needoId);
      return { list, total: list.length, page: input.page, page_size: input.pageSize };
    }),
    acceptInvitation: jest.fn(async (input) => {
      const invitation = invitationRecords.find((item) => item.invitationId === input.invitationId);
      if (!invitation) return { kind: "not_found" as const };
      const accepted = { ...invitation, status: "accepted" as const, respondedAt: input.now.toISOString() };
      invitationRecords.splice(invitationRecords.indexOf(invitation), 1, accepted);
      const member: AffiliateAllianceMemberPayload = {
        memberId: 100 + input.inviteeUserId,
        person: invitation.invitee,
        role: invitation.role,
        parent: null,
        promoterShareBpsOverride: null,
        permissions: {
          canClaimTasks: false,
          canViewAllianceOverview: false,
          canViewMemberDetails: false,
          canManageOwnSubordinates: false,
          canViewAllianceWallet: false
        },
        joinedAt: input.now.toISOString()
      };
      return { kind: "accepted" as const, invitation: accepted, member };
    }),
    rejectInvitation: jest.fn(async (input) => {
      const invitation = invitationRecords.find((item) => item.invitationId === input.invitationId);
      if (!invitation) return { kind: "not_found" as const };
      const rejected = { ...invitation, status: "rejected" as const, respondedAt: input.now.toISOString() };
      invitationRecords.splice(invitationRecords.indexOf(invitation), 1, rejected);
      return { kind: "rejected" as const, invitation: rejected };
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

  return { app, alliances, invitationRecords, repository, tokens };
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

  it("exposes owner member, candidate, sent invitation, and create endpoints", async () => {
    const fixture = createFixture();
    const authorization = `Bearer ${fixture.tokens[7]}`;
    await request(fixture.app)
      .post("/api/v1/affiliate/alliances")
      .set("Authorization", authorization)
      .send({ name: "东京联盟", defaultPromoterShareBps: 8000 })
      .expect(201);

    await request(fixture.app)
      .get("/api/v1/affiliate/alliances/me/members?page=1&pageSize=20")
      .set("Authorization", authorization)
      .expect(200)
      .expect(({ body }) => expect(body.data.list[0]).toMatchObject({ role: "owner" }));
    await request(fixture.app)
      .get("/api/v1/affiliate/alliances/me/eligible-contacts?q=Affiliate")
      .set("Authorization", authorization)
      .expect(200)
      .expect(({ body }) => {
        expect(body.data.list).toEqual([
          { needoId: "u0000000008", displayName: "Affiliate 8", avatarUrl: null }
        ]);
        expect(JSON.stringify(body.data)).not.toMatch(/userId|email|phone|identityId/);
      });
    await request(fixture.app)
      .post("/api/v1/affiliate/alliances/me/invitations")
      .set("Authorization", authorization)
      .send({ inviteeNeedoId: "u0000000008", role: "partner" })
      .expect(201)
      .expect(({ body }) => expect(body.data.invitation).toMatchObject({ invitationId: 71, status: "pending" }));
    await request(fixture.app)
      .get("/api/v1/affiliate/alliances/me/invitations?status=pending")
      .set("Authorization", authorization)
      .expect(200)
      .expect(({ body }) => expect(body.data.total).toBe(1));
  });

  it("lets only the invitee list and respond to received invitations", async () => {
    const fixture = createFixture();
    await request(fixture.app)
      .post("/api/v1/affiliate/alliances")
      .set("Authorization", `Bearer ${fixture.tokens[7]}`)
      .send({ name: "东京联盟", defaultPromoterShareBps: 8000 })
      .expect(201);
    await request(fixture.app)
      .post("/api/v1/affiliate/alliances/me/invitations")
      .set("Authorization", `Bearer ${fixture.tokens[7]}`)
      .send({ inviteeNeedoId: "u0000000008", role: "partner" })
      .expect(201);

    await request(fixture.app)
      .get("/api/v1/affiliate/alliance-invitations/mine")
      .set("Authorization", `Bearer ${fixture.tokens[8]}`)
      .expect(200)
      .expect(({ body }) => expect(body.data.list[0]).toMatchObject({ invitationId: 71 }));
    await request(fixture.app)
      .post("/api/v1/affiliate/alliance-invitations/71/accept")
      .set("Authorization", `Bearer ${fixture.tokens[8]}`)
      .send({})
      .expect(200)
      .expect(({ body }) => {
        expect(body.data.invitation.status).toBe("accepted");
        expect(body.data.member.permissions).toEqual({
          canClaimTasks: false,
          canViewAllianceOverview: false,
          canViewMemberDetails: false,
          canManageOwnSubordinates: false,
          canViewAllianceWallet: false
        });
      });
    await request(fixture.app)
      .post("/api/v1/affiliate/alliance-invitations/999/reject")
      .set("Authorization", `Bearer ${fixture.tokens[8]}`)
      .send({})
      .expect(404)
      .expect(({ body }) => expect(body.message).toBe("error.affiliate_alliance.invitation_not_found"));
  });

  it("enforces invitation RBAC and strict request contracts", async () => {
    const fixture = createFixture();
    await request(fixture.app).get("/api/v1/affiliate/alliance-invitations/mine").expect(401);
    await request(fixture.app)
      .get("/api/v1/affiliate/alliances/me/members")
      .set("Authorization", `Bearer ${fixture.tokens[8]}`)
      .expect(403);
    await request(fixture.app)
      .post("/api/v1/affiliate/alliance-invitations/71/accept")
      .set("Authorization", `Bearer ${fixture.tokens[8]}`)
      .send({ allianceId: 42 })
      .expect(400);
    await request(fixture.app)
      .get("/api/v1/affiliate/alliance-invitations/mine?status=cancelled")
      .set("Authorization", `Bearer ${fixture.tokens[8]}`)
      .expect(400);
  });
});
