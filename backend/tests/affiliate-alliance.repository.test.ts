import type { PrismaClient } from "@prisma/client";
import { AffiliateAllianceRepository } from "../src/repositories/affiliate-alliance.repository";

const timestamp = new Date("2026-08-28T12:00:00.000Z");
const memberRecord = {
  id: 91,
  role: "OWNER",
  promoterShareBpsOverride: null,
  alliance: {
    id: 42,
    name: "东京美容联盟",
    description: "面向东京地区",
    status: "ACTIVE",
    version: 1,
    defaultPromoterShareBps: 8000,
    createdAt: timestamp,
    updatedAt: timestamp,
    owner: {
      needoId: "u0000000007",
      username: "山本太郎",
      avatarUrl: null
    }
  },
  parent: null
};

const permissionRecord = {
  canClaimTasks: true,
  canViewAllianceOverview: true,
  canViewMemberDetails: true,
  canManageOwnSubordinates: true,
  canViewAllianceWallet: true
};

const walletRecord = {
  currency: "NDP",
  availableBalance: 0,
  frozenBalance: 0
};

const auditLog = {
  actorId: 7,
  action: "affiliate_alliance.created",
  targetType: "AffiliateAlliance",
  targetId: null,
  ip: "127.0.0.1",
  userAgent: "jest",
  metadata: { defaultPromoterShareBps: 8000 }
};

describe("AffiliateAllianceRepository", () => {
  it("reads only the current non-deleted membership, permissions, alliance, and wallet", async () => {
    const memberFindFirst = jest.fn().mockResolvedValue(memberRecord);
    const permissionFindFirst = jest.fn().mockResolvedValue(permissionRecord);
    const walletFindFirst = jest.fn().mockResolvedValue(walletRecord);
    const client = {
      affiliateAllianceMember: { findFirst: memberFindFirst },
      affiliateAlliancePermission: { findFirst: permissionFindFirst },
      wallet: { findFirst: walletFindFirst }
    } as unknown as PrismaClient;
    const repository = new AffiliateAllianceRepository(client);

    const result = await repository.findMine(7);

    expect(memberFindFirst).toHaveBeenCalledWith({
      where: {
        userId: 7,
        activeKey: "user:7",
        leftAt: null,
        deletedAt: null,
        alliance: {
          deletedAt: null,
          owner: { deletedAt: null }
        }
      },
      select: expect.objectContaining({
        alliance: {
          select: expect.objectContaining({
            owner: { select: { needoId: true, username: true, avatarUrl: true } }
          })
        },
        parent: {
          select: {
            leftAt: true,
            deletedAt: true,
            user: { select: { needoId: true } }
          }
        }
      })
    });
    expect(permissionFindFirst).toHaveBeenCalledWith({
      where: { memberId: 91, deletedAt: null },
      select: expect.any(Object)
    });
    expect(walletFindFirst).toHaveBeenCalledWith({
      where: {
        ownerType: "ALLIANCE",
        ownerId: 42,
        currency: "NDP",
        deletedAt: null
      },
      select: {
        currency: true,
        availableBalance: true,
        frozenBalance: true
      }
    });
    expect(result).toEqual({
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
        permissions: permissionRecord
      },
      wallet: walletRecord,
      createdAt: timestamp.toISOString(),
      updatedAt: timestamp.toISOString()
    });
    expect(JSON.stringify(result)).not.toMatch(/userId|identityId|scout/);
  });

  it("reads profile status and active membership eligibility from canonical records", async () => {
    const client = {
      affiliateProfile: {
        findFirst: jest.fn().mockResolvedValue({ status: "ACTIVE" })
      },
      affiliateAllianceMember: {
        findFirst: jest.fn().mockResolvedValue(null)
      }
    } as unknown as PrismaClient;
    const repository = new AffiliateAllianceRepository(client);

    await expect(repository.findCreationEligibility(7)).resolves.toEqual({
      affiliateStatus: "active",
      hasActiveMembership: false
    });
    expect(client.affiliateProfile.findFirst).toHaveBeenCalledWith({
      where: { userId: 7, deletedAt: null },
      select: { status: true }
    });
    expect(client.affiliateAllianceMember.findFirst).toHaveBeenCalledWith({
      where: {
        userId: 7,
        activeKey: "user:7",
        leftAt: null,
        deletedAt: null
      },
      select: { id: true }
    });
  });

  it("creates the complete owner aggregate in one audited transaction", async () => {
    const transaction = {
      affiliateProfile: {
        findFirst: jest.fn().mockResolvedValue({ status: "ACTIVE" })
      },
      affiliateAllianceMember: {
        findFirst: jest.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(memberRecord),
        create: jest.fn().mockResolvedValue({ id: 91 })
      },
      affiliateAlliance: {
        create: jest.fn().mockResolvedValue({ id: 42 })
      },
      affiliateAlliancePermission: {
        create: jest.fn().mockResolvedValue({ id: 101 }),
        findFirst: jest.fn().mockResolvedValue(permissionRecord)
      },
      wallet: {
        create: jest.fn().mockResolvedValue({ id: 111 }),
        findFirst: jest.fn().mockResolvedValue(walletRecord)
      },
      auditLog: {
        create: jest.fn().mockResolvedValue({ id: 121 })
      }
    };
    const client = {
      $transaction: jest.fn(async (callback) => callback(transaction))
    } as unknown as PrismaClient;
    const repository = new AffiliateAllianceRepository(client);

    await expect(
      repository.createOwned({
        userId: 7,
        name: "东京美容联盟",
        description: "面向东京地区",
        defaultPromoterShareBps: 8000,
        auditLog
      })
    ).resolves.toMatchObject({ allianceId: 42, wallet: walletRecord });

    expect(client.$transaction).toHaveBeenCalledTimes(1);
    expect(transaction.affiliateProfile.findFirst).toHaveBeenCalledWith({
      where: { userId: 7, status: "ACTIVE", deletedAt: null },
      select: { id: true }
    });
    expect(transaction.affiliateAllianceMember.findFirst).toHaveBeenNthCalledWith(1, {
      where: {
        userId: 7,
        activeKey: "user:7",
        leftAt: null,
        deletedAt: null
      },
      select: { id: true }
    });
    expect(transaction.affiliateAlliance.create).toHaveBeenCalledWith({
      data: {
        ownerUserId: 7,
        name: "东京美容联盟",
        description: "面向东京地区",
        defaultPromoterShareBps: 8000
      },
      select: { id: true }
    });
    expect(transaction.affiliateAllianceMember.create).toHaveBeenCalledWith({
      data: {
        allianceId: 42,
        userId: 7,
        role: "OWNER",
        parentMemberId: null,
        promoterShareBpsOverride: null,
        activeKey: "user:7"
      },
      select: { id: true }
    });
    expect(transaction.affiliateAlliancePermission.create).toHaveBeenCalledWith({
      data: {
        memberId: 91,
        canClaimTasks: true,
        canViewAllianceOverview: true,
        canViewMemberDetails: true,
        canManageOwnSubordinates: true,
        canViewAllianceWallet: true
      }
    });
    expect(transaction.wallet.create).toHaveBeenCalledWith({
      data: {
        ownerType: "ALLIANCE",
        ownerId: 42,
        currency: "NDP",
        availableBalance: 0,
        frozenBalance: 0
      }
    });
    expect(transaction.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "affiliate_alliance.created",
        targetType: "AffiliateAlliance",
        targetId: 42
      })
    });
  });

  it("maps a concurrent active membership uniqueness race to already joined", async () => {
    const transaction = {
      affiliateProfile: {
        findFirst: jest.fn().mockResolvedValue({ status: "ACTIVE" })
      },
      affiliateAllianceMember: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockRejectedValue({ code: "P2002" })
      },
      affiliateAlliance: {
        create: jest.fn().mockResolvedValue({ id: 42 })
      }
    };
    const client = {
      $transaction: jest.fn(async (callback) => callback(transaction))
    } as unknown as PrismaClient;
    const repository = new AffiliateAllianceRepository(client);

    await expect(
      repository.createOwned({
        userId: 7,
        name: "东京美容联盟",
        description: null,
        defaultPromoterShareBps: 8000,
        auditLog
      })
    ).rejects.toMatchObject({
      message: "error.affiliate_alliance.already_joined",
      statusCode: 409
    });
  });

  it("passes through non-uniqueness persistence failures", async () => {
    const failure = new Error("database unavailable");
    const client = {
      $transaction: jest.fn().mockRejectedValue(failure)
    } as unknown as PrismaClient;
    const repository = new AffiliateAllianceRepository(client);

    await expect(
      repository.createOwned({
        userId: 7,
        name: "东京美容联盟",
        description: null,
        defaultPromoterShareBps: 8000,
        auditLog
      })
    ).rejects.toBe(failure);
  });

  it("discovers only reciprocal active Affiliate contacts through one paginated query", async () => {
    const count = jest.fn().mockResolvedValue(1);
    const findMany = jest.fn().mockResolvedValue([
      { needoId: "u0000000008", username: "佐藤花子", avatarUrl: null }
    ]);
    const client = { user: { count, findMany } } as unknown as PrismaClient;
    const repository = new AffiliateAllianceRepository(client);

    await expect(
      repository.listEligibleContacts({
        allianceId: 42,
        ownerUserId: 7,
        page: 1,
        pageSize: 20,
        q: "佐藤"
      })
    ).resolves.toEqual({
      list: [{ needoId: "u0000000008", displayName: "佐藤花子", avatarUrl: null }],
      total: 1,
      page: 1,
      page_size: 20
    });

    const where = (findMany.mock.calls[0]?.[0] as { where: Record<string, unknown> }).where;
    expect(where).toEqual(
      expect.objectContaining({
        isActive: true,
        deletedAt: null,
        identities: {
          some: { type: "scout", isActive: true, deletedAt: null }
        },
        affiliateProfile: { is: { status: "ACTIVE", deletedAt: null } },
        affiliateAllianceMemberships: {
          none: { activeKey: { not: null }, leftAt: null, deletedAt: null }
        },
        contactEntries: {
          some: { ownerUserId: 7, blockedAt: null, deletedAt: null }
        },
        ownedContacts: {
          some: { contactUserId: 7, blockedAt: null, deletedAt: null }
        },
        receivedAffiliateAllianceInvitations: {
          none: { allianceId: 42, status: "PENDING", deletedAt: null }
        }
      })
    );
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 0,
        take: 20,
        orderBy: [{ username: "asc" }, { id: "asc" }],
        select: { needoId: true, username: true, avatarUrl: true }
      })
    );
    expect(count).toHaveBeenCalledWith({ where });
  });

  it("commits request-time expiration and system audit before returning expired", async () => {
    const expiresAt = new Date("2026-08-28T12:00:00.000Z");
    const transaction = {
      affiliateAllianceInvitation: {
        findFirst: jest.fn().mockResolvedValue({
          id: 71,
          status: "PENDING",
          expiresAt,
          version: 3,
          pendingKey: "alliance:42:invitee:8"
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 })
      },
      auditLog: { create: jest.fn().mockResolvedValue({ id: 901 }) }
    };
    const client = {
      $transaction: jest.fn(async (callback) => callback(transaction))
    } as unknown as PrismaClient;
    const repository = new AffiliateAllianceRepository(client);

    await expect(
      repository.acceptInvitation({
        invitationId: 71,
        inviteeUserId: 8,
        now: expiresAt,
        auditLog: { actorId: 8, action: "affiliate_alliance.invitation_accepted", targetType: "AffiliateAllianceInvitation" },
        expiryAuditLog: { actorId: null, action: "affiliate_alliance.invitation_expired", targetType: "AffiliateAllianceInvitation" }
      })
    ).resolves.toEqual({ kind: "expired" });

    expect(transaction.affiliateAllianceInvitation.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 71, inviteeUserId: 8, deletedAt: null } })
    );
    expect(transaction.affiliateAllianceInvitation.updateMany).toHaveBeenCalledWith({
      where: { id: 71, status: "PENDING", version: 3, deletedAt: null },
      data: {
        status: "EXPIRED",
        pendingKey: null,
        expiredAt: expiresAt,
        version: { increment: 1 }
      }
    });
    expect(transaction.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actorId: null,
        action: "affiliate_alliance.invitation_expired",
        targetId: 71
      })
    });
  });

  it("commits reject-time expiration instead of leaving a stale pending row", async () => {
    const expiresAt = new Date("2026-08-28T12:00:00.000Z");
    const transaction = {
      affiliateAllianceInvitation: {
        findFirst: jest.fn().mockResolvedValue({
          id: 72,
          status: "PENDING",
          expiresAt,
          version: 1,
          pendingKey: "alliance:42:invitee:8"
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 })
      },
      auditLog: { create: jest.fn().mockResolvedValue({ id: 902 }) }
    };
    const client = {
      $transaction: jest.fn(async (callback) => callback(transaction))
    } as unknown as PrismaClient;
    const repository = new AffiliateAllianceRepository(client);

    await expect(
      repository.rejectInvitation({
        invitationId: 72,
        inviteeUserId: 8,
        now: expiresAt,
        auditLog: { actorId: 8, action: "affiliate_alliance.invitation_rejected", targetType: "AffiliateAllianceInvitation" },
        expiryAuditLog: { actorId: null, action: "affiliate_alliance.invitation_expired", targetType: "AffiliateAllianceInvitation" }
      })
    ).resolves.toEqual({ kind: "expired" });
    expect(transaction.affiliateAllianceInvitation.updateMany).toHaveBeenCalledWith({
      where: { id: 72, status: "PENDING", version: 1, deletedAt: null },
      data: {
        status: "EXPIRED",
        pendingKey: null,
        expiredAt: expiresAt,
        version: { increment: 1 }
      }
    });
    expect(transaction.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actorId: null,
        action: "affiliate_alliance.invitation_expired",
        targetId: 72
      })
    });
  });
});
