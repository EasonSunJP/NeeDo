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
});
