import type { PrismaClient } from "@prisma/client";
import { BackofficeRepository } from "../src/repositories/backoffice.repository";

describe("BackofficeRepository technician primary shop", () => {
  it("rejects a primary display shop that has no formal technician affiliation", async () => {
    const client = {
      technicianProfile: {
        findFirst: jest.fn().mockResolvedValue({ id: 47, shopId: null }),
        update: jest.fn()
      },
      shop: { findFirst: jest.fn().mockResolvedValue({ id: 16 }) },
      technicianShopAffiliation: { findFirst: jest.fn().mockResolvedValue(null) }
    } as unknown as PrismaClient;
    const repository = new BackofficeRepository(client);

    await repository
      .updateTechnician({
        scope: "platform",
        technicianId: 47,
        shopId: 16
      })
      .catch(() => null);
    expect(client.technicianShopAffiliation.findFirst).toHaveBeenCalledWith({
      where: expect.objectContaining({
        technicianProfileId: 47,
        shopId: 16,
        activeKey: { not: null },
        workStatus: "ACTIVE",
        deletedAt: null
      }),
      select: { id: true }
    });
    expect(client.technicianProfile.update).not.toHaveBeenCalled();
  });

  it("does not activate a technician for a shop without a formal affiliation", async () => {
    const tx = {
      technicianProfile: {
        findFirst: jest.fn().mockResolvedValue({ id: 47, userId: 7, shopId: null }),
        update: jest.fn()
      },
      shop: { findFirst: jest.fn().mockResolvedValue({ id: 16 }) },
      technicianShopAffiliation: { findFirst: jest.fn().mockResolvedValue(null) },
      user: { update: jest.fn() },
      userIdentity: { updateMany: jest.fn() }
    };
    const client = {
      $transaction: jest.fn(async (callback: (database: typeof tx) => unknown) => callback(tx))
    } as unknown as PrismaClient;
    const repository = new BackofficeRepository(client);

    await expect(
      repository.approveTechnician({
        scope: "platform",
        technicianId: 47,
        shopId: 16,
        approvedAt: new Date("2026-09-13T00:00:00.000Z")
      })
    ).rejects.toMatchObject({ message: "error.technician.primary_shop_requires_affiliation" });
    expect(tx.technicianProfile.update).not.toHaveBeenCalled();
    expect(tx.userIdentity.updateMany).not.toHaveBeenCalled();
  });
});
