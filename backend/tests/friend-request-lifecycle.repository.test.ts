import type { PrismaClient } from "@prisma/client";
import { RealtimeRepository } from "../src/repositories/realtime.repository";

const dbNow = new Date("2026-08-30T00:00:00.000Z");
const expiresAt = new Date("2026-09-02T00:00:00.000Z");

const requester = {
  id: 41,
  needoId: "u0000000041",
  username: "Requester",
  avatarUrl: "/requester.png"
};

const target = {
  id: 167,
  needoId: "u0000000167",
  username: "Target",
  avatarUrl: "/target.png"
};

const requestRecord = (overrides: Record<string, unknown> = {}) => ({
  id: 19,
  requesterUserId: requester.id,
  targetUserId: target.id,
  requester,
  target,
  status: "PENDING",
  message: null,
  respondedAt: null,
  expiresAt,
  expiredAt: null,
  createdAt: dbNow,
  updatedAt: dbNow,
  deletedAt: null,
  ...overrides
});

const transactionClient = <T>(transaction: T) =>
  ({
    $transaction: jest.fn(async (callback: (database: T) => unknown) => callback(transaction))
  }) as unknown as PrismaClient;

describe("RealtimeRepository friend request lifecycle", () => {
  it("derives expiry from the database clock and returns safe profiles", async () => {
    const created = requestRecord();
    const tx = {
      $queryRaw: jest
        .fn()
        .mockResolvedValueOnce([{ dbNow }])
        .mockResolvedValueOnce([{ id: requester.id }, { id: target.id }]),
      contact: { count: jest.fn().mockResolvedValue(0) },
      friendRequest: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue(created)
      },
      notification: { create: jest.fn().mockResolvedValue({ id: 1 }) },
      auditLog: { create: jest.fn().mockResolvedValue({ id: 2 }), createMany: jest.fn() }
    };

    await expect(
      new RealtimeRepository(transactionClient(tx)).createFriendRequest({
        requesterUserId: requester.id,
        targetUserId: target.id
      })
    ).resolves.toEqual({
      status: "ready",
      result: {
        created: true,
        friendRequest: {
          id: 19,
          requesterUserId: requester.id,
          targetUserId: target.id,
          requester: {
            userId: requester.id,
            needoId: requester.needoId,
            username: requester.username,
            avatarUrl: requester.avatarUrl
          },
          target: {
            userId: target.id,
            needoId: target.needoId,
            username: target.username,
            avatarUrl: target.avatarUrl
          },
          status: "pending",
          message: null,
          respondedAt: null,
          expiresAt,
          expiredAt: null,
          createdAt: dbNow
        }
      }
    });
    expect(tx.friendRequest.create).toHaveBeenCalledWith({
      data: {
        requesterUserId: requester.id,
        targetUserId: target.id,
        message: null,
        expiresAt
      },
      include: expect.any(Object)
    });
    expect(tx.notification.create).toHaveBeenCalledTimes(1);
    expect(tx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actorId: requester.id,
        action: "im.friend_request.created",
        targetId: 19
      })
    });
  });

  it("returns the same unexpired request without writes or a new alert", async () => {
    const original = requestRecord();
    const tx = {
      $queryRaw: jest
        .fn()
        .mockResolvedValueOnce([{ dbNow }])
        .mockResolvedValueOnce([{ id: requester.id }, { id: target.id }]),
      contact: { count: jest.fn().mockResolvedValue(0) },
      friendRequest: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(original),
        create: jest.fn()
      },
      notification: { create: jest.fn() },
      auditLog: { create: jest.fn(), createMany: jest.fn() }
    };

    const outcome = await new RealtimeRepository(transactionClient(tx)).createFriendRequest({
      requesterUserId: requester.id,
      targetUserId: target.id
    });

    expect(outcome).toMatchObject({
      status: "ready",
      result: { created: false, friendRequest: { id: original.id, createdAt: dbNow, expiresAt } }
    });
    expect(tx.friendRequest.create).not.toHaveBeenCalled();
    expect(tx.notification.create).not.toHaveBeenCalled();
    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });

  it("rejects an inactive target before creating a request", async () => {
    const tx = {
      $queryRaw: jest
        .fn()
        .mockResolvedValueOnce([{ dbNow }])
        .mockResolvedValueOnce([{ id: requester.id }]),
      contact: { count: jest.fn() },
      friendRequest: { create: jest.fn() },
      notification: { create: jest.fn() },
      auditLog: { create: jest.fn() }
    };

    await expect(
      new RealtimeRepository(transactionClient(tx)).createFriendRequest({
        requesterUserId: requester.id,
        targetUserId: target.id
      })
    ).resolves.toEqual({ status: "target_unavailable" });
    expect(tx.friendRequest.create).not.toHaveBeenCalled();
  });

  it("accepts atomically with reciprocal contacts and follows", async () => {
    const pending = requestRecord();
    const accepted = requestRecord({ status: "ACCEPTED", respondedAt: dbNow });
    const tx = {
      $queryRaw: jest
        .fn()
        .mockResolvedValueOnce([{ dbNow }])
        .mockResolvedValueOnce([{ id: pending.id }]),
      friendRequest: {
        findFirst: jest.fn().mockResolvedValue(pending),
        update: jest.fn().mockResolvedValue(accepted)
      },
      contact: { upsert: jest.fn().mockResolvedValue({ id: 1 }) },
      follow: { upsert: jest.fn().mockResolvedValue({ id: 1 }) },
      conversation: { findFirst: jest.fn().mockResolvedValue({ id: 91 }) },
      conversationParticipant: {
        findMany: jest.fn().mockResolvedValue([{ userId: target.id }]),
        upsert: jest.fn().mockResolvedValue({ id: 7 })
      },
      auditLog: { create: jest.fn().mockResolvedValue({ id: 3 }) }
    };

    const outcome = await new RealtimeRepository(transactionClient(tx)).respondToFriendRequest({
      id: pending.id,
      actorUserId: target.id,
      action: "accept"
    });

    expect(outcome).toMatchObject({
      status: "responded",
      result: {
        friendRequest: { id: pending.id, status: "accepted" },
        recipientUserIds: [requester.id, target.id]
      }
    });
    expect(tx.contact.upsert).toHaveBeenCalledTimes(2);
    expect(tx.follow.upsert).toHaveBeenCalledTimes(2);
    expect(tx.conversationParticipant.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          conversationId: 91,
          userId: requester.id,
          createdAt: dbNow
        })
      })
    );
  });

  it("marks a due request expired instead of accepting it", async () => {
    const pending = requestRecord({ expiresAt: dbNow });
    const expired = requestRecord({ status: "EXPIRED", expiresAt: dbNow, expiredAt: dbNow });
    const tx = {
      $queryRaw: jest
        .fn()
        .mockResolvedValueOnce([{ dbNow }])
        .mockResolvedValueOnce([{ id: pending.id }]),
      friendRequest: {
        findFirst: jest.fn().mockResolvedValue(pending),
        update: jest.fn().mockResolvedValue(expired)
      },
      contact: { upsert: jest.fn() },
      follow: { upsert: jest.fn() },
      auditLog: { create: jest.fn().mockResolvedValue({ id: 4 }) }
    };

    const outcome = await new RealtimeRepository(transactionClient(tx)).respondToFriendRequest({
      id: pending.id,
      actorUserId: target.id,
      action: "accept"
    });

    expect(outcome).toMatchObject({
      status: "expired",
      friendRequest: { id: pending.id, status: "expired", expiredAt: dbNow }
    });
    expect(tx.contact.upsert).not.toHaveBeenCalled();
    expect(tx.follow.upsert).not.toHaveBeenCalled();
  });

  it("claims due requests with skip-locked database-time batching", async () => {
    const expired = requestRecord({ status: "EXPIRED", expiredAt: dbNow });
    const tx = {
      $queryRaw: jest
        .fn()
        .mockResolvedValueOnce([{ id: expired.id }])
        .mockResolvedValueOnce([{ dbNow }]),
      friendRequest: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findMany: jest.fn().mockResolvedValue([expired])
      },
      auditLog: { createMany: jest.fn().mockResolvedValue({ count: 1 }) }
    };

    await expect(
      new RealtimeRepository(transactionClient(tx)).expireDueFriendRequests({ batchSize: 100 })
    ).resolves.toEqual([
      expect.objectContaining({ id: expired.id, status: "expired", expiredAt: dbNow })
    ]);

    const claimQuery = tx.$queryRaw.mock.calls[0]?.[0] as {
      strings?: readonly string[];
      values?: unknown[];
    };
    const sql = claimQuery.strings?.join(" ") ?? "";
    expect(sql).toContain("CURRENT_TIMESTAMP(3)");
    expect(sql).toContain("FOR UPDATE SKIP LOCKED");
    expect(claimQuery.values).toEqual([100]);
    expect(tx.friendRequest.updateMany).toHaveBeenCalledWith({
      where: {
        id: { in: [expired.id] },
        status: "PENDING",
        expiresAt: { lte: dbNow },
        deletedAt: null
      },
      data: { status: "EXPIRED", expiredAt: dbNow }
    });
    expect(tx.auditLog.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          actorId: null,
          action: "im.friend_request.expired",
          targetId: expired.id,
          metadata: { source: "expiry_worker" }
        })
      ]
    });
  });

  it("returns an incoming pending directory relationship with a safe profile", async () => {
    const pending = requestRecord({ requesterUserId: target.id, targetUserId: requester.id });
    const client = {
      $queryRaw: jest.fn().mockResolvedValue([{ dbNow }]),
      user: { findFirst: jest.fn().mockResolvedValue(target) },
      contact: { findFirst: jest.fn().mockResolvedValue(null) },
      friendRequest: { findFirst: jest.fn().mockResolvedValue(pending) }
    } as unknown as PrismaClient;

    await expect(
      new RealtimeRepository(client).getDirectoryProfile(requester.id, target.id)
    ).resolves.toMatchObject({
      relationship: "incoming_pending",
      contactId: null,
      user: { userId: target.id, needoId: target.needoId },
      friendRequest: { id: pending.id, status: "pending" }
    });
  });

  it("counts only incoming requests that remain unexpired by database time", async () => {
    const friendRequestCount = jest.fn().mockResolvedValue(1);
    const client = {
      $queryRaw: jest.fn().mockResolvedValue([{ dbNow }]),
      conversationParticipant: {
        aggregate: jest.fn().mockResolvedValue({ _sum: { unreadCount: 0 } })
      },
      notification: { count: jest.fn().mockResolvedValue(0) },
      friendRequest: { count: friendRequestCount }
    } as unknown as PrismaClient;

    await expect(new RealtimeRepository(client).getUnreadCounts(target.id)).resolves.toMatchObject({
      friendRequests: 1,
      total: 1
    });
    expect(friendRequestCount).toHaveBeenCalledWith({
      where: {
        targetUserId: target.id,
        status: "PENDING",
        expiresAt: { gt: dbNow },
        deletedAt: null
      }
    });
  });
});
