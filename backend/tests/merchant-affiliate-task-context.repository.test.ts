import { MerchantAffiliateTaskContextRepository } from "../src/repositories/merchant-affiliate-task-context.repository";

const now = new Date("2026-08-30T02:00:00.000Z");

const activePublicIdentifierFilter = {
  is: { kind: "SHOP", status: "ACTIVE", deletedAt: null }
};

const decimal = (value: number) => ({ toNumber: () => value });

describe("MerchantAffiliateTaskContextRepository", () => {
  it("paginates manageable merchant publishers and batches their shop counts", async () => {
    const client = {
      userRole: {
        findMany: jest.fn().mockResolvedValue([{ scopeId: 31 }])
      },
      merchantAccount: {
        findMany: jest.fn().mockResolvedValue([{ id: 31, name: "NeeDo Group" }]),
        count: jest.fn().mockResolvedValue(1)
      },
      merchantShopMembership: {
        groupBy: jest.fn().mockResolvedValue([{ merchantAccountId: 31, _count: { _all: 2 } }])
      }
    };
    const repository = new MerchantAffiliateTaskContextRepository(client as never);

    await expect(
      repository.listManageableMerchantPublishers({ userId: 7, offset: 0, limit: 20, now })
    ).resolves.toEqual({
      list: [
        {
          publisherType: "merchant_account",
          merchantAccountId: 31,
          shopId: null,
          publicId: null,
          displayName: "NeeDo Group",
          current: false,
          manageableShopCount: 2
        }
      ],
      total: 1
    });

    expect(client.userRole.findMany).toHaveBeenCalledWith({
      where: {
        userId: 7,
        deletedAt: null,
        scopeType: { in: ["merchant", "merchant_account"] },
        scopeId: { not: null },
        role: { deletedAt: null, code: { in: ["merchant_owner", "merchant_staff"] } }
      },
      select: { scopeId: true }
    });
    expect(client.merchantAccount.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          deletedAt: null,
          status: "active",
          OR: expect.arrayContaining([
            { ownerUserId: 7 },
            expect.objectContaining({ id: { in: [31] } })
          ])
        }),
        skip: 0,
        take: 20
      })
    );
    expect(client.merchantShopMembership.groupBy).toHaveBeenCalledTimes(1);
  });

  it("queries merchant shops through active memberships and batches service counts", async () => {
    const client = {
      merchantShopMembership: {
        findMany: jest.fn().mockResolvedValue([
          {
            shop: {
              id: 11,
              name: "Shibuya Shop",
              city: "Tokyo",
              publicIdentifier: { publicId: "shop0000000011" }
            }
          },
          {
            shop: {
              id: 12,
              name: "Shinjuku Shop",
              city: "Tokyo",
              publicIdentifier: { publicId: "shop0000000012" }
            }
          }
        ]),
        count: jest.fn().mockResolvedValue(2)
      },
      service: {
        groupBy: jest.fn().mockResolvedValue([
          { shopId: 11, _count: { _all: 3 } },
          { shopId: 12, _count: { _all: 1 } }
        ])
      }
    };
    const repository = new MerchantAffiliateTaskContextRepository(client as never);

    await expect(
      repository.listMerchantShops({ merchantAccountId: 31, page: 1, pageSize: 20, now })
    ).resolves.toEqual({
      list: [
        expect.objectContaining({ shopId: 11, publicId: "shop0000000011", activeServiceCount: 3 }),
        expect.objectContaining({ shopId: 12, publicId: "shop0000000012", activeServiceCount: 1 })
      ],
      total: 2,
      page: 1,
      page_size: 20
    });

    expect(client.merchantShopMembership.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          merchantAccountId: 31,
          activeKey: { not: null },
          deletedAt: null,
          shop: expect.objectContaining({
            deletedAt: null,
            publicIdentifier: activePublicIdentifierFilter
          })
        })
      })
    );
    expect(client.service.groupBy).toHaveBeenCalledTimes(1);
  });

  it("lists JPY services with formal shop IDs and converts Decimal prices", async () => {
    const client = {
      service: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 101,
            shopId: 11,
            name: "Cut",
            priceAmount: decimal(5_000),
            shop: {
              name: "Shibuya Shop",
              publicIdentifier: { publicId: "shop0000000011" }
            }
          }
        ]),
        count: jest.fn().mockResolvedValue(1)
      }
    };
    const repository = new MerchantAffiliateTaskContextRepository(client as never);

    await expect(repository.listServices({ shopIds: [11, 12], page: 1, pageSize: 20 })).resolves.toEqual({
      list: [
        {
          serviceId: 101,
          shopId: 11,
          serviceName: "Cut",
          priceJpy: 5_000,
          shopName: "Shibuya Shop",
          shopPublicId: "shop0000000011"
        }
      ],
      total: 1,
      page: 1,
      page_size: 20
    });

    expect(client.service.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          shopId: { in: [11, 12] },
          status: { in: ["active", "published"] },
          currency: "JPY",
          deletedAt: null,
          shop: expect.objectContaining({ publicIdentifier: activePublicIdentifierFilter })
        })
      })
    );
  });

  it("uses one shop query and one batched count query for the current shop", async () => {
    const client = {
      shop: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 11,
            name: "Shibuya Shop",
            city: "Tokyo",
            publicIdentifier: { publicId: "shop0000000011" }
          }
        ]),
        count: jest.fn().mockResolvedValue(1)
      },
      service: {
        groupBy: jest.fn().mockResolvedValue([{ shopId: 11, _count: { _all: 3 } }])
      }
    };
    const repository = new MerchantAffiliateTaskContextRepository(client as never);

    await repository.listCurrentShop({ shopId: 11, page: 1, pageSize: 20 });

    expect(client.shop.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ publicIdentifier: activePublicIdentifierFilter })
      })
    );
    expect(client.service.groupBy).toHaveBeenCalledTimes(1);
  });

  it("deduplicates a task page into one merchant query and one shop identifier query", async () => {
    const client = {
      merchantAccount: {
        findMany: jest.fn().mockResolvedValue([{ id: 31, name: "NeeDo Group" }])
      },
      shop: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 11,
            publicIdentifier: { publicId: "shop0000000011", kind: "SHOP", status: "ACTIVE", deletedAt: null }
          },
          { id: 12, publicIdentifier: null }
        ])
      }
    };
    const repository = new MerchantAffiliateTaskContextRepository(client as never);

    await expect(
      repository.findTaskDisplayResources({ merchantAccountIds: [31, 31], shopIds: [11, 12, 11] })
    ).resolves.toEqual({
      merchantAccounts: [{ id: 31, name: "NeeDo Group" }],
      shops: [
        { id: 11, publicId: "shop0000000011" },
        { id: 12, publicId: null }
      ]
    });

    expect(client.merchantAccount.findMany).toHaveBeenCalledTimes(1);
    expect(client.merchantAccount.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ id: { in: [31] } }) })
    );
    expect(client.shop.findMany).toHaveBeenCalledTimes(1);
    expect(client.shop.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: { in: [11, 12] }, deletedAt: null } })
    );
  });
});
