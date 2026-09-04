import { ConversationAccessPolicy, ConversationType } from "@prisma/client";
import type { PrismaClient } from "@prisma/client";

import { RealtimeRepository } from "../src/repositories/realtime.repository";

const createdAt = new Date("2026-08-30T06:00:00.000Z");

describe("RealtimeRepository group privacy message countdown", () => {
  it("snapshots the active group privacy policy and expiry when the message is created", async () => {
    const messageCreate = jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({
      id: 41,
      conversationId: data.conversationId,
      senderUserId: data.senderUserId,
      type: "TEXT",
      content: data.content,
      metadata: data.metadata ?? null,
      expiresAt: data.expiresAt,
      expiredAt: null,
      recallDeadlineAt: data.recallDeadlineAt,
      recalledAt: null,
      recallMode: null,
      contentPurgedAt: null,
      privacyPolicyVersionAtSend: data.privacyPolicyVersionAtSend,
      lifecycleVersion: data.lifecycleVersion,
      reactionVersion: 0,
      createdAt: data.createdAt,
      updatedAt: data.createdAt,
      deletedAt: null,
      reactions: []
    }));
    const transaction = {
      conversationParticipant: {
        findFirst: jest.fn(async () => ({
          id: 1,
          conversation: {
            type: ConversationType.GROUP,
            accessPolicy: ConversationAccessPolicy.BUSINESS_CONTEXT,
            privacyModeEnabled: true,
            disappearingTtlSeconds: 120,
            disappearingStartMode: "sent",
            privacyPolicyVersion: 4,
            participants: [
              { userId: 7, identityId: 7, identity: { ownedContacts: [] } },
              { userId: 8, identityId: 8, identity: { ownedContacts: [] } }
            ]
          }
        })),
        updateMany: jest.fn(async () => ({ count: 1 }))
      },
      imPolicy: {
        findFirst: jest.fn(async () => ({
          textRetentionSeconds: null,
          recallWindowSeconds: 180,
          version: 7
        }))
      },
      message: { create: messageCreate },
      conversation: { update: jest.fn(async () => ({})) }
    };
    const client = {
      $transaction: async (operation: (tx: typeof transaction) => unknown) => operation(transaction)
    } as unknown as PrismaClient;

    jest.useFakeTimers().setSystemTime(createdAt);
    try {
      const result = await new RealtimeRepository(client).createMessage({
        conversationId: 3,
        senderUserId: 7,
        type: "text",
        content: "隐私倒计时消息"
      });

      expect(messageCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            createdAt,
            expiresAt: new Date("2026-08-30T06:02:00.000Z"),
            privacyPolicyVersionAtSend: 4
          })
        })
      );
      expect(result).toMatchObject({
        status: "created",
        message: {
          expiresAt: new Date("2026-08-30T06:02:00.000Z"),
          privacyPolicyVersionAtSend: 4
        }
      });
    } finally {
      jest.useRealTimers();
    }
  });

  it("excludes expired privacy messages from history before the cleanup worker runs", async () => {
    const findMany = jest.fn(async () => []);
    const count = jest.fn(async () => 0);
    const client = {
      conversationParticipant: {
        findFirst: jest.fn(async () => ({
          id: 1,
          clearedThroughMessageId: null
        }))
      },
      message: { findMany, count }
    } as unknown as PrismaClient;

    await new RealtimeRepository(client).listMessages({
      conversationId: 3,
      userId: 7
    });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          conversationId: 3,
          deletedAt: null,
          expiredAt: null,
          OR: [{ expiresAt: null }, { expiresAt: { gt: expect.any(Date) } }]
        })
      })
    );
  });
});
