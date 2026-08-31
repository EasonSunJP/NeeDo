import { createHash } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import {
  ImMessageTranslationRepository,
  type ImMessageTranslationCacheEntry
} from "../src/repositories/im-message-translation.repository";

const now = new Date("2026-08-31T12:00:00.000Z");
const createdAt = new Date("2026-08-31T11:00:00.000Z");
const sourceContentHash = createHash("sha256").update("hello", "utf8").digest("hex");
const write: ImMessageTranslationCacheEntry = {
  messageId: 41,
  sourceContentHash,
  sourceLanguage: "EN",
  targetLanguage: "ja",
  translatedContent: "こんにちは",
  providerKey: "deepl",
  providerRequestId: "chunk-1"
};

const activeMessage = {
  id: 41,
  conversationId: 91,
  senderUserId: 52,
  type: "TEXT",
  content: "hello",
  metadata: { needoMessageType: "text" }
};

const createFixture = (
  options: {
    participant?: { createdAt: Date; clearedThroughMessageId: number | null } | null;
    messages?: ReadonlyArray<typeof activeMessage>;
    existingTranslations?: ReadonlyArray<
      ImMessageTranslationCacheEntry & { deletedAt: Date | null }
    >;
  } = {}
) => {
  const participantFindFirst = jest.fn(async () =>
    options.participant === undefined
      ? { createdAt, clearedThroughMessageId: null }
      : options.participant
  );
  const messageFindMany = jest.fn(async () => options.messages ?? [activeMessage]);
  const translationFindMany = jest.fn(async () => options.existingTranslations ?? []);
  const translationCreate = jest.fn(async () => ({ id: 1 }));
  const transaction = {
    conversationParticipant: { findFirst: participantFindFirst },
    message: { findMany: messageFindMany },
    imMessageTranslation: {
      findMany: translationFindMany,
      create: translationCreate
    }
  };
  const transactionCall = jest.fn(async (operation: (tx: typeof transaction) => unknown) =>
    operation(transaction)
  );
  const client = {
    $transaction: transactionCall,
    conversationParticipant: { findFirst: participantFindFirst },
    message: { findMany: messageFindMany }
  } as unknown as PrismaClient;
  return {
    repository: new ImMessageTranslationRepository(client),
    participantFindFirst,
    messageFindMany,
    translationFindMany,
    translationCreate,
    transactionCall
  };
};

const finalize = (repository: ImMessageTranslationRepository) =>
  repository.finalizeTranslations({
    conversationId: 91,
    userId: 41,
    identityId: 71,
    messageIds: [41],
    expectedMessages: [{ messageId: 41, source: "hello", sourceContentHash }],
    requiredCacheKeys: [],
    writes: [write],
    now
  });

describe("ImMessageTranslationRepository final authoritative transaction", () => {
  it("revalidates visibility and exact source before creating all cache rows in one short transaction", async () => {
    const fixture = createFixture();

    await expect(finalize(fixture.repository)).resolves.toBe("committed");

    expect(fixture.transactionCall).toHaveBeenCalledTimes(1);
    expect(fixture.transactionCall).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: "Serializable"
    });
    expect(fixture.participantFindFirst).toHaveBeenCalledWith({
      where: {
        conversationId: 91,
        userId: 41,
        identityId: 71,
        deletedAt: null,
        conversation: { deletedAt: null },
        identity: {
          is: {
            id: 71,
            userId: 41,
            isActive: true,
            deletedAt: null,
            user: { is: { id: 41, isActive: true, deletedAt: null } }
          }
        },
        user: { is: { id: 41, isActive: true, deletedAt: null } }
      },
      select: { createdAt: true, clearedThroughMessageId: true }
    });
    expect(fixture.messageFindMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        id: { in: [41] },
        conversationId: 91,
        createdAt: { gte: createdAt },
        deletedAt: null,
        recalledAt: null,
        contentPurgedAt: null,
        expiredAt: null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        userDeletions: { none: { identityId: 71, deletedAt: null } }
      }),
      select: expect.objectContaining({ content: true, metadata: true })
    });
    expect(fixture.translationCreate).toHaveBeenCalledWith({
      data: { ...write, translatedAt: now }
    });
  });

  it.each([
    ["participant removal", { participant: null }],
    ["identity deactivation", { participant: null }],
    ["identity soft deletion", { participant: null }],
    ["identity reassignment to another user", { participant: null }],
    ["user deactivation", { participant: null }],
    ["user soft deletion", { participant: null }],
    [
      "clear-history cutoff",
      { participant: { createdAt, clearedThroughMessageId: 41 }, messages: [] }
    ],
    ["delete-for-me or recall filtering", { messages: [] }],
    ["exact source change", { messages: [{ ...activeMessage, content: "changed" }] }]
  ] as const)("returns not_found with zero writes after %s", async (_label, options) => {
    const fixture = createFixture(options);

    await expect(finalize(fixture.repository)).resolves.toBe("not_found");
    expect(fixture.translationCreate).not.toHaveBeenCalled();
  });

  it("applies the active user and identity binding to the initial authoritative load", async () => {
    const fixture = createFixture({ participant: null });

    await expect(
      fixture.repository.loadVisibleMessages({
        conversationId: 91,
        userId: 41,
        identityId: 71,
        messageIds: [41],
        now
      })
    ).resolves.toEqual([]);
    expect(fixture.participantFindFirst).toHaveBeenCalledWith({
      where: expect.objectContaining({
        userId: 41,
        identityId: 71,
        identity: {
          is: expect.objectContaining({
            id: 71,
            userId: 41,
            isActive: true,
            deletedAt: null,
            user: { is: { id: 41, isActive: true, deletedAt: null } }
          })
        },
        user: { is: { id: 41, isActive: true, deletedAt: null } }
      }),
      select: { createdAt: true, clearedThroughMessageId: true }
    });
    expect(fixture.messageFindMany).not.toHaveBeenCalled();
  });

  it("does not revive a soft-deleted unique cache reservation", async () => {
    const fixture = createFixture({
      existingTranslations: [{ ...write, deletedAt: new Date("2026-08-31T11:30:00.000Z") }]
    });

    await expect(finalize(fixture.repository)).resolves.toBe("cache_conflict");
    expect(fixture.translationCreate).not.toHaveBeenCalled();
    expect(JSON.stringify(fixture.translationFindMany.mock.calls)).not.toContain(
      '"deletedAt":null'
    );
  });

  it("requires an initially used cache hit to remain active at finalization", async () => {
    const fixture = createFixture({ existingTranslations: [{ ...write, deletedAt: null }] });

    await expect(
      fixture.repository.finalizeTranslations({
        conversationId: 91,
        userId: 41,
        identityId: 71,
        messageIds: [41],
        expectedMessages: [{ messageId: 41, source: "hello", sourceContentHash }],
        requiredCacheKeys: [write],
        writes: [],
        now
      })
    ).resolves.toBe("committed");
    expect(fixture.translationCreate).not.toHaveBeenCalled();
  });
});
