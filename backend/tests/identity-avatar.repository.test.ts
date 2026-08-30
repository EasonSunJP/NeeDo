import type { Prisma } from "@prisma/client";
import { persistIdentityAvatar } from "../src/repositories/identity-avatar.repository";

describe("persistIdentityAvatar", () => {
  it("claims the first account avatar as the immutable cross-identity baseline", async () => {
    const transaction = {
      mediaAsset: {
        create: jest.fn().mockResolvedValue({ id: 91 }),
        updateMany: jest.fn().mockResolvedValue({ count: 0 })
      },
      user: {
        update: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 })
      }
    } as unknown as Prisma.TransactionClient;
    const capturedAt = new Date("2026-08-30T12:00:00.000Z");

    await persistIdentityAvatar(transaction, {
      avatar: { mimeType: "image/png", url: "/media/avatars/first.png" },
      capturedAt,
      identityId: 19,
      source: { kind: "technician", profileId: 31 },
      userId: 9
    });

    expect(transaction.user.updateMany).toHaveBeenCalledWith({
      where: { avatarBootstrapUrl: null, id: 9 },
      data: {
        avatarBootstrappedAt: capturedAt,
        avatarBootstrapUrl: "/media/avatars/first.png",
        avatarUrl: "/media/avatars/first.png"
      }
    });
    expect(transaction.user.update).not.toHaveBeenCalled();
    expect(transaction.mediaAsset.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        entityId: 31,
        entityType: "technician_profile",
        ownerIdentityId: 19,
        ownerUserId: 9,
        technicianProfileId: 31,
        usageType: "avatar",
        url: "/media/avatars/first.png"
      })
    });
  });

  it("updates only the customer identity after the first avatar was established", async () => {
    const transaction = {
      mediaAsset: {
        create: jest.fn().mockResolvedValue({ id: 92 }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 })
      },
      user: {
        update: jest.fn().mockResolvedValue({ id: 9 }),
        updateMany: jest.fn().mockResolvedValue({ count: 0 })
      }
    } as unknown as Prisma.TransactionClient;

    await persistIdentityAvatar(transaction, {
      avatar: { mimeType: "image/jpeg", url: "/media/avatars/customer-later.jpg" },
      capturedAt: new Date("2026-08-30T13:00:00.000Z"),
      identityId: 17,
      source: { kind: "customer", profileId: 41 },
      userId: 9
    });

    expect(transaction.user.update).toHaveBeenCalledWith({
      where: { id: 9 },
      data: { avatarUrl: "/media/avatars/customer-later.jpg" }
    });
    expect(transaction.mediaAsset.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        customerProfileId: 41,
        entityId: 41,
        entityType: "customer_profile",
        ownerIdentityId: 17,
        ownerUserId: 9
      })
    });
  });

  it("updates only the shop identity after the first avatar was established", async () => {
    const transaction = {
      mediaAsset: {
        create: jest.fn().mockResolvedValue({ id: 93 }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 })
      },
      user: {
        update: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 0 })
      }
    } as unknown as Prisma.TransactionClient;

    await persistIdentityAvatar(transaction, {
      avatar: { mimeType: "image/webp", url: "/media/avatars/shop-later.webp" },
      capturedAt: new Date("2026-08-30T14:00:00.000Z"),
      identityId: 21,
      source: { kind: "shop", shopId: 3 },
      userId: 9
    });

    expect(transaction.user.update).not.toHaveBeenCalled();
    expect(transaction.mediaAsset.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        entityId: 3,
        entityType: "shop",
        ownerIdentityId: 21,
        ownerUserId: 9,
        shopId: 3
      })
    });
  });
});
