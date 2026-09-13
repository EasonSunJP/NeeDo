import type { PrismaClient } from "@prisma/client";
import {
  ShopVisibilityRepository,
  type ShopVisibilityViewer
} from "../src/repositories/shop-visibility.repository";

const viewer: ShopVisibilityViewer = {
  userId: 900,
  identityId: 901,
  identityType: "customer",
  identityScopeType: "customer_profile",
  identityScopeId: 902
};

const shop = {
  id: 21,
  ownerUserId: 100,
  visibility: "network"
};

const createClient = () => ({
  shop: {
    findFirst: jest.fn(async (): Promise<typeof shop | null> => shop)
  },
  userIdentity: {
    findMany: jest.fn(async (): Promise<Array<{ scopeId: number | null }>> => [])
  }
});

describe("ShopVisibilityRepository", () => {
  it("builds a closed anonymous filter and selected-identity relationship filter", async () => {
    const repository = new ShopVisibilityRepository(createClient() as unknown as PrismaClient);

    await expect(repository.buildVisibilityWhere()).resolves.toEqual({ visibility: "public" });
    await expect(repository.buildVisibilityWhere(viewer)).resolves.toEqual(
      expect.objectContaining({
        OR: expect.arrayContaining([
          { visibility: "public" },
          { ownerUserId: viewer.userId },
          expect.objectContaining({
            visibility: "network",
            OR: expect.arrayContaining([
              {
                customerMemberships: {
                  some: {
                    customerProfileId: viewer.identityScopeId,
                    status: "ACTIVE",
                    activeKey: { not: null },
                    endedAt: null,
                    deletedAt: null
                  }
                }
              }
            ])
          })
        ])
      })
    );
  });

  it("allows public shops anonymously and privateAll only to the owner", async () => {
    const client = createClient();
    const repository = new ShopVisibilityRepository(client as unknown as PrismaClient);

    client.shop.findFirst.mockResolvedValueOnce({ ...shop, visibility: "public" });
    await expect(repository.canView(shop.id)).resolves.toBe(true);

    client.shop.findFirst.mockResolvedValueOnce(null);
    await expect(repository.canView(shop.id, viewer)).resolves.toBe(false);

    client.shop.findFirst.mockResolvedValueOnce({ ...shop, visibility: "privateAll" });
    await expect(repository.canView(shop.id, { ...viewer, userId: shop.ownerUserId })).resolves.toBe(
      true
    );
    expect(client.shop.findFirst).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: shop.id,
          status: "published",
          deletedAt: null,
          OR: expect.arrayContaining([{ ownerUserId: shop.ownerUserId }])
        })
      })
    );
  });

  it("uses exact shop-scoped reciprocal friend identities for limited visibility", async () => {
    const client = createClient();
    client.userIdentity.findMany
      .mockResolvedValueOnce([{ scopeId: shop.id }])
      .mockResolvedValueOnce([]);
    client.shop.findFirst.mockResolvedValue({ ...shop, visibility: "limited" });
    const repository = new ShopVisibilityRepository(client as unknown as PrismaClient);

    await expect(repository.canView(shop.id, viewer)).resolves.toBe(true);
    expect(client.userIdentity.findMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: expect.objectContaining({
          scopeType: "shop",
          scopeId: { not: null },
          ownedContacts: expect.any(Object),
          contactTargets: expect.any(Object)
        }),
        select: { scopeId: true }
      })
    );
    expect(client.shop.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: shop.id,
          OR: expect.arrayContaining([
            { visibility: { in: ["limited", "network"] }, id: { in: [shop.id] } }
          ])
        })
      })
    );
  });

  it("does not let a relationship with another owner shop unlock the target shop", async () => {
    const client = createClient();
    client.userIdentity.findMany
      .mockResolvedValueOnce([{ scopeId: 22 }])
      .mockResolvedValueOnce([]);
    client.shop.findFirst.mockResolvedValue(null);
    const repository = new ShopVisibilityRepository(client as unknown as PrismaClient);

    await expect(repository.canView(shop.id, viewer)).resolves.toBe(false);
    expect(client.shop.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: shop.id,
          OR: expect.arrayContaining([
            { visibility: { in: ["limited", "network"] }, id: { in: [22] } }
          ])
        })
      })
    );
  });

  it("embeds active customer and technician relationships only in network predicates", async () => {
    const client = createClient();
    client.shop.findFirst.mockResolvedValue({ ...shop, visibility: "network" });
    const repository = new ShopVisibilityRepository(client as unknown as PrismaClient);
    const technicianViewer = {
      ...viewer,
      identityType: "technician",
      identityScopeType: "technician_profile",
      identityScopeId: 134
    };

    await expect(repository.canView(shop.id, technicianViewer)).resolves.toBe(true);
    expect(client.shop.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: expect.arrayContaining([
            expect.objectContaining({
              visibility: "network",
              OR: expect.arrayContaining([
                {
                  technicianShopAffiliations: {
                    some: expect.objectContaining({ technicianProfileId: 134 })
                  }
                }
              ])
            })
          ])
        })
      })
    );
  });

  it("uses the same published nondeleted predicate for direct target checks", async () => {
    const client = createClient();
    client.shop.findFirst.mockResolvedValue(null);
    const repository = new ShopVisibilityRepository(client as unknown as PrismaClient);

    await expect(repository.canViewTarget(shop, viewer)).resolves.toBe(false);
    expect(client.shop.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: shop.id, status: "published", deletedAt: null })
      })
    );
  });

  it("updates the visibility and writes its audit record in one transaction", async () => {
    const updatedAt = new Date("2026-09-13T15:00:00.000Z");
    const updateMany = jest.fn(async () => ({ count: 1 }));
    const findUnique = jest
      .fn()
      .mockResolvedValueOnce({ id: shop.id, visibility: "public" as const })
      .mockResolvedValueOnce({
        id: shop.id,
        visibility: "privateAll" as const,
        visibilityUpdatedAt: updatedAt,
        visibilityUpdatedBy: viewer.userId
      });
    const auditCreate = jest.fn(async () => ({ id: 1 }));
    const transaction = {
      shop: { updateMany, findUnique },
      auditLog: { create: auditCreate }
    };
    const client = {
      ...createClient(),
      $transaction: jest.fn(async (work: (tx: typeof transaction) => Promise<unknown>) =>
        work(transaction)
      )
    };
    const repository = new ShopVisibilityRepository(client as unknown as PrismaClient);

    await expect(
      repository.updateVisibility({
        shopId: shop.id,
        visibility: "privateAll",
        actorUserId: viewer.userId,
        updatedAt,
        auditLog: {
          actorId: viewer.userId,
          action: "merchant_admin.shop.visibility.update",
          targetType: "shop",
          targetId: shop.id,
          ip: "127.0.0.1",
          userAgent: "jest",
          metadata: { previousVisibility: "public", nextVisibility: "privateAll" }
        }
      })
    ).resolves.toEqual({
      shopId: shop.id,
      visibility: "privateAll",
      updatedAt,
      updatedBy: viewer.userId
    });
    expect(client.$transaction).toHaveBeenCalledTimes(1);
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: shop.id, deletedAt: null },
      data: {
        visibility: "privateAll",
        visibilityUpdatedAt: updatedAt,
        visibilityUpdatedBy: viewer.userId
      }
    });
    expect(auditCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actorId: viewer.userId,
        action: "merchant_admin.shop.visibility.update",
        targetType: "shop",
        targetId: shop.id,
        metadata: {
          previousVisibility: "public",
          nextVisibility: "privateAll"
        }
      })
    });
  });
});
