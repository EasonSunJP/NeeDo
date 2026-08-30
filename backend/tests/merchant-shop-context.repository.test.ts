import { MerchantShopContextRepository } from "../src/repositories/merchant-shop-context.repository";

const NOW = new Date("2026-08-31T03:00:00.000Z");

describe("MerchantShopContextRepository", () => {
  it("lists only active merchant-account memberships with stable pagination and public fields", async () => {
    const count = jest.fn(async () => 3);
    const findMany = jest.fn(async () => [
      {
        shop: {
          name: "Tokyo First",
          city: "Tokyo",
          status: "published",
          publicIdentifier: { publicId: "shop0000000001" }
        }
      },
      {
        shop: {
          name: "Osaka Second",
          city: "Osaka",
          status: "active",
          publicIdentifier: { publicId: "shop0000000002" }
        }
      }
    ]);
    const client = {
      $transaction: jest.fn(async (callback: (transaction: unknown) => Promise<unknown>) =>
        callback({ merchantShopMembership: { count, findMany } })
      )
    };
    const repository = new MerchantShopContextRepository(client as never);

    const result = await repository.listManageableShops({
      identityScopeType: "merchant_account",
      identityScopeId: 41,
      selectedShopPublicId: "shop0000000002",
      now: NOW,
      page: 2,
      pageSize: 2
    });

    const activeWhere = {
      merchantAccountId: 41,
      activeKey: { not: null },
      startsAt: { lte: NOW },
      OR: [{ endsAt: null }, { endsAt: { gt: NOW } }],
      deletedAt: null,
      merchantAccount: { is: { status: "active", deletedAt: null } },
      shop: {
        is: {
          status: { in: ["active", "published"] },
          deletedAt: null,
          publicIdentifier: { is: { status: "ACTIVE", deletedAt: null } }
        }
      }
    };
    expect(count).toHaveBeenCalledWith({ where: activeWhere });
    expect(findMany).toHaveBeenCalledWith({
      where: activeWhere,
      orderBy: [{ startsAt: "asc" }, { id: "asc" }],
      skip: 2,
      take: 2,
      select: {
        shop: {
          select: {
            name: true,
            city: true,
            status: true,
            publicIdentifier: { select: { publicId: true } }
          }
        }
      }
    });
    expect(result).toEqual({
      list: [
        {
          publicId: "shop0000000001",
          name: "Tokyo First",
          city: "Tokyo",
          status: "published",
          selected: false
        },
        {
          publicId: "shop0000000002",
          name: "Osaka Second",
          city: "Osaka",
          status: "active",
          selected: true
        }
      ],
      total: 3,
      page: 2,
      page_size: 2
    });
    expect(JSON.stringify(result)).not.toMatch(/shopId|merchantAccountId|membershipId|numberPart/);
  });

  it("limits a direct shop identity to its own active shop without a merchant-account relation", async () => {
    const findFirst = jest.fn(async () => ({
      name: "Own Shop",
      city: "Tokyo",
      status: "active",
      publicIdentifier: { publicId: "shop0000000007" }
    }));
    const repository = new MerchantShopContextRepository({ shop: { findFirst } } as never);

    const result = await repository.listManageableShops({
      identityScopeType: "shop",
      identityScopeId: 7,
      selectedShopPublicId: null,
      now: NOW,
      page: 1,
      pageSize: 20
    });

    expect(findFirst).toHaveBeenCalledWith({
      where: {
        id: 7,
        status: { in: ["active", "published"] },
        deletedAt: null,
        publicIdentifier: { is: { status: "ACTIVE", deletedAt: null } }
      },
      select: {
        name: true,
        city: true,
        status: true,
        publicIdentifier: { select: { publicId: true } }
      }
    });
    expect(result).toEqual({
      list: [
        {
          publicId: "shop0000000007",
          name: "Own Shop",
          city: "Tokyo",
          status: "active",
          selected: true
        }
      ],
      total: 1,
      page: 1,
      page_size: 20
    });
  });

  it("resolves a requested or deterministic default shop only through an active relation", async () => {
    const findFirst = jest
      .fn()
      .mockResolvedValueOnce({ shop: { id: 12, publicIdentifier: { publicId: "shop0000000002" } } })
      .mockResolvedValueOnce({ shop: { id: 11, publicIdentifier: { publicId: "shop0000000001" } } })
      .mockResolvedValueOnce(null);
    const repository = new MerchantShopContextRepository({
      merchantShopMembership: { findFirst }
    } as never);

    await expect(
      repository.resolveShop({
        merchantAccountId: 41,
        shopPublicId: "shop0000000002",
        now: NOW
      })
    ).resolves.toEqual({ shopId: 12, shopPublicId: "shop0000000002" });
    await expect(
      repository.resolveDefaultShop({ merchantAccountId: 41, now: NOW })
    ).resolves.toEqual({ shopId: 11, shopPublicId: "shop0000000001" });
    await expect(
      repository.resolveShop({
        merchantAccountId: 99,
        shopPublicId: "shop0000000002",
        now: NOW
      })
    ).resolves.toBeNull();

    const activeRelationWhere = {
      merchantAccountId: 41,
      activeKey: { not: null },
      startsAt: { lte: NOW },
      OR: [{ endsAt: null }, { endsAt: { gt: NOW } }],
      deletedAt: null,
      merchantAccount: { is: { status: "active", deletedAt: null } },
      shop: {
        is: {
          status: { in: ["active", "published"] },
          deletedAt: null,
          publicIdentifier: { is: { status: "ACTIVE", deletedAt: null } }
        }
      }
    };
    expect(findFirst.mock.calls[0][0]).toEqual({
      where: {
        ...activeRelationWhere,
        shop: {
          is: {
            ...activeRelationWhere.shop.is,
            publicIdentifier: {
              is: {
                publicId: "shop0000000002",
                status: "ACTIVE",
                deletedAt: null
              }
            }
          }
        }
      },
      select: {
        shop: { select: { id: true, publicIdentifier: { select: { publicId: true } } } }
      }
    });
    expect(findFirst.mock.calls[1][0]).toEqual({
      where: activeRelationWhere,
      orderBy: [{ startsAt: "asc" }, { id: "asc" }],
      select: {
        shop: { select: { id: true, publicIdentifier: { select: { publicId: true } } } }
      }
    });
  });
});
