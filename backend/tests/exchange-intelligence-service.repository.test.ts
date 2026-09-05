import type { PrismaClient } from "@prisma/client";
import { ExchangeIntelligenceServiceRepository } from "../src/repositories/exchange-intelligence-service.repository";

const now = new Date("2026-09-05T09:00:00.000Z");

const shopService = {
  id: 501,
  name: "訪問ヘアセット",
  durationMinutes: 60,
  priceAmount: { toString: () => "12000.00" },
  currency: "JPY",
  serviceMode: "home",
  shop: {
    name: "青山ケア",
    city: "東京都",
    address: "港区青山1-1",
    publicIdentifier: { publicId: "shop00000011" }
  }
};

const technicianService = {
  id: 701,
  name: "着付け",
  durationMinutes: 90,
  priceAmount: 18000,
  currency: "JPY",
  shop: {
    name: "青山ケア",
    city: "東京都",
    address: "港区青山1-1",
    publicIdentifier: { publicId: "shop00000011" }
  },
  technicianProfile: {
    displayName: "山田 花子",
    serviceArea: "東京23区",
    serviceAreasJson: ["港区", "渋谷区"],
    user: {
      avatarUrl: "/media/hanako.jpg",
      identities: [{ publicIdentifier: { publicId: "s0000000081" } }]
    }
  }
};

describe("ExchangeIntelligenceServiceRepository", () => {
  it("lists only formal shop services in the current merchant shop with one eager query", async () => {
    const findMany = jest.fn(async () => [shopService]);
    const count = jest.fn(async () => 1);
    const repository = new ExchangeIntelligenceServiceRepository({
      service: { findMany, count }
    } as unknown as PrismaClient);

    await expect(
      repository.listOptions({
        scope: { kind: "merchant", shopId: 11 },
        page: 1,
        pageSize: 20,
        now
      })
    ).resolves.toEqual({
      list: [
        {
          serviceRef: "shop:501",
          ownerType: "shop",
          name: "訪問ヘアセット",
          durationMinutes: 60,
          catalogPriceJpy: 12000,
          currency: "JPY",
          serviceMode: "home",
          available: true,
          shop: {
            publicId: "shop00000011",
            name: "青山ケア",
            city: "東京都",
            address: "港区青山1-1"
          },
          technician: null
        }
      ],
      total: 1,
      page: 1,
      page_size: 20
    });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          shopId: 11,
          status: "published",
          deletedAt: null
        }),
        skip: 0,
        take: 20,
        orderBy: [{ sortOrder: "asc" }, { id: "asc" }]
      })
    );
    expect(count).toHaveBeenCalledTimes(1);
  });

  it("lists technician services only through a current active affiliation", async () => {
    const affiliationFindMany = jest.fn(async () => [{ shopId: 11 }]);
    const findMany = jest.fn(async () => [technicianService]);
    const count = jest.fn(async () => 1);
    const repository = new ExchangeIntelligenceServiceRepository({
      technicianShopAffiliation: { findMany: affiliationFindMany },
      technicianService: { findMany, count }
    } as unknown as PrismaClient);

    const result = await repository.listOptions({
      scope: { kind: "technician", technicianProfileId: 81 },
      page: 2,
      pageSize: 20,
      now
    });

    expect(result.list[0]).toEqual(
      expect.objectContaining({
        serviceRef: "technician:701",
        ownerType: "technician",
        technician: {
          publicId: "s0000000081",
          displayName: "山田 花子",
          avatarUrl: "/media/hanako.jpg",
          serviceArea: "東京23区",
          serviceAreas: ["港区", "渋谷区"]
        }
      })
    );
    expect(affiliationFindMany).toHaveBeenCalledWith({
      where: {
        technicianProfileId: 81,
        workStatus: "ACTIVE",
        activeKey: { not: null },
        startsAt: { lte: now },
        OR: [{ endsAt: null }, { endsAt: { gt: now } }],
        deletedAt: null,
        shop: {
          status: "published",
          deletedAt: null,
          publicIdentifier: { is: { kind: "SHOP", status: "ACTIVE", deletedAt: null } }
        }
      },
      select: { shopId: true },
      orderBy: [{ shopId: "asc" }, { id: "asc" }]
    });
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          technicianId: 81,
          shopId: { in: [11] },
          isActive: true,
          isBookable: true,
          reviewStatus: "APPROVED",
          deletedAt: null
        }),
        skip: 20,
        take: 20
      })
    );
  });
});
