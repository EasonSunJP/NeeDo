import type { PrismaClient } from "@prisma/client";
import { RealtimeRepository } from "../src/repositories/realtime.repository";

const createdAt = new Date("2026-08-30T00:00:00.000Z");

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

function createMessageRecord(emojis: string[], reactionVersion = 0) {
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
    reactions: emojis.map((emoji, index) => ({
      id: index + 1,
      messageId: 41,
      userId: 7,
      emoji,
      createdAt,
      updatedAt: createdAt,
      deletedAt: null,
      user: {
        id: 7,
        username: "LifeDance 管理员",
        avatarUrl: null
      }
    }))
  };
}

function createConcurrentFixture() {
  const committedReactions = new Set<string>();
  let committedReactionVersion = 0;
  const messageLock = new MessageLock();
  const lockCalls: Array<{ messageId: number; conversationId: number; userId: number }> = [];

  const client = {
    $transaction: async (operation: (tx: unknown) => unknown) => {
      const ownWrites = new Set<string>();
      let nextReactionVersion: number | undefined;
      let snapshot: string[] | undefined;
      let releaseLock: (() => void) | undefined;
      const readSnapshot = () => {
        snapshot ??= [...committedReactions];
        return [...new Set([...snapshot, ...ownWrites])];
      };
      const transaction = {
        $queryRaw: jest.fn(async () => {
          lockCalls.push({ messageId: 41, conversationId: 3, userId: 7 });
          releaseLock = await messageLock.acquire();
          return [{ id: 41 }];
        }),
        message: {
          findFirst: jest.fn(async () => {
            readSnapshot();
            return { id: 41 };
          }),
          findUnique: jest.fn(async () =>
            createMessageRecord(readSnapshot(), committedReactionVersion)
          ),
          update: jest.fn(async () => {
            nextReactionVersion = committedReactionVersion + 1;
            return createMessageRecord(readSnapshot(), nextReactionVersion);
          })
        },
        messageReaction: {
          upsert: jest.fn(async ({ create }: { create: { emoji: string } }) => {
            ownWrites.add(create.emoji);
            return { id: ownWrites.size, ...create };
          }),
          updateMany: jest.fn(async () => ({ count: 0 }))
        }
      };

      try {
        const result = await operation(transaction);
        ownWrites.forEach((emoji) => committedReactions.add(emoji));
        if (nextReactionVersion !== undefined) {
          committedReactionVersion = nextReactionVersion;
        }
        return result;
      } finally {
        releaseLock?.();
      }
    }
  } as unknown as PrismaClient;

  return {
    committedReactions,
    lockCalls,
    repository: new RealtimeRepository(client)
  };
}

describe("RealtimeRepository message reactions", () => {
  it("serializes reactions for one message so the second response contains both emojis", async () => {
    const fixture = createConcurrentFixture();

    const [, second] = await Promise.all([
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

    expect(second?.reactions.map((reaction) => reaction.emoji)).toEqual(["OK", "😂"]);
    expect((second as { reactionVersion?: number } | null)?.reactionVersion).toBe(2);
    expect(fixture.committedReactions).toEqual(new Set(["OK", "😂"]));
    expect(fixture.lockCalls).toHaveLength(2);
  });
});
