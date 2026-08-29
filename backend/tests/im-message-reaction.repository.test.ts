import type { PrismaClient } from "@prisma/client";

import { RealtimeRepository } from "../src/repositories/realtime.repository";

const createdAt = new Date("2026-08-30T00:00:00.000Z");

type ReactionState = {
  id: number;
  userId: number;
  emoji: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
};

class MessageLock {
  private tail = Promise.resolve();

  public async acquire(): Promise<() => void> {
    const previous = this.tail;
    let release: () => void = () => undefined;
    this.tail = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    return release;
  }
}

function createMessageRecord(reactions: ReactionState[], reactionVersion = 0) {
  return {
    id: 41,
    conversationId: 3,
    senderUserId: 8,
    type: "TEXT",
    content: "并发快捷表情",
    metadata: { needoMessageType: "text" },
    expiresAt: null,
    expiredAt: null,
    recallDeadlineAt: new Date("2026-08-30T00:03:00.000Z"),
    recalledAt: null,
    recallMode: null,
    contentPurgedAt: null,
    privacyPolicyVersionAtSend: null,
    lifecycleVersion: 0,
    reactionVersion,
    createdAt,
    updatedAt: createdAt,
    deletedAt: null,
    reactions: reactions
      .filter((reaction) => reaction.deletedAt === null)
      .sort((left, right) => left.id - right.id)
      .map((reaction) => ({
        id: reaction.id,
        messageId: 41,
        userId: reaction.userId,
        emoji: reaction.emoji,
        createdAt: reaction.createdAt,
        updatedAt: reaction.updatedAt,
        deletedAt: reaction.deletedAt,
        user: {
          id: reaction.userId,
          username: reaction.userId === 7 ? "LifeDance 管理员" : `用户 ${reaction.userId}`,
          avatarUrl: null
        }
      }))
  };
}

function createConcurrentFixture(
  seed: Array<{ userId: number; emoji: string; deletedAt?: Date | null }> = [],
  initialReactionVersion = 0
) {
  const committedReactions: ReactionState[] = seed.map((reaction, index) => ({
    id: index + 1,
    userId: reaction.userId,
    emoji: reaction.emoji,
    createdAt,
    updatedAt: createdAt,
    deletedAt: reaction.deletedAt ?? null
  }));
  let committedReactionVersion = initialReactionVersion;
  let nextReactionId = committedReactions.length + 1;
  let writeSequence = 0;
  const messageLock = new MessageLock();
  const lockCalls: Array<{ messageId: number; conversationId: number; userId: number }> = [];

  const client = {
    $transaction: async (operation: (tx: unknown) => unknown) => {
      let releaseLock: (() => void) | undefined;
      const transaction = {
        $queryRaw: jest.fn(async () => {
          lockCalls.push({ messageId: 41, conversationId: 3, userId: 7 });
          releaseLock = await messageLock.acquire();
          return [{ id: 41 }];
        }),
        message: {
          findUnique: jest.fn(async () =>
            createMessageRecord(committedReactions, committedReactionVersion)
          ),
          update: jest.fn(async () => {
            committedReactionVersion += 1;
            return createMessageRecord(committedReactions, committedReactionVersion);
          })
        },
        messageReaction: {
          findMany: jest.fn(
            async ({ where }: { where: { userId: number; deletedAt: null } }) =>
              committedReactions
                .filter(
                  (reaction) =>
                    reaction.userId === where.userId && reaction.deletedAt === where.deletedAt
                )
                .sort(
                  (left, right) =>
                    right.updatedAt.getTime() - left.updatedAt.getTime() || right.id - left.id
                )
                .map(({ emoji }) => ({ emoji }))
          ),
          upsert: jest.fn(
            async ({ create }: { create: { userId: number; emoji: string } }) => {
              const existing = committedReactions.find(
                (reaction) => reaction.userId === create.userId && reaction.emoji === create.emoji
              );
              writeSequence += 1;
              const updatedAt = new Date(createdAt.getTime() + writeSequence);

              if (existing) {
                existing.deletedAt = null;
                existing.updatedAt = updatedAt;
                return existing;
              }

              const added: ReactionState = {
                id: nextReactionId,
                userId: create.userId,
                emoji: create.emoji,
                createdAt: updatedAt,
                updatedAt,
                deletedAt: null
              };
              nextReactionId += 1;
              committedReactions.push(added);
              return added;
            }
          ),
          updateMany: jest.fn(
            async ({ where, data }: {
              where: { userId: number; emoji: string; deletedAt: null };
              data: { deletedAt: Date };
            }) => {
              const matching = committedReactions.filter(
                (reaction) =>
                  reaction.userId === where.userId &&
                  reaction.emoji === where.emoji &&
                  reaction.deletedAt === where.deletedAt
              );
              matching.forEach((reaction) => {
                reaction.deletedAt = data.deletedAt;
                reaction.updatedAt = data.deletedAt;
              });
              return { count: matching.length };
            }
          )
        }
      };

      try {
        return await operation(transaction);
      } finally {
        releaseLock?.();
      }
    }
  } as unknown as PrismaClient;

  return {
    activeReactions: () => committedReactions.filter((reaction) => reaction.deletedAt === null),
    getReactionVersion: () => committedReactionVersion,
    lockCalls,
    repository: new RealtimeRepository(client)
  };
}

describe("RealtimeRepository message reactions", () => {
  it("allows one judgement and one emoji for the same user", async () => {
    const fixture = createConcurrentFixture();

    const [judgement, emoji] = await Promise.all([
      fixture.repository.setMessageReaction({
        conversationId: 3,
        messageId: 41,
        userId: 7,
        emoji: "OK"
      }),
      fixture.repository.setMessageReaction({
        conversationId: 3,
        messageId: 41,
        userId: 7,
        emoji: "😂"
      })
    ]);

    expect(judgement.status).toBe("updated");
    expect(emoji.status).toBe("updated");
    expect(emoji.status === "updated" ? emoji.message.reactions.map(({ emoji }) => emoji) : []).toEqual([
      "OK",
      "😂"
    ]);
    expect(fixture.getReactionVersion()).toBe(2);
    expect(fixture.lockCalls).toHaveLength(2);
  });

  it("returns slot_occupied for a second different emoji and preserves the first", async () => {
    const fixture = createConcurrentFixture();

    await fixture.repository.setMessageReaction({ conversationId: 3, messageId: 41, userId: 7, emoji: "😂" });
    const blocked = await fixture.repository.setMessageReaction({
      conversationId: 3,
      messageId: 41,
      userId: 7,
      emoji: "👍"
    });

    expect(blocked.status).toBe("slot_occupied");
    expect(blocked.status === "slot_occupied" ? blocked.activeEmoji : undefined).toBe("😂");
    expect(fixture.activeReactions().map(({ emoji }) => emoji)).toEqual(["😂"]);
    expect(fixture.getReactionVersion()).toBe(1);
  });

  it("returns unchanged for the same-value PUT without incrementing reactionVersion", async () => {
    const fixture = createConcurrentFixture();
    const input = { conversationId: 3, messageId: 41, userId: 7, emoji: "OK" };

    await fixture.repository.setMessageReaction(input);
    const repeated = await fixture.repository.setMessageReaction(input);

    expect(repeated.status).toBe("unchanged");
    expect(repeated.status === "unchanged" ? repeated.message.reactionVersion : undefined).toBe(1);
    expect(fixture.getReactionVersion()).toBe(1);
  });

  it("allows a new same-category value after the selected value is removed", async () => {
    const fixture = createConcurrentFixture();

    await fixture.repository.setMessageReaction({ conversationId: 3, messageId: 41, userId: 7, emoji: "OK" });
    const removed = await fixture.repository.removeMessageReaction({ conversationId: 3, messageId: 41, userId: 7, emoji: "OK" });
    const replacement = await fixture.repository.setMessageReaction({ conversationId: 3, messageId: 41, userId: 7, emoji: "NO" });

    expect(removed.status).toBe("updated");
    expect(replacement.status).toBe("updated");
    expect(fixture.activeReactions().map(({ emoji }) => emoji)).toEqual(["NO"]);
    expect(fixture.getReactionVersion()).toBe(3);
  });

  it("lets only one of two concurrent same-category values occupy the slot", async () => {
    const fixture = createConcurrentFixture();

    const outcomes = await Promise.all([
      fixture.repository.setMessageReaction({ conversationId: 3, messageId: 41, userId: 7, emoji: "😂" }),
      fixture.repository.setMessageReaction({ conversationId: 3, messageId: 41, userId: 7, emoji: "👍" })
    ]);

    expect(outcomes.map(({ status }) => status).sort()).toEqual(["slot_occupied", "updated"]);
    expect(fixture.activeReactions()).toHaveLength(1);
    expect(["😂", "👍"]).toContain(fixture.activeReactions()[0]?.emoji);
    expect(fixture.getReactionVersion()).toBe(1);
  });

  it("keeps another user's reaction untouched", async () => {
    const fixture = createConcurrentFixture([{ userId: 8, emoji: "👍" }], 1);

    const outcome = await fixture.repository.setMessageReaction({ conversationId: 3, messageId: 41, userId: 7, emoji: "😂" });

    expect(outcome.status).toBe("updated");
    expect(fixture.activeReactions().map(({ userId, emoji }) => ({ userId, emoji }))).toEqual([
      { userId: 8, emoji: "👍" },
      { userId: 7, emoji: "😂" }
    ]);
  });

  it("returns unchanged when the exact DELETE has no active value", async () => {
    const fixture = createConcurrentFixture();

    const outcome = await fixture.repository.removeMessageReaction({ conversationId: 3, messageId: 41, userId: 7, emoji: "OK" });

    expect(outcome.status).toBe("unchanged");
    expect(fixture.getReactionVersion()).toBe(0);
  });
});
