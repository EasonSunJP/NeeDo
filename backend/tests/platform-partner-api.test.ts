import request from "supertest";
import { createApp } from "../src/app";
import { env } from "../src/config/env";
import { AuthTokenService } from "../src/services/auth-token.service";
import type {
  AgentShopReferralRecord,
  PlatformPartnerProfileRecord,
  PlatformPartnerRepositoryPort
} from "../src/services/platform-partner.service";

const profile: PlatformPartnerProfileRecord = {
  id: 41,
  publicId: "11111111-1111-4111-8111-111111111111",
  partnerType: "AGENT",
  activatedAt: new Date("2026-09-01T00:00:00.000Z"),
  markedById: 1,
  reason: "线下代理协议已审核",
  createdAt: new Date("2026-09-01T01:00:00.000Z"),
  user: {
    id: 88,
    needoId: "u0000000088",
    username: "山田代理",
    avatarUrl: null,
    isActive: true
  }
};

const referral: AgentShopReferralRecord = {
  id: 51,
  publicId: "22222222-2222-4222-8222-222222222222",
  agentProfileId: 41,
  status: "ACTIVE",
  source: "运营人工确认",
  confirmedAt: new Date("2026-09-01T02:00:00.000Z"),
  confirmedById: 1,
  successQualifiedAt: null,
  reason: "店铺签约资料已核对",
  createdAt: new Date("2026-09-01T03:00:00.000Z"),
  agentProfile: profile,
  shop: {
    id: 19,
    publicId: "shop0000000019",
    name: "LifeDance 涩谷",
    city: "东京都"
  }
};

const agentListProfile = {
  ...profile,
  administration: {
    referralCount: 1,
    referredShops: [{ publicId: "shop0000000019", name: "LifeDance 涩谷", city: "东京都" }],
    currentRule: null,
    latestSettlement: null
  }
};

const createRepository = (): jest.Mocked<PlatformPartnerRepositoryPort> =>
  ({
    markPartnerProfile: jest.fn(async () => ({ kind: "created", profile })),
    listAgents: jest.fn(async () => ({
      list: [agentListProfile],
      total: 1,
      page: 1,
      page_size: 20
    })),
    listAgentShopReferrals: jest.fn(async () => ({
      kind: "found",
      page: { list: [referral], total: 1, page: 1, page_size: 20 }
    })),
    linkAgentShop: jest.fn(async () => ({ kind: "created", referral }))
  }) as unknown as jest.Mocked<PlatformPartnerRepositoryPort>;

const createFixture = (
  permissions: string[] = [
    "backoffice:partner-profile:write",
    "backoffice:agent:read",
    "backoffice:agent:write"
  ]
) => {
  const user = {
    id: 1,
    needoId: "needo0000000001",
    email: "operator@example.test",
    phone: null,
    passwordHash: "unused",
    username: "运营管理员",
    avatarUrl: null,
    isActive: true,
    isTestAccount: false,
    lastLoginAt: null,
    deletedAt: null,
    identities: [
      {
        id: 10,
        userId: 1,
        type: "operator",
        scopeType: "global",
        scopeId: null,
        displayName: "运营管理员",
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
          code: "operator",
          deletedAt: null,
          rolePermissions: permissions.map((code) => ({
            deletedAt: null,
            permission: { code, type: "api", deletedAt: null }
          }))
        }
      }
    ]
  };
  const repository = createRepository();
  const auditLogRepository = { create: jest.fn(async () => undefined) };
  const app = createApp(undefined, {
    redisHealthCheck: async () => ({ status: "ok", latencyMs: 1 }),
    testOnlyAllowLegacyAuthAdapters: true,
    authRepository: { findUserById: jest.fn(async () => user) },
    authSessionStore: { isAccessTokenBlacklisted: jest.fn(async () => false) },
    otpDeliveryClient: { sendOtp: jest.fn(async () => undefined) },
    platformPartnerRepository: repository,
    auditLogRepository
  } as never);
  const token = new AuthTokenService(env).issueAccessToken({
    id: user.id,
    email: user.email,
    currentIdentityId: 10
  }).token;
  return { app, token, repository, auditLogRepository };
};

describe("platform partner HTTP API", () => {
  it("requires authentication and dedicated permissions", async () => {
    const fixture = createFixture([]);
    await request(fixture.app).get("/api/v1/backoffice/agents").expect(401);
    await request(fixture.app)
      .get("/api/v1/backoffice/agents")
      .set("Authorization", `Bearer ${fixture.token}`)
      .expect(403);
    await request(fixture.app)
      .post("/api/v1/backoffice/users/88/partner-profiles")
      .set("Authorization", `Bearer ${fixture.token}`)
      .send({
        partnerType: "agent",
        activatedAt: "2026-09-01T00:00:00.000Z",
        reason: "资料确认"
      })
      .expect(403);
  });

  it("marks a user as a partner with validated effective evidence", async () => {
    const fixture = createFixture();

    await request(fixture.app)
      .post("/api/v1/backoffice/users/88/partner-profiles")
      .set("Authorization", `Bearer ${fixture.token}`)
      .send({
        partnerType: "agent",
        activatedAt: "2026-09-01T00:00:00.000Z",
        reason: "线下代理协议已审核"
      })
      .expect(201)
      .expect((response) => {
        expect(response.body.data).toMatchObject({
          publicId: "11111111-1111-4111-8111-111111111111",
          partnerType: "agent",
          user: { id: 88, needoId: "u0000000088", nickname: "山田代理" }
        });
        expect(JSON.stringify(response.body.data)).not.toContain("passwordHash");
      });

    expect(fixture.repository.markPartnerProfile).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 88,
        partnerType: "AGENT",
        activatedAt: new Date("2026-09-01T00:00:00.000Z"),
        reason: "线下代理协议已审核"
      })
    );

    await request(fixture.app)
      .post("/api/v1/backoffice/users/not-a-number/partner-profiles")
      .set("Authorization", `Bearer ${fixture.token}`)
      .send({ partnerType: "invalid", activatedAt: "not-a-date", reason: "" })
      .expect(400);
  });

  it("returns a paginated agent list filtered by NeeDo ID, nickname, and status", async () => {
    const fixture = createFixture();

    await request(fixture.app)
      .get("/api/v1/backoffice/agents?page=1&pageSize=20&keyword=u0000000088&status=active")
      .set("Authorization", `Bearer ${fixture.token}`)
      .expect(200)
      .expect((response) => {
        expect(response.body).toMatchObject({
          code: 0,
          message: "success",
          data: {
            list: [{ partnerType: "agent", user: { needoId: "u0000000088" } }],
            total: 1,
            page: 1,
            page_size: 20
          }
        });
      });
    expect(fixture.repository.listAgents).toHaveBeenCalledWith({
      page: 1,
      pageSize: 20,
      keyword: "u0000000088",
      status: "active"
    });

    await request(fixture.app)
      .get("/api/v1/backoffice/agents?pageSize=101&status=unknown")
      .set("Authorization", `Bearer ${fixture.token}`)
      .expect(400);
  });

  it("links one formally identified shop to an active agent", async () => {
    const fixture = createFixture();

    await request(fixture.app)
      .post("/api/v1/backoffice/agents/11111111-1111-4111-8111-111111111111/shop-referrals")
      .set("Authorization", `Bearer ${fixture.token}`)
      .send({
        shopPublicId: "shop0000000019",
        source: "运营人工确认",
        confirmedAt: "2026-09-01T02:00:00.000Z",
        reason: "店铺签约资料已核对"
      })
      .expect(201)
      .expect((response) => {
        expect(response.body.data).toMatchObject({
          publicId: "22222222-2222-4222-8222-222222222222",
          agentPublicId: "11111111-1111-4111-8111-111111111111",
          shop: { publicId: "shop0000000019", name: "LifeDance 涩谷" },
          status: "active"
        });
      });

    expect(fixture.repository.linkAgentShop).toHaveBeenCalledWith(
      expect.objectContaining({
        agentPublicId: "11111111-1111-4111-8111-111111111111",
        shopPublicId: "shop0000000019",
        confirmedById: 1
      })
    );

    await request(fixture.app)
      .post("/api/v1/backoffice/agents/not-a-uuid/shop-referrals")
      .set("Authorization", `Bearer ${fixture.token}`)
      .send({ shopPublicId: "wrong", source: "", confirmedAt: "bad", reason: "" })
      .expect(400);
  });

  it("lists an agent's formally linked shops with read permission", async () => {
    const fixture = createFixture();

    await request(fixture.app)
      .get(
        "/api/v1/backoffice/agents/11111111-1111-4111-8111-111111111111/shop-referrals?page=1&pageSize=20&status=active"
      )
      .set("Authorization", `Bearer ${fixture.token}`)
      .expect(200)
      .expect((response) => {
        expect(response.body.data).toMatchObject({
          list: [
            {
              publicId: referral.publicId,
              agentPublicId: profile.publicId,
              status: "active",
              shop: { publicId: "shop0000000019", name: "LifeDance 涩谷" }
            }
          ],
          total: 1,
          page: 1,
          page_size: 20
        });
      });
    expect(fixture.repository.listAgentShopReferrals).toHaveBeenCalledWith({
      agentPublicId: profile.publicId,
      page: 1,
      pageSize: 20,
      status: "active"
    });
  });
});
