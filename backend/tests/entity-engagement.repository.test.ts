import {
  EntityEngagementRepository,
  type EntityTarget
} from "../src/repositories/entity-engagement.repository";

const target: EntityTarget = { targetType: "shop", publicId: "shop0000000001" };

describe("EntityEngagementRepository", () => {
  it("restores a historical favorite and returns the fresh aggregate count", async () => {
    const tx = {
      entityFavorite: {
        findFirst: jest.fn(async () => ({ id: 9, deletedAt: new Date("2026-01-01T00:00:00Z") })),
        update: jest.fn(async () => undefined),
        create: jest.fn(async () => undefined),
        count: jest.fn(async () => 12)
      }
    };
    const client = {
      shop: {
        findMany: jest.fn(async () => [{ id: 7, publicIdentifier: { publicId: "shop0000000001" } }])
      },
      technicianProfile: { findMany: jest.fn(async () => []) },
      $transaction: jest.fn(async (operation: (transaction: typeof tx) => unknown) => operation(tx))
    };
    const repository = new EntityEngagementRepository(client as never);

    await expect(repository.setFavorite(42, target, true)).resolves.toEqual({
      ...target,
      isFavorited: true,
      favoriteCount: 12
    });
    expect(tx.entityFavorite.update).toHaveBeenCalledWith({
      where: { id: 9 },
      data: { activeKey: "42:shop:7", deletedAt: null }
    });
    expect(tx.entityFavorite.create).not.toHaveBeenCalled();
  });

  it("makes repeated delete idempotent without creating a favorite", async () => {
    const tx = {
      entityFavorite: {
        findFirst: jest.fn(async () => null),
        update: jest.fn(async () => undefined),
        create: jest.fn(async () => undefined),
        count: jest.fn(async () => 5)
      }
    };
    const client = {
      shop: {
        findMany: jest.fn(async () => [{ id: 7, publicIdentifier: { publicId: "shop0000000001" } }])
      },
      technicianProfile: { findMany: jest.fn(async () => []) },
      $transaction: jest.fn(async (operation: (transaction: typeof tx) => unknown) => operation(tx))
    };
    const repository = new EntityEngagementRepository(client as never);

    await expect(repository.setFavorite(42, target, false)).resolves.toEqual({
      ...target,
      isFavorited: false,
      favoriteCount: 5
    });
    expect(tx.entityFavorite.update).not.toHaveBeenCalled();
    expect(tx.entityFavorite.create).not.toHaveBeenCalled();
  });

  it("batches status reads by target type instead of issuing one query per card", async () => {
    const client = {
      shop: {
        findMany: jest.fn(async () => [{ id: 7, publicIdentifier: { publicId: "shop0000000001" } }])
      },
      technicianProfile: {
        findMany: jest.fn(async () => [
          {
            id: 8,
            user: {
              identities: [{ publicIdentifier: { publicId: "s0000000001" } }]
            }
          }
        ])
      },
      entityFavorite: {
        findMany: jest.fn(async () => [{ shopId: 7, technicianProfileId: null }]),
        groupBy: jest
          .fn()
          .mockResolvedValueOnce([{ shopId: 7, _count: { _all: 4 } }])
          .mockResolvedValueOnce([{ technicianProfileId: 8, _count: { _all: 6 } }])
      }
    };
    const repository = new EntityEngagementRepository(client as never);

    await expect(
      repository.getFavoriteStatuses(42, [
        target,
        { targetType: "technician", publicId: "s0000000001" }
      ])
    ).resolves.toEqual([
      { ...target, isFavorited: true, favoriteCount: 4 },
      {
        targetType: "technician",
        publicId: "s0000000001",
        isFavorited: false,
        favoriteCount: 6
      }
    ]);
    expect(client.shop.findMany).toHaveBeenCalledTimes(1);
    expect(client.technicianProfile.findMany).toHaveBeenCalledTimes(1);
    expect(client.entityFavorite.findMany).toHaveBeenCalledTimes(1);
  });
});
