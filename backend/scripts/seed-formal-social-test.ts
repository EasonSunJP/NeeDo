import { SocialPostVisibility, type Prisma } from "@prisma/client";
import { hash } from "bcryptjs";
import { config as loadDotenv } from "dotenv";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { SIMULATION_NAMESPACE } from "../src/simulation/three-month-simulation-plan";
import {
  buildFormalTestAccountExportRow,
  orderFormalTestAccountExports
} from "../src/simulation/formal-test-account-export";
import { syncFormalSocialAccountProfile } from "../src/simulation/formal-social-account-profile";
import { buildSocialSimulationPlan } from "../src/simulation/social-simulation-plan";
import { getSimulationSeedConfig } from "../src/simulation/simulation-seed-config";

const BCRYPT_ROUNDS = 12;
const DEFAULT_ACCOUNT_EXPORT_PATH = "../outputs/NeeDo_正式测试账号_2026-08-25.csv";

const assert: (condition: unknown, message: string) => asserts condition = (condition, message) => {
  if (!condition) throw new Error(message);
};

const getRequired = <Key, Value>(map: ReadonlyMap<Key, Value>, key: Key, entity: string): Value => {
  const value = map.get(key);
  if (value === undefined) throw new Error(`${entity} is missing for ${String(key)}.`);
  return value;
};

const readJsonRecord = (value: Prisma.JsonValue | null): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const chunkRows = <T>(rows: T[], size = 500): T[][] =>
  Array.from({ length: Math.ceil(rows.length / size) }, (_, index) =>
    rows.slice(index * size, (index + 1) * size)
  );

const escapeCsv = (value: string): string => `"${value.replaceAll('"', '""')}"`;

const main = async (): Promise<void> => {
  const envFile = process.env.ENV_FILE || ".env.dev";
  assert(existsSync(envFile), `environment file was not found: ${envFile}`);
  process.env.ENV_FILE = envFile;
  loadDotenv({ path: envFile });

  const seedConfig = getSimulationSeedConfig(process.env);
  const socialPlan = buildSocialSimulationPlan();
  const passwordHash = await hash(seedConfig.defaultPassword, BCRYPT_ROUNDS);
  const { prisma, disconnectPrisma } = await import("../src/prisma/client");

  try {
    const result = await prisma.$transaction(
      async (tx) => {
        const users = await tx.user.findMany({
          where: { email: { in: socialPlan.accounts.map((account) => account.email) } },
          select: {
            id: true,
            needoId: true,
            email: true,
          }
        });
        assert(
          users.length === socialPlan.accounts.length,
          `Expected ${socialPlan.accounts.length} formal test accounts, found ${users.length}. Run the User Management and three-month account seed first.`
        );

        const userIdByEmail = new Map(users.map((user) => [user.email, user.id]));
        const needoIdByEmail = new Map(users.map((user) => [user.email, user.needoId]));
        const userIdByKey = new Map(
          socialPlan.accounts.map((account) => [
            account.key,
            getRequired(userIdByEmail, account.email, "formal test user")
          ])
        );
        const userIds = [...userIdByKey.values()];

        await tx.user.updateMany({
          where: { id: { in: userIds } },
          data: { passwordHash, isActive: true, deletedAt: null }
        });
        for (const account of socialPlan.accounts) {
          const userId = getRequired(userIdByKey, account.key, "formal test user");
          await tx.user.update({
            where: { id: userId },
            data: { username: account.displayName, avatarUrl: account.avatarUrl }
          });
          await tx.userIdentity.updateMany({
            where: { userId, deletedAt: null },
            data: { displayName: account.displayName }
          });
          await syncFormalSocialAccountProfile(tx, userId, account);
        }

        const existingPosts = await tx.socialPost.findMany({
          where: { authorUserId: { in: userIds }, deletedAt: null },
          select: { id: true, media: true }
        });
        const oldSimulationPostIds = existingPosts.flatMap((post) => {
          const media = readJsonRecord(post.media);
          return media?.namespace === SIMULATION_NAMESPACE && media.dataset === "social"
            ? [post.id]
            : [];
        });
        if (oldSimulationPostIds.length > 0) {
          await tx.socialPost.updateMany({
            where: { id: { in: oldSimulationPostIds } },
            data: { deletedAt: new Date() }
          });
        }

        const basePosts = socialPlan.posts.filter((post) => post.kind !== "quote");
        for (const rows of chunkRows(basePosts)) {
          await tx.socialPost.createMany({
            data: rows.map((post): Prisma.SocialPostCreateManyInput => ({
              authorUserId: getRequired(userIdByKey, post.authorKey, "social post author"),
              content: post.content,
              media: post.media as unknown as Prisma.InputJsonValue,
              visibility:
                post.visibility === "followers"
                  ? SocialPostVisibility.FOLLOWERS
                  : SocialPostVisibility.PUBLIC,
              createdAt: new Date(post.createdAt)
            }))
          });
        }

        const insertedPosts = await tx.socialPost.findMany({
          where: { authorUserId: { in: userIds }, deletedAt: null },
          select: { id: true, media: true }
        });
        const postIdByKey = new Map<string, number>();
        insertedPosts.forEach((post) => {
          const media = readJsonRecord(post.media);
          if (
            media?.namespace === SIMULATION_NAMESPACE &&
            media.dataset === "social" &&
            typeof media.postKey === "string"
          ) {
            postIdByKey.set(media.postKey, post.id);
          }
        });

        const quotePosts = socialPlan.posts.filter((post) => post.kind === "quote");
        for (const rows of chunkRows(quotePosts)) {
          await tx.socialPost.createMany({
            data: rows.map((post): Prisma.SocialPostCreateManyInput => {
              assert(post.quotePostKey, `Quote source is missing for ${post.key}.`);
              return {
                authorUserId: getRequired(userIdByKey, post.authorKey, "quote author"),
                content: post.content,
                media: {
                  ...post.media,
                  quotePostId: getRequired(postIdByKey, post.quotePostKey, "quoted post")
                } as unknown as Prisma.InputJsonValue,
                visibility:
                  post.visibility === "followers"
                    ? SocialPostVisibility.FOLLOWERS
                    : SocialPostVisibility.PUBLIC,
                createdAt: new Date(post.createdAt)
              };
            })
          });
        }

        const directedFriendPairs = socialPlan.friendships.flatMap((friendship) => [
          {
            followerUserId: getRequired(userIdByKey, friendship.leftKey, "friend"),
            followingUserId: getRequired(userIdByKey, friendship.rightKey, "friend")
          },
          {
            followerUserId: getRequired(userIdByKey, friendship.rightKey, "friend"),
            followingUserId: getRequired(userIdByKey, friendship.leftKey, "friend")
          }
        ]);
        const plannedKeys = new Set(
          directedFriendPairs.map((pair) => `${pair.followerUserId}:${pair.followingUserId}`)
        );
        const existingFollows = await tx.follow.findMany({
          where: {
            OR: [
              { followerUserId: { in: userIds } },
              { followingUserId: { in: userIds } }
            ]
          },
          select: { id: true, followerUserId: true, followingUserId: true, deletedAt: true }
        });
        const existingIdByKey = new Map(
          existingFollows.map((follow) => [
            `${follow.followerUserId}:${follow.followingUserId}`,
            follow.id
          ])
        );
        const obsoleteIds = existingFollows
          .filter(
            (follow) =>
              !follow.deletedAt &&
              !plannedKeys.has(`${follow.followerUserId}:${follow.followingUserId}`)
          )
          .map((follow) => follow.id);
        if (obsoleteIds.length > 0) {
          await tx.follow.updateMany({
            where: { id: { in: obsoleteIds } },
            data: { deletedAt: new Date() }
          });
        }
        const activeExistingIds = directedFriendPairs.flatMap((pair) => {
          const id = existingIdByKey.get(`${pair.followerUserId}:${pair.followingUserId}`);
          return id ? [id] : [];
        });
        if (activeExistingIds.length > 0) {
          await tx.follow.updateMany({
            where: { id: { in: activeExistingIds } },
            data: { deletedAt: null }
          });
        }
        const missingPairs = directedFriendPairs.filter(
          (pair) => !existingIdByKey.has(`${pair.followerUserId}:${pair.followingUserId}`)
        );
        for (const rows of chunkRows(missingPairs)) {
          await tx.follow.createMany({
            data: rows.map((pair) => ({
              ...pair,
              createdAt: new Date("2026-08-01T00:00:00.000Z")
            })),
            skipDuplicates: true
          });
        }

        return { userIdByEmail, needoIdByEmail, accountCount: users.length };
      },
      { maxWait: 20_000, timeout: 180_000 }
    );

    const exportRows = orderFormalTestAccountExports(
      socialPlan.accounts.map((account) =>
        buildFormalTestAccountExportRow(
          {
            ...account,
            needoId: getRequired(
              result.needoIdByEmail,
              account.email,
              "NeeDo ID"
            ),
            userId: getRequired(result.userIdByEmail, account.email, "formal test user")
          },
          seedConfig.defaultPassword
        )
      )
    );
    const csvRows = exportRows.map((row) => [
      row.accountType,
      row.needoId,
      row.nickname,
      row.email,
      row.password
    ]);
    const csv = [["account_type", "needo_id", "nickname", "email", "password"], ...csvRows]
      .map((row) => row.map(escapeCsv).join(","))
      .join("\n");
    const exportPath = resolve(
      process.cwd(),
      process.env.SIMULATION_ACCOUNT_EXPORT || DEFAULT_ACCOUNT_EXPORT_PATH
    );
    await mkdir(dirname(exportPath), { recursive: true });
    await writeFile(exportPath, `\uFEFF${csv}\n`, "utf8");

    console.log(
      JSON.stringify(
        {
          accounts: result.accountCount,
          socialPosts: socialPlan.posts.length,
          mutualFriendships: socialPlan.friendships.length,
          friendsPerAccount: (socialPlan.friendships.length * 2) / socialPlan.accounts.length,
          exportPath,
          status: "ok"
        },
        null,
        2
      )
    );
  } finally {
    await disconnectPrisma();
  }
};

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
