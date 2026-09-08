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
const requesterIdentityId = 410;
const targetIdentityId = 1670;

const requestRecord = (overrides: Record<string, unknown> = {}) => ({
  id: 19,
  requesterUserId: requester.id,
  requesterIdentityId,
  targetUserId: target.id,
  targetIdentityId,
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
      userIdentity: { count: jest.fn().mockResolvedValue(2) },
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
        requesterIdentityId,
        targetUserId: target.id,
        targetIdentityId
      })
    ).resolves.toEqual({
      status: "ready",
      result: {
        created: true,
        friendRequest: {
          id: 19,
          requesterUserId: requester.id,
          requesterIdentityId,
          targetUserId: target.id,
          targetIdentityId,
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
        requesterIdentityId,
        targetUserId: target.id,
        targetIdentityId,
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
      userIdentity: { count: jest.fn().mockResolvedValue(2) },
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
      requesterIdentityId,
      targetUserId: target.id,
      targetIdentityId
    });

    expect(outcome).toMatchObject({
      status: "ready",
      result: { created: false, friendRequest: { id: original.id, createdAt: dbNow, expiresAt } }
    });
    expect(tx.friendRequest.create).not.toHaveBeenCalled();
    expect(tx.notification.create).not.toHaveBeenCalled();
    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });

  it("allows a friend request when reciprocal contacts come from a non-friend source", async () => {
    const created = requestRecord();
    const countContacts = jest.fn(async (args: { where?: { source?: string } }) =>
      args.where?.source === "friend_request" ? 0 : 2
    );
    const tx = {
      $queryRaw: jest
        .fn()
        .mockResolvedValueOnce([{ dbNow }])
        .mockResolvedValueOnce([{ id: requester.id }, { id: target.id }]),
      contact: { count: countContacts },
      userIdentity: { count: jest.fn().mockResolvedValue(2) },
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
        requesterIdentityId,
        targetUserId: target.id,
        targetIdentityId
      })
    ).resolves.toMatchObject({
      status: "ready",
      result: { created: true, friendRequest: { id: created.id } }
    });
    expect(countContacts).toHaveBeenCalledWith({
      where: {
        source: "friend_request",
        deletedAt: null,
        OR: [
          { ownerIdentityId: requesterIdentityId, contactIdentityId: targetIdentityId },
          { ownerIdentityId: targetIdentityId, contactIdentityId: requesterIdentityId }
        ]
      }
    });
  });

  it("still blocks a duplicate request for reciprocal friend-request contacts", async () => {
    const countContacts = jest.fn().mockResolvedValue(2);
    const tx = {
      $queryRaw: jest
        .fn()
        .mockResolvedValueOnce([{ dbNow }])
        .mockResolvedValueOnce([{ id: requester.id }, { id: target.id }]),
      contact: { count: countContacts },
      userIdentity: { count: jest.fn().mockResolvedValue(2) },
      friendRequest: { findFirst: jest.fn(), create: jest.fn() },
      notification: { create: jest.fn() },
      auditLog: { create: jest.fn(), createMany: jest.fn() }
    };

    await expect(
      new RealtimeRepository(transactionClient(tx)).createFriendRequest({
        requesterUserId: requester.id,
        requesterIdentityId,
        targetUserId: target.id,
        targetIdentityId
      })
    ).resolves.toEqual({ status: "already_friends" });
    expect(countContacts).toHaveBeenCalledWith({
      where: {
        source: "friend_request",
        deletedAt: null,
        OR: [
          { ownerIdentityId: requesterIdentityId, contactIdentityId: targetIdentityId },
          { ownerIdentityId: targetIdentityId, contactIdentityId: requesterIdentityId }
        ]
      }
    });
    expect(tx.friendRequest.create).not.toHaveBeenCalled();
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
        requesterIdentityId,
        targetUserId: target.id,
        targetIdentityId
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
        findMany: jest.fn().mockResolvedValue([{ identityId: targetIdentityId }]),
        upsert: jest.fn().mockResolvedValue({ id: 7 })
      },
      auditLog: { create: jest.fn().mockResolvedValue({ id: 3 }) }
    };

    const outcome = await new RealtimeRepository(transactionClient(tx)).respondToFriendRequest({
      id: pending.id,
      actorUserId: target.id,
      actorIdentityId: targetIdentityId,
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
          identityId: requesterIdentityId,
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
      actorIdentityId: targetIdentityId,
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
    const pending = requestRecord({
      requesterUserId: target.id,
      requesterIdentityId: targetIdentityId,
      targetUserId: requester.id,
      targetIdentityId: requesterIdentityId
    });
    const publicTarget = {
      ...target,
      identities: [
        {
          type: "customer",
          scopeType: "customer_profile",
          scopeId: 73,
          displayName: "Mia",
          isDefault: true
        }
      ],
      platformMembershipEntitlements: [
        { tierVersion: { tier: { code: "GOLD" } } }
      ],
      customerProfile: {
        id: 73,
        displayName: "Mia",
        bio: "东京生活，预约前请先确认时间。",
        city: "东京",
        membershipLevel: "premium",
        isPublic: true,
        gender: "female",
        age: 25,
        heightCm: { toString: () => "164.00" },
        languages: ["日本語", "中文"],
        visibility: "public",
        deletedAt: null,
        reviewSummary: {
          ratingAverage: { toString: () => "5.00" },
          reviewCount: 28,
          deletedAt: null
        }
      },
      technicianProfile: null,
      membershipAdjustments: []
    };
    const client = {
      $queryRaw: jest.fn().mockResolvedValue([{ dbNow }]),
      user: { findFirst: jest.fn().mockResolvedValue(publicTarget) },
      contact: { findFirst: jest.fn().mockResolvedValue(null) },
      friendRequest: { findFirst: jest.fn().mockResolvedValue(pending) }
    } as unknown as PrismaClient;

    await expect(
      new RealtimeRepository(client).getDirectoryProfile(
        requester.id,
        requesterIdentityId,
        target.id,
        targetIdentityId
      )
    ).resolves.toMatchObject({
      relationship: "incoming_pending",
      contactId: null,
      user: { userId: target.id, needoId: target.needoId },
      friendRequest: { id: pending.id, status: "pending" },
      identityCard: {
        entityType: "user",
        profileId: 73,
        displayName: "Mia",
        identityLabel: "gold",
        verified: false,
        creditValue: "5.00",
        creditReviewCount: 28,
        gender: "female",
        age: 25,
        heightCm: "164.00",
        languages: ["日本語", "中文"],
        city: "东京",
        serviceArea: null,
        yearsExperience: null,
        bio: "东京生活，预约前请先确认时间。"
      }
    });
  });

  it("returns a self profile for the active identity without reading relationship rows", async () => {
    const selfUser = {
      ...requester,
      identities: [
        {
          id: 411,
          type: "customer",
          scopeType: "customer_profile",
          scopeId: 141,
          displayName: "Requester Customer",
          isDefault: true
        },
        {
          id: requesterIdentityId,
          type: "technician",
          scopeType: "technician_profile",
          scopeId: 741,
          displayName: "Requester Technician",
          isDefault: false
        }
      ],
      customerProfile: null,
      technicianProfile: {
        id: 741,
        displayName: "Requester Technician",
        bio: "本人技师资料",
        city: "东京",
        serviceArea: "新宿区",
        yearsExperience: 4,
        employmentType: "INDEPENDENT",
        status: "published",
        verifiedAt: dbNow,
        deletedAt: null,
        reviewSummary: null
      }
    };
    const contactFindFirst = jest.fn();
    const friendRequestFindFirst = jest.fn();
    const client = {
      $queryRaw: jest.fn().mockResolvedValue([{ dbNow }]),
      user: { findFirst: jest.fn().mockResolvedValue(selfUser) },
      contact: { findFirst: contactFindFirst },
      friendRequest: { findFirst: friendRequestFindFirst }
    } as unknown as PrismaClient;

    await expect(
      new RealtimeRepository(client).getDirectoryProfile(
        requester.id,
        requesterIdentityId,
        requester.id,
        requesterIdentityId
      )
    ).resolves.toMatchObject({
      relationship: "self",
      contactId: null,
      friendRequest: null,
      identityCard: {
        entityType: "technician",
        profileId: 741,
        displayName: "Requester Technician"
      }
    });
    expect(contactFindFirst).not.toHaveBeenCalled();
    expect(friendRequestFindFirst).not.toHaveBeenCalled();
  });

  it("keeps an incoming pending request actionable when only the viewer has a one-way contact", async () => {
    const pending = requestRecord({
      requesterUserId: target.id,
      requesterIdentityId: targetIdentityId,
      targetUserId: requester.id,
      targetIdentityId: requesterIdentityId
    });
    const publicTarget = {
      ...target,
      identities: [],
      customerProfile: null,
      technicianProfile: null
    };
    const findContact = jest.fn().mockResolvedValueOnce({ id: 91 }).mockResolvedValueOnce(null);
    const client = {
      $queryRaw: jest.fn().mockResolvedValue([{ dbNow }]),
      user: { findFirst: jest.fn().mockResolvedValue(publicTarget) },
      contact: { findFirst: findContact },
      friendRequest: { findFirst: jest.fn().mockResolvedValue(pending) }
    } as unknown as PrismaClient;

    await expect(
      new RealtimeRepository(client).getDirectoryProfile(
        requester.id,
        requesterIdentityId,
        target.id,
        targetIdentityId
      )
    ).resolves.toMatchObject({
      relationship: "incoming_pending",
      contactId: null,
      friendRequest: { id: pending.id, status: "pending" }
    });
    expect(findContact).toHaveBeenNthCalledWith(2, {
      where: {
        ownerIdentityId: targetIdentityId,
        contactIdentityId: requesterIdentityId,
        source: "friend_request",
        deletedAt: null,
        blockedAt: null
      },
      select: { id: true }
    });
  });

  it.each([
    "lifedance_admin2_seed",
    "lifedance_customer_service_seed",
    "manual",
    "technician_application"
  ])(
    "keeps an incoming request actionable across reciprocal %s contacts",
    async (contactSource) => {
      const pending = requestRecord({
        requesterUserId: target.id,
        requesterIdentityId: targetIdentityId,
        targetUserId: requester.id,
        targetIdentityId: requesterIdentityId
      });
      const businessContact = (id: number) => ({ id, source: contactSource });
      const findContact = jest.fn(
        async (args: { where?: { source?: string; ownerIdentityId?: number } }) => {
          if (args.where?.source === "friend_request") {
            return null;
          }
          return businessContact(args.where?.ownerIdentityId === requesterIdentityId ? 91 : 92);
        }
      );
      const client = {
        $queryRaw: jest.fn().mockResolvedValue([{ dbNow }]),
        user: {
          findFirst: jest.fn().mockResolvedValue({
            ...target,
            identities: [],
            customerProfile: null,
            technicianProfile: null
          })
        },
        contact: { findFirst: findContact },
        friendRequest: { findFirst: jest.fn().mockResolvedValue(pending) }
      } as unknown as PrismaClient;

      await expect(
        new RealtimeRepository(client).getDirectoryProfile(
          requester.id,
          requesterIdentityId,
          target.id,
          targetIdentityId
        )
      ).resolves.toMatchObject({
        relationship: "incoming_pending",
        contactId: null,
        friendRequest: { id: pending.id, status: "pending" }
      });
      expect(findContact).toHaveBeenNthCalledWith(1, {
        where: {
          ownerIdentityId: requesterIdentityId,
          contactIdentityId: targetIdentityId,
          deletedAt: null,
          blockedAt: null
        },
        select: { id: true }
      });
      expect(findContact).toHaveBeenNthCalledWith(2, {
        where: {
          ownerIdentityId: targetIdentityId,
          contactIdentityId: requesterIdentityId,
          source: "friend_request",
          deletedAt: null,
          blockedAt: null
        },
        select: { id: true }
      });
    }
  );

  it("recognizes reciprocal friend-request contacts as a friendship", async () => {
    const findContact = jest
      .fn()
      .mockResolvedValueOnce({ id: 91 })
      .mockResolvedValueOnce({ id: 92 });
    const friendRequestFindFirst = jest.fn();
    const client = {
      $queryRaw: jest.fn().mockResolvedValue([{ dbNow }]),
      user: {
        findFirst: jest.fn().mockResolvedValue({
          ...target,
          identities: [],
          customerProfile: null,
          technicianProfile: null
        })
      },
      contact: { findFirst: findContact },
      friendRequest: { findFirst: friendRequestFindFirst }
    } as unknown as PrismaClient;

    await expect(
      new RealtimeRepository(client).getDirectoryProfile(
        requester.id,
        requesterIdentityId,
        target.id,
        targetIdentityId
      )
    ).resolves.toMatchObject({ relationship: "friend", contactId: 91 });
    expect(findContact).toHaveBeenNthCalledWith(1, {
      where: {
        ownerIdentityId: requesterIdentityId,
        contactIdentityId: targetIdentityId,
        deletedAt: null,
        blockedAt: null
      },
      select: { id: true }
    });
    expect(findContact).toHaveBeenNthCalledWith(2, {
      where: {
        ownerIdentityId: targetIdentityId,
        contactIdentityId: requesterIdentityId,
        source: "friend_request",
        deletedAt: null,
        blockedAt: null
      },
      select: { id: true }
    });
    expect(friendRequestFindFirst).not.toHaveBeenCalled();
  });

  it("does not expose private customer profile fields in a directory identity card", async () => {
    const privateTarget = {
      ...target,
      identities: [
        {
          type: "customer",
          scopeType: "customer_profile",
          scopeId: 73,
          displayName: "Mia",
          isDefault: true
        }
      ],
      customerProfile: {
        id: 73,
        displayName: "Mia",
        bio: "private bio",
        city: "东京",
        membershipLevel: "premium",
        isPublic: false,
        gender: "female",
        age: 25,
        heightCm: { toString: () => "164.00" },
        languages: ["日本語", "中文"],
        visibility: "private",
        deletedAt: null,
        reviewSummary: null
      },
      technicianProfile: null
    };
    const client = {
      $queryRaw: jest.fn().mockResolvedValue([{ dbNow }]),
      user: { findFirst: jest.fn().mockResolvedValue(privateTarget) },
      contact: { findFirst: jest.fn().mockResolvedValue({ id: 91 }) },
      friendRequest: { findFirst: jest.fn() }
    } as unknown as PrismaClient;

    await expect(
      new RealtimeRepository(client).getDirectoryProfile(
        requester.id,
        requesterIdentityId,
        target.id,
        targetIdentityId
      )
    ).resolves.toMatchObject({
      relationship: "friend",
      identityCard: {
        entityType: "account",
        profileId: null,
        displayName: target.username,
        creditValue: null,
        creditReviewCount: 0,
        gender: null,
        age: null,
        heightCm: null,
        languages: [],
        city: null,
        bio: null
      }
    });
  });

  it("maps a published technician identity to its formal profile and credit summary", async () => {
    const technicianTarget = {
      ...target,
      identities: [
        {
          type: "technician",
          scopeType: "technician_profile",
          scopeId: 88,
          displayName: "Mia 技师",
          isDefault: true
        }
      ],
      customerProfile: null,
      technicianProfile: {
        id: 88,
        displayName: "Mia 技师",
        bio: "擅长整体护理。",
        city: "东京",
        serviceArea: "涩谷区、港区",
        yearsExperience: 7,
        languages: ["日本語"],
        visibility: "public",
        employmentType: "INDEPENDENT",
        status: "published",
        verifiedAt: dbNow,
        deletedAt: null,
        reviewSummary: {
          ratingAverage: { toString: () => "4.90" },
          reviewCount: 42,
          deletedAt: null
        }
      }
    };
    const client = {
      $queryRaw: jest.fn().mockResolvedValue([{ dbNow }]),
      user: { findFirst: jest.fn().mockResolvedValue(technicianTarget) },
      contact: { findFirst: jest.fn().mockResolvedValue({ id: 92 }) },
      friendRequest: { findFirst: jest.fn() },
      technicianProfile: { findFirst: jest.fn().mockResolvedValue(null) }
    } as unknown as PrismaClient;

    await expect(
      new RealtimeRepository(client).getDirectoryProfile(
        requester.id,
        requesterIdentityId,
        target.id,
        targetIdentityId
      )
    ).resolves.toMatchObject({
      identityCard: {
        entityType: "technician",
        profileId: 88,
        displayName: "Mia 技师",
        verified: true,
        creditValue: "4.90",
        creditReviewCount: 42,
        languages: ["日本語"],
        city: "东京",
        serviceArea: "涩谷区、港区",
        yearsExperience: 7,
        bio: "擅长整体护理。"
      }
    });
    expect(client.user.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({
          technicianProfile: {
            select: expect.objectContaining({ languages: true, visibility: true })
          }
        })
      })
    );
  });

  it("does not expose languages from a private technician identity card", async () => {
    const privateTechnicianTarget = {
      ...target,
      identities: [
        {
          id: targetIdentityId,
          type: "technician",
          scopeType: "technician_profile",
          scopeId: 88,
          displayName: "Mia 技师",
          isDefault: true
        }
      ],
      customerProfile: null,
      technicianProfile: {
        id: 88,
        displayName: "Mia 技师",
        bio: "private technician bio",
        city: "东京",
        serviceArea: "涩谷区、港区",
        yearsExperience: 7,
        languages: ["日本語"],
        visibility: "private",
        employmentType: "INDEPENDENT",
        status: "published",
        verifiedAt: dbNow,
        deletedAt: null,
        reviewSummary: null
      }
    };
    const client = {
      $queryRaw: jest.fn().mockResolvedValue([{ dbNow }]),
      user: { findFirst: jest.fn().mockResolvedValue(privateTechnicianTarget) },
      contact: { findFirst: jest.fn().mockResolvedValue(null) },
      friendRequest: { findFirst: jest.fn().mockResolvedValue(null) }
    } as unknown as PrismaClient;

    const profile = await new RealtimeRepository(client).getDirectoryProfile(
      requester.id,
      requesterIdentityId,
      target.id,
      targetIdentityId
    );

    expect(profile?.identityCard).toMatchObject({
      entityType: "technician",
      profileId: 88,
      languages: []
    });
  });

  it("uses an eligible technician language list when a public customer list is empty", async () => {
    const publicCustomerWithTechnicianLanguages = {
      ...target,
      identities: [
        {
          id: targetIdentityId,
          type: "customer",
          scopeType: "customer_profile",
          scopeId: 73,
          displayName: "Mia",
          isDefault: true
        }
      ],
      customerProfile: {
        id: 73,
        displayName: "Mia",
        bio: "公开资料",
        city: "东京",
        membershipLevel: "premium",
        isPublic: true,
        gender: "private",
        age: null,
        heightCm: null,
        languages: null,
        visibility: "public",
        deletedAt: null,
        reviewSummary: null
      },
      technicianProfile: {
        id: 88,
        displayName: "Mia 技师",
        bio: null,
        city: "东京",
        serviceArea: null,
        baseLatitude: { toString: () => "35.6762000" },
        baseLongitude: { toString: () => "139.6503000" },
        yearsExperience: 7,
        languages: ["日本語"],
        visibility: "public",
        employmentType: "INDEPENDENT",
        status: "published",
        verifiedAt: null,
        deletedAt: null,
        reviewSummary: null
      }
    };
    const client = {
      $queryRaw: jest.fn().mockResolvedValue([{ dbNow }]),
      user: { findFirst: jest.fn().mockResolvedValue(publicCustomerWithTechnicianLanguages) },
      contact: { findFirst: jest.fn().mockResolvedValue(null) },
      friendRequest: { findFirst: jest.fn().mockResolvedValue(null) }
    } as unknown as PrismaClient;

    await expect(
      new RealtimeRepository(client).getDirectoryProfile(
        requester.id,
        requesterIdentityId,
        target.id,
        targetIdentityId
      )
    ).resolves.toMatchObject({
      identityCard: { entityType: "user", languages: ["日本語"] }
    });
  });

  it("keeps public customer languages ahead of eligible technician languages", async () => {
    const publicCustomerWithOwnLanguages = {
      ...target,
      identities: [
        {
          id: targetIdentityId,
          type: "customer",
          scopeType: "customer_profile",
          scopeId: 73,
          displayName: "Mia",
          isDefault: true
        }
      ],
      customerProfile: {
        id: 73,
        displayName: "Mia",
        bio: "公开资料",
        city: "东京",
        membershipLevel: "premium",
        isPublic: true,
        gender: "private",
        age: null,
        heightCm: null,
        languages: ["中文"],
        visibility: "public",
        deletedAt: null,
        reviewSummary: null
      },
      technicianProfile: {
        id: 88,
        displayName: "Mia 技师",
        bio: null,
        city: "东京",
        serviceArea: null,
        yearsExperience: 7,
        languages: ["日本語"],
        visibility: "public",
        employmentType: "INDEPENDENT",
        status: "published",
        verifiedAt: null,
        deletedAt: null,
        reviewSummary: null
      }
    };
    const client = {
      $queryRaw: jest.fn().mockResolvedValue([{ dbNow }]),
      user: { findFirst: jest.fn().mockResolvedValue(publicCustomerWithOwnLanguages) },
      contact: { findFirst: jest.fn().mockResolvedValue(null) },
      friendRequest: { findFirst: jest.fn().mockResolvedValue(null) }
    } as unknown as PrismaClient;

    const profile = await new RealtimeRepository(client).getDirectoryProfile(
      requester.id,
      requesterIdentityId,
      target.id,
      targetIdentityId
    );

    expect(profile?.identityCard.languages).toEqual(["中文"]);
    expect(profile?.identityCard).not.toHaveProperty("baseLatitude");
    expect(profile?.identityCard).not.toHaveProperty("baseLongitude");
    expect(profile?.identityCard).not.toHaveProperty("serviceBase");
  });

  it("does not fall back to private technician languages for a public customer", async () => {
    const publicCustomerWithPrivateTechnician = {
      ...target,
      identities: [
        {
          id: targetIdentityId,
          type: "customer",
          scopeType: "customer_profile",
          scopeId: 73,
          displayName: "Mia",
          isDefault: true
        }
      ],
      customerProfile: {
        id: 73,
        displayName: "Mia",
        bio: "公开资料",
        city: "东京",
        membershipLevel: "premium",
        isPublic: true,
        gender: "private",
        age: null,
        heightCm: null,
        languages: null,
        visibility: "public",
        deletedAt: null,
        reviewSummary: null
      },
      technicianProfile: {
        id: 88,
        displayName: "Mia 技师",
        bio: null,
        city: "东京",
        serviceArea: null,
        yearsExperience: 7,
        languages: ["日本語"],
        visibility: "private",
        employmentType: "INDEPENDENT",
        status: "published",
        verifiedAt: null,
        deletedAt: null,
        reviewSummary: null
      }
    };
    const client = {
      $queryRaw: jest.fn().mockResolvedValue([{ dbNow }]),
      user: { findFirst: jest.fn().mockResolvedValue(publicCustomerWithPrivateTechnician) },
      contact: { findFirst: jest.fn().mockResolvedValue(null) },
      friendRequest: { findFirst: jest.fn().mockResolvedValue(null) }
    } as unknown as PrismaClient;

    const profile = await new RealtimeRepository(client).getDirectoryProfile(
      requester.id,
      requesterIdentityId,
      target.id,
      targetIdentityId
    );

    expect(profile?.identityCard).toMatchObject({ entityType: "user", languages: [] });
  });

  it("does not expose technician languages through a private customer card", async () => {
    const privateCustomer = {
      ...target,
      identities: [
        {
          id: targetIdentityId,
          type: "customer",
          scopeType: "customer_profile",
          scopeId: 73,
          displayName: "Mia",
          isDefault: true
        }
      ],
      customerProfile: {
        id: 73,
        displayName: "Mia",
        bio: "private bio",
        city: "东京",
        membershipLevel: "premium",
        isPublic: false,
        gender: "private",
        age: null,
        heightCm: null,
        languages: null,
        visibility: "private",
        deletedAt: null,
        reviewSummary: null
      },
      technicianProfile: {
        id: 88,
        displayName: "Mia 技师",
        bio: null,
        city: "东京",
        serviceArea: null,
        yearsExperience: 7,
        languages: ["日本語"],
        visibility: "public",
        employmentType: "INDEPENDENT",
        status: "published",
        verifiedAt: null,
        deletedAt: null,
        reviewSummary: null
      }
    };
    const client = {
      $queryRaw: jest.fn().mockResolvedValue([{ dbNow }]),
      user: { findFirst: jest.fn().mockResolvedValue(privateCustomer) },
      contact: { findFirst: jest.fn().mockResolvedValue(null) },
      friendRequest: { findFirst: jest.fn().mockResolvedValue(null) }
    } as unknown as PrismaClient;

    await expect(
      new RealtimeRepository(client).getDirectoryProfile(
        requester.id,
        requesterIdentityId,
        target.id,
        targetIdentityId
      )
    ).resolves.toMatchObject({
      identityCard: { entityType: "account", languages: [] }
    });
  });

  it.each([
    { status: "draft", deletedAt: null },
    { status: "published", deletedAt: dbNow }
  ])(
    "does not expose languages from an ineligible technician profile (%o)",
    async ({ status, deletedAt }) => {
      const publicCustomer = {
        ...target,
        identities: [
          {
            id: targetIdentityId,
            type: "customer",
            scopeType: "customer_profile",
            scopeId: 73,
            displayName: "Mia",
            isDefault: true
          }
        ],
        customerProfile: {
          id: 73,
          displayName: "Mia",
          bio: "公开资料",
          city: "东京",
          membershipLevel: "premium",
          isPublic: true,
          gender: "private",
          age: null,
          heightCm: null,
          languages: null,
          visibility: "public",
          deletedAt: null,
          reviewSummary: null
        },
        technicianProfile: {
          id: 88,
          displayName: "Mia 技师",
          bio: null,
          city: "东京",
          serviceArea: null,
          yearsExperience: 7,
          languages: ["日本語"],
          visibility: "public",
          employmentType: "INDEPENDENT",
          status,
          verifiedAt: null,
          deletedAt,
          reviewSummary: null
        }
      };
      const client = {
        $queryRaw: jest.fn().mockResolvedValue([{ dbNow }]),
        user: { findFirst: jest.fn().mockResolvedValue(publicCustomer) },
        contact: { findFirst: jest.fn().mockResolvedValue(null) },
        friendRequest: { findFirst: jest.fn().mockResolvedValue(null) }
      } as unknown as PrismaClient;

      await expect(
        new RealtimeRepository(client).getDirectoryProfile(
          requester.id,
          requesterIdentityId,
          target.id,
          targetIdentityId
        )
      ).resolves.toMatchObject({
        identityCard: { entityType: "user", languages: [] }
      });
    }
  );

  it("maps a merchant shop identity without exposing account-only metrics", async () => {
    const merchantTarget = {
      ...target,
      identities: [
        {
          type: "merchant_owner",
          scopeType: "shop",
          scopeId: 55,
          displayName: "NeeDo 银座店",
          isDefault: true
        }
      ],
      customerProfile: null,
      technicianProfile: null
    };
    const client = {
      $queryRaw: jest.fn().mockResolvedValue([{ dbNow }]),
      user: { findFirst: jest.fn().mockResolvedValue(merchantTarget) },
      shop: {
        findFirst: jest.fn().mockResolvedValue({
          id: 55,
          name: "NeeDo 银座店",
          description: "预约制护理门店。",
          city: "东京",
          address: "中央区银座 1-1",
          reviewSummary: {
            ratingAverage: { toString: () => "4.75" },
            reviewCount: 81,
            deletedAt: null
          }
        })
      },
      contact: { findFirst: jest.fn().mockResolvedValue({ id: 93 }) },
      friendRequest: { findFirst: jest.fn() }
    } as unknown as PrismaClient;

    await expect(
      new RealtimeRepository(client).getDirectoryProfile(
        requester.id,
        requesterIdentityId,
        target.id,
        targetIdentityId
      )
    ).resolves.toMatchObject({
      identityCard: {
        entityType: "shop",
        profileId: 55,
        displayName: "NeeDo 银座店",
        creditValue: "4.75",
        creditReviewCount: 81,
        city: "东京",
        serviceArea: "中央区银座 1-1",
        bio: "预约制护理门店。"
      }
    });
    expect(client.shop.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 55, status: "published", deletedAt: null }
      })
    );
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

    await expect(
      new RealtimeRepository(client).getUnreadCounts(targetIdentityId)
    ).resolves.toMatchObject({
      friendRequests: 1,
      total: 1
    });
    expect(friendRequestCount).toHaveBeenCalledWith({
      where: {
        targetIdentityId,
        status: "PENDING",
        expiresAt: { gt: dbNow },
        deletedAt: null
      }
    });
  });
});
