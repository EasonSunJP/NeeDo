import type { PrismaClient } from "@prisma/client";
import { RealtimeRepository } from "../src/repositories/realtime.repository";

describe("RealtimeRepository friendship conversation boundaries", () => {
  it("refuses a post-delete send before writing a message or unread state", async () => {
    const transaction = {
      conversationParticipant: {
        findFirst: jest.fn().mockResolvedValue({
          id: 77,
          createdAt: new Date("2026-08-30T00:00:00.000Z"),
          conversation: {
            accessPolicy: "FRIENDSHIP_REQUIRED",
            participants: [{ userId: 41 }, { userId: 167 }]
          }
        }),
        updateMany: jest.fn()
      },
      contact: { count: jest.fn().mockResolvedValue(0) },
      imPolicy: { findFirst: jest.fn() },
      message: { create: jest.fn() },
      conversation: { update: jest.fn() }
    };
    const client = {
      $transaction: jest.fn(async (operation: (tx: typeof transaction) => unknown) =>
        operation(transaction)
      )
    } as unknown as PrismaClient;

    await expect(
      new RealtimeRepository(client).createMessage({
        conversationId: 91,
        senderUserId: 167,
        type: "text",
        content: "still there?"
      })
    ).resolves.toEqual({ status: "not_friends" });
    expect(transaction.message.create).not.toHaveBeenCalled();
    expect(transaction.conversation.update).not.toHaveBeenCalled();
    expect(transaction.conversationParticipant.updateMany).not.toHaveBeenCalled();
  });

  it("returns no history without a participant and filters rejoined history by joined time", async () => {
    const rejoinedAt = new Date("2026-08-30T07:00:00.000Z");
    const participantFindFirst = jest
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 88, clearedThroughMessageId: null, createdAt: rejoinedAt });
    const messageFindMany = jest.fn().mockResolvedValue([]);
    const client = {
      conversationParticipant: { findFirst: participantFindFirst },
      message: {
        findMany: messageFindMany,
        count: jest.fn().mockResolvedValue(0)
      }
    } as unknown as PrismaClient;
    const repository = new RealtimeRepository(client);

    await expect(
      repository.listMessages({ conversationId: 91, userId: 41, pageSize: 20 })
    ).resolves.toBeNull();
    await expect(
      repository.listMessages({ conversationId: 91, userId: 41, pageSize: 20 })
    ).resolves.toMatchObject({ list: [], total: 0 });
    expect(messageFindMany.mock.calls[0]?.[0]).toMatchObject({
      where: { conversationId: 91, createdAt: { gte: rejoinedAt } }
    });
  });

  it("refuses direct conversation creation without reciprocal friendship", async () => {
    const conversationFindFirst = jest.fn();
    const conversationCreate = jest.fn();
    const client = {
      contact: { count: jest.fn().mockResolvedValue(0) },
      conversation: { findFirst: conversationFindFirst, create: conversationCreate },
      conversationParticipant: { updateMany: jest.fn() }
    } as unknown as PrismaClient;
    const repository = new RealtimeRepository(client);

    await expect(
      repository.createConversation({
        creatorUserId: 41,
        type: "direct",
        participantUserIds: [167]
      })
    ).resolves.toEqual({ status: "not_friends" });
    expect(conversationFindFirst).not.toHaveBeenCalled();
    expect(conversationCreate).not.toHaveBeenCalled();
  });
});
