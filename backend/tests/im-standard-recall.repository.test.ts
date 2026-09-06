import { Prisma, type PrismaClient } from "@prisma/client";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
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

const createFixture = (
  candidate: typeof activeMessage | typeof recalledMessage | null = activeMessage
) => {
  const messageFindFirst = jest.fn(async () => candidate);
  const messageUpdateMany = jest.fn(async () => ({ count: 1 }));
  const tracelessMessage = { ...recalledMessage, recallMode: "TRACELESS" as const };
  let persistedMessage: typeof recalledMessage | typeof tracelessMessage = recalledMessage;
  const messageUpdate = jest.fn(async ({ data }: { data: { recallMode: string } }) => {
    persistedMessage = data.recallMode === "TRACELESS" ? tracelessMessage : recalledMessage;
    return persistedMessage;
  });
  const messageFindUnique = jest.fn(async () => persistedMessage);
  const translationDeleteMany = jest.fn(async () => ({ count: 2 }));
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
    conversationParticipant: {
      findFirst: jest.fn(async () => ({ createdAt })),
      updateMany: jest.fn(async () => ({ count: 1 }))
    },
    message: {
      findFirst: messageFindFirst,
      updateMany: messageUpdateMany,
      update: messageUpdate,
      findUnique: messageFindUnique
    },
    imMessageTranslation: { deleteMany: translationDeleteMany },
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
    messageUpdate,
    messageFindUnique,
    translationDeleteMany,
    reactionUpdateMany,
    syncUpsert,
    auditCreate,
    conversationParticipantUpdateMany: transaction.conversationParticipant.updateMany,
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
        mode: "standard",
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
        createdAt: { gte: createdAt },
        recalledAt: null,
        recallMode: null,
        deletedAt: null,
        recallDeadlineAt: { gte: recalledAt }
      },
      data: { lifecycleVersion: { increment: 1 } }
    });
    expect(fixture.translationDeleteMany).toHaveBeenCalledWith({ where: { messageId: 41 } });
    expect(fixture.messageUpdate).toHaveBeenCalledWith({
      where: { id: 41 },
      data: {
        content: null,
        metadata: Prisma.DbNull,
        recalledAt,
        recallMode: "STANDARD",
        contentPurgedAt: recalledAt
      }
    });
    expect(fixture.translationDeleteMany.mock.invocationCallOrder[0]).toBeLessThan(
      fixture.messageUpdate.mock.invocationCallOrder[0] ?? 0
    );
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
        mode: "standard",
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

  it("persists a traceless terminal recall and removes its unread recipient state", async () => {
    const fixture = createFixture();

    await expect(
      fixture.repository.recallMessage({
        conversationId: 3,
        messageId: 41,
        senderUserId: 7,
        mode: "traceless",
        now: recalledAt
      })
    ).resolves.toMatchObject({
      status: "recalled",
      message: { content: null, metadata: null, recallMode: "traceless" }
    });

    expect(fixture.messageUpdate).toHaveBeenCalledWith({
      where: { id: 41 },
      data: expect.objectContaining({ recallMode: "TRACELESS" })
    });
    expect(fixture.syncUpsert).toHaveBeenCalledWith({
      where: { messageId_action: { messageId: 41, action: "TRACELESS_RECALL" } },
      create: expect.objectContaining({ action: "TRACELESS_RECALL" }),
      update: {}
    });
    expect(fixture.auditCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "im.message.traceless_recall",
        metadata: { conversationId: 3, recallMode: "traceless" }
      })
    });
    expect(JSON.stringify(fixture.auditCreate.mock.calls[0]?.[0].data)).not.toMatch(
      /content|url|storageKey|thumbnail|filename/i
    );
    expect(fixture.conversationParticipantUpdateMany).toHaveBeenCalledWith({
      where: {
        conversationId: 3,
        identityId: { not: 7 },
        deletedAt: null,
        unreadCount: { gt: 0 },
        OR: [{ lastReadMessageId: null }, { lastReadMessageId: { lt: 41 } }]
      },
      data: { unreadCount: { decrement: 1 } }
    });
  });

  it("keeps traceless recalls out of shared history and conversation last-message queries", () => {
    const source = readFileSync(resolve(process.cwd(), "src/repositories/realtime.repository.ts"), "utf8");

    expect(source).toContain("recallMode: { not: MessageRecallMode.TRACELESS }");
    expect(source).toContain("...this.availableMessageWhere(new Date())");
    expect(source).not.toContain("recallMode: { not: MessageRecallMode.STANDARD }");
  });

  it("rejects one millisecond after the deadline without writes", async () => {
    const fixture = createFixture();

    await expect(
      fixture.repository.recallMessage({
        conversationId: 3,
        messageId: 41,
        senderUserId: 7,
        mode: "standard",
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
        mode: "standard",
        now: recalledAt
      })
    ).resolves.toEqual({ status: "not_found" });
    expect(fixture.messageUpdateMany).not.toHaveBeenCalled();
  });
});
