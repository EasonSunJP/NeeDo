import { compare } from "bcryptjs";
import { config as loadDotenv } from "dotenv";
import { existsSync } from "node:fs";

import { buildSocialSimulationPlan } from "../src/simulation/social-simulation-plan";
import { SIMULATION_NAMESPACE } from "../src/simulation/three-month-simulation-plan";
import { getSimulationSeedConfig } from "../src/simulation/simulation-seed-config";

const assert: (condition: unknown, message: string) => asserts condition = (condition, message) => {
  if (!condition) throw new Error(message);
};

const readRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const main = async (): Promise<void> => {
  const envFile = process.env.ENV_FILE || ".env.dev";
  assert(existsSync(envFile), `environment file was not found: ${envFile}`);
  process.env.ENV_FILE = envFile;
  loadDotenv({ path: envFile });

  const seedConfig = getSimulationSeedConfig(process.env);
  const plan = buildSocialSimulationPlan();
  const { prisma, disconnectPrisma } = await import("../src/prisma/client");

  try {
    const users = await prisma.user.findMany({
      where: { email: { in: plan.accounts.map((account) => account.email) }, deletedAt: null },
      select: {
        id: true,
        needoId: true,
        email: true,
        username: true,
        avatarUrl: true,
        passwordHash: true,
      }
    });
    assert(users.length === plan.accounts.length, `Expected ${plan.accounts.length} users.`);
    const userByEmail = new Map(users.map((user) => [user.email, user]));
    const accountByUserId = new Map(
      plan.accounts.map((account) => {
        const user = userByEmail.get(account.email);
        assert(user, `User is missing for ${account.email}.`);
        assert(user.username === account.displayName, `Nickname mismatch for ${account.email}.`);
        assert(user.avatarUrl === account.avatarUrl, `Avatar mismatch for ${account.email}.`);
        return [user.id, account] as const;
      })
    );
    const customerUserIds = plan.accounts
      .filter((account) => account.socialType === "user")
      .map((account) => userByEmail.get(account.email)?.id)
      .filter((userId): userId is number => typeof userId === "number");
    const technicianUserIds = plan.accounts
      .filter((account) => account.accountType === "technician")
      .map((account) => userByEmail.get(account.email)?.id)
      .filter((userId): userId is number => typeof userId === "number");
    const [customerProfiles, technicianProfiles] = await Promise.all([
      prisma.customerProfile.findMany({
        where: { userId: { in: customerUserIds }, deletedAt: null },
        select: {
          userId: true,
          displayName: true,
          isPublic: true,
          mediaAssets: {
            where: { usageType: "avatar", isActive: true, deletedAt: null },
            orderBy: { id: "asc" },
            select: { url: true }
          }
        }
      }),
      prisma.technicianProfile.findMany({
        where: { userId: { in: technicianUserIds }, deletedAt: null },
        select: {
          userId: true,
          displayName: true,
          mediaAssets: {
            where: { usageType: "avatar", isActive: true, deletedAt: null },
            orderBy: { id: "asc" },
            select: { url: true }
          }
        }
      })
    ]);
    const customerProfileByUserId = new Map(customerProfiles.map((profile) => [profile.userId, profile]));
    const technicianProfileByUserId = new Map(technicianProfiles.map((profile) => [profile.userId, profile]));
    for (const account of plan.accounts) {
      const user = userByEmail.get(account.email);
      assert(user, `User is missing for ${account.email}.`);
      if (account.socialType === "user") {
        const profile = customerProfileByUserId.get(user.id);
        assert(profile, `Customer profile is missing for ${account.email}.`);
        assert(profile.displayName === account.displayName, `Profile nickname mismatch for ${account.email}.`);
        assert(profile.mediaAssets[0]?.url === account.avatarUrl, `Profile avatar mismatch for ${account.email}.`);
        assert(profile.isPublic, `Customer profile is not readable for ${account.email}.`);
      } else if (account.accountType === "technician") {
        const profile = technicianProfileByUserId.get(user.id);
        assert(profile, `Technician profile is missing for ${account.email}.`);
        assert(profile.displayName === account.displayName, `Profile nickname mismatch for ${account.email}.`);
        assert(profile.mediaAssets[0]?.url === account.avatarUrl, `Profile avatar mismatch for ${account.email}.`);
      }
    }
    const needoIds = plan.accounts.map((account) => {
      const user = userByEmail.get(account.email);
      assert(user, `User is missing for ${account.email}.`);
      assert(/^(?:u|needo)\d{10}$/.test(user.needoId), `Primary public ID format mismatch for ${account.email}.`);
      return user.needoId;
    });
    const uniqueNeeDoIds = new Set(needoIds);
    assert(
      uniqueNeeDoIds.size === plan.accounts.length,
      `NeeDo ID uniqueness mismatch: ${uniqueNeeDoIds.size}/${plan.accounts.length}.`
    );
    const passwordHashes = new Set(users.map((user) => user.passwordHash));
    const passwordMatchByHash = new Map(
      await Promise.all(
        [...passwordHashes].map(async (passwordHash) => [
          passwordHash,
          await compare(seedConfig.defaultPassword, passwordHash)
        ] as const)
      )
    );
    const invalidPasswordEmails = users
      .filter((user) => !passwordMatchByHash.get(user.passwordHash))
      .map((user) => user.email);
    assert(
      invalidPasswordEmails.length === 0,
      `Formal test password mismatch: ${invalidPasswordEmails.join(", ")}.`
    );

    const userIds = users.map((user) => user.id);
    const posts = await prisma.socialPost.findMany({
      where: { authorUserId: { in: userIds }, deletedAt: null },
      select: { authorUserId: true, media: true }
    });
    const kindCountByAuthor = new Map<number, Map<string, number>>();
    let simulationPostCount = 0;
    posts.forEach((post) => {
      const media = readRecord(post.media);
      if (media?.namespace !== SIMULATION_NAMESPACE || media.dataset !== "social") return;
      simulationPostCount += 1;
      const items = Array.isArray(media.items) ? media.items.map(readRecord).filter(Boolean) : [];
      const kind =
        typeof media.quotePostId === "number"
          ? "quote"
          : items.some((item) => item?.type === "video")
            ? "video"
            : items.length > 1
              ? "multi_image"
              : items.length === 1
                ? "single_image"
                : "text";
      const kinds = kindCountByAuthor.get(post.authorUserId) ?? new Map<string, number>();
      kinds.set(kind, (kinds.get(kind) ?? 0) + 1);
      kindCountByAuthor.set(post.authorUserId, kinds);
    });
    assert(simulationPostCount === plan.posts.length, `Expected ${plan.posts.length} posts.`);
    for (const userId of userIds) {
      const kinds = kindCountByAuthor.get(userId);
      assert(kinds, `Posts are missing for user ${userId}.`);
      for (const kind of ["text", "single_image", "multi_image", "video", "quote"]) {
        assert(kinds.get(kind) === 3, `${kind} count mismatch for user ${userId}.`);
      }
    }

    const follows = await prisma.follow.findMany({
      where: { followerUserId: { in: userIds }, deletedAt: null },
      select: { followerUserId: true, followingUserId: true }
    });
    const followsByUser = new Map<number, number[]>();
    follows.forEach((follow) => {
      const following = followsByUser.get(follow.followerUserId) ?? [];
      following.push(follow.followingUserId);
      followsByUser.set(follow.followerUserId, following);
    });
    for (const userId of userIds) {
      const friendIds = followsByUser.get(userId) ?? [];
      assert(friendIds.length === 36, `Friend count mismatch for user ${userId}: ${friendIds.length}.`);
      const types = new Set(friendIds.map((friendId) => accountByUserId.get(friendId)?.socialType));
      assert(types.has("shop"), `Shop friend missing for user ${userId}.`);
      assert(types.has("technician"), `Technician friend missing for user ${userId}.`);
      assert(types.has("user"), `General-user friend missing for user ${userId}.`);
    }

    console.log(
      JSON.stringify(
        {
          accounts: users.length,
          passwordMatches: users.length,
          profileNamesMatch: customerProfiles.length + technicianProfiles.length,
          readableCustomerProfiles: customerProfiles.filter((profile) => profile.isPublic).length,
          uniqueNeeDoIds: uniqueNeeDoIds.size,
          socialPosts: simulationPostCount,
          postsPerAccount: 15,
          contentKindsPerAccount: 5,
          friendsPerAccount: 36,
          friendTypes: ["shop", "technician", "user"],
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
