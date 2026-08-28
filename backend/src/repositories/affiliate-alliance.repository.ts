import {
  AffiliateAllianceMemberRole as PrismaAffiliateAllianceMemberRole,
  AffiliateProfileStatus as PrismaAffiliateProfileStatus,
  WalletOwnerType as PrismaWalletOwnerType,
  type Prisma,
  type PrismaClient
} from "@prisma/client";
import { ERROR_CODES } from "../constants/error-codes";
import { prisma } from "../prisma/client";
import type {
  AffiliateAllianceCreateOwnedInput,
  AffiliateAllianceCreationEligibility,
  AffiliateAlliancePayload,
  AffiliateAllianceRepositoryPort,
  AffiliateAllianceStatus
} from "../services/affiliate-alliance.service";
import { AppError } from "../utils/app-error";
import { toAuditLogCreateData } from "./audit-log.repository";

type AlliancePrismaClient = PrismaClient | Prisma.TransactionClient;

const allianceMemberSelect = {
  id: true,
  role: true,
  promoterShareBpsOverride: true,
  alliance: {
    select: {
      id: true,
      name: true,
      description: true,
      status: true,
      version: true,
      defaultPromoterShareBps: true,
      createdAt: true,
      updatedAt: true,
      owner: {
        select: { needoId: true, username: true, avatarUrl: true }
      }
    }
  },
  parent: {
    select: {
      leftAt: true,
      deletedAt: true,
      user: { select: { needoId: true } }
    }
  }
} satisfies Prisma.AffiliateAllianceMemberSelect;

const permissionSelect = {
  canClaimTasks: true,
  canViewAllianceOverview: true,
  canViewMemberDetails: true,
  canManageOwnSubordinates: true,
  canViewAllianceWallet: true
} satisfies Prisma.AffiliateAlliancePermissionSelect;

const walletSelect = {
  currency: true,
  availableBalance: true,
  frozenBalance: true
} satisfies Prisma.WalletSelect;

type AllianceMemberRecord = Prisma.AffiliateAllianceMemberGetPayload<{
  select: typeof allianceMemberSelect;
}>;
type AlliancePermissionRecord = Prisma.AffiliateAlliancePermissionGetPayload<{
  select: typeof permissionSelect;
}>;
type AllianceWalletRecord = Prisma.WalletGetPayload<{ select: typeof walletSelect }>;

export class AffiliateAllianceRepository implements AffiliateAllianceRepositoryPort {
  public constructor(private readonly client: PrismaClient = prisma) {}

  public findMine(userId: number): Promise<AffiliateAlliancePayload | null> {
    return this.findMineWithClient(this.client, userId);
  }

  public async findCreationEligibility(
    userId: number
  ): Promise<AffiliateAllianceCreationEligibility> {
    const [profile, membership] = await Promise.all([
      this.client.affiliateProfile.findFirst({
        where: { userId, deletedAt: null },
        select: { status: true }
      }),
      this.client.affiliateAllianceMember.findFirst({
        where: {
          userId,
          activeKey: this.activeMembershipKey(userId),
          leftAt: null,
          deletedAt: null
        },
        select: { id: true }
      })
    ]);

    return {
      affiliateStatus: profile ? this.statusFromPrisma(profile.status) : null,
      hasActiveMembership: membership !== null
    };
  }

  public async createOwned(
    input: AffiliateAllianceCreateOwnedInput
  ): Promise<AffiliateAlliancePayload> {
    try {
      return await this.client.$transaction(async (transaction) => {
        const profile = await transaction.affiliateProfile.findFirst({
          where: {
            userId: input.userId,
            status: PrismaAffiliateProfileStatus.ACTIVE,
            deletedAt: null
          },
          select: { id: true }
        });
        if (!profile) throw this.profileInactive();

        const currentMembership = await transaction.affiliateAllianceMember.findFirst({
          where: {
            userId: input.userId,
            activeKey: this.activeMembershipKey(input.userId),
            leftAt: null,
            deletedAt: null
          },
          select: { id: true }
        });
        if (currentMembership) throw this.alreadyJoined();

        const alliance = await transaction.affiliateAlliance.create({
          data: {
            ownerUserId: input.userId,
            name: input.name,
            description: input.description,
            defaultPromoterShareBps: input.defaultPromoterShareBps
          },
          select: { id: true }
        });
        const member = await transaction.affiliateAllianceMember.create({
          data: {
            allianceId: alliance.id,
            userId: input.userId,
            role: PrismaAffiliateAllianceMemberRole.OWNER,
            parentMemberId: null,
            promoterShareBpsOverride: null,
            activeKey: this.activeMembershipKey(input.userId)
          },
          select: { id: true }
        });
        await transaction.affiliateAlliancePermission.create({
          data: {
            memberId: member.id,
            canClaimTasks: true,
            canViewAllianceOverview: true,
            canViewMemberDetails: true,
            canManageOwnSubordinates: true,
            canViewAllianceWallet: true
          }
        });
        await transaction.wallet.create({
          data: {
            ownerType: PrismaWalletOwnerType.ALLIANCE,
            ownerId: alliance.id,
            currency: "NDP",
            availableBalance: 0,
            frozenBalance: 0
          }
        });
        await transaction.auditLog.create({
          data: toAuditLogCreateData({ ...input.auditLog, targetId: alliance.id })
        });

        const created = await this.findMineWithClient(transaction, input.userId);
        if (!created) throw this.dataInvalid();
        return created;
      });
    } catch (error) {
      if (this.isUniqueConflict(error)) throw this.alreadyJoined();
      throw error;
    }
  }

  private async findMineWithClient(
    client: AlliancePrismaClient,
    userId: number
  ): Promise<AffiliateAlliancePayload | null> {
    const membership = await client.affiliateAllianceMember.findFirst({
      where: {
        userId,
        activeKey: this.activeMembershipKey(userId),
        leftAt: null,
        deletedAt: null,
        alliance: {
          deletedAt: null,
          owner: { deletedAt: null }
        }
      },
      select: allianceMemberSelect
    });
    if (!membership) return null;

    const [permission, wallet] = await Promise.all([
      client.affiliateAlliancePermission.findFirst({
        where: { memberId: membership.id, deletedAt: null },
        select: permissionSelect
      }),
      client.wallet.findFirst({
        where: {
          ownerType: PrismaWalletOwnerType.ALLIANCE,
          ownerId: membership.alliance.id,
          currency: "NDP",
          deletedAt: null
        },
        select: walletSelect
      })
    ]);
    if (!permission || !wallet) throw this.dataInvalid();

    return this.mapPayload(membership, permission, wallet);
  }

  private mapPayload(
    membership: AllianceMemberRecord,
    permission: AlliancePermissionRecord,
    wallet: AllianceWalletRecord
  ): AffiliateAlliancePayload {
    const alliance = membership.alliance;
    const managerNeedoId =
      membership.parent && !membership.parent.deletedAt && !membership.parent.leftAt
        ? membership.parent.user.needoId
        : null;

    return {
      allianceId: alliance.id,
      name: alliance.name,
      description: alliance.description,
      status: this.statusFromPrisma(alliance.status),
      version: alliance.version,
      defaultPromoterShareBps: alliance.defaultPromoterShareBps,
      owner: {
        needoId: alliance.owner.needoId,
        displayName: alliance.owner.username,
        avatarUrl: alliance.owner.avatarUrl
      },
      membership: {
        memberId: membership.id,
        role: membership.role.toLowerCase() as AffiliateAlliancePayload["membership"]["role"],
        managerNeedoId,
        promoterShareBpsOverride: membership.promoterShareBpsOverride,
        permissions: permission
      },
      wallet: {
        currency: "NDP",
        availableBalance: wallet.availableBalance,
        frozenBalance: wallet.frozenBalance
      },
      createdAt: alliance.createdAt.toISOString(),
      updatedAt: alliance.updatedAt.toISOString()
    };
  }

  private statusFromPrisma(value: string): AffiliateAllianceStatus {
    return value.toLowerCase() as AffiliateAllianceStatus;
  }

  private activeMembershipKey(userId: number): string {
    return `user:${userId}`;
  }

  private isUniqueConflict(error: unknown): boolean {
    return typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
  }

  private profileInactive(): AppError {
    return new AppError({
      code: ERROR_CODES.AFFILIATE_ALLIANCE_PROFILE_INACTIVE,
      message: "error.affiliate_alliance.profile_inactive",
      statusCode: 403
    });
  }

  private alreadyJoined(): AppError {
    return new AppError({
      code: ERROR_CODES.AFFILIATE_ALLIANCE_ALREADY_JOINED,
      message: "error.affiliate_alliance.already_joined",
      statusCode: 409
    });
  }

  private dataInvalid(): AppError {
    return new AppError({
      code: ERROR_CODES.INTERNAL,
      message: "error.affiliate_alliance.data_invalid",
      statusCode: 500
    });
  }
}
