import { ERROR_CODES } from "../src/constants/error-codes";
import {
  PlatformPartnerService,
  type AgentShopReferralRecord,
  type PlatformPartnerProfileRecord,
  type PlatformPartnerRepositoryPort
} from "../src/services/platform-partner.service";
import type { AuthenticatedAccessContext } from "../src/services/auth.service";

const actor: AuthenticatedAccessContext = {
  userId: 1,
  email: "operator@example.test",
  accessTokenJti: "operator-token",
  accessTokenExpiresAt: 1_800_000_000,
  currentIdentityId: 10,
  currentIdentityType: "operator",
  currentIdentityScopeType: "global",
  currentIdentityScopeId: null,
  roles: ["operator"],
  permissions: [
    "backoffice:partner-profile:write",
    "backoffice:agent:read",
    "backoffice:agent:write"
  ]
};

const context = { ip: "127.0.0.1", userAgent: "jest" };
const activatedAt = new Date("2026-09-01T00:00:00.000Z");
const createdAt = new Date("2026-09-01T01:00:00.000Z");

const profile = (
  overrides: Partial<PlatformPartnerProfileRecord> = {}
): PlatformPartnerProfileRecord => ({
  id: 41,
  publicId: "11111111-1111-4111-8111-111111111111",
  partnerType: "AGENT",
  activatedAt,
  markedById: 1,
  reason: "线下代理协议已审核",
  createdAt,
  user: {
    id: 88,
    needoId: "u0000000088",
    username: "山田代理",
    avatarUrl: null,
    isActive: true
  },
  ...overrides
});

const referral = (overrides: Partial<AgentShopReferralRecord> = {}): AgentShopReferralRecord => ({
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
  agentProfile: profile(),
  shop: {
    id: 19,
    publicId: "shop0000000019",
    name: "LifeDance 涩谷",
    city: "东京都"
  },
  ...overrides
});

const setup = () => {
  const repository: jest.Mocked<PlatformPartnerRepositoryPort> = {
    markPartnerProfile: jest.fn().mockResolvedValue({ kind: "created", profile: profile() }),
    listAgents: jest.fn().mockResolvedValue({
      list: [
        {
          ...profile(),
          administration: {
            referralCount: 1,
            referredShops: [{ publicId: "shop0000000019", name: "LifeDance 涩谷", city: "东京都" }],
            currentRule: {
              version: 2,
              fixedSuccessRewardJpy: 50_000,
              profitShareRateBps: 1_500,
              paymentMethod: "bank_transfer",
              effectiveFrom: new Date("2026-09-01T00:00:00.000Z"),
              effectiveTo: null
            },
            latestSettlement: {
              publicId: "33333333-3333-4333-8333-333333333333",
              status: "paid",
              periodStart: new Date("2026-09-01T00:00:00.000Z"),
              periodEnd: new Date("2026-09-30T00:00:00.000Z"),
              totalAmountJpy: 62_000,
              confirmedAt: new Date("2026-10-01T00:00:00.000Z"),
              paidAt: new Date("2026-10-02T00:00:00.000Z")
            }
          }
        }
      ],
      total: 1,
      page: 1,
      page_size: 20
    }),
    listAgentShopReferrals: jest.fn().mockResolvedValue({
      kind: "found",
      page: { list: [referral()], total: 1, page: 1, page_size: 20 }
    }),
    linkAgentShop: jest.fn().mockResolvedValue({ kind: "created", referral: referral() })
  };
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  const service = new PlatformPartnerService(repository, audit);
  return { service, repository, audit };
};

describe("PlatformPartnerService", () => {
  it("marks an existing user as a partner and records safe before/after evidence", async () => {
    const { service, repository, audit } = setup();

    await expect(
      service.markPartnerProfile(
        88,
        { partnerType: "agent", activatedAt, reason: "线下代理协议已审核" },
        actor,
        context
      )
    ).resolves.toEqual(
      expect.objectContaining({
        publicId: "11111111-1111-4111-8111-111111111111",
        partnerType: "agent",
        activatedAt: "2026-09-01T00:00:00.000Z",
        user: expect.objectContaining({ needoId: "u0000000088", nickname: "山田代理" })
      })
    );

    expect(repository.markPartnerProfile).toHaveBeenCalledWith({
      userId: 88,
      partnerType: "AGENT",
      activatedAt,
      markedById: 1,
      reason: "线下代理协议已审核"
    });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "backoffice.partner_profile.create",
        targetType: "platform_partner_profile",
        targetId: 41,
        metadata: {
          before: null,
          after: {
            publicId: "11111111-1111-4111-8111-111111111111",
            userId: 88,
            partnerType: "agent",
            activatedAt: "2026-09-01T00:00:00.000Z"
          },
          reason: "线下代理协议已审核"
        }
      })
    );
  });

  it("rejects missing users and duplicate active partner markers", async () => {
    const missing = setup();
    missing.repository.markPartnerProfile.mockResolvedValue({ kind: "user_not_found" });
    const duplicate = setup();
    duplicate.repository.markPartnerProfile.mockResolvedValue({ kind: "duplicate" });

    await expect(
      missing.service.markPartnerProfile(
        999,
        { partnerType: "agent", activatedAt, reason: "资料确认" },
        actor,
        context
      )
    ).rejects.toMatchObject({ code: ERROR_CODES.USER_NOT_FOUND, statusCode: 404 });
    await expect(
      duplicate.service.markPartnerProfile(
        88,
        { partnerType: "agent", activatedAt, reason: "重复标记" },
        actor,
        context
      )
    ).rejects.toMatchObject({ code: ERROR_CODES.PLATFORM_PARTNER_CONFLICT, statusCode: 409 });
  });

  it("lists agents by NeeDo ID, nickname and account status without auditing keywords", async () => {
    const { service, repository, audit } = setup();

    await expect(
      service.listAgents(
        { page: 1, pageSize: 20, keyword: "山田", status: "active" },
        actor,
        context
      )
    ).resolves.toMatchObject({
      total: 1,
      list: [
        {
          partnerType: "agent",
          user: { needoId: "u0000000088" },
          administration: {
            referralCount: 1,
            currentRule: { version: 2, effectiveFrom: "2026-09-01T00:00:00.000Z" },
            latestSettlement: {
              status: "paid",
              totalAmountJpy: 62_000,
              paidAt: "2026-10-02T00:00:00.000Z"
            }
          }
        }
      ]
    });

    expect(repository.listAgents).toHaveBeenCalledWith({
      page: 1,
      pageSize: 20,
      keyword: "山田",
      status: "active"
    });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "backoffice.agent.list",
        metadata: { page: 1, pageSize: 20, status: "active", resultCount: 1 }
      })
    );
    expect(JSON.stringify(audit.record.mock.calls)).not.toContain("山田");
  });

  it("links a shop to an active agent and records the confirmed relationship", async () => {
    const { service, repository, audit } = setup();
    const confirmedAt = new Date("2026-09-01T02:00:00.000Z");

    await expect(
      service.linkAgentShop(
        "11111111-1111-4111-8111-111111111111",
        {
          shopPublicId: "shop0000000019",
          source: "运营人工确认",
          confirmedAt,
          reason: "店铺签约资料已核对"
        },
        actor,
        context
      )
    ).resolves.toEqual(
      expect.objectContaining({
        agentPublicId: "11111111-1111-4111-8111-111111111111",
        shop: { publicId: "shop0000000019", name: "LifeDance 涩谷", city: "东京都" },
        status: "active"
      })
    );

    expect(repository.linkAgentShop).toHaveBeenCalledWith({
      agentPublicId: "11111111-1111-4111-8111-111111111111",
      shopPublicId: "shop0000000019",
      source: "运营人工确认",
      confirmedAt,
      confirmedById: 1,
      reason: "店铺签约资料已核对"
    });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "backoffice.agent_shop_referral.create",
        targetType: "agent_shop_referral",
        targetId: 51,
        metadata: {
          before: null,
          after: {
            publicId: "22222222-2222-4222-8222-222222222222",
            agentPublicId: "11111111-1111-4111-8111-111111111111",
            shopPublicId: "shop0000000019",
            status: "active",
            source: "运营人工确认",
            confirmedAt: "2026-09-01T02:00:00.000Z"
          },
          reason: "店铺签约资料已核对"
        }
      })
    );
  });

  it("lists the agent's referred shops with pagination and read audit evidence", async () => {
    const { service, repository, audit } = setup();
    const agentPublicId = profile().publicId;

    await expect(
      service.listAgentShopReferrals(
        agentPublicId,
        { page: 1, pageSize: 20, status: "active" },
        actor,
        context
      )
    ).resolves.toMatchObject({
      list: [{ agentPublicId, status: "active", shop: { publicId: "shop0000000019" } }],
      total: 1
    });
    expect(repository.listAgentShopReferrals).toHaveBeenCalledWith({
      agentPublicId,
      page: 1,
      pageSize: 20,
      status: "active"
    });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "backoffice.agent_shop_referral.list",
        metadata: {
          agentPublicId,
          page: 1,
          pageSize: 20,
          status: "active",
          resultCount: 1
        }
      })
    );
  });

  it("rejects absent agents, absent shops, and shops already owned by another active referral", async () => {
    const absentAgent = setup();
    absentAgent.repository.linkAgentShop.mockResolvedValue({ kind: "agent_not_found" });
    const absentShop = setup();
    absentShop.repository.linkAgentShop.mockResolvedValue({ kind: "shop_not_found" });
    const conflict = setup();
    conflict.repository.linkAgentShop.mockResolvedValue({ kind: "shop_conflict" });
    const input = {
      shopPublicId: "shop0000000019",
      source: "运营人工确认",
      confirmedAt: activatedAt,
      reason: "资料确认"
    };

    await expect(
      absentAgent.service.linkAgentShop(profile().publicId, input, actor, context)
    ).rejects.toMatchObject({
      code: ERROR_CODES.PLATFORM_PARTNER_PROFILE_NOT_FOUND,
      statusCode: 404
    });
    await expect(
      absentShop.service.linkAgentShop(profile().publicId, input, actor, context)
    ).rejects.toMatchObject({ code: ERROR_CODES.PLATFORM_PARTNER_SHOP_NOT_FOUND, statusCode: 404 });
    await expect(
      conflict.service.linkAgentShop(profile().publicId, input, actor, context)
    ).rejects.toMatchObject({ code: ERROR_CODES.AGENT_REFERRAL_CONFLICT, statusCode: 409 });
  });
});
