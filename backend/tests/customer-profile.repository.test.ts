import type { PrismaClient } from "@prisma/client";
import { CustomerProfileRepository } from "../src/repositories/customer-profile.repository";

const now = new Date("2026-08-26T00:00:00.000Z");

const profile = {
  age: 35,
  bio: "旧资料",
  city: "Tokyo",
  createdAt: now,
  deletedAt: null,
  displayName: "旧昵称",
  gender: "female",
  heightCm: 165,
  id: 41,
  isPublic: true,
  languages: ["日本語"],
  mediaAssets: [],
  membershipLevel: "standard",
  updatedAt: now,
  user: { needoId: "u1234567890" },
  userId: 11,
  visibility: "public"
};

describe("CustomerProfileRepository", () => {
  it("maps the current customer level from the formal experience account", async () => {
    const client = {
      customerProfile: {
        findFirst: jest.fn().mockResolvedValue({
          ...profile,
          user: {
            avatarBootstrapUrl: null,
            avatarUrl: null,
            experienceAccount: { currentLevel: 72, deletedAt: null },
            needoId: "u5314672018"
          }
        })
      }
    } as unknown as PrismaClient;
    const repository = new CustomerProfileRepository(client);

    await expect(repository.findMine(81, 464)).resolves.toMatchObject({
      level: 72,
      publicId: "u5314672018"
    });
  });

  it("uses the account avatar when the customer profile has no active avatar media", async () => {
    const accountAvatarUrl = "/images/generated/profiles/ai-profile-41.jpg";
    const client = {
      customerProfile: {
        findFirst: jest.fn().mockResolvedValue({
          ...profile,
          mediaAssets: [],
          user: { avatarBootstrapUrl: null, avatarUrl: accountAvatarUrl, needoId: "u5314672018" }
        })
      }
    } as unknown as PrismaClient;
    const repository = new CustomerProfileRepository(client);

    await expect(repository.findMine(81, 464)).resolves.toMatchObject({
      avatarUrl: accountAvatarUrl,
      displayName: "旧昵称",
      publicId: "u5314672018"
    });
  });

  it("updates only its scoped profile, replaces the active avatar, and writes the audit in its transaction", async () => {
    const updated = {
      ...profile,
      age: 36,
      bio: "新资料",
      displayName: "新昵称",
      gender: "private",
      heightCm: 171,
      isPublic: false,
      languages: ["日本語", "English"],
      mediaAssets: [
        {
          id: 82,
          url: "http://localhost:3000/media/customer-avatars/new.png",
          usageType: "avatar",
          isActive: true,
          deletedAt: null
        }
      ],
      visibility: "network"
    };
    const transaction = {
      auditLog: { create: jest.fn().mockResolvedValue(undefined) },
      customerProfile: {
        findFirst: jest.fn().mockResolvedValue(profile),
        findUniqueOrThrow: jest.fn().mockResolvedValue(updated),
        update: jest.fn().mockResolvedValue(updated)
      },
      mediaAsset: { create: jest.fn().mockResolvedValue({ id: 82 }), updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      user: {
        update: jest.fn().mockResolvedValue({ id: 11 }),
        updateMany: jest.fn().mockResolvedValue({ count: 0 })
      }
    };
    const client = {
      $transaction: jest.fn(async (callback) => callback(transaction)),
      customerProfile: { findFirst: jest.fn().mockResolvedValue(updated) }
    } as unknown as PrismaClient;
    const repository = new CustomerProfileRepository(client);

    await expect(
      repository.updateMine(
        11,
        41,
        17,
        {
          age: 36,
          avatar: { mimeType: "image/png", url: "http://localhost:3000/media/customer-avatars/new.png" },
          bio: "新资料",
          displayName: "新昵称",
          gender: "private",
          heightCm: 171,
          isPublic: false,
          languages: ["日本語", "English"],
          visibility: "network"
        },
        {
          action: "customer_profile.self_update",
          actorId: 11,
          metadata: { changedFields: ["age", "avatar"] },
          targetId: 41,
          targetType: "CustomerProfile"
        }
      )
    ).resolves.toMatchObject({
      age: 36,
      avatarUrl: "http://localhost:3000/media/customer-avatars/new.png",
      bio: "新资料",
      displayName: "新昵称",
      gender: "private",
      heightCm: 171,
      languages: ["日本語", "English"],
      visibility: "network"
    });

    expect(transaction.customerProfile.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 41, userId: 11, deletedAt: null } })
    );
    expect(transaction.mediaAsset.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { isActive: false } })
    );
    expect(transaction.mediaAsset.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          customerProfileId: 41,
          ownerIdentityId: 17,
          ownerUserId: 11,
          usageType: "avatar"
        })
      })
    );
    expect(transaction.user.update).toHaveBeenCalledWith({
      where: { id: 11 },
      data: { avatarUrl: "http://localhost:3000/media/customer-avatars/new.png" }
    });
    expect(transaction.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: "customer_profile.self_update", targetId: 41 }) })
    );
    await expect(repository.findMine(11, 41)).resolves.toMatchObject({ displayName: "新昵称" });
  });

  it("propagates an audit insert failure through the transaction", async () => {
    const transaction = {
      auditLog: { create: jest.fn().mockRejectedValue(new Error("audit unavailable")) },
      customerProfile: {
        findFirst: jest.fn().mockResolvedValue(profile),
        findUniqueOrThrow: jest.fn(),
        update: jest.fn().mockResolvedValue(profile)
      },
      mediaAsset: { create: jest.fn(), updateMany: jest.fn() },
      user: { update: jest.fn(), updateMany: jest.fn() }
    };
    const client = {
      $transaction: jest.fn(async (callback) => callback(transaction)),
      customerProfile: { findFirst: jest.fn() }
    } as unknown as PrismaClient;
    const repository = new CustomerProfileRepository(client);

    await expect(
      repository.updateMine(11, 41, 17, { displayName: "不会提交" }, {
        action: "customer_profile.self_update",
        targetType: "CustomerProfile"
      })
    ).rejects.toThrow("audit unavailable");
    expect(transaction.customerProfile.findUniqueOrThrow).not.toHaveBeenCalled();
  });
});
