import { config as loadDotenv } from "dotenv";
import { existsSync } from "node:fs";

type DuplicateReactionSlot = {
  messageId: number;
  userId: number;
  category: "judgement" | "emoji";
  activeCount: bigint;
};

const loadScriptEnvironment = (): void => {
  const envFile = process.env.ENV_FILE || ".env.dev";
  if (existsSync(envFile)) loadDotenv({ path: envFile });
};

const main = async (): Promise<void> => {
  loadScriptEnvironment();
  const { prisma, disconnectPrisma } = await import("../src/prisma/client");

  try {
    const duplicates = await prisma.$queryRaw<DuplicateReactionSlot[]>`
      SELECT
        message_id AS messageId,
        user_id AS userId,
        CASE
          WHEN emoji IN ('OK', 'NO', 'Pending', '+1', 'Done', 'Cool', 'Good', 'Thanks')
            THEN 'judgement'
          ELSE 'emoji'
        END AS category,
        COUNT(*) AS activeCount
      FROM message_reactions
      WHERE deleted_at IS NULL
      GROUP BY message_id, user_id, category
      HAVING COUNT(*) > 1
    `;
    const result = {
      ready: duplicates.length === 0,
      duplicateSlotCount: duplicates.length,
      duplicates: duplicates.map((duplicate) => ({
        ...duplicate,
        activeCount: Number(duplicate.activeCount)
      }))
    };

    process.stdout.write(`${JSON.stringify(result)}\n`);
    if (!result.ready) process.exitCode = 1;
  } finally {
    await disconnectPrisma();
  }
};

if (require.main === module) {
  void main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  });
}
