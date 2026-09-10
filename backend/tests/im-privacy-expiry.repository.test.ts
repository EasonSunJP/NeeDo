import type { PrismaClient } from "@prisma/client";

import { ImPrivacyExpiryRepository } from "../src/repositories/im-privacy-expiry.repository";

const createdAt = new Date("2026-08-30T06:00:00.000Z");
const expiresAt = new Date("2026-08-30T06:02:00.000Z");

describe("ImPrivacyExpiryRepository", () => {
  it("atomically purges a due privacy message and writes only content-free terminal records", async () => {
    const messageUpdateMany = jest.fn(async () => ({ count: 1 }));
    const messageUpdate = jest.fn(async () => ({ id: 41 }));
    const messageDelete = jest.fn(async () => ({ id: 41 }));
    const translationDeleteMany = jest.fn(async () => ({ count: 2 }));
    const syncCreate = jest.fn(async () => ({ id: 91 }));
    const auditCreate = jest.fn(async () => ({ id: 92 }));
    const transaction = {
      message: {
        updateMany: messageUpdateMany,
        findFirst: jest
          .fn()
          .mockResolvedValueOnce({ id: 40, createdAt })
          .mockResolvedValueOnce({ createdAt }),
        update: messageUpdate,
        delete: messageDelete
      },
      conversationParticipant: {
        findMany: jest.fn(async () => [{ userId: 7 }, { userId: 8 }]),
        updateMany: jest.fn(async () => ({ count: 1 }))
      },
      conversation: {
        findUnique: jest.fn(async () => ({ createdAt })),
        update: jest.fn(async () => ({}))
      },
      messageReaction: { deleteMany: jest.fn(async () => ({ count: 1 })) },
      messageUserDeletion: { deleteMany: jest.fn(async () => ({ count: 0 })) },
      imMessageTranslation: { deleteMany: translationDeleteMany },
      imDeletionSync: { create: syncCreate },
      auditLog: { create: auditCreate }
    };
    const client = {
      $transaction: jest.fn(async (operation: (tx: typeof transaction) => unknown) =>
        operation(transaction)
      )
    } as unknown as PrismaClient;

    await expect(
      new ImPrivacyExpiryRepository(client).expire({
        candidate: {
          id: 41,
          conversationId: 3,
          senderUserId: 7,
          createdAt,
          expiresAt,
          lifecycleVersion: 4,
          privacyPolicyVersionAtSend: 3
        },
        now: expiresAt
      })
    ).resolves.toEqual({
      directiveId: 91,
      conversationId: 3,
      messageId: 41,
      occurredAt: expiresAt,
      participantUserIds: [7, 8]
    });
    expect(messageUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { lifecycleVersion: { increment: 1 } } })
    );
    expect(translationDeleteMany).toHaveBeenCalledWith({ where: { messageId: 41 } });
    expect(messageUpdate).toHaveBeenCalledWith({
      where: { id: 41 },
      data: expect.objectContaining({
        content: null,
        metadata: expect.anything(),
        contentPurgedAt: expiresAt,
        expiredAt: expiresAt
      })
    });
    expect(translationDeleteMany.mock.invocationCallOrder[0]).toBeLessThan(
      messageUpdate.mock.invocationCallOrder[0] ?? 0
    );
    expect(messageUpdate.mock.invocationCallOrder[0]).toBeLessThan(
      messageDelete.mock.invocationCallOrder[0] ?? 0
    );
    expect(messageDelete).toHaveBeenCalledWith({ where: { id: 41 } });
    expect(syncCreate).toHaveBeenCalledWith({
      data: {
        conversationId: 3,
        messageId: 41,
        action: "PRIVACY_EXPIRED",
        mediaKind: null,
        occurredAt: expiresAt
      }
    });
    expect(JSON.stringify(auditCreate.mock.calls)).not.toMatch(
      /content|messageText|metadata.*隐私/i
    );
  });
});
