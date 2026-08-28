import {
  AffiliateAllianceInvitationRole as PrismaAffiliateAllianceInvitationRole,
  AffiliateAllianceInvitationStatus as PrismaAffiliateAllianceInvitationStatus,
  AffiliateAllianceMemberRole as PrismaAffiliateAllianceMemberRole,
  AffiliateAllianceStatus as PrismaAffiliateAllianceStatus,
  AffiliateProfileStatus as PrismaAffiliateProfileStatus,
  WalletOwnerType as PrismaWalletOwnerType,
  type Prisma,
  type PrismaClient
} from "@prisma/client";
import { ERROR_CODES } from "../constants/error-codes";
import { prisma } from "../prisma/client";
import type {
  AffiliateAllianceCreateOwnedInput,
  AffiliateAllianceCreateInvitationInput,
  AffiliateAllianceCreateInvitationResult,
  AffiliateAllianceCreationEligibility,
  AffiliateAllianceAcceptInvitationResult,
  AffiliateAllianceEligibleContactInput,
  AffiliateAllianceInvitationPayload,
  AffiliateAllianceMemberPayload,
  AffiliateAllianceOwnerListInput,
  AffiliateAlliancePayload,
  AffiliateAlliancePublicPerson,
  AffiliateAllianceReceivedInvitationListInput,
  AffiliateAllianceRejectInvitationResult,
  AffiliateAllianceRepositoryPort,
  AffiliateAllianceRespondInvitationInput,
  AffiliateAllianceSentInvitationListInput,
  AffiliateAllianceStatus
} from "../services/affiliate-alliance.service";
import { AppError } from "../utils/app-error";
import { buildPaginatedResponse, toPrismaPagination } from "../utils/pagination";
import {
  toAuditLogCreateData,
  type AuditLogCreateInput
} from "./audit-log.repository";

type AlliancePrismaClient = PrismaClient | Prisma.TransactionClient;

class AffiliateAllianceInvitationStateRaceError extends Error {}

const publicPersonSelect = {
  needoId: true,
  username: true,
  avatarUrl: true
} satisfies Prisma.UserSelect;

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

const allianceMemberListSelect = {
  id: true,
  role: true,
  promoterShareBpsOverride: true,
  joinedAt: true,
  user: { select: publicPersonSelect },
  parent: {
    select: {
      id: true,
      user: { select: publicPersonSelect }
    }
  },
  permission: { select: permissionSelect }
} satisfies Prisma.AffiliateAllianceMemberSelect;

const invitationSelect = {
  id: true,
  allianceId: true,
  inviterMemberId: true,
  inviteeUserId: true,
  role: true,
  proposedParentMemberId: true,
  status: true,
  pendingKey: true,
  expiresAt: true,
  respondedAt: true,
  expiredAt: true,
  version: true,
  createdAt: true,
  deletedAt: true,
  alliance: {
    select: { id: true, name: true, status: true, deletedAt: true }
  },
  inviterMember: {
    select: {
      id: true,
      userId: true,
      role: true,
      leftAt: true,
      deletedAt: true,
      user: { select: publicPersonSelect }
    }
  },
  invitee: { select: publicPersonSelect },
  proposedParentMember: {
    select: {
      id: true,
      allianceId: true,
      role: true,
      leftAt: true,
      deletedAt: true,
      user: { select: publicPersonSelect }
    }
  }
} satisfies Prisma.AffiliateAllianceInvitationSelect;

type AllianceMemberRecord = Prisma.AffiliateAllianceMemberGetPayload<{
  select: typeof allianceMemberSelect;
}>;
type AlliancePermissionRecord = Prisma.AffiliateAlliancePermissionGetPayload<{
  select: typeof permissionSelect;
}>;
type AllianceWalletRecord = Prisma.WalletGetPayload<{ select: typeof walletSelect }>;
type PublicPersonRecord = Prisma.UserGetPayload<{ select: typeof publicPersonSelect }>;
type AllianceMemberListRecord = Prisma.AffiliateAllianceMemberGetPayload<{
  select: typeof allianceMemberListSelect;
}>;
type AllianceInvitationRecord = Prisma.AffiliateAllianceInvitationGetPayload<{
  select: typeof invitationSelect;
}>;

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

  public async listMembers(
    input: AffiliateAllianceOwnerListInput
  ): Promise<ReturnType<typeof buildPaginatedResponse<AffiliateAllianceMemberPayload>>> {
    const pagination = toPrismaPagination(input);
    const where: Prisma.AffiliateAllianceMemberWhereInput = {
      allianceId: input.allianceId,
      activeKey: { not: null },
      leftAt: null,
      deletedAt: null,
      ...(input.q
        ? {
            user: {
              is: {
                OR: [
                  { needoId: { contains: input.q } },
                  { username: { contains: input.q } }
                ],
                deletedAt: null
              }
            }
          }
        : {})
    };
    const [total, records] = await Promise.all([
      this.client.affiliateAllianceMember.count({ where }),
      this.client.affiliateAllianceMember.findMany({
        where,
        skip: pagination.skip,
        take: pagination.take,
        orderBy: [{ joinedAt: "asc" }, { id: "asc" }],
        select: allianceMemberListSelect
      })
    ]);
    return buildPaginatedResponse(records.map((record) => this.mapMember(record)), total, input);
  }

  public async listEligibleContacts(
    input: AffiliateAllianceEligibleContactInput
  ): Promise<ReturnType<typeof buildPaginatedResponse<AffiliateAlliancePublicPerson>>> {
    const pagination = toPrismaPagination(input);
    const where: Prisma.UserWhereInput = {
      isActive: true,
      deletedAt: null,
      identities: {
        some: { type: "scout", isActive: true, deletedAt: null }
      },
      affiliateProfile: {
        is: { status: PrismaAffiliateProfileStatus.ACTIVE, deletedAt: null }
      },
      affiliateAllianceMemberships: {
        none: { activeKey: { not: null }, leftAt: null, deletedAt: null }
      },
      contactEntries: {
        some: { ownerUserId: input.ownerUserId, blockedAt: null, deletedAt: null }
      },
      ownedContacts: {
        some: { contactUserId: input.ownerUserId, blockedAt: null, deletedAt: null }
      },
      receivedAffiliateAllianceInvitations: {
        none: {
          allianceId: input.allianceId,
          status: PrismaAffiliateAllianceInvitationStatus.PENDING,
          deletedAt: null
        }
      },
      ...(input.q
        ? {
            OR: [
              { needoId: { contains: input.q } },
              { username: { contains: input.q } }
            ]
          }
        : {})
    };
    const [total, records] = await Promise.all([
      this.client.user.count({ where }),
      this.client.user.findMany({
        where,
        skip: pagination.skip,
        take: pagination.take,
        orderBy: [{ username: "asc" }, { id: "asc" }],
        select: publicPersonSelect
      })
    ]);
    return buildPaginatedResponse(records.map((record) => this.mapPerson(record)), total, input);
  }

  public async listSentInvitations(
    input: AffiliateAllianceSentInvitationListInput
  ): Promise<ReturnType<typeof buildPaginatedResponse<AffiliateAllianceInvitationPayload>>> {
    return this.listInvitations({ allianceId: input.allianceId }, input);
  }

  public async listReceivedInvitations(
    input: AffiliateAllianceReceivedInvitationListInput
  ): Promise<ReturnType<typeof buildPaginatedResponse<AffiliateAllianceInvitationPayload>>> {
    return this.listInvitations({ inviteeUserId: input.inviteeUserId }, input);
  }

  public async createInvitation(
    input: AffiliateAllianceCreateInvitationInput
  ): Promise<AffiliateAllianceCreateInvitationResult> {
    try {
      return await this.client.$transaction(async (transaction) => {
        const owner = await transaction.affiliateAllianceMember.findFirst({
          where: {
            id: input.inviterMemberId,
            allianceId: input.allianceId,
            userId: input.inviterUserId,
            role: PrismaAffiliateAllianceMemberRole.OWNER,
            leftAt: null,
            deletedAt: null,
            alliance: {
              ownerUserId: input.inviterUserId,
              status: PrismaAffiliateAllianceStatus.ACTIVE,
              deletedAt: null
            }
          },
          select: { id: true }
        });
        if (!owner) return { kind: "owner_required" } as const;

        const invitee = await this.findEligibleAffiliateUser(
          transaction,
          input.inviteeNeedoId
        );
        if (!invitee) return { kind: "invitee_not_eligible" } as const;
        if (!(await this.hasMutualContact(transaction, input.inviterUserId, invitee.id))) {
          return { kind: "mutual_contact_required" } as const;
        }
        if (await this.hasActiveMembership(transaction, invitee.id)) {
          return { kind: "already_joined" } as const;
        }
        const duplicate = await transaction.affiliateAllianceInvitation.findFirst({
          where: {
            allianceId: input.allianceId,
            inviteeUserId: invitee.id,
            status: PrismaAffiliateAllianceInvitationStatus.PENDING,
            deletedAt: null
          },
          select: { id: true }
        });
        if (duplicate) return { kind: "duplicate" } as const;
        if (
          !(await this.isValidInvitationParent(
            transaction,
            input.allianceId,
            input.role,
            input.proposedParentMemberId
          ))
        ) {
          return { kind: "parent_invalid" } as const;
        }

        const created = await transaction.affiliateAllianceInvitation.create({
          data: {
            allianceId: input.allianceId,
            inviterMemberId: input.inviterMemberId,
            inviteeUserId: invitee.id,
            role: this.invitationRoleToPrisma(input.role),
            proposedParentMemberId: input.proposedParentMemberId,
            status: PrismaAffiliateAllianceInvitationStatus.PENDING,
            pendingKey: this.pendingInvitationKey(input.allianceId, invitee.id),
            expiresAt: input.expiresAt,
            version: 1
          },
          select: { id: true }
        });
        await transaction.auditLog.create({
          data: toAuditLogCreateData({ ...input.auditLog, targetId: created.id })
        });
        const invitation = await this.findInvitationWithClient(transaction, created.id);
        if (!invitation) throw this.dataInvalid();
        return { kind: "created", invitation: this.mapInvitation(invitation) } as const;
      });
    } catch (error) {
      if (this.isUniqueConflictFor(error, "pending_key")) return { kind: "duplicate" };
      throw error;
    }
  }

  public async acceptInvitation(
    input: AffiliateAllianceRespondInvitationInput & { expiryAuditLog: AuditLogCreateInput }
  ): Promise<AffiliateAllianceAcceptInvitationResult> {
    try {
      return await this.client.$transaction(async (transaction) => {
        const invitation = await this.findScopedInvitation(
          transaction,
          input.invitationId,
          input.inviteeUserId
        );
        if (!invitation) return { kind: "not_found" } as const;
        if (invitation.status !== PrismaAffiliateAllianceInvitationStatus.PENDING) {
          return { kind: "state_conflict" } as const;
        }
        if (invitation.expiresAt.getTime() <= input.now.getTime()) {
          const expired = await this.expirePendingInvitationWithClient(
            transaction,
            invitation,
            input.now,
            input.expiryAuditLog
          );
          return { kind: expired ? "expired" : "state_conflict" } as const;
        }
        if (
          invitation.alliance.status !== PrismaAffiliateAllianceStatus.ACTIVE ||
          invitation.alliance.deletedAt !== null ||
          invitation.inviterMember.role !== PrismaAffiliateAllianceMemberRole.OWNER ||
          invitation.inviterMember.leftAt !== null ||
          invitation.inviterMember.deletedAt !== null
        ) {
          return { kind: "owner_required" } as const;
        }
        const invitee = await this.findEligibleAffiliateUserById(
          transaction,
          input.inviteeUserId
        );
        if (!invitee) return { kind: "invitee_not_eligible" } as const;
        if (
          !(await this.hasMutualContact(
            transaction,
            invitation.inviterMember.userId,
            input.inviteeUserId
          ))
        ) {
          return { kind: "mutual_contact_required" } as const;
        }
        if (await this.hasActiveMembership(transaction, input.inviteeUserId)) {
          return { kind: "already_joined" } as const;
        }
        const role = invitation.role.toLowerCase() as "partner" | "subordinate";
        if (
          !(await this.isValidInvitationParent(
            transaction,
            invitation.allianceId,
            role,
            invitation.proposedParentMemberId
          ))
        ) {
          return { kind: "parent_invalid" } as const;
        }

        const member = await transaction.affiliateAllianceMember.create({
          data: {
            allianceId: invitation.allianceId,
            userId: input.inviteeUserId,
            role:
              role === "partner"
                ? PrismaAffiliateAllianceMemberRole.PARTNER
                : PrismaAffiliateAllianceMemberRole.SUBORDINATE,
            parentMemberId: invitation.proposedParentMemberId,
            promoterShareBpsOverride: null,
            activeKey: this.activeMembershipKey(input.inviteeUserId)
          },
          select: { id: true, joinedAt: true }
        });
        const permissions = {
          canClaimTasks: false,
          canViewAllianceOverview: false,
          canViewMemberDetails: false,
          canManageOwnSubordinates: false,
          canViewAllianceWallet: false
        };
        await transaction.affiliateAlliancePermission.create({
          data: { memberId: member.id, ...permissions }
        });
        const updated = await transaction.affiliateAllianceInvitation.updateMany({
          where: {
            id: invitation.id,
            status: PrismaAffiliateAllianceInvitationStatus.PENDING,
            version: invitation.version,
            deletedAt: null
          },
          data: {
            status: PrismaAffiliateAllianceInvitationStatus.ACCEPTED,
            pendingKey: null,
            respondedAt: input.now,
            version: { increment: 1 }
          }
        });
        if (updated.count !== 1) throw new AffiliateAllianceInvitationStateRaceError();
        await transaction.auditLog.create({
          data: toAuditLogCreateData({ ...input.auditLog, targetId: invitation.id })
        });

        const acceptedInvitation = this.mapInvitation({
          ...invitation,
          status: PrismaAffiliateAllianceInvitationStatus.ACCEPTED,
          pendingKey: null,
          respondedAt: input.now,
          version: invitation.version + 1
        });
        const memberPayload: AffiliateAllianceMemberPayload = {
          memberId: member.id,
          person: this.mapPerson(invitee),
          role,
          parent: invitation.proposedParentMember
            ? {
                memberId: invitation.proposedParentMember.id,
                person: this.mapPerson(invitation.proposedParentMember.user)
              }
            : null,
          promoterShareBpsOverride: null,
          permissions,
          joinedAt: member.joinedAt.toISOString()
        };
        return { kind: "accepted", invitation: acceptedInvitation, member: memberPayload } as const;
      });
    } catch (error) {
      if (error instanceof AffiliateAllianceInvitationStateRaceError) {
        return { kind: "state_conflict" };
      }
      if (this.isUniqueConflictFor(error, "active_key")) return { kind: "already_joined" };
      throw error;
    }
  }

  public async rejectInvitation(
    input: AffiliateAllianceRespondInvitationInput
  ): Promise<AffiliateAllianceRejectInvitationResult> {
    try {
      return await this.client.$transaction(async (transaction) => {
        const invitation = await this.findScopedInvitation(
          transaction,
          input.invitationId,
          input.inviteeUserId
        );
        if (!invitation) return { kind: "not_found" } as const;
        if (invitation.status !== PrismaAffiliateAllianceInvitationStatus.PENDING) {
          return { kind: "state_conflict" } as const;
        }
        if (invitation.expiresAt.getTime() <= input.now.getTime()) {
          const expired = await this.expirePendingInvitationWithClient(
            transaction,
            invitation,
            input.now,
            input.expiryAuditLog ?? {
              actorId: null,
              action: "affiliate_alliance.invitation_expired",
              targetType: "AffiliateAllianceInvitation",
              targetId: invitation.id,
              metadata: { source: "reject_guard" }
            }
          );
          return { kind: expired ? "expired" : "state_conflict" } as const;
        }
        const updated = await transaction.affiliateAllianceInvitation.updateMany({
          where: {
            id: invitation.id,
            status: PrismaAffiliateAllianceInvitationStatus.PENDING,
            version: invitation.version,
            deletedAt: null
          },
          data: {
            status: PrismaAffiliateAllianceInvitationStatus.REJECTED,
            pendingKey: null,
            respondedAt: input.now,
            version: { increment: 1 }
          }
        });
        if (updated.count !== 1) throw new AffiliateAllianceInvitationStateRaceError();
        await transaction.auditLog.create({
          data: toAuditLogCreateData({ ...input.auditLog, targetId: invitation.id })
        });
        return {
          kind: "rejected",
          invitation: this.mapInvitation({
            ...invitation,
            status: PrismaAffiliateAllianceInvitationStatus.REJECTED,
            pendingKey: null,
            respondedAt: input.now,
            version: invitation.version + 1
          })
        } as const;
      });
    } catch (error) {
      if (error instanceof AffiliateAllianceInvitationStateRaceError) {
        return { kind: "state_conflict" };
      }
      throw error;
    }
  }

  public async listExpiryCandidateInvitationIds(input: {
    now: Date;
    batchSize: number;
    afterInvitationId: number;
  }): Promise<number[]> {
    const records = await this.client.affiliateAllianceInvitation.findMany({
      where: {
        id: { gt: input.afterInvitationId },
        status: PrismaAffiliateAllianceInvitationStatus.PENDING,
        expiresAt: { lte: input.now },
        deletedAt: null
      },
      orderBy: { id: "asc" },
      take: input.batchSize,
      select: { id: true }
    });
    return records.map((record) => record.id);
  }

  public async expireInvitation(input: { invitationId: number; now: Date }): Promise<boolean> {
    return this.client.$transaction(async (transaction) => {
      const invitation = await transaction.affiliateAllianceInvitation.findFirst({
        where: {
          id: input.invitationId,
          status: PrismaAffiliateAllianceInvitationStatus.PENDING,
          expiresAt: { lte: input.now },
          deletedAt: null
        },
        select: invitationSelect
      });
      if (!invitation) return false;
      return this.expirePendingInvitationWithClient(transaction, invitation, input.now, {
        actorId: null,
        action: "affiliate_alliance.invitation_expired",
        targetType: "AffiliateAllianceInvitation",
        targetId: invitation.id,
        metadata: { source: "expiry_worker" }
      });
    });
  }

  private async listInvitations(
    scope: Pick<Prisma.AffiliateAllianceInvitationWhereInput, "allianceId" | "inviteeUserId">,
    input: AffiliateAllianceSentInvitationListInput | AffiliateAllianceReceivedInvitationListInput
  ): Promise<ReturnType<typeof buildPaginatedResponse<AffiliateAllianceInvitationPayload>>> {
    const pagination = toPrismaPagination(input);
    const where: Prisma.AffiliateAllianceInvitationWhereInput = {
      ...scope,
      deletedAt: null,
      ...(input.status
        ? { status: input.status.toUpperCase() as PrismaAffiliateAllianceInvitationStatus }
        : {})
    };
    const [total, records] = await Promise.all([
      this.client.affiliateAllianceInvitation.count({ where }),
      this.client.affiliateAllianceInvitation.findMany({
        where,
        skip: pagination.skip,
        take: pagination.take,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        select: invitationSelect
      })
    ]);
    return buildPaginatedResponse(
      records.map((record) => this.mapInvitation(record)),
      total,
      input
    );
  }

  private findInvitationWithClient(
    client: AlliancePrismaClient,
    invitationId: number
  ): Promise<AllianceInvitationRecord | null> {
    return client.affiliateAllianceInvitation.findFirst({
      where: { id: invitationId, deletedAt: null },
      select: invitationSelect
    });
  }

  private findScopedInvitation(
    client: AlliancePrismaClient,
    invitationId: number,
    inviteeUserId: number
  ): Promise<AllianceInvitationRecord | null> {
    return client.affiliateAllianceInvitation.findFirst({
      where: { id: invitationId, inviteeUserId, deletedAt: null },
      select: invitationSelect
    });
  }

  private findEligibleAffiliateUser(
    client: AlliancePrismaClient,
    needoId: string
  ): Promise<(PublicPersonRecord & { id: number }) | null> {
    return client.user.findFirst({
      where: {
        needoId,
        isActive: true,
        deletedAt: null,
        identities: { some: { type: "scout", isActive: true, deletedAt: null } },
        affiliateProfile: {
          is: { status: PrismaAffiliateProfileStatus.ACTIVE, deletedAt: null }
        }
      },
      select: { id: true, ...publicPersonSelect }
    });
  }

  private findEligibleAffiliateUserById(
    client: AlliancePrismaClient,
    userId: number
  ): Promise<(PublicPersonRecord & { id: number }) | null> {
    return client.user.findFirst({
      where: {
        id: userId,
        isActive: true,
        deletedAt: null,
        identities: { some: { type: "scout", isActive: true, deletedAt: null } },
        affiliateProfile: {
          is: { status: PrismaAffiliateProfileStatus.ACTIVE, deletedAt: null }
        }
      },
      select: { id: true, ...publicPersonSelect }
    });
  }

  private async hasMutualContact(
    client: AlliancePrismaClient,
    inviterUserId: number,
    inviteeUserId: number
  ): Promise<boolean> {
    const [forward, reverse] = await Promise.all([
      client.contact.findFirst({
        where: {
          ownerUserId: inviterUserId,
          contactUserId: inviteeUserId,
          blockedAt: null,
          deletedAt: null
        },
        select: { id: true }
      }),
      client.contact.findFirst({
        where: {
          ownerUserId: inviteeUserId,
          contactUserId: inviterUserId,
          blockedAt: null,
          deletedAt: null
        },
        select: { id: true }
      })
    ]);
    return forward !== null && reverse !== null;
  }

  private async hasActiveMembership(
    client: AlliancePrismaClient,
    userId: number
  ): Promise<boolean> {
    return (
      (await client.affiliateAllianceMember.findFirst({
        where: {
          userId,
          activeKey: this.activeMembershipKey(userId),
          leftAt: null,
          deletedAt: null
        },
        select: { id: true }
      })) !== null
    );
  }

  private async isValidInvitationParent(
    client: AlliancePrismaClient,
    allianceId: number,
    role: "partner" | "subordinate",
    proposedParentMemberId: number | null
  ): Promise<boolean> {
    if (role === "partner") return proposedParentMemberId === null;
    if (proposedParentMemberId === null) return false;
    const parent = await client.affiliateAllianceMember.findFirst({
      where: {
        id: proposedParentMemberId,
        allianceId,
        role: { in: [PrismaAffiliateAllianceMemberRole.OWNER, PrismaAffiliateAllianceMemberRole.PARTNER] },
        activeKey: { not: null },
        leftAt: null,
        deletedAt: null
      },
      select: { id: true }
    });
    return parent !== null;
  }

  private async expirePendingInvitationWithClient(
    client: AlliancePrismaClient,
    invitation: AllianceInvitationRecord,
    now: Date,
    auditLog: AuditLogCreateInput
  ): Promise<boolean> {
    const updated = await client.affiliateAllianceInvitation.updateMany({
      where: {
        id: invitation.id,
        status: PrismaAffiliateAllianceInvitationStatus.PENDING,
        version: invitation.version,
        deletedAt: null
      },
      data: {
        status: PrismaAffiliateAllianceInvitationStatus.EXPIRED,
        pendingKey: null,
        expiredAt: now,
        version: { increment: 1 }
      }
    });
    if (updated.count !== 1) return false;
    await client.auditLog.create({
      data: toAuditLogCreateData({ ...auditLog, targetId: invitation.id })
    });
    return true;
  }

  private mapPerson(record: PublicPersonRecord): AffiliateAlliancePublicPerson {
    return {
      needoId: record.needoId,
      displayName: record.username,
      avatarUrl: record.avatarUrl
    };
  }

  private mapMember(record: AllianceMemberListRecord): AffiliateAllianceMemberPayload {
    if (!record.permission) throw this.dataInvalid();
    return {
      memberId: record.id,
      person: this.mapPerson(record.user),
      role: record.role.toLowerCase() as AffiliateAllianceMemberPayload["role"],
      parent: record.parent
        ? { memberId: record.parent.id, person: this.mapPerson(record.parent.user) }
        : null,
      promoterShareBpsOverride: record.promoterShareBpsOverride,
      permissions: record.permission,
      joinedAt: record.joinedAt.toISOString()
    };
  }

  private mapInvitation(record: AllianceInvitationRecord): AffiliateAllianceInvitationPayload {
    return {
      invitationId: record.id,
      alliance: { allianceId: record.alliance.id, name: record.alliance.name },
      inviter: this.mapPerson(record.inviterMember.user),
      invitee: this.mapPerson(record.invitee),
      role: record.role.toLowerCase() as AffiliateAllianceInvitationPayload["role"],
      proposedParent: record.proposedParentMember
        ? {
            memberId: record.proposedParentMember.id,
            person: this.mapPerson(record.proposedParentMember.user)
          }
        : null,
      status: record.status.toLowerCase() as AffiliateAllianceInvitationPayload["status"],
      expiresAt: record.expiresAt.toISOString(),
      respondedAt: record.respondedAt?.toISOString() ?? null,
      createdAt: record.createdAt.toISOString()
    };
  }

  private invitationRoleToPrisma(
    role: "partner" | "subordinate"
  ): PrismaAffiliateAllianceInvitationRole {
    return role === "partner"
      ? PrismaAffiliateAllianceInvitationRole.PARTNER
      : PrismaAffiliateAllianceInvitationRole.SUBORDINATE;
  }

  private pendingInvitationKey(allianceId: number, inviteeUserId: number): string {
    return `alliance:${allianceId}:invitee:${inviteeUserId}`;
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

  private isUniqueConflictFor(error: unknown, field: string): boolean {
    if (
      typeof error !== "object" ||
      error === null ||
      !("code" in error) ||
      error.code !== "P2002"
    ) {
      return false;
    }
    const meta = "meta" in error ? error.meta : undefined;
    return JSON.stringify(meta ?? "").toLowerCase().includes(field.toLowerCase());
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
