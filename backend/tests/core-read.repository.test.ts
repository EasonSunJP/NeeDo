import { CoreReadRepository } from "../src/repositories/core-read.repository";

const now = new Date("2026-08-31T00:00:00.000Z");

const activeShopIdentifier = {
  id: 11,
  publicId: "shop5831047296",
  numberPart: "5831047296",
  kind: "SHOP",
  userIdentityId: null,
  shopId: 21,
  merchantAccountId: null,
  customerSupportAccountId: null,
  loginAllowed: false,
  searchable: true,
  status: "ACTIVE",
  createdAt: now,
  updatedAt: now,
  deletedAt: null
};

const activeTechnicianIdentifier = {
  ...activeShopIdentifier,
  id: 12,
  publicId: "s5831047296",
  kind: "S",
  userIdentityId: 31,
  shopId: null
};

const inactiveTechnicianIdentifier = {
  ...activeTechnicianIdentifier,
  id: 13,
  publicId: "s0000000001",
  numberPart: "0000000001",
  status: "RETIRED"
};

const publishedShopWithoutServices = {
  id: 21,
  name: "LifeDance Wellness 渋谷",
  city: "Tokyo",
  address: "1-2-3 Shibuya",
  mediaAssets: [],
  publicIdentifier: activeShopIdentifier,
  reviewSummary: null
};

const publishedTechnicianWithoutServices = {
  id: 41,
  displayName: "橘 ひかり",
  city: "Tokyo",
  baseLatitude: { toString: () => "35.6762000" },
  baseLongitude: { toString: () => "139.6503000" },
  mediaAssets: [],
  reviewSummary: null,
  user: {
    avatarBootstrapUrl: null,
    identities: [
      { publicIdentifier: inactiveTechnicianIdentifier },
      { publicIdentifier: activeTechnicianIdentifier }
    ]
  }
};

function createRepositoryFixture() {
  const shopFindMany = jest.fn(async () => [publishedShopWithoutServices]);
  const shopCount = jest.fn(async () => 1);
  const technicianFindMany = jest.fn(async () => [publishedTechnicianWithoutServices]);
  const technicianCount = jest.fn(async () => 1);
  const serviceFindMany = jest.fn(async () => []);
  const serviceCount = jest.fn(async () => 0);
  const repository = new CoreReadRepository({
    shop: { findMany: shopFindMany, count: shopCount },
    technicianProfile: { findMany: technicianFindMany, count: technicianCount },
    service: { findMany: serviceFindMany, count: serviceCount }
  } as never);

  return {
    repository,
    serviceFindMany,
    shopFindMany,
    technicianFindMany
  };
}

describe("CoreReadRepository multi-entity search", () => {
  it("searches published shops directly without requiring a service", async () => {
    const fixture = createRepositoryFixture();

    await expect(fixture.repository.searchShops({
      entityType: "shop",
      keywords: ["LifeDance Wellness 渋谷"],
      categoryIds: [],
      page: 1,
      pageSize: 20
    })).resolves.toMatchObject({
      list: [{ name: "LifeDance Wellness 渋谷", publicId: "shop5831047296" }],
      total: 1
    });

    expect(fixture.shopFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        deletedAt: null,
        status: "published",
        publicIdentifier: {
          is: expect.objectContaining({ kind: "SHOP", status: "ACTIVE", deletedAt: null })
        },
        OR: expect.arrayContaining([
          { name: { contains: "LifeDance Wellness 渋谷" } }
        ])
      }),
      skip: 0,
      take: 20
    }));
  });

  it("searches published technicians directly without requiring a service", async () => {
    const fixture = createRepositoryFixture();

    const result = await fixture.repository.searchTechnicians({
      entityType: "technician",
      keywords: ["ひかり"],
      categoryIds: [],
      page: 1,
      pageSize: 20
    });
    expect(result).toMatchObject({
      list: [{ displayName: "橘 ひかり", publicId: "s5831047296" }],
      total: 1
    });
    expect(result.list[0]).not.toHaveProperty("baseLatitude");
    expect(result.list[0]).not.toHaveProperty("baseLongitude");
    expect(result.list[0]).not.toHaveProperty("serviceBase");

    expect(fixture.technicianFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        deletedAt: null,
        status: "published",
        user: {
          identities: {
            some: expect.objectContaining({ deletedAt: null, isActive: true })
          }
        },
        OR: expect.arrayContaining([{ displayName: { contains: "ひかり" } }])
      }),
      include: expect.objectContaining({
        user: {
          select: expect.objectContaining({
            identities: expect.objectContaining({
              where: expect.objectContaining({
                deletedAt: null,
                isActive: true,
                publicIdentifier: {
                  is: expect.objectContaining({
                    kind: "S",
                    status: "ACTIVE",
                    deletedAt: null
                  })
                }
              })
            })
          })
        }
      }),
      skip: 0,
      take: 20
    }));
  });

  it("does not expose a soft-deleted technician attached to a published service", async () => {
    const unpublishedTechnician = {
      ...publishedTechnicianWithoutServices,
      status: "published",
      deletedAt: now
    };
    const service = {
      id: 61,
      publicId: "83b6d591-d7ca-4ca0-b975-7a44363e1f3a",
      categoryId: 3,
      shopId: 21,
      technicianProfileId: unpublishedTechnician.id,
      name: "Private recovery",
      description: null,
      city: "Tokyo",
      serviceMode: "store",
      priceAmount: 8800,
      currency: "JPY",
      durationMinutes: 60,
      status: "published",
      isRecommended: false,
      sortOrder: 0,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      category: {
        id: 3,
        code: "wellness",
        name: "Wellness",
        nameJa: "ウェルネス",
        nameEn: "Wellness",
        parentId: null,
        iconUrl: null,
        sortOrder: 0,
        isActive: true,
        createdAt: now,
        updatedAt: now,
        deletedAt: null
      },
      shop: {
        ...publishedShopWithoutServices,
        shopNo: null,
        ownerUserId: null,
        description: null,
        latitude: null,
        longitude: null,
        phone: null,
        status: "published",
        isRecommended: false,
        pricingMode: "MERCHANT",
        technicianPricingRatePercent: 100,
        pricingModeUpdatedAt: null,
        pricingModeUpdatedBy: null,
        createdAt: now,
        updatedAt: now,
        deletedAt: null
      },
      technicianProfile: unpublishedTechnician,
      mediaAssets: [],
      reviewSummary: null
    };
    const repository = new CoreReadRepository({
      service: {
        findMany: jest.fn(async () => [service]),
        count: jest.fn(async () => 1)
      }
    } as never);

    await expect(repository.search({
      entityType: "service",
      keywords: ["recovery"],
      categoryIds: [],
      page: 1,
      pageSize: 20
    })).resolves.toMatchObject({
      list: [{ technician: null }]
    });
  });

  it("combines keywords and category IDs as one OR group", async () => {
    const fixture = createRepositoryFixture();

    await fixture.repository.search({
      entityType: "service",
      keywords: ["massage", "家政"],
      categoryIds: [3, 9],
      page: 1,
      pageSize: 20
    });

    expect(fixture.serviceFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        OR: expect.arrayContaining([
          { name: { contains: "massage" } },
          { name: { contains: "家政" } },
          { categoryId: { in: [3, 9] } }
        ])
      })
    }));
  });
});
