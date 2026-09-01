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
  reviewSummary: null,
  _count: {
    entityFavorites: 1540,
    entityShareEvents: 29
  },
  serviceCategorySelections: [
    {
      category: {
        id: 2,
        code: "wellness",
        translations: [{ name: "リラクゼーション" }]
      }
    }
  ],
  businessKeywordSelections: [
    {
      businessKeyword: {
        id: 21,
        code: "wellness_spa",
        categoryId: 2,
        translations: [{ label: "スパケア" }]
      }
    }
  ]
};

const publishedTechnicianWithoutServices = {
  id: 41,
  displayName: "橘 ひかり",
  city: "Tokyo",
  age: 25,
  baseLatitude: { toString: () => "35.6762000" },
  baseLongitude: { toString: () => "139.6503000" },
  mediaAssets: [],
  reviewSummary: null,
  performanceSummary: {
    completedOrderCount: 1280,
    acceptanceRateBps: 9800,
    deletedAt: null
  },
  technicianServices: [
    {
      id: 71,
      name: "肩颈调理",
      priceAmount: 8800,
      currency: "JPY",
      durationMinutes: 60
    }
  ],
  _count: {
    entityFavorites: 154,
    entityShareEvents: 8
  },
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
  const technicianFindMany = jest.fn(
    async (): Promise<Array<Record<string, unknown>>> => [publishedTechnicianWithoutServices]
  );
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
    technicianFindMany,
    technicianCount
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
      list: [{
        name: "LifeDance Wellness 渋谷",
        publicId: "shop5831047296",
        favoriteCount: 1540,
        shareCount: 29,
        serviceCategories: [{ code: "wellness", label: "リラクゼーション" }],
        businessKeywords: [{ code: "wellness_spa", label: "スパケア" }]
      }],
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
          { name: { contains: "LifeDance Wellness 渋谷" } },
          {
            serviceCategorySelections: {
              some: expect.objectContaining({ deletedAt: null })
            }
          },
          {
            businessKeywordSelections: {
              some: expect.objectContaining({ deletedAt: null })
            }
          }
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
      list: [{
        displayName: "橘 ひかり",
        publicId: "s5831047296",
        age: 25,
        favoriteCount: 154,
        shareCount: 8,
        completedOrderCount: 1280,
        acceptanceRatePercent: 98,
        primaryService: {
          id: 71,
          name: "肩颈调理",
          priceAmount: "8800",
          currency: "JPY",
          durationMinutes: 60
        }
      }],
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
        _count: {
          select: {
            entityFavorites: { where: { deletedAt: null } },
            entityShareEvents: { where: { deletedAt: null } }
          }
        },
        performanceSummary: true,
        technicianServices: expect.objectContaining({
          where: {
            deletedAt: null,
            isActive: true,
            isBookable: true,
            reviewStatus: "APPROVED"
          },
          orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
          take: 1
        }),
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

  it("defaults absent technician performance and primary service without inventing metrics", async () => {
    const fixture = createRepositoryFixture();
    fixture.technicianFindMany.mockResolvedValueOnce([
      {
        ...publishedTechnicianWithoutServices,
        age: null,
        performanceSummary: null,
        technicianServices: [],
        _count: { entityFavorites: 0, entityShareEvents: 0 }
      }
    ]);

    await expect(fixture.repository.searchTechnicians({
      entityType: "technician",
      keywords: ["ひかり"],
      categoryIds: [],
      page: 1,
      pageSize: 20
    })).resolves.toMatchObject({
      list: [{
        age: null,
        favoriteCount: 0,
        shareCount: 0,
        completedOrderCount: 0,
        acceptanceRatePercent: 100,
        primaryService: null
      }]
    });
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

  it("counts only searchable technicians that have an eligible public location", async () => {
    const fixture = createRepositoryFixture();

    await expect(fixture.repository.countEligibleLocatedTechnicians({
      entityType: "technician",
      keywords: ["massage"],
      categoryIds: [3]
    })).resolves.toBe(1);

    expect(fixture.technicianCount).toHaveBeenCalledWith({
      where: expect.objectContaining({
        deletedAt: null,
        status: "published",
        OR: expect.arrayContaining([
          { displayName: { contains: "massage" } },
          { technicianServices: { some: expect.any(Object) } }
        ]),
        AND: [{
          OR: expect.arrayContaining([
            expect.objectContaining({
              baseLatitude: { not: null },
              baseLongitude: { not: null }
            }),
            expect.objectContaining({ technicianShopAffiliations: { some: expect.any(Object) } })
          ])
        }]
      })
    });
  });

  it("loads bounded candidates with personal and active published shop locations", async () => {
    const candidateRecord = {
      ...publishedTechnicianWithoutServices,
      baseLatitude: { toString: () => "35.6762000" },
      baseLongitude: { toString: () => "139.6503000" },
      reviewSummary: {
        ratingAverage: { toString: () => "4.80" },
        reviewCount: 132,
        deletedAt: null
      },
      performanceSummary: { completedOrderCount: 120, deletedAt: null },
      technicianShopAffiliations: [
        {
          shop: {
            latitude: { toString: () => "35.6800000" },
            longitude: { toString: () => "139.6600000" }
          }
        }
      ],
      user: {
        ...publishedTechnicianWithoutServices.user,
        createdAt: new Date("2025-01-01T00:00:00.000Z")
      }
    };
    const technicianFindMany = jest.fn(async () => [candidateRecord]);
    const repository = new CoreReadRepository({
      technicianProfile: { findMany: technicianFindMany }
    } as never);

    await expect(repository.findEligibleTechniciansWithinBounds(
      { entityType: "technician", keywords: ["massage"], categoryIds: [3] },
      { latitude: 35.6762, longitude: 139.6503 },
      3
    )).resolves.toEqual([
      {
        technicianProfileId: 41,
        locations: [
          { latitude: 35.6762, longitude: 139.6503 },
          { latitude: 35.68, longitude: 139.66 }
        ],
        ratingAverage: "4.80",
        completedOrderCount: 120,
        reviewCount: 132,
        registeredAt: new Date("2025-01-01T00:00:00.000Z")
      }
    ]);

    expect(technicianFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        OR: expect.arrayContaining([{ displayName: { contains: "massage" } }]),
        AND: [{ OR: expect.any(Array) }]
      }),
      select: expect.objectContaining({
        baseLatitude: true,
        baseLongitude: true,
        performanceSummary: expect.any(Object),
        technicianShopAffiliations: expect.any(Object),
        user: expect.any(Object)
      })
    }));
  });

  it("loads final card payloads by ranked IDs without exposing private coordinates", async () => {
    const fixture = createRepositoryFixture();

    const result = await fixture.repository.loadTechnicianCardsByRankedIds([41]);

    expect(result.get(41)).toMatchObject({ id: 41, publicId: "s5831047296" });
    expect(result.get(41)).not.toHaveProperty("baseLatitude");
    expect(fixture.technicianFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: { in: [41] } })
    }));
  });
});
