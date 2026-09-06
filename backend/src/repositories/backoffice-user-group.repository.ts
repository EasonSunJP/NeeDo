import { buildManagedUserTierWhere } from "./managed-user-tier-filter";
import { randomUUID } from "node:crypto";
import {
  BackofficeUserGroupStatus,
  Prisma,
  type PrismaClient
} from "@prisma/client";
import type {
  BackofficeUserGroupMemberPayload,
  BackofficeUserGroupMembersMutationResult,
  BackofficeUserGroupMutationResult,
  BackofficeUserGroupPayload,
  BackofficeUserGroupRepositoryPort,
  SystemUserGroupCode
} from "../domain/backoffice-user-group";
import { prisma } from "../prisma/client";
import { toAuditLogCreateData } from "./audit-log.repository";
import {
  buildPaginatedResponse,
  toPrismaPagination,
  type PaginatedResponse,
  type PaginationInput
} from "../utils/pagination";

const operationsRoleCodes = ["admin", "operator", "finance", "support", "viewer"];
const memberSelect = Prisma.validator<Prisma.UserSelect>()({
  id: true,
  needoId: true,
  username: true,
  avatarUrl: true,
  email: true
});

const customGroupSelect = Prisma.validator<Prisma.BackofficeUserGroupSelect>()({
  code: true,
  name: true,
  description: true,
  status: true,
  _count: { select: { memberships: { where: { deletedAt: null } } } }
});

export class BackofficeUserGroupRepository implements BackofficeUserGroupRepositoryPort {
  public constructor(private readonly client: PrismaClient = prisma) {}

  public async countCustomGroups(): Promise<number> {
    return this.client.backofficeUserGroup.count({ where: { deletedAt: null } });
  }

  public async listCustomGroups(
    query: PaginationInput & { offset?: number; limit?: number }
  ): Promise<BackofficeUserGroupPayload[]> {
    const pagination = toPrismaPagination(query);
    const groups = await this.client.backofficeUserGroup.findMany({
      where: { deletedAt: null },
      select: customGroupSelect,
      skip: query.offset ?? pagination.skip,
      take: query.limit ?? pagination.take,
      orderBy: [{ status: "asc" }, { name: "asc" }, { id: "asc" }]
    });
    return groups.map((group) => this.mapCustomGroup(group));
  }

  public async countSystemGroupMembers(
    groupCode: SystemUserGroupCode,
    occurredAt: Date
  ): Promise<number> {
    return this.client.user.count({ where: this.systemMemberWhere(groupCode, occurredAt) });
  }

  public async listSystemGroupMembers(
    groupCode: SystemUserGroupCode,
    occurredAt: Date,
    query: PaginationInput
  ): Promise<PaginatedResponse<BackofficeUserGroupMemberPayload>> {
    const pagination = toPrismaPagination(query);
    const where = this.systemMemberWhere(groupCode, occurredAt);
    const [list, total] = await Promise.all([
      this.client.user.findMany({
        where,
        select: memberSelect,
        skip: pagination.skip,
        take: pagination.take,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }]
      }),
      this.client.user.count({ where })
    ]);
    return buildPaginatedResponse(list.map(this.mapMember), total, query);
  }

  public async listCustomGroupMembers(
    groupCode: `custom:${string}`,
    query: PaginationInput
  ): Promise<PaginatedResponse<BackofficeUserGroupMemberPayload> | null> {
    const group = await this.client.backofficeUserGroup.findFirst({
      where: { code: groupCode, deletedAt: null },
      select: { id: true }
    });
    if (!group) return null;
    const pagination = toPrismaPagination(query);
    const where: Prisma.BackofficeUserGroupMembershipWhereInput = {
      groupId: group.id,
      deletedAt: null,
      user: { deletedAt: null }
    };
    const [memberships, total] = await Promise.all([
      this.client.backofficeUserGroupMembership.findMany({
        where,
        select: { user: { select: memberSelect } },
        skip: pagination.skip,
        take: pagination.take,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }]
      }),
      this.client.backofficeUserGroupMembership.count({ where })
    ]);
    return buildPaginatedResponse(
      memberships.map((membership) => this.mapMember(membership.user)),
      total,
      query
    );
  }

  public async createCustomGroupWithAudit(input: {
    actorId: number;
    name: string;
    activeNameKey: string;
    description: string | null;
    audit: Parameters<typeof toAuditLogCreateData>[0];
  }): Promise<BackofficeUserGroupMutationResult> {
    try {
      return await this.client.$transaction(async (transaction) => {
        const publicId = randomUUID();
        const created = await transaction.backofficeUserGroup.create({
          data: {
            publicId,
            code: `custom:${publicId}`,
            name: input.name,
            activeNameKey: input.activeNameKey,
            description: input.description,
            createdById: input.actorId,
            updatedById: input.actorId
          },
          select: { id: true, ...customGroupSelect }
        });
        await transaction.auditLog.create({
          data: toAuditLogCreateData({ ...input.audit, targetId: created.id })
        });
        return { kind: "created" as const, value: this.mapCustomGroup(created) };
      });
    } catch (error) {
      if (this.isUniqueConflict(error)) return { kind: "name_conflict" };
      throw error;
    }
  }

  public async updateCustomGroupWithAudit(input: {
    actorId: number;
    groupCode: `custom:${string}`;
    name: string;
    activeNameKey: string;
    description: string | null;
    audit: Parameters<typeof toAuditLogCreateData>[0];
  }): Promise<BackofficeUserGroupMutationResult> {
    try {
      return await this.client.$transaction(async (transaction) => {
        const current = await transaction.backofficeUserGroup.findFirst({
          where: { code: input.groupCode, deletedAt: null },
          select: { id: true, status: true }
        });
        if (!current) return { kind: "not_found" as const };
        if (current.status !== BackofficeUserGroupStatus.ACTIVE) {
          return { kind: "invalid_state" as const };
        }
        const updated = await transaction.backofficeUserGroup.update({
          where: { id: current.id },
          data: {
            name: input.name,
            activeNameKey: input.activeNameKey,
            description: input.description,
            updatedById: input.actorId
          },
          select: customGroupSelect
        });
        await transaction.auditLog.create({
          data: toAuditLogCreateData({ ...input.audit, targetId: current.id })
        });
        return { kind: "updated" as const, value: this.mapCustomGroup(updated) };
      });
    } catch (error) {
      if (this.isUniqueConflict(error)) return { kind: "name_conflict" };
      throw error;
    }
  }

  public async archiveCustomGroupWithAudit(input: {
    actorId: number;
    groupCode: `custom:${string}`;
    reason: string;
    audit: Parameters<typeof toAuditLogCreateData>[0];
  }): Promise<BackofficeUserGroupMutationResult> {
    return this.client.$transaction(async (transaction) => {
      const current = await transaction.backofficeUserGroup.findFirst({
        where: { code: input.groupCode, deletedAt: null },
        select: { id: true, status: true }
      });
      if (!current) return { kind: "not_found" as const };
      if (current.status !== BackofficeUserGroupStatus.ACTIVE) {
        return { kind: "invalid_state" as const };
      }
      const archivedAt = new Date();
      await transaction.backofficeUserGroup.update({
        where: { id: current.id },
        data: {
          status: BackofficeUserGroupStatus.ARCHIVED,
          activeNameKey: null,
          archivedAt,
          updatedById: input.actorId
        }
      });
      await transaction.backofficeUserGroupMembership.updateMany({
        where: { groupId: current.id, deletedAt: null },
        data: { deletedAt: archivedAt }
      });
      await transaction.auditLog.create({
        data: toAuditLogCreateData({ ...input.audit, targetId: current.id })
      });
      return { kind: "archived" as const };
    });
  }

  public async setCustomGroupMembersWithAudit(input: {
    actorId: number;
    groupCode: `custom:${string}`;
    userIds: string[];
    reason: string;
    audit: Parameters<typeof toAuditLogCreateData>[0];
  }): Promise<BackofficeUserGroupMembersMutationResult> {
    return this.client.$transaction(async (transaction) => {
      const group = await transaction.backofficeUserGroup.findFirst({
        where: { code: input.groupCode, deletedAt: null },
        select: { id: true, publicId: true, status: true }
      });
      if (!group) return { kind: "not_found" as const };
      if (group.status !== BackofficeUserGroupStatus.ACTIVE) {
        return { kind: "invalid_state" as const };
      }

      const users = await transaction.user.findMany({
        where: { needoId: { in: input.userIds }, deletedAt: null },
        select: { id: true, needoId: true }
      });
      if (users.length !== input.userIds.length) return { kind: "user_not_found" as const };

      const existing = await transaction.backofficeUserGroupMembership.findMany({
        where: { groupId: group.id },
        select: { id: true, userId: true, deletedAt: true }
      });
      const existingByUserId = new Map(
        existing.map((membership) => [membership.userId, membership])
      );
      const desiredUserIds = new Set(users.map((user) => user.id));
      let added = 0;
      let unchanged = 0;

      for (const user of users) {
        const membership = existingByUserId.get(user.id);
        if (!membership) {
          await transaction.backofficeUserGroupMembership.create({
            data: { groupId: group.id, userId: user.id, assignedById: input.actorId }
          });
          added += 1;
        } else if (membership.deletedAt) {
          await transaction.backofficeUserGroupMembership.update({
            where: { id: membership.id },
            data: { assignedById: input.actorId, deletedAt: null }
          });
          added += 1;
        } else {
          unchanged += 1;
        }
      }

      const removedIds = existing
        .filter(
          (membership) => membership.deletedAt === null && !desiredUserIds.has(membership.userId)
        )
        .map((membership) => membership.id);
      if (removedIds.length > 0) {
        await transaction.backofficeUserGroupMembership.updateMany({
          where: { id: { in: removedIds }, deletedAt: null },
          data: { deletedAt: new Date() }
        });
      }
      await transaction.auditLog.create({
        data: toAuditLogCreateData({ ...input.audit, targetId: group.id })
      });
      return {
        kind: "updated" as const,
        added,
        removed: removedIds.length,
        unchanged
      };
    });
  }

  private systemMemberWhere(
    groupCode: SystemUserGroupCode,
    occurredAt: Date
  ): Prisma.UserWhereInput {
    const activeBase: Prisma.UserWhereInput = {
      deletedAt: null,
      isActive: true
    };
    if (groupCode === "system:operations") {
      return {
        ...activeBase,
        userRoles: {
          some: {
            deletedAt: null,
            role: { code: { in: operationsRoleCodes }, deletedAt: null }
          }
        }
      };
    }

    const tierCode = groupCode.slice("system:".length) as "free" | "silver" | "gold" | "black_diamond";
    return { ...activeBase, ...buildManagedUserTierWhere(tierCode, occurredAt) };
  }

  private mapCustomGroup(
    group: Prisma.BackofficeUserGroupGetPayload<{ select: typeof customGroupSelect }>
  ): BackofficeUserGroupPayload {
    return {
      code: group.code as `custom:${string}`,
      kind: "custom",
      name: group.name,
      description: group.description,
      status: group.status === BackofficeUserGroupStatus.ACTIVE ? "active" : "archived",
      mutableName: true,
      memberCount: group._count.memberships
    };
  }

  private mapMember(member: {
    id: number;
    needoId: string;
    username: string;
    avatarUrl: string | null;
    email: string;
  }): BackofficeUserGroupMemberPayload {
    return member;
  }

  private isUniqueConflict(error: unknown): boolean {
    return Boolean(error && typeof error === "object" && "code" in error && error.code === "P2002");
  }
}
