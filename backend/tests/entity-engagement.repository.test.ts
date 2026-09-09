import {
  EntityEngagementRepository,
  type EntityTarget
} from "../src/repositories/entity-engagement.repository";

const target: EntityTarget = { targetType: "shop", publicId: "shop0000000001" };

describe("EntityEngagementRepository", () => {
  it.each([
    ["service", "11111111-1111-4111-8111-111111111111", "serviceId", 17],
    ["technician_service", "22222222-2222-4222-8222-222222222222", "technicianServiceId", 18]
  ] as const)(
    "persists a formal %s favorite target",
    async (targetType, publicId, targetIdKey, targetId) => {
      const serviceTarget = { targetType, publicId } as unknown as EntityTarget;
      const tx = {
        entityFavorite: {
          findFirst: jest.fn(async () => null),
          update: jest.fn(async () => undefined),
          create: jest.fn(async () => undefined),
          count: jest.fn(async () => 1)
        }
      };
      const client = {
        shop: { findMany: jest.fn(async () => []) },
        technicianProfile: { findMany: jest.fn(async () => []) },
        service: {
          findMany: jest.fn(async () =>
            targetType === "service" ? [{ id: targetId, publicId }] : []
          )
        },
        technicianService: {
          findMany: jest.fn(async () =>
            targetType === "technician_service" ? [{ id: targetId, publicId }] : []
          )
        },
        $transaction: jest.fn(async (operation: (transaction: typeof tx) => unknown) =>
          operation(tx)
        )
      };
      const repository = new EntityEngagementRepository(client as never);

      await expect(repository.setFavorite(42, serviceTarget, true)).resolves.toEqual({
        ...serviceTarget,
        isFavorited: true,
        favoriteCount: 1
      });
      expect(tx.entityFavorite.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 42,
          activeKey: `42:${targetType}:${targetId}`,
          [targetIdKey]: targetId
        })
      });
    }
  );

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

  it("counts a successful system share once for a repeated idempotency key", async () => {
    const event = {
      id: 21,
      requestFingerprint: "same-fingerprint",
      messageId: null
    };
    const tx = {
      entityShareEvent: {
        findUnique: jest.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(event),
        create: jest.fn(async () => event),
        count: jest.fn(async () => 9)
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
    const input = {
      actorUserId: 42,
      actorIdentityId: 10,
      target,
      idempotencyKey: "d295f424-8be2-4a8a-a465-1eb538129bb3",
      requestFingerprint: "same-fingerprint"
    };

    await expect(repository.recordSystemShare(input)).resolves.toMatchObject({
      status: "created",
      receipt: { ...target, shareCount: 9, replayed: false, messageId: null }
    });
    await expect(repository.recordSystemShare(input)).resolves.toMatchObject({
      status: "replayed",
      receipt: { ...target, shareCount: 9, replayed: true, messageId: null }
    });
    expect(tx.entityShareEvent.create).toHaveBeenCalledTimes(1);
  });

  it("rejects an idempotency key reused for a different system-share payload", async () => {
    const tx = {
      entityShareEvent: {
        findUnique: jest.fn(async () => ({
          id: 21,
          requestFingerprint: "previous-fingerprint",
          messageId: null
        })),
        create: jest.fn(),
        count: jest.fn()
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

    await expect(
      repository.recordSystemShare({
        actorUserId: 42,
        actorIdentityId: 10,
        target,
        idempotencyKey: "d295f424-8be2-4a8a-a465-1eb538129bb3",
        requestFingerprint: "different-fingerprint"
      })
    ).resolves.toEqual({ status: "idempotency_conflict" });
    expect(tx.entityShareEvent.create).not.toHaveBeenCalled();
  });
});
