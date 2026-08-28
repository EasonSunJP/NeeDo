import type { AuditLogCreateInput } from "../src/repositories/audit-log.repository";
import type { AuditLogRecordInput } from "../src/services/audit-log.service";
import {
  AffiliateAllianceService,
  type AffiliateAllianceInvitationPayload,
  type AffiliateAllianceMemberPayload,
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
  createOwned: jest.fn(),
  listMembers: jest.fn(),
  listEligibleContacts: jest.fn(),
  listSentInvitations: jest.fn(),
  createInvitation: jest.fn(),
  listReceivedInvitations: jest.fn(),
  acceptInvitation: jest.fn(),
  rejectInvitation: jest.fn()
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

describe("AffiliateAllianceService invitation workflow", () => {
  const currentTime = new Date("2026-08-28T12:00:00.000Z");
  const member: AffiliateAllianceMemberPayload = {
    memberId: 91,
    person: alliance.owner,
    role: "owner",
    parent: null,
    promoterShareBpsOverride: null,
    permissions: alliance.membership.permissions,
    joinedAt: now
  };
  const invitation: AffiliateAllianceInvitationPayload = {
    invitationId: 71,
    alliance: { allianceId: 42, name: "东京美容联盟" },
    inviter: alliance.owner,
    invitee: {
      needoId: "u0000000008",
      displayName: "佐藤花子",
      avatarUrl: null
    },
    role: "partner",
    proposedParent: null,
    status: "pending",
    expiresAt: "2026-08-31T12:00:00.000Z",
    respondedAt: null,
    createdAt: now
  };

  it("keeps owner-only reads behind current owner membership", async () => {
    const repository = createRepository();
    repository.findMine.mockResolvedValue({
      ...alliance,
      membership: { ...alliance.membership, role: "partner" }
    });
    const service = new AffiliateAllianceService(repository, createAudit(), () => currentTime);

    await expect(
      service.listMembers(actor, { page: 1, pageSize: 20 })
    ).rejects.toMatchObject({
      message: "error.affiliate_alliance.owner_required",
      statusCode: 403
    });
    expect(repository.listMembers).not.toHaveBeenCalled();
  });

  it("lists owner members with normalized repository scope", async () => {
    const repository = createRepository();
    repository.findMine.mockResolvedValue(alliance);
    repository.listMembers.mockResolvedValue({
      list: [member],
      total: 1,
      page: 1,
      page_size: 20
    });
    const service = new AffiliateAllianceService(repository, createAudit(), () => currentTime);

    await expect(
      service.listMembers(actor, { page: 1, pageSize: 20, q: " 山本 " })
    ).resolves.toEqual({ list: [member], total: 1, page: 1, page_size: 20 });
    expect(repository.listMembers).toHaveBeenCalledWith({
      allianceId: 42,
      page: 1,
      pageSize: 20,
      q: "山本"
    });
  });

  it("creates a 72-hour invitation with owner scope and an audited immutable NeeDo ID", async () => {
    const repository = createRepository();
    const audit = createAudit();
    repository.findMine.mockResolvedValue(alliance);
    repository.createInvitation.mockResolvedValue({ kind: "created", invitation });
    const service = new AffiliateAllianceService(repository, audit, () => currentTime);

    await expect(
      service.createInvitation(actor, context, {
        inviteeNeedoId: "u0000000008",
        role: "partner"
      })
    ).resolves.toEqual({ invitation });

    expect(repository.createInvitation).toHaveBeenCalledWith({
      allianceId: 42,
      inviterMemberId: 91,
      inviterUserId: 7,
      inviteeNeedoId: "u0000000008",
      role: "partner",
      proposedParentMemberId: null,
      now: currentTime,
      expiresAt: new Date("2026-08-31T12:00:00.000Z"),
      auditLog: expect.objectContaining({
        actorId: 7,
        action: "affiliate_alliance.invitation_created",
        targetType: "AffiliateAllianceInvitation"
      })
    });
  });

  it.each([
    ["owner_required", "error.affiliate_alliance.owner_required", 403],
    ["invitee_not_eligible", "error.affiliate_alliance.invitee_not_eligible", 403],
    ["mutual_contact_required", "error.affiliate_alliance.mutual_contact_required", 403],
    ["duplicate", "error.affiliate_alliance.invitation_duplicate", 409],
    ["parent_invalid", "error.affiliate_alliance.parent_invalid", 409],
    ["already_joined", "error.affiliate_alliance.already_joined", 409]
  ] as const)("maps create result %s to a stable domain error", async (kind, message, statusCode) => {
    const repository = createRepository();
    repository.findMine.mockResolvedValue(alliance);
    repository.createInvitation.mockResolvedValue({ kind });
    const service = new AffiliateAllianceService(repository, createAudit(), () => currentTime);

    await expect(
      service.createInvitation(actor, context, {
        inviteeNeedoId: "u0000000008",
        role: "partner"
      })
    ).rejects.toMatchObject({ message, statusCode });
  });

  it("lists received invitations by the authenticated Affiliate user only", async () => {
    const repository = createRepository();
    repository.listReceivedInvitations.mockResolvedValue({
      list: [invitation],
      total: 1,
      page: 1,
      page_size: 20
    });
    const service = new AffiliateAllianceService(repository, createAudit(), () => currentTime);

    await expect(
      service.listReceivedInvitations(actor, { page: 1, pageSize: 20, status: "pending" })
    ).resolves.toMatchObject({ list: [invitation] });
    expect(repository.listReceivedInvitations).toHaveBeenCalledWith({
      inviteeUserId: 7,
      page: 1,
      pageSize: 20,
      status: "pending"
    });
  });

  it("returns accepted membership with all permissions disabled", async () => {
    const repository = createRepository();
    const acceptedMember: AffiliateAllianceMemberPayload = {
      ...member,
      person: invitation.invitee,
      role: "partner",
      permissions: {
        canClaimTasks: false,
        canViewAllianceOverview: false,
        canViewMemberDetails: false,
        canManageOwnSubordinates: false,
        canViewAllianceWallet: false
      }
    };
    repository.acceptInvitation.mockResolvedValue({
      kind: "accepted",
      invitation: { ...invitation, status: "accepted", respondedAt: now },
      member: acceptedMember
    });
    const service = new AffiliateAllianceService(repository, createAudit(), () => currentTime);

    await expect(service.acceptInvitation(actor, context, 71)).resolves.toEqual({
      invitation: { ...invitation, status: "accepted", respondedAt: now },
      member: acceptedMember
    });
    expect(repository.acceptInvitation).toHaveBeenCalledWith(
      expect.objectContaining({
        invitationId: 71,
        inviteeUserId: 7,
        now: currentTime,
        auditLog: expect.objectContaining({
          action: "affiliate_alliance.invitation_accepted"
        }),
        expiryAuditLog: expect.objectContaining({
          actorId: null,
          action: "affiliate_alliance.invitation_expired"
        })
      })
    );
  });

  it.each([
    ["not_found", "error.affiliate_alliance.invitation_not_found", 404],
    ["expired", "error.affiliate_alliance.invitation_expired", 409],
    ["state_conflict", "error.affiliate_alliance.invitation_state_conflict", 409],
    ["mutual_contact_required", "error.affiliate_alliance.mutual_contact_required", 403],
    ["invitee_not_eligible", "error.affiliate_alliance.invitee_not_eligible", 403],
    ["parent_invalid", "error.affiliate_alliance.parent_invalid", 409],
    ["already_joined", "error.affiliate_alliance.already_joined", 409]
  ] as const)("maps accept result %s without leaking persistence errors", async (kind, message, statusCode) => {
    const repository = createRepository();
    repository.acceptInvitation.mockResolvedValue({ kind });
    const service = new AffiliateAllianceService(repository, createAudit(), () => currentTime);

    await expect(service.acceptInvitation(actor, context, 999)).rejects.toMatchObject({
      message,
      statusCode
    });
  });

  it("rejects only the authenticated invitee's invitation and maps terminal conflicts", async () => {
    const repository = createRepository();
    repository.rejectInvitation
      .mockResolvedValueOnce({
        kind: "rejected",
        invitation: { ...invitation, status: "rejected", respondedAt: now }
      })
      .mockResolvedValueOnce({ kind: "not_found" });
    const service = new AffiliateAllianceService(repository, createAudit(), () => currentTime);

    await expect(service.rejectInvitation(actor, context, 71)).resolves.toMatchObject({
      invitation: { status: "rejected" }
    });
    expect(repository.rejectInvitation).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ invitationId: 71, inviteeUserId: 7, now: currentTime })
    );
    await expect(service.rejectInvitation(actor, context, 999)).rejects.toMatchObject({
      message: "error.affiliate_alliance.invitation_not_found",
      statusCode: 404
    });
  });

  it("requires current Affiliate identity for received invitation actions", async () => {
    const repository = createRepository();
    const service = new AffiliateAllianceService(repository, createAudit(), () => currentTime);
    const customerActor = { ...actor, currentIdentityType: "customer" } as AuthenticatedAccessContext;

    await expect(
      service.listReceivedInvitations(customerActor, { page: 1, pageSize: 20 })
    ).rejects.toMatchObject({ message: "error.affiliate_alliance.identity_required" });
    await expect(service.acceptInvitation(customerActor, context, 71)).rejects.toMatchObject({
      message: "error.affiliate_alliance.identity_required"
    });
    expect(repository.listReceivedInvitations).not.toHaveBeenCalled();
    expect(repository.acceptInvitation).not.toHaveBeenCalled();
  });
});
