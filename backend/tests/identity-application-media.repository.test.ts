import type { PrismaClient } from "@prisma/client";
import { IdentityApplicationMediaRepository } from "../src/repositories/identity-application-media.repository";

const now = new Date("2026-08-26T05:00:00.000Z");

describe("IdentityApplicationMediaRepository", () => {
  it("increments the editable snapshot version and attaches private media atomically", async () => {
    const tx = {
      identityApplication: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      mediaAsset: {
        create: jest.fn().mockResolvedValue({ id: 101, mimeType: "image/png", createdAt: now })
      },
      identityApplicationMedia: { create: jest.fn().mockResolvedValue({ id: 111 }) },
      auditLog: { create: jest.fn().mockResolvedValue({ id: 121 }) }
    };
    const client = {
      $transaction: jest.fn(async (callback: (database: typeof tx) => unknown) => callback(tx))
    } as unknown as PrismaClient;
    const repository = new IdentityApplicationMediaRepository(client);

    await expect(
      repository.attachInTransaction({
        applicationId: 41,
        userId: 7,
        expectedVersion: 2,
        purpose: "portrait",
        fileKey: "a".repeat(64) + ".png",
        mimeType: "image/png",
        checksumSha256: "b".repeat(64),
        createdAt: now
      })
    ).resolves.toMatchObject({ id: 101, applicationVersion: 3 });
    expect(tx.identityApplication.updateMany).toHaveBeenCalledWith({
      where: {
        id: 41,
        userId: 7,
        version: 2,
        status: { in: ["draft", "rejected"] },
        deletedAt: null
      },
      data: { version: { increment: 1 } }
    });
    expect(tx.mediaAsset.create).toHaveBeenCalledWith({
      data: {
        entityType: "identity_application",
        entityId: 41,
        ownerUserId: 7,
        url: "a".repeat(64) + ".png",
        mimeType: "image/png",
        usageType: "identity_application_private",
        checksumSha256: "b".repeat(64),
        isActive: true,
        createdAt: now
      }
    });
    expect(tx.auditLog.create).toHaveBeenCalledWith({
      data: {
        actorId: 7,
        action: "identity_application.media.uploaded",
        targetType: "MediaAsset",
        targetId: 101,
        ip: null,
        userAgent: null,
        metadata: {
          applicationId: 41,
          mediaAssetId: 101,
          purpose: "portrait",
          mimeType: "image/png",
          version: 3
        },
        createdAt: now
      }
    });
  });
});
