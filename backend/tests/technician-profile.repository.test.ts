import type { PrismaClient } from "@prisma/client";
import { TechnicianProfileRepository } from "../src/repositories/technician-profile.repository";

const now = new Date("2026-08-30T00:00:00.000Z");
const record = {
  id: 31,
  userId: 9,
  shopId: 3,
  displayName: "田中 彩",
  bio: "肩颈护理",
  city: "Tokyo",
  serviceArea: "銀座",
  serviceAreasJson: ["銀座"],
  age: 28,
  heightCm: 164,
  languages: ["日本語"],
  profileTags: ["肩颈调理"],
  canServeForeigners: true,
  bidBudgetMinJpy: 12_000,
  bidBudgetMaxJpy: 28_000,
  paymentMethods: ["platform", "offline"],
  visibility: "public",
  yearsExperience: 4,
  employmentType: "FULL_TIME",
  status: "published",
  isRecommended: false,
  employmentStartedAt: null,
  verifiedAt: now,
  createdAt: now,
  updatedAt: now,
  deletedAt: null,
  mediaAssets: [],
  user: {
    avatarBootstrapUrl: null,
    identities: [{
      publicIdentifier: {
        publicId: "s1234567890",
        kind: "S",
        status: "ACTIVE",
        deletedAt: null
      }
    }]
  }
};

describe("TechnicianProfileRepository", () => {
  it("updates only the scoped profile and persists avatar ownership on the current identity", async () => {
    const updated = {
      ...record,
      displayName: "彩",
      mediaAssets: [{ url: "/media/customer-avatars/avatar.png" }]
    };
    const transaction = {
      technicianProfile: {
        findFirst: jest.fn().mockResolvedValue(record),
        update: jest.fn().mockResolvedValue(updated),
        findUniqueOrThrow: jest.fn().mockResolvedValue(updated)
      },
      mediaAsset: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        create: jest.fn().mockResolvedValue({ id: 91 })
      },
      user: {
        update: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 0 })
      },
      auditLog: { create: jest.fn().mockResolvedValue({ id: 1 }) }
    };
    const client = {
      $transaction: jest.fn(async (callback) => callback(transaction))
    } as unknown as PrismaClient;
    const repository = new TechnicianProfileRepository(client);

    await expect(repository.updateMine(
      9,
      31,
      19,
      {
        displayName: "彩",
        avatar: { url: "/media/customer-avatars/avatar.png", mimeType: "image/png" }
      },
      {
        actorId: 9,
        action: "technician_profile.self_update",
        targetType: "TechnicianProfile",
        targetId: 31
      }
    )).resolves.toMatchObject({ displayName: "彩", avatarUrl: "/media/customer-avatars/avatar.png" });

    expect(transaction.technicianProfile.findFirst).toHaveBeenCalledWith({
      where: { id: 31, userId: 9, deletedAt: null }
    });
    expect(transaction.mediaAsset.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        technicianProfileId: 31,
        ownerUserId: 9,
        ownerIdentityId: 19,
        usageType: "avatar"
      })
    });
    expect(transaction.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: "technician_profile.self_update", targetId: 31 })
    });
  });
});
