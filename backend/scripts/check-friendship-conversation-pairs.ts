import { config as loadDotenv } from "dotenv";

const main = async () => {
  loadDotenv({ path: process.env.ENV_FILE || ".env.dev" });
  const { prisma, disconnectPrisma } = await import("../src/prisma/client");

  try {
    const conversations = await prisma.conversation.findMany({
      where: { type: "DIRECT", deletedAt: null },
      select: {
        id: true,
        accessPolicy: true,
        friendshipPairKey: true,
        participants: {
          where: { deletedAt: null },
          select: { identityId: true }
        }
      }
    });
    const malformed = conversations.filter((item) => item.participants.length !== 2);
    const pairMap = new Map<
      string,
      Array<{ conversationId: number; friendshipPairKey: string | null }>
    >();

    for (const conversation of conversations.filter(
      (item) =>
        item.participants.length === 2 && item.accessPolicy === "FRIENDSHIP_REQUIRED"
    )) {
      const [low, high] = conversation.participants
        .map((item) => item.identityId)
        .sort((left, right) => left - right);
      const pair = `${low}:${high}`;
      pairMap.set(pair, [
        ...(pairMap.get(pair) ?? []),
        { conversationId: conversation.id, friendshipPairKey: conversation.friendshipPairKey }
      ]);
    }

    const malformedPairKeys = [...pairMap.entries()].flatMap(([pair, conversationsForPair]) =>
      conversationsForPair
        .filter(
          (conversation) =>
            conversation.friendshipPairKey !== null &&
            conversation.friendshipPairKey !== pair
        )
        .map((conversation) => ({ pair, conversationId: conversation.conversationId }))
    );
    const canonicalPairs = [...pairMap.entries()].map(([pair, conversationsForPair]) => ({
      pair,
      conversationIds: conversationsForPair.map((item) => item.conversationId),
      keyedConversationIds: conversationsForPair
        .filter((item) => item.friendshipPairKey === pair)
        .map((item) => item.conversationId)
    }));
    const duplicates = canonicalPairs.filter((item) => item.keyedConversationIds.length > 1);
    const missingCanonicalPairs = canonicalPairs.filter(
      (item) => item.keyedConversationIds.length === 0
    );

    if (
      malformed.length > 0 ||
      malformedPairKeys.length > 0 ||
      duplicates.length > 0 ||
      missingCanonicalPairs.length > 0
    ) {
      process.stderr.write(
        `${JSON.stringify(
          {
            malformedConversationIds: malformed.map((item) => item.id),
            malformedPairKeys,
            duplicatePairs: duplicates,
            missingCanonicalPairs
          },
          null,
          2
        )}\n`
      );
      process.exitCode = 1;
    }
  } finally {
    await disconnectPrisma();
  }
};

void main();
