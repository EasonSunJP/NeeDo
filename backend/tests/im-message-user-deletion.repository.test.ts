import type { PrismaClient } from "@prisma/client";
import { RealtimeRepository } from "../src/repositories/realtime.repository";

describe("RealtimeRepository identity-only message deletion", () => {
  it("persists an idempotent viewer tombstone without changing the shared message", async () => {
    const participantCreatedAt = new Date("2026-08-30T00:00:00.000Z");
    const participantFindFirst = jest.fn(async () => ({
      createdAt: participantCreatedAt,
      clearedThroughMessageId: null
    }));
    const messageFindMany = jest.fn(async () => [{ id: 41 }]);
    const deletionUpsert = jest.fn(async () => ({ id: 91 }));
    const commandFindUnique = jest.fn(async () => null);
    const commandCreate = jest.fn(async () => ({ id: 92 }));
    const auditCreate = jest.fn(async () => ({ id: 12 }));
    const transaction = {
      conversationParticipant: { findFirst: participantFindFirst },
      message: { findMany: messageFindMany },
      imMessageBatchDeleteCommand: {
        findUnique: commandFindUnique,
        create: commandCreate
      },
      messageUserDeletion: { upsert: deletionUpsert },
      auditLog: { create: auditCreate }
    };
    const client = {
      imMessageBatchDeleteCommand: { findUnique: commandFindUnique },
      $transaction: async (operation: (tx: typeof transaction) => unknown) => operation(transaction)
    } as unknown as PrismaClient;
    const repository = new RealtimeRepository(client);

    await expect(
      repository.deleteMessageForUser({
        conversationId: 3,
        messageId: 41,
        userId: 7,
        identityId: 70
      })
    ).resolves.toEqual({ conversationId: 3, messageId: 41, deleted: true });

    expect(participantFindFirst).toHaveBeenCalledWith({
      where: {
        conversationId: 3,
        identityId: 70,
        deletedAt: null,
        conversation: { deletedAt: null }
      },
      select: { createdAt: true, clearedThroughMessageId: true }
    });

    expect(messageFindMany).toHaveBeenCalledWith({
      where: {
        id: { in: [41] },
        conversationId: 3,
        createdAt: { gte: participantCreatedAt },
        deletedAt: null,
        conversation: {
          deletedAt: null,
          participants: { some: { identityId: 70, deletedAt: null } }
        }
      },
      select: { id: true }
    });
    expect(deletionUpsert).toHaveBeenCalledWith({
      where: { identityId_messageId: { identityId: 70, messageId: 41 } },
      create: { conversationId: 3, messageId: 41, userId: 7, identityId: 70 },
      update: { deletedAt: null }
    });
    expect(auditCreate).toHaveBeenCalledWith({
      data: {
        actorId: 7,
        action: "im.messages.deleted_for_user",
        targetType: "Conversation",
        targetId: 3,
        ip: null,
        userAgent: null,
        metadata: { conversationId: 3, count: 1, messageIds: [41] }
      }
    });
    expect(commandCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        conversationId: 3,
        ownerUserId: 7,
        ownerIdentityId: 70,
        idempotencyKey: expect.any(String),
        requestFingerprint: expect.any(String),
        resultJson: {
          conversationId: 3,
          messageIds: [41],
          count: 1,
          deleted: true
        }
      })
    });
  });

  it("does not persist a tombstone outside the viewer's conversation scope", async () => {
    const participantCreatedAt = new Date("2026-08-30T00:00:00.000Z");
    const deletionUpsert = jest.fn();
    const auditCreate = jest.fn();
    const transaction = {
      conversationParticipant: {
        findFirst: jest.fn(async () => ({
          createdAt: participantCreatedAt,
          clearedThroughMessageId: null
        }))
      },
      message: { findMany: jest.fn(async () => []) },
      imMessageBatchDeleteCommand: {
        findUnique: jest.fn(),
        create: jest.fn()
      },
      messageUserDeletion: { upsert: deletionUpsert },
      auditLog: { create: auditCreate }
    };
    const client = {
      $transaction: async (operation: (tx: typeof transaction) => unknown) => operation(transaction)
    } as unknown as PrismaClient;

    await expect(
      new RealtimeRepository(client).deleteMessageForUser({
        conversationId: 3,
        messageId: 41,
        userId: 8
      })
    ).resolves.toBeNull();
    expect(deletionUpsert).not.toHaveBeenCalled();
    expect(auditCreate).not.toHaveBeenCalled();
  });
});
