import { config as loadDotenv } from "dotenv";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

type ReplySnapshot = {
  databaseName: string;
  totalPosts: number;
  validLegacyReplies: number;
};

type ReplyCheckPhase = "preflight" | "postflight";

const BLOCKED_ENVIRONMENTS = new Set(["staging", "prod", "production"]);
const LOOPBACK_DATABASE_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
const PRODUCTION_LIKE_DATABASE_NAME = /(^|[_-])(prod|production|staging)([_-]|$)/i;

const assert = (condition: unknown, message: string): asserts condition => {
  if (!condition) throw new Error(message);
};

const resolvePhase = (argumentsList: string[]): ReplyCheckPhase => {
  const phase = argumentsList
    .find((argument) => argument.startsWith("--phase="))
    ?.slice("--phase=".length);
  assert(
    phase === "preflight" || phase === "postflight",
    "Social reply relation check requires --phase=preflight or --phase=postflight."
  );
  return phase;
};

const loadLocalEnvironment = (): string => {
  const envFile = process.env.ENV_FILE?.trim() || ".env.dev";
  assert(existsSync(envFile), `environment file was not found: ${envFile}`);
  loadDotenv({ path: envFile, override: true });

  const nodeEnvironment = process.env.NODE_ENV?.trim().toLowerCase() ?? "";
  const deployEnvironment = process.env.DEPLOY_ENV?.trim().toLowerCase() ?? "";
  assert(
    !BLOCKED_ENVIRONMENTS.has(nodeEnvironment) && !BLOCKED_ENVIRONMENTS.has(deployEnvironment),
    "Social reply relation check rejects staging and production environments"
  );

  let databaseUrl: URL;
  try {
    databaseUrl = new URL(process.env.DATABASE_URL || "");
  } catch {
    throw new Error("DATABASE_URL must be a valid URL");
  }
  assert(databaseUrl.protocol === "mysql:", "Social reply relation check requires a MySQL DATABASE_URL");
  assert(
    LOOPBACK_DATABASE_HOSTS.has(databaseUrl.hostname),
    "Social reply relation check only accepts a loopback MySQL host"
  );

  const databaseName = databaseUrl.pathname.replace(/^\//, "");
  assert(databaseName.length > 0, "DATABASE_URL must include a database name");
  assert(
    !PRODUCTION_LIKE_DATABASE_NAME.test(databaseName),
    "Social reply relation check rejects production-like database names"
  );
  return databaseName;
};

const snapshotPath = resolve(process.cwd(), ".data/social-reply-relation-preflight.json");

const writeSnapshot = (snapshot: ReplySnapshot): void => {
  mkdirSync(resolve(process.cwd(), ".data"), { recursive: true });
  writeFileSync(snapshotPath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
};

const readSnapshot = (): ReplySnapshot => {
  assert(existsSync(snapshotPath), `preflight snapshot was not found: ${snapshotPath}`);
  const snapshot = JSON.parse(readFileSync(snapshotPath, "utf8")) as Partial<ReplySnapshot>;
  assert(
    typeof snapshot.databaseName === "string" &&
      typeof snapshot.totalPosts === "number" &&
      Number.isSafeInteger(snapshot.totalPosts) &&
      typeof snapshot.validLegacyReplies === "number" &&
      Number.isSafeInteger(snapshot.validLegacyReplies),
    "preflight snapshot is invalid"
  );
  return snapshot as ReplySnapshot;
};

const countFrom = (row: { count: bigint } | undefined): number => Number(row?.count ?? 0n);

const main = async (): Promise<void> => {
  const databaseName = loadLocalEnvironment();
  const phase = resolvePhase(process.argv.slice(2));
  const { prisma, disconnectPrisma } = await import("../src/prisma/client");

  try {
    const [totalRow] = await prisma.$queryRaw<Array<{ totalPosts: bigint }>>`
      SELECT COUNT(*) AS totalPosts FROM social_posts
    `;
    const totalPosts = Number(totalRow?.totalPosts ?? 0n);

    if (phase === "preflight") {
      const [legacyRow] = await prisma.$queryRaw<Array<{ validLegacyReplies: bigint }>>`
        SELECT COUNT(*) AS validLegacyReplies
        FROM social_posts AS reply
        INNER JOIN social_posts AS parent
          ON parent.id = CAST(JSON_UNQUOTE(JSON_EXTRACT(reply.media, '$.replyToPostId')) AS UNSIGNED)
        WHERE JSON_EXTRACT(reply.media, '$.replyToPostId') IS NOT NULL
          AND JSON_UNQUOTE(JSON_EXTRACT(reply.media, '$.replyToPostId')) REGEXP '^[1-9][0-9]*$'
      `;
      const snapshot: ReplySnapshot = {
        databaseName,
        totalPosts,
        validLegacyReplies: Number(legacyRow?.validLegacyReplies ?? 0n)
      };
      writeSnapshot(snapshot);
      process.stdout.write(`${JSON.stringify({ status: "ok", phase, ...snapshot }, null, 2)}\n`);
      return;
    }

    const snapshot = readSnapshot();
    assert(snapshot.databaseName === databaseName, "preflight snapshot database does not match DATABASE_URL");
    const [backfilledRow, orphanedRow, indexRow, foreignKeyRow] = await Promise.all([
      prisma.$queryRaw<Array<{ count: bigint }>>`
        SELECT COUNT(*) AS count FROM social_posts WHERE reply_to_post_id IS NOT NULL
      `,
      prisma.$queryRaw<Array<{ count: bigint }>>`
        SELECT COUNT(*) AS count
        FROM social_posts AS reply
        LEFT JOIN social_posts AS parent ON parent.id = reply.reply_to_post_id
        WHERE reply.reply_to_post_id IS NOT NULL AND parent.id IS NULL
      `,
      prisma.$queryRaw<Array<{ count: bigint }>>`
        SELECT COUNT(DISTINCT index_name) AS count
        FROM information_schema.statistics
        WHERE table_schema = DATABASE()
          AND table_name = 'social_posts'
          AND index_name = 'social_posts_reply_parent_active_idx'
      `,
      prisma.$queryRaw<Array<{ count: bigint }>>`
        SELECT COUNT(*) AS count
        FROM information_schema.table_constraints
        WHERE table_schema = DATABASE()
          AND table_name = 'social_posts'
          AND constraint_name = 'social_posts_reply_to_post_id_fkey'
          AND constraint_type = 'FOREIGN KEY'
      `
    ]);

    const backfilledRelations = countFrom(backfilledRow);
    const orphanedRelations = countFrom(orphanedRow);
    const replyParentIndexCount = countFrom(indexRow);
    const replyParentForeignKeyCount = countFrom(foreignKeyRow);
    assert(totalPosts === snapshot.totalPosts, "total post count changed since preflight");
    assert(
      backfilledRelations === snapshot.validLegacyReplies,
      "reply relation backfill count does not match the preflight snapshot"
    );
    assert(orphanedRelations === 0, "reply relation backfill contains orphaned parents");
    assert(replyParentIndexCount === 1, "reply relation index is missing");
    assert(replyParentForeignKeyCount === 1, "reply relation foreign key is missing");

    process.stdout.write(
      `${JSON.stringify(
        {
          status: "ok",
          phase,
          databaseName,
          totalPosts,
          backfilledRelations,
          orphanedRelations,
          replyParentIndexCount,
          replyParentForeignKeyCount
        },
        null,
        2
      )}\n`
    );
  } finally {
    await disconnectPrisma();
  }
};

if (require.main === module) {
  void main().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
