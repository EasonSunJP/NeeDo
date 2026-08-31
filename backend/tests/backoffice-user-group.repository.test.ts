import type { PrismaClient } from "@prisma/client";
import { BackofficeUserGroupRepository } from "../src/repositories/backoffice-user-group.repository";

describe("BackofficeUserGroupRepository", () => {
  it("paginates custom groups in SQL and counts only active memberships", async () => {
    const client = {
      backofficeUserGroup: {
        findMany: jest.fn(async () => []),
        count: jest.fn(async () => 0)
      }
    };
    const repository = new BackofficeUserGroupRepository(client as unknown as PrismaClient);

    await repository.listCustomGroups({ page: 3, pageSize: 20 });

    expect(client.backofficeUserGroup.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 40,
        take: 20,
        where: { deletedAt: null },
        select: expect.objectContaining({
          _count: {
            select: {
              memberships: { where: { deletedAt: null } }
            }
          }
        })
      })
    );
  });

  it("derives paid members through active entitlement and tier filters at query time", async () => {
    const client = {
      user: {
        findMany: jest.fn(async () => []),
        count: jest.fn(async () => 0)
      }
    };
    const repository = new BackofficeUserGroupRepository(client as unknown as PrismaClient);
    const occurredAt = new Date("2026-09-01T00:00:00Z");

    await repository.listSystemGroupMembers("system:gold", occurredAt, {
      page: 1,
      pageSize: 20
    });

    expect(client.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          platformMembershipEntitlements: {
            some: expect.objectContaining({
              startsAt: { lte: occurredAt },
              tierVersion: expect.objectContaining({
                tier: expect.objectContaining({ code: "GOLD" })
              })
            })
          }
        }),
        skip: 0,
        take: 20
      })
    );
  });

  it("restores soft-deleted memberships without creating duplicate rows", async () => {
    const transaction = {
      backofficeUserGroup: {
        findFirst: jest.fn(async () => ({ id: 4, publicId: "group-1", status: "ACTIVE" }))
      },
      user: {
        findMany: jest.fn(async () => [
          { id: 10, needoId: "u0000000001" },
          { id: 11, needoId: "u0000000002" }
        ])
      },
      backofficeUserGroupMembership: {
        findMany: jest.fn(async () => [
          { id: 50, userId: 10, deletedAt: null },
          { id: 51, userId: 11, deletedAt: new Date("2026-08-01T00:00:00Z") }
        ]),
        update: jest.fn(async () => ({})),
        create: jest.fn(async () => ({})),
        updateMany: jest.fn(async () => ({ count: 0 }))
      },
      auditLog: { create: jest.fn(async () => ({})) }
    };
    const client = {
      $transaction: jest.fn(async (callback: (tx: typeof transaction) => unknown) => callback(transaction))
    };
    const repository = new BackofficeUserGroupRepository(client as unknown as PrismaClient);

    await expect(
      repository.setCustomGroupMembersWithAudit({
        actorId: 7,
        groupCode: "custom:group-1",
        userIds: ["u0000000001", "u0000000002"],
        reason: "cohort refresh",
        audit: {
          actorId: 7,
          action: "backoffice.user_group.members.replace",
          targetType: "BackofficeUserGroup",
          targetId: null,
          ip: null,
          userAgent: null,
          metadata: {}
        }
      })
    ).resolves.toEqual({ kind: "updated", added: 1, removed: 0, unchanged: 1 });

    expect(transaction.backofficeUserGroupMembership.update).toHaveBeenCalledWith({
      where: { id: 51 },
      data: { assignedById: 7, deletedAt: null }
    });
    expect(transaction.backofficeUserGroupMembership.create).not.toHaveBeenCalled();
    expect(transaction.auditLog.create).toHaveBeenCalledTimes(1);
  });
});
