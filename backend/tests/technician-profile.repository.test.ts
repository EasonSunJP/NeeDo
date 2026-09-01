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
  baseLatitude: { toString: () => "35.6762000" },
  baseLongitude: { toString: () => "139.6503000" },
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
  backofficeProfileTags: [
    { id: 1, label: "准时", isActive: true, expiresAt: null },
    { id: 2, label: "已过期", isActive: true, expiresAt: new Date("2020-01-01T00:00:00.000Z") }
  ],
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
  it("returns the private service base only through the self-profile repository", async () => {
    const client = {
      technicianProfile: { findFirst: jest.fn(async () => record) }
    } as unknown as PrismaClient;
    const repository = new TechnicianProfileRepository(client);

    await expect(repository.findMine(9, 31)).resolves.toMatchObject({
      specialTags: ["准时"],
      serviceBase: { latitude: 35.6762, longitude: 139.6503 }
    });
  });

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
        serviceBase: { latitude: 35.6895, longitude: 139.6917 },
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
    expect(transaction.technicianProfile.update).toHaveBeenCalledWith({
      where: { id: 31 },
      data: expect.objectContaining({
        baseLatitude: 35.6895,
        baseLongitude: 139.6917
      })
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

  it("clears both private service-base coordinates together", async () => {
    const transaction = {
      technicianProfile: {
        findFirst: jest.fn().mockResolvedValue(record),
        update: jest.fn(),
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          ...record,
          baseLatitude: null,
          baseLongitude: null
        })
      },
      auditLog: { create: jest.fn() }
    };
    const client = {
      $transaction: jest.fn(async (callback) => callback(transaction))
    } as unknown as PrismaClient;
    const repository = new TechnicianProfileRepository(client);

    await repository.updateMine(9, 31, 19, { serviceBase: null }, {
      actorId: 9,
      action: "technician_profile.self_update",
      targetType: "TechnicianProfile",
      targetId: 31
    });

    expect(transaction.technicianProfile.update).toHaveBeenCalledWith({
      where: { id: 31 },
      data: expect.objectContaining({ baseLatitude: null, baseLongitude: null })
    });
  });
});
