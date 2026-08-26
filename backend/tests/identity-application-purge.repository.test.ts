import type { PrismaClient } from "@prisma/client";
import { IdentityApplicationPurgeRepository } from "../src/repositories/identity-application-purge.repository";

const now = new Date("2026-09-25T05:00:00.000Z");
const retryBefore = new Date("2026-09-25T04:45:00.000Z");

describe("IdentityApplicationPurgeRepository", () => {
  it("lists only closed applications due at or before the exact retention boundary", async () => {
    const identityApplication = {
      findMany: jest.fn().mockResolvedValue([
        {
          id: 41,
          version: 3,
          media: [
            { mediaAsset: { url: "a".repeat(64) + ".jpg" } },
            { mediaAsset: { url: "b".repeat(64) + ".png" } }
          ]
        }
      ])
    };
    const repository = new IdentityApplicationPurgeRepository({
      identityApplication
    } as unknown as PrismaClient);

    await expect(repository.listDue({ now, retryBefore, limit: 25 })).resolves.toEqual([
      {
        applicationId: 41,
        version: 3,
        fileKeys: ["a".repeat(64) + ".jpg", "b".repeat(64) + ".png"]
      }
    ]);
    expect(identityApplication.findMany).toHaveBeenCalledWith({
      where: {
        status: { in: ["approved", "rejected", "withdrawn"] },
        purgeAt: { lte: now },
        purgedAt: null,
        deletedAt: null,
        OR: [{ purgeStartedAt: null }, { purgeStartedAt: { lte: retryBefore } }]
      },
      orderBy: [{ purgeAt: "asc" }, { id: "asc" }],
      take: 25,
      select: expect.any(Object)
    });
  });

  it("claims one version so rejected applications cannot be reopened during file deletion", async () => {
    const identityApplication = { updateMany: jest.fn().mockResolvedValue({ count: 1 }) };
    const repository = new IdentityApplicationPurgeRepository({
      identityApplication
    } as unknown as PrismaClient);

    await expect(
      repository.claim({ applicationId: 41, expectedVersion: 3, claimedAt: now, retryBefore })
    ).resolves.toBe(true);
    expect(identityApplication.updateMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        id: 41,
        version: 3,
        status: { in: ["approved", "rejected", "withdrawn"] },
        purgeAt: { lte: now },
        purgedAt: null
      }),
      data: { purgeStartedAt: now, version: { increment: 1 } }
    });
  });

  it("hard-deletes application payload/media, retains operational bank and legal evidence, and audits without IP", async () => {
    const tx = {
      identityApplication: {
        findFirst: jest.fn().mockResolvedValue({
          id: 41,
          userId: 7,
          type: "merchant",
          merchantDetail: { bankAccountId: 81 },
          media: [{ mediaAssetId: 101 }, { mediaAssetId: 102 }]
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 })
      },
      identityApplicationMedia: { deleteMany: jest.fn().mockResolvedValue({ count: 2 }) },
      mediaAsset: { deleteMany: jest.fn().mockResolvedValue({ count: 2 }) },
      technicianApplicationDetail: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
      merchantApplicationDetail: { deleteMany: jest.fn().mockResolvedValue({ count: 1 }) },
      protectedBankAccount: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
      auditLog: { create: jest.fn().mockResolvedValue({ id: 1 }) }
    };
    const client = {
      $transaction: jest.fn(async (callback: (transaction: typeof tx) => Promise<unknown>) =>
        callback(tx)
      )
    };
    const repository = new IdentityApplicationPurgeRepository(client as unknown as PrismaClient);

    await repository.complete({ applicationId: 41, claimedVersion: 4, purgedAt: now });

    expect(tx.identityApplicationMedia.deleteMany).toHaveBeenCalledWith({
      where: { applicationId: 41 }
    });
    expect(tx.mediaAsset.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: [101, 102] }, entityType: "identity_application", entityId: 41 }
    });
    expect(tx.merchantApplicationDetail.deleteMany).toHaveBeenCalledWith({
      where: { applicationId: 41 }
    });
    expect(tx.protectedBankAccount.deleteMany).toHaveBeenCalledWith({
      where: {
        id: 81,
        merchantApplications: { none: {} },
        settlementMerchantAccounts: { none: { deletedAt: null } }
      }
    });
    expect(tx.identityApplication.updateMany).toHaveBeenCalledWith({
      where: expect.objectContaining({ id: 41, version: 4, purgeStartedAt: { not: null } }),
      data: expect.objectContaining({
        purgedAt: now,
        purgeStartedAt: null,
        rejectionReason: null,
        version: { increment: 1 }
      })
    });
    expect(tx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actorId: null,
        action: "identity_application.private_data.purged",
        targetId: 41,
        ip: null,
        userAgent: null,
        metadata: {
          applicationId: 41,
          applicationType: "merchant",
          applicantUserId: 7,
          mediaCount: 2
        }
      })
    });
  });
});
