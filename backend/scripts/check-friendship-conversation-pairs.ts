import { config as loadDotenv } from "dotenv";

const main = async () => {
  loadDotenv({ path: process.env.ENV_FILE || ".env.dev" });
  const { prisma, disconnectPrisma } = await import("../src/prisma/client");

  try {
    const conversations = await prisma.conversation.findMany({
      where: { type: "DIRECT", deletedAt: null },
      select: {
        id: true,
        participants: {
          where: { deletedAt: null },
          select: { identityId: true }
        }
      }
    });
    const malformed = conversations.filter((item) => item.participants.length !== 2);
    const pairMap = new Map<string, number[]>();

    for (const conversation of conversations.filter((item) => item.participants.length === 2)) {
      const [low, high] = conversation.participants
        .map((item) => item.identityId)
        .sort((left, right) => left - right);
      const pair = `${low}:${high}`;
      pairMap.set(pair, [...(pairMap.get(pair) ?? []), conversation.id]);
    }

    const duplicates = [...pairMap.entries()]
      .filter(([, conversationIds]) => conversationIds.length > 1)
      .map(([pair, conversationIds]) => ({ pair, conversationIds }));

    if (malformed.length > 0 || duplicates.length > 0) {
      process.stderr.write(
        `${JSON.stringify(
          {
            malformedConversationIds: malformed.map((item) => item.id),
            duplicatePairs: duplicates
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
