import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "@jest/globals";
import { disconnectPrisma, prisma } from "../src/prisma/client";
import { CustomerProfileRepository } from "../src/repositories/customer-profile.repository";
import { UserRepository } from "../src/repositories/user.repository";

const runIntegration = process.env.RUN_CUSTOMER_PROFILE_REPOSITORY_INTEGRATION === "true";
const describeIntegration = runIntegration ? describe : describe.skip;
const marker = `customer-profile-repository-${randomUUID()}`;
let userId: number;
let profileId: number;

describeIntegration("CustomerProfileRepository MySQL integration", () => {
  const repository = new CustomerProfileRepository(prisma);

  beforeAll(async () => {
    const user = await new UserRepository(prisma).create({
      email: `${marker}@needo.local`,
      isActive: true,
      passwordHash: "integration-test-password-hash",
      username: marker
    });
    userId = user.id;
    const profile = await prisma.customerProfile.update({
      where: { userId },
      data: { city: "Tokyo", displayName: "原始资料", languages: ["日本語"] }
    });
    profileId = profile.id;
    await prisma.mediaAsset.create({
      data: {
        customerProfileId: profileId,
        entityType: "customer_profile",
        entityId: profileId,
        mimeType: "image/png",
        url: "https://media.local/old.png",
        usageType: "avatar"
      }
    });
  }, 30_000);

  afterAll(async () => {
    if (userId) {
      await prisma.auditLog.deleteMany({ where: { actorId: userId } });
      await prisma.mediaAsset.deleteMany({ where: { customerProfileId: profileId } });
      await prisma.customerProfile.deleteMany({ where: { id: profileId } });
      await prisma.userRole.deleteMany({ where: { userId } });
      const identities = await prisma.userIdentity.findMany({ where: { userId }, select: { id: true } });
      await prisma.publicIdentifier.deleteMany({
        where: { userIdentityId: { in: identities.map((identity) => identity.id) } }
      });
      await prisma.userIdentity.deleteMany({ where: { userId } });
      await prisma.user.deleteMany({ where: { id: userId } });
    }
    await disconnectPrisma();
  }, 30_000);

  it("persists only the scoped profile, avatar lifecycle, user avatar, audit, and a hard reread", async () => {
    await expect(
      repository.updateMine(
        userId,
        profileId,
        {
          age: 36,
          avatar: { mimeType: "image/png", url: "https://media.local/new.png" },
          bio: "持久化资料",
          displayName: "更新后的资料",
          gender: "private",
          heightCm: 171,
          isPublic: false,
          languages: ["日本語", "English"],
          visibility: "network"
        },
        {
          action: "customer_profile.self_update",
          actorId: userId,
          metadata: { changedFields: ["avatar", "displayName"] },
          targetId: profileId,
          targetType: "CustomerProfile"
        }
      )
    ).resolves.toMatchObject({ displayName: "更新后的资料", visibility: "network" });

    await expect(repository.findMine(userId, profileId)).resolves.toMatchObject({
      age: 36,
      avatarUrl: "https://media.local/new.png",
      bio: "持久化资料",
      displayName: "更新后的资料",
      gender: "private",
      heightCm: 171,
      languages: ["日本語", "English"],
      publicId: expect.stringMatching(/^u\d{10}$/),
      visibility: "network"
    });
    await expect(repository.findMine(userId, profileId + 999_999)).resolves.toBeNull();
    await expect(prisma.mediaAsset.findMany({ where: { customerProfileId: profileId, usageType: "avatar" } })).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ isActive: false, url: "https://media.local/old.png" }),
        expect.objectContaining({ isActive: true, url: "https://media.local/new.png" })
      ])
    );
    await expect(prisma.user.findUniqueOrThrow({ where: { id: userId } })).resolves.toMatchObject({
      avatarUrl: "https://media.local/new.png"
    });
    await expect(prisma.auditLog.findFirstOrThrow({ where: { action: "customer_profile.self_update", targetId: profileId } })).resolves.toMatchObject({
      actorId: userId
    });
  });

  it("rolls profile changes back when the audit insert fails", async () => {
    await expect(
      repository.updateMine(userId, profileId, { displayName: "不得提交" }, {
        action: "x".repeat(101),
        actorId: userId,
        targetId: profileId,
        targetType: "CustomerProfile"
      })
    ).rejects.toBeDefined();

    await expect(repository.findMine(userId, profileId)).resolves.toMatchObject({
      displayName: "更新后的资料"
    });
  });
});
