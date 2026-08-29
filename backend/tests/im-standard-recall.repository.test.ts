import { Prisma, type PrismaClient } from "@prisma/client";
import { RealtimeRepository } from "../src/repositories/realtime.repository";

const createdAt = new Date("2026-08-28T00:00:00.000Z");
const recallDeadlineAt = new Date("2026-08-28T00:03:00.000Z");
const recalledAt = new Date("2026-08-28T00:02:00.000Z");

const activeMessage = {
  id: 41,
  conversationId: 3,
  senderUserId: 7,
  type: "TEXT",
  content: "需要重新编辑的内容",
  metadata: { needoMessageType: "text" },
  expiresAt: null,
  expiredAt: null,
  recallDeadlineAt,
  recalledAt: null,
  recallMode: null,
  contentPurgedAt: null,
  privacyPolicyVersionAtSend: null,
  lifecycleVersion: 0,
  createdAt,
  updatedAt: createdAt,
  deletedAt: null,
  reactions: []
};

const recalledMessage = {
  ...activeMessage,
  content: null,
  metadata: null,
  recalledAt,
  recallMode: "STANDARD",
  contentPurgedAt: recalledAt,
  lifecycleVersion: 1,
  updatedAt: recalledAt
};

const createFixture = (candidate: typeof activeMessage | typeof recalledMessage | null = activeMessage) => {
  const messageFindFirst = jest.fn(async () => candidate);
  const messageUpdateMany = jest.fn(async () => ({ count: 1 }));
  const messageFindUnique = jest.fn(async () => recalledMessage);
  const reactionUpdateMany = jest.fn(async () => ({ count: 2 }));
  const syncUpsert = jest.fn(async ({ create }: { create: Record<string, unknown> }) => ({
    id: 91,
    ...create
  }));
  const auditCreate = jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({
    id: 12,
    ...data
  }));
  const conversationUpdate = jest.fn(async () => ({ id: 3 }));
  const transaction = {
    message: {
      findFirst: messageFindFirst,
      updateMany: messageUpdateMany,
      findUnique: messageFindUnique
    },
    messageReaction: { updateMany: reactionUpdateMany },
    imDeletionSync: { upsert: syncUpsert },
    auditLog: { create: auditCreate },
    conversation: { update: conversationUpdate }
  };
  const client = {
    $transaction: async (operation: (tx: typeof transaction) => unknown) => operation(transaction)
  } as unknown as PrismaClient;

  return {
    repository: new RealtimeRepository(client),
    messageFindFirst,
    messageUpdateMany,
    messageFindUnique,
    reactionUpdateMany,
    syncUpsert,
    auditCreate,
    conversationUpdate
  };
};

describe("RealtimeRepository standard recall", () => {
  it("atomically purges content and writes one content-free terminal record", async () => {
    const fixture = createFixture();

    await expect(
      fixture.repository.recallMessage({
        conversationId: 3,
        messageId: 41,
        senderUserId: 7,
        now: recalledAt
      })
    ).resolves.toMatchObject({
      status: "recalled",
      message: {
        id: 41,
        content: null,
        metadata: null,
        recallMode: "standard",
        reactions: [],
        availableRecallModes: []
      }
    });

    expect(fixture.messageUpdateMany).toHaveBeenCalledWith({
      where: {
        id: 41,
        conversationId: 3,
        senderIdentityId: 7,
        senderUserId: 7,
        recalledAt: null,
        recallMode: null,
        deletedAt: null,
        recallDeadlineAt: { gte: recalledAt }
      },
      data: {
        content: null,
        metadata: Prisma.DbNull,
        recalledAt,
        recallMode: "STANDARD",
        contentPurgedAt: recalledAt,
        lifecycleVersion: { increment: 1 }
      }
    });
    expect(fixture.reactionUpdateMany).toHaveBeenCalledWith({
      where: { messageId: 41, deletedAt: null },
      data: { deletedAt: recalledAt }
    });
    expect(fixture.syncUpsert).toHaveBeenCalledTimes(1);
    expect(fixture.syncUpsert).toHaveBeenCalledWith({
      where: { messageId_action: { messageId: 41, action: "STANDARD_RECALL" } },
      create: {
        conversationId: 3,
        messageId: 41,
        action: "STANDARD_RECALL",
        mediaKind: null,
        occurredAt: recalledAt
      },
      update: {}
    });
    expect(fixture.auditCreate).toHaveBeenCalledTimes(1);
    const auditData = fixture.auditCreate.mock.calls[0]?.[0].data;
    expect(auditData).toEqual({
      actorId: 7,
      action: "im.message.standard_recall",
      targetType: "Message",
      targetId: 41,
      ip: null,
      userAgent: null,
      metadata: { conversationId: 3, recallMode: "standard" },
      createdAt: recalledAt
    });
    expect(JSON.stringify(auditData)).not.toMatch(/content|url|storageKey|thumbnail|filename/i);
  });

  it("returns the existing tombstone idempotently without duplicate writes", async () => {
    const fixture = createFixture(recalledMessage);

    await expect(
      fixture.repository.recallMessage({
        conversationId: 3,
        messageId: 41,
        senderUserId: 7,
        now: recalledAt
      })
    ).resolves.toMatchObject({
      status: "already_recalled",
      message: { id: 41, content: null, recallMode: "standard" }
    });
    expect(fixture.messageUpdateMany).not.toHaveBeenCalled();
    expect(fixture.syncUpsert).not.toHaveBeenCalled();
    expect(fixture.auditCreate).not.toHaveBeenCalled();
  });

  it("rejects one millisecond after the deadline without writes", async () => {
    const fixture = createFixture();

    await expect(
      fixture.repository.recallMessage({
        conversationId: 3,
        messageId: 41,
        senderUserId: 7,
        now: new Date(recallDeadlineAt.getTime() + 1)
      })
    ).resolves.toEqual({ status: "window_expired" });
    expect(fixture.messageUpdateMany).not.toHaveBeenCalled();
    expect(fixture.reactionUpdateMany).not.toHaveBeenCalled();
    expect(fixture.syncUpsert).not.toHaveBeenCalled();
    expect(fixture.auditCreate).not.toHaveBeenCalled();
  });

  it("returns not found for a message outside the sender scope", async () => {
    const fixture = createFixture(null);

    await expect(
      fixture.repository.recallMessage({
        conversationId: 3,
        messageId: 41,
        senderUserId: 8,
        now: recalledAt
      })
    ).resolves.toEqual({ status: "not_found" });
    expect(fixture.messageUpdateMany).not.toHaveBeenCalled();
  });
});
