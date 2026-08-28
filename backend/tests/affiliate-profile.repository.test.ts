import { createHash } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { AffiliateProfileRepository } from "../src/repositories/affiliate-profile.repository";

const timestamp = new Date("2026-08-28T09:00:00.000Z");
const record = {
  id: 51,
  version: 3,
  status: "ACTIVE",
  cooperationStatus: "AVAILABLE",
  bio: "美容紹介",
  strengths: ["美容"],
  serviceAreas: ["東京都"],
  updatedAt: timestamp,
  user: {
    needoId: "u0000000007",
    username: "山本太郎",
    avatarUrl: null
  },
  channels: [
    {
      id: 71,
      platform: "INSTAGRAM",
      customLabel: null,
      homepageUrl: "https://instagram.com/needo",
      sortOrder: 0,
      createdAt: timestamp,
      updatedAt: timestamp
    }
  ]
};

const auditLog = {
  actorId: 7,
  action: "affiliate_profile.updated",
  targetType: "AffiliateProfile",
  targetId: 51,
  metadata: { changedFields: ["bio"] }
};

const current = { id: 51, version: 3, status: "ACTIVE" };

describe("AffiliateProfileRepository", () => {
  it("reads only the owned non-deleted profile and public user projection", async () => {
    const findFirst = jest.fn().mockResolvedValue(record);
    const client = {
      affiliateProfile: { findFirst }
    } as unknown as PrismaClient;
    const repository = new AffiliateProfileRepository(client);

    const result = await repository.findMine(7);

    expect(client.affiliateProfile.findFirst).toHaveBeenCalledWith({
      where: { userId: 7, deletedAt: null },
      select: expect.objectContaining({
        user: { select: { needoId: true, username: true, avatarUrl: true } },
        channels: {
          where: { deletedAt: null },
          orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
          select: expect.any(Object)
        }
      })
    });
    const selection = findFirst.mock.calls[0]?.[0]?.select;
    expect(selection).not.toHaveProperty("userId");
    expect(result).toEqual({
      profileId: 51,
      needoId: "u0000000007",
      displayName: "山本太郎",
      avatarUrl: null,
      affiliateStatus: "active",
      cooperationStatus: "available",
      version: 3,
      bio: "美容紹介",
      strengths: ["美容"],
      serviceAreas: ["東京都"],
      channels: [
        {
          channelId: 71,
          platform: "instagram",
          customLabel: null,
          homepageUrl: "https://instagram.com/needo",
          sortOrder: 0,
          createdAt: timestamp.toISOString(),
          updatedAt: timestamp.toISOString()
        }
      ],
      updatedAt: timestamp.toISOString()
    });
    expect(JSON.stringify(result)).not.toContain("userId");
  });

  it("updates a profile through a version-guarded audited transaction", async () => {
    const updated = { ...record, version: 4, bio: "新しい紹介" };
    const transaction = {
      affiliateProfile: {
        findFirst: jest.fn().mockResolvedValueOnce(current).mockResolvedValueOnce(updated),
        updateMany: jest.fn().mockResolvedValue({ count: 1 })
      },
      auditLog: { create: jest.fn().mockResolvedValue({ id: 1 }) }
    };
    const client = {
      $transaction: jest.fn(async (callback) => callback(transaction))
    } as unknown as PrismaClient;
    const repository = new AffiliateProfileRepository(client);

    await expect(
      repository.updateMine(7, 3, { bio: "新しい紹介", strengths: ["美容", "旅行"] }, auditLog)
    ).resolves.toMatchObject({ version: 4, bio: "新しい紹介" });

    expect(transaction.affiliateProfile.updateMany).toHaveBeenCalledWith({
      where: { id: 51, userId: 7, version: 3, deletedAt: null },
      data: {
        bio: "新しい紹介",
        strengths: ["美容", "旅行"],
        version: { increment: 1 }
      }
    });
    expect(transaction.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "affiliate_profile.updated",
        targetId: 51,
        metadata: { changedFields: ["bio"] }
      })
    });
  });

  it("creates a channel with a hashed active key and a second version guard", async () => {
    const updated = { ...record, version: 4 };
    const transaction = {
      affiliateProfile: {
        findFirst: jest.fn().mockResolvedValueOnce(current).mockResolvedValueOnce(updated),
        updateMany: jest.fn().mockResolvedValue({ count: 1 })
      },
      affiliateProfileChannel: {
        count: jest.fn().mockResolvedValue(1),
        create: jest.fn().mockResolvedValue({ id: 72 })
      },
      auditLog: { create: jest.fn().mockResolvedValue({ id: 1 }) }
    };
    const client = {
      $transaction: jest.fn(async (callback) => callback(transaction))
    } as unknown as PrismaClient;
    const repository = new AffiliateProfileRepository(client);
    const homepageUrl = "https://x.com/needo";

    await repository.createChannel(
      7,
      3,
      { platform: "x", customLabel: null, homepageUrl, sortOrder: 2 },
      { ...auditLog, action: "affiliate_profile.channel_created" }
    );

    const hash = createHash("sha256").update(homepageUrl).digest("hex");
    expect(transaction.affiliateProfileChannel.count).toHaveBeenCalledWith({
      where: { profileId: 51, deletedAt: null }
    });
    expect(transaction.affiliateProfileChannel.create).toHaveBeenCalledWith({
      data: {
        profileId: 51,
        platform: "X",
        customLabel: null,
        homepageUrl,
        activeKey: `51:${hash}`,
        sortOrder: 2
      }
    });
    expect(transaction.affiliateProfile.updateMany).toHaveBeenCalledWith({
      where: { id: 51, userId: 7, version: 3, deletedAt: null },
      data: { version: { increment: 1 } }
    });
  });

  it("rechecks the ten-channel limit inside the transaction", async () => {
    const transaction = {
      affiliateProfile: {
        findFirst: jest.fn().mockResolvedValue(current),
        updateMany: jest.fn()
      },
      affiliateProfileChannel: {
        count: jest.fn().mockResolvedValue(10),
        create: jest.fn()
      },
      auditLog: { create: jest.fn() }
    };
    const client = {
      $transaction: jest.fn(async (callback) => callback(transaction))
    } as unknown as PrismaClient;
    const repository = new AffiliateProfileRepository(client);

    await expect(
      repository.createChannel(
        7,
        3,
        {
          platform: "x",
          customLabel: null,
          homepageUrl: "https://x.com/needo",
          sortOrder: 0
        },
        auditLog
      )
    ).rejects.toMatchObject({ message: "error.affiliate_profile.channel_limit" });
    expect(transaction.affiliateProfileChannel.create).not.toHaveBeenCalled();
  });

  it("updates only an owned active channel and refreshes its active key", async () => {
    const updated = { ...record, version: 4 };
    const transaction = {
      affiliateProfile: {
        findFirst: jest.fn().mockResolvedValueOnce(current).mockResolvedValueOnce(updated),
        updateMany: jest.fn().mockResolvedValue({ count: 1 })
      },
      affiliateProfileChannel: {
        findFirst: jest.fn().mockResolvedValue({ id: 71, profileId: 51 }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 })
      },
      auditLog: { create: jest.fn().mockResolvedValue({ id: 1 }) }
    };
    const client = {
      $transaction: jest.fn(async (callback) => callback(transaction))
    } as unknown as PrismaClient;
    const repository = new AffiliateProfileRepository(client);
    const homepageUrl = "https://instagram.com/needo-new";

    await repository.updateChannel(
      7,
      71,
      3,
      { homepageUrl },
      { ...auditLog, action: "affiliate_profile.channel_updated" }
    );

    expect(transaction.affiliateProfileChannel.findFirst).toHaveBeenCalledWith({
      where: { id: 71, profileId: 51, deletedAt: null },
      select: { id: true }
    });
    expect(transaction.affiliateProfileChannel.updateMany).toHaveBeenCalledWith({
      where: { id: 71, profileId: 51, deletedAt: null },
      data: {
        homepageUrl,
        activeKey: `51:${createHash("sha256").update(homepageUrl).digest("hex")}`
      }
    });
  });

  it("soft-deletes an owned channel and releases its active key", async () => {
    const updated = { ...record, version: 4, channels: [] };
    const transaction = {
      affiliateProfile: {
        findFirst: jest.fn().mockResolvedValueOnce(current).mockResolvedValueOnce(updated),
        updateMany: jest.fn().mockResolvedValue({ count: 1 })
      },
      affiliateProfileChannel: {
        findFirst: jest.fn().mockResolvedValue({ id: 71, profileId: 51 }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 })
      },
      auditLog: { create: jest.fn().mockResolvedValue({ id: 1 }) }
    };
    const client = {
      $transaction: jest.fn(async (callback) => callback(transaction))
    } as unknown as PrismaClient;
    const repository = new AffiliateProfileRepository(client);

    await repository.deleteChannel(7, 71, 3, {
      ...auditLog,
      action: "affiliate_profile.channel_deleted"
    });

    expect(transaction.affiliateProfileChannel.updateMany).toHaveBeenCalledWith({
      where: { id: 71, profileId: 51, deletedAt: null },
      data: { activeKey: null, deletedAt: expect.any(Date) }
    });
    expect(transaction.auditLog.create).toHaveBeenCalled();
  });

  it("maps an active-key uniqueness race to the public channel conflict", async () => {
    const transaction = {
      affiliateProfile: {
        findFirst: jest.fn().mockResolvedValue(current),
        updateMany: jest.fn()
      },
      affiliateProfileChannel: {
        count: jest.fn().mockResolvedValue(1),
        create: jest.fn().mockRejectedValue({ code: "P2002" })
      },
      auditLog: { create: jest.fn() }
    };
    const client = {
      $transaction: jest.fn(async (callback) => callback(transaction))
    } as unknown as PrismaClient;
    const repository = new AffiliateProfileRepository(client);

    await expect(
      repository.createChannel(
        7,
        3,
        {
          platform: "x",
          customLabel: null,
          homepageUrl: "https://x.com/needo",
          sortOrder: 0
        },
        auditLog
      )
    ).rejects.toMatchObject({
      message: "error.affiliate_profile.channel_conflict",
      statusCode: 409
    });
    expect(transaction.affiliateProfile.updateMany).not.toHaveBeenCalled();
  });

  it("rejects a stale profile version before any write", async () => {
    const transaction = {
      affiliateProfile: {
        findFirst: jest.fn().mockResolvedValue({ ...current, version: 4 }),
        updateMany: jest.fn()
      },
      auditLog: { create: jest.fn() }
    };
    const client = {
      $transaction: jest.fn(async (callback) => callback(transaction))
    } as unknown as PrismaClient;
    const repository = new AffiliateProfileRepository(client);

    await expect(repository.updateMine(7, 3, { bio: "stale" }, auditLog)).rejects.toMatchObject({
      message: "error.affiliate_profile.version_conflict"
    });
    expect(transaction.affiliateProfile.updateMany).not.toHaveBeenCalled();
    expect(transaction.auditLog.create).not.toHaveBeenCalled();
  });
});
