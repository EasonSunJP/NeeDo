import { MerchantProfileRepository } from "../src/repositories/merchant-profile.repository";

const now = new Date("2026-09-01T00:00:00.000Z");

function merchantRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: 61,
    userId: 9,
    identityId: 109,
    displayName: "佐藤 美咲",
    gender: "private",
    age: 29,
    heightCm: 163,
    languages: ["日本語", "中文"],
    bio: "商户负责人",
    visibility: "public",
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    identity: { publicIdentifier: { publicId: "b0000000109", status: "ACTIVE", deletedAt: null } },
    user: { avatarBootstrapUrl: null },
    ...overrides
  };
}

describe("MerchantProfileRepository identity scope", () => {
  it("reads only the exact user and merchant identity pair", async () => {
    const findFirst = jest.fn(async () => merchantRecord());
    const mediaFindFirst = jest.fn(async () => ({ url: "/media/merchant/avatar.webp" }));
    const repository = new MerchantProfileRepository({
      merchantIdentityProfile: { findFirst },
      mediaAsset: { findFirst: mediaFindFirst }
    } as never);

    await expect(repository.findMine(9, 109)).resolves.toMatchObject({
      id: 61,
      userId: 9,
      identityId: 109,
      publicId: "b0000000109",
      avatarUrl: "/media/merchant/avatar.webp",
      displayName: "佐藤 美咲"
    });
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 9, identityId: 109, deletedAt: null }
      })
    );
    expect(mediaFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          entityId: 61,
          entityType: "merchant_identity_profile",
          ownerIdentityId: 109,
          ownerUserId: 9,
          usageType: "avatar",
          isActive: true,
          deletedAt: null
        }
      })
    );
  });

  it("updates only the exact user and merchant identity pair", async () => {
    const findFirst = jest.fn(async () => merchantRecord());
    const update = jest.fn(async () => merchantRecord({ displayName: "美咲" }));
    const findUniqueOrThrow = jest.fn(async () => merchantRecord({ displayName: "美咲" }));
    const auditCreate = jest.fn(async () => ({ id: 1 }));
    const transaction = {
      merchantIdentityProfile: { findFirst, update, findUniqueOrThrow },
      mediaAsset: { findFirst: jest.fn(async () => null) },
      auditLog: { create: auditCreate }
    };
    const repository = new MerchantProfileRepository({
      $transaction: jest.fn(async (callback) => callback(transaction))
    } as never);

    await expect(
      repository.updateMine(
        9,
        109,
        { displayName: "美咲", languages: [] },
        {
          action: "merchant_profile.self_update",
          actorId: 9,
          ip: "127.0.0.1",
          metadata: { changedFields: ["displayName", "languages"] },
          targetId: 61,
          targetType: "merchant_identity_profile",
          userAgent: "jest"
        }
      )
    ).resolves.toMatchObject({ displayName: "美咲" });

    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 9, identityId: 109, deletedAt: null }
      })
    );
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 61 },
        data: expect.objectContaining({ displayName: "美咲", languages: [] })
      })
    );
    expect(auditCreate).toHaveBeenCalledTimes(1);
  });
});
