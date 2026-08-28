import type { AuditLogCreateInput } from "../src/repositories/audit-log.repository";
import type { AuditLogRecordInput } from "../src/services/audit-log.service";
import {
  AffiliateAllianceService,
  type AffiliateAlliancePayload,
  type AffiliateAllianceRepositoryPort
} from "../src/services/affiliate-alliance.service";
import type { AuthRequestContext, AuthenticatedAccessContext } from "../src/services/auth.service";

const now = "2026-08-28T12:00:00.000Z";
const alliance: AffiliateAlliancePayload = {
  allianceId: 42,
  name: "东京美容联盟",
  description: "面向东京地区",
  status: "active",
  version: 1,
  defaultPromoterShareBps: 8000,
  owner: {
    needoId: "u0000000007",
    displayName: "山本太郎",
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
  wallet: {
    currency: "NDP",
    availableBalance: 0,
    frozenBalance: 0
  },
  createdAt: now,
  updatedAt: now
};

const actor = {
  userId: 7,
  currentIdentityType: "scout",
  roles: ["scout"],
  permissions: ["page:affiliate-alliance", "button:affiliate-alliance-create"]
} as AuthenticatedAccessContext;
const context: AuthRequestContext = { ip: "127.0.0.1", userAgent: "jest" };

const createRepository = (): jest.Mocked<AffiliateAllianceRepositoryPort> => ({
  findMine: jest.fn(),
  findCreationEligibility: jest.fn(),
  createOwned: jest.fn()
});

const createAudit = () => ({
  createInput: jest.fn(
    (input: AuditLogRecordInput): AuditLogCreateInput => ({
      actorId: input.actor.userId,
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId ?? null,
      ip: input.context.ip,
      userAgent: input.context.userAgent,
      metadata: input.metadata
    })
  )
});

describe("AffiliateAllianceService", () => {
  it("requires the current Affiliate identity even when admin permissions are present", async () => {
    const repository = createRepository();
    const service = new AffiliateAllianceService(repository, createAudit());

    await expect(
      service.getMine({
        ...actor,
        currentIdentityType: "customer",
        roles: ["admin"],
        permissions: ["page:affiliate-alliance", "button:affiliate-alliance-create"]
      })
    ).rejects.toMatchObject({
      message: "error.affiliate_alliance.identity_required",
      statusCode: 403
    });
    expect(repository.findMine).not.toHaveBeenCalled();
  });

  it("returns null when the activated Affiliate has not joined an alliance", async () => {
    const repository = createRepository();
    repository.findMine.mockResolvedValue(null);
    const service = new AffiliateAllianceService(repository, createAudit());

    await expect(service.getMine(actor)).resolves.toEqual({ alliance: null });
    expect(repository.findMine).toHaveBeenCalledWith(7);
  });

  it("creates an owner alliance without requiring eKYC or bank data", async () => {
    const repository = createRepository();
    const audit = createAudit();
    repository.findCreationEligibility.mockResolvedValue({
      affiliateStatus: "active",
      hasActiveMembership: false
    });
    repository.createOwned.mockResolvedValue(alliance);
    const service = new AffiliateAllianceService(repository, audit);

    await expect(
      service.createMine(actor, context, {
        name: "  东京美容联盟  ",
        description: "  面向东京地区  ",
        defaultPromoterShareBps: 8000
      })
    ).resolves.toEqual({ alliance });

    expect(repository.createOwned).toHaveBeenCalledWith({
      userId: 7,
      name: "东京美容联盟",
      description: "面向东京地区",
      defaultPromoterShareBps: 8000,
      auditLog: expect.objectContaining({
        actorId: 7,
        action: "affiliate_alliance.created",
        targetType: "AffiliateAlliance",
        targetId: null
      })
    });
    expect(audit.createInput).toHaveBeenCalledWith(
      expect.objectContaining({
        actor,
        context,
        action: "affiliate_alliance.created",
        targetType: "AffiliateAlliance",
        metadata: { defaultPromoterShareBps: 8000 }
      })
    );
  });

  it.each(["suspended", "closed", null] as const)(
    "blocks creation when the Affiliate profile status is %s",
    async (affiliateStatus) => {
      const repository = createRepository();
      repository.findCreationEligibility.mockResolvedValue({
        affiliateStatus,
        hasActiveMembership: false
      });
      const service = new AffiliateAllianceService(repository, createAudit());

      await expect(
        service.createMine(actor, context, {
          name: "东京美容联盟",
          description: null,
          defaultPromoterShareBps: 8000
        })
      ).rejects.toMatchObject({
        message: "error.affiliate_alliance.profile_inactive",
        statusCode: 403
      });
      expect(repository.createOwned).not.toHaveBeenCalled();
    }
  );

  it("prevents a second current alliance membership", async () => {
    const repository = createRepository();
    repository.findCreationEligibility.mockResolvedValue({
      affiliateStatus: "active",
      hasActiveMembership: true
    });
    const service = new AffiliateAllianceService(repository, createAudit());

    await expect(
      service.createMine(actor, context, {
        name: "东京美容联盟",
        defaultPromoterShareBps: 8000
      })
    ).rejects.toMatchObject({
      message: "error.affiliate_alliance.already_joined",
      statusCode: 409
    });
    expect(repository.createOwned).not.toHaveBeenCalled();
  });

  it("exposes only public IDs and never internal identity fields", async () => {
    const repository = createRepository();
    repository.findMine.mockResolvedValue(alliance);
    const service = new AffiliateAllianceService(repository, createAudit());

    const response = await service.getMine(actor);
    expect(response.alliance?.owner.needoId).toBe("u0000000007");
    expect(JSON.stringify(response)).not.toMatch(/userId|identityId|scout/);
  });
});
