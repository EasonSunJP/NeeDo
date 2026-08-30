import type { PrismaClient } from "@prisma/client";
import { RealtimeRepository } from "../src/repositories/realtime.repository";

describe("RealtimeRepository friendship deletion", () => {
  it("hard-deletes both contacts and follows but only the actor's conversation participant", async () => {
    const transaction = {
      $queryRaw: jest.fn().mockResolvedValue([{ id: 31 }]),
      contact: {
        findFirst: jest.fn().mockResolvedValue({
          id: 31,
          contactUserId: 167,
          contactIdentityId: 1670
        }),
        findMany: jest.fn().mockResolvedValue([{ id: 31 }, { id: 32 }]),
        deleteMany: jest.fn().mockResolvedValue({ count: 2 })
      },
      follow: { deleteMany: jest.fn().mockResolvedValue({ count: 2 }) },
      conversation: { findFirst: jest.fn().mockResolvedValue({ id: 91 }) },
      conversationParticipant: { deleteMany: jest.fn().mockResolvedValue({ count: 1 }) },
      auditLog: { create: jest.fn().mockResolvedValue({ id: 12 }) }
    };
    const client = {
      $transaction: jest.fn(async (operation: (tx: typeof transaction) => unknown) =>
        operation(transaction)
      )
    } as unknown as PrismaClient;
    const repository = new RealtimeRepository(client);

    await expect(
      repository.deleteContact({ contactId: 31, ownerUserId: 41, ownerIdentityId: 410 })
    ).resolves.toEqual({
      actorUserId: 41,
      actorIdentityId: 410,
      counterpartUserId: 167,
      counterpartIdentityId: 1670,
      contactIds: [31, 32],
      deletedContactCount: 2,
      deletedFollowCount: 2,
      deletedConversationId: 91,
      deletedAt: expect.any(Date),
      deleted: true
    });

    expect(transaction.contact.deleteMany).toHaveBeenCalledWith({
      where: {
        OR: [
          { ownerIdentityId: 410, contactIdentityId: 1670 },
          { ownerIdentityId: 1670, contactIdentityId: 410 }
        ]
      }
    });
    expect(transaction.follow.deleteMany).toHaveBeenCalledWith({
      where: {
        OR: [
          { followerIdentityId: 410, followingIdentityId: 1670 },
          { followerIdentityId: 1670, followingIdentityId: 410 }
        ]
      }
    });
    expect(transaction.conversationParticipant.deleteMany).toHaveBeenCalledWith({
      where: { conversationId: 91, identityId: 410 }
    });
    expect(transaction.conversationParticipant.deleteMany).not.toHaveBeenCalledWith({
      where: { conversationId: 91, identityId: 1670 }
    });
    expect(transaction.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actorId: 41,
        action: "im.friendship.deleted",
        targetType: "User",
        targetId: 167,
        metadata: {
          actorIdentityId: 410,
          counterpartIdentityId: 1670,
          contactIds: [31, 32],
          conversationId: 91
        }
      })
    });
  });

  it("does not mutate or audit another user's contact", async () => {
    const transaction = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      contact: { findFirst: jest.fn(), findMany: jest.fn(), deleteMany: jest.fn() },
      follow: { deleteMany: jest.fn() },
      conversationParticipant: { deleteMany: jest.fn() },
      auditLog: { create: jest.fn() }
    };
    const client = {
      $transaction: jest.fn(async (operation: (tx: typeof transaction) => unknown) =>
        operation(transaction)
      )
    } as unknown as PrismaClient;
    const repository = new RealtimeRepository(client);

    await expect(
      repository.deleteContact({ contactId: 31, ownerUserId: 99, ownerIdentityId: 990 })
    ).resolves.toBeNull();
    expect(transaction.contact.deleteMany).not.toHaveBeenCalled();
    expect(transaction.follow.deleteMany).not.toHaveBeenCalled();
    expect(transaction.auditLog.create).not.toHaveBeenCalled();
  });
});
