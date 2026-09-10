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
  latitude: { toString: () => "35.6580340" },
  longitude: { toString: () => "139.7016360" },
  mediaAssets: [],
  publicIdentifier: activeShopIdentifier,
  reviewSummary: null,
  _count: {
    bookingOrders: 1999,
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
  visibility: "public",
  gender: "female",
  age: 25,
  heightCm: { toString: () => "164.00" },
  languages: ["日本語", "中文"],
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

describe("shop detail affiliated technician roster", () => {
  it("projects a saved locale and its ordered carousel media on the public shop detail", async () => {
    const media = {
      id: 91,
      entityType: "shop_presentation_upload",
      entityId: 21,
      categoryId: null,
      serviceId: null,
      shopId: 21,
      technicianProfileId: null,
      customerProfileId: null,
      ownerUserId: 7,
      ownerIdentityId: 70,
      url: "/media/content/localized.webp",
      mimeType: "image/webp",
      usageType: "shop_presentation_draft",
      width: null,
      height: null,
      altText: "base",
      sortOrder: 0,
      isActive: true,
      checksumSha256: "a".repeat(64),
      purgeAt: null,
      purgedAt: null,
      createdAt: now,
      updatedAt: now,
      deletedAt: null
    };
    const shop = {
      ...publishedShopWithoutServices,
      mediaAssets: [media],
      services: [],
      technicians: [],
      technicianShopAffiliations: [],
      description: "Base description",
      phone: null,
      latitude: null,
      longitude: null,
      createdAt: now,
      updatedAt: now
    };
    const client = {
      shop: { findFirst: jest.fn(async () => shop) },
      shopPresentationLocale: { findFirst: jest.fn(async () => ({
        content: {
          storeName: "日本語店名",
          description: "日本語説明",
          address: "東京都港区",
          area: "港区",
          rankLabel: "おすすめ",
          businessHours: "11:00-23:00",
          subtitle: "すぐ予約可能",
          station: "麻布十番駅",
          distance: "徒歩3分",
          parking: "近隣駐車場",
          routeGuide: "A9出口",
          paymentMethods: [],
          equipment: [],
          carousel: [{ mediaAssetPublicId: "a".repeat(64), altText: "日本語画像" }],
          serviceMenus: []
        }
      })) }
    };
    const result = await new CoreReadRepository(client as never).findShopDetail(21, "ja");
    expect(result).toMatchObject({ name: "日本語店名", description: "日本語説明", city: "港区", address: "東京都港区", coverUrl: media.url });
    expect(result?.mediaAssets).toEqual([expect.objectContaining({ url: media.url, altText: "日本語画像" })]);
  });

  it("includes active partner technicians with real avatars once alongside primary staff", async () => {
    const partner = { ...publishedTechnicianWithoutServices, id: 42, displayName: "合作技师", user: { ...publishedTechnicianWithoutServices.user, avatarBootstrapUrl: "/media/partner.jpg" } };
    const findFirst = jest.fn(async () => ({
      ...publishedShopWithoutServices, services: [], technicians: [publishedTechnicianWithoutServices],
      technicianShopAffiliations: [{ technicianProfile: publishedTechnicianWithoutServices }, { technicianProfile: partner }],
      description: null, phone: null, latitude: null, longitude: null, createdAt: now, updatedAt: now
    }));
    const repository = new CoreReadRepository({ shop: { findFirst } } as never);
    const result = await repository.findShopDetail(21);
    expect(result?.technicians.map(t => t.id)).toEqual([41, 42]);
    expect(result?.technicians[1]?.avatarUrl).toBe("/media/partner.jpg");
    expect(findFirst.mock.calls[0]).toEqual([expect.objectContaining({ include: expect.objectContaining({
      technicianShopAffiliations: expect.objectContaining({ where: expect.objectContaining({ deletedAt: null, workStatus: "ACTIVE", startsAt: { lte: expect.any(Date) }, OR: [{ endsAt: null }, { endsAt: { gt: expect.any(Date) } }] }) })
    }) })]);
  });
});

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

    await expect(
      fixture.repository.searchShops({
        entityType: "shop",
        keywords: ["LifeDance Wellness 渋谷"],
        categoryIds: [],
        page: 1,
        pageSize: 20
      })
    ).resolves.toMatchObject({
      list: [
        {
          name: "LifeDance Wellness 渋谷",
          publicId: "shop5831047296",
          completedOrderCount: 1999,
          favoriteCount: 1540,
          shareCount: 29,
          serviceCategories: [{ code: "wellness", label: "リラクゼーション" }],
          businessKeywords: [{ code: "wellness_spa", label: "スパケア" }]
        }
      ],
      total: 1
    });

    expect(fixture.shopFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
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
        include: expect.objectContaining({
          _count: {
            select: expect.objectContaining({
              bookingOrders: {
                where: { status: "COMPLETED", deletedAt: null }
              }
            })
          }
        }),
        skip: 0,
        take: 20
      })
    );
  });

  it("computes shop distance from supplied origin and persisted coordinates only", async () => {
    const fixture = createRepositoryFixture();

    const withOrigin = await fixture.repository.searchShops({
      entityType: "shop",
      keywords: [],
      categoryIds: [],
      latitude: 35.681236,
      longitude: 139.767125,
      page: 1,
      pageSize: 20
    });
    const withoutOrigin = await fixture.repository.searchShops({
      entityType: "shop",
      keywords: [],
      categoryIds: [],
      page: 1,
      pageSize: 20
    });

    expect(withOrigin.list[0]?.distanceKm).toBeGreaterThan(0);
    expect(withOrigin.list[0]?.distanceKm).toBeLessThan(10);
    expect(withoutOrigin.list[0]).not.toHaveProperty("distanceKm");
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
      list: [
        {
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
        }
      ],
      total: 1
    });
    expect(result.list[0]).not.toHaveProperty("baseLatitude");
    expect(result.list[0]).not.toHaveProperty("baseLongitude");
    expect(result.list[0]).not.toHaveProperty("serviceBase");

    expect(fixture.technicianFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
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
      })
    );
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

    await expect(
      fixture.repository.searchTechnicians({
        entityType: "technician",
        keywords: ["ひかり"],
        categoryIds: [],
        page: 1,
        pageSize: 20
      })
    ).resolves.toMatchObject({
      list: [
        {
          age: null,
          favoriteCount: 0,
          shareCount: 0,
          completedOrderCount: 0,
          acceptanceRatePercent: 100,
          primaryService: null
        }
      ]
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
      reviewSummary: null,
      _count: { bookingOrders: 18 }
    };
    const findMany = jest.fn(async () => [service]);
    const repository = new CoreReadRepository({
      service: {
        findMany,
        count: jest.fn(async () => 1)
      }
    } as never);

    await expect(
      repository.search({
        entityType: "service",
        keywords: ["recovery"],
        categoryIds: [],
        page: 1,
        pageSize: 20
      })
    ).resolves.toMatchObject({
      list: [{ technician: null, usageCount: 18 }]
    });
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        include: expect.objectContaining({
          _count: {
            select: {
              bookingOrders: {
                where: { status: "COMPLETED", deletedAt: null }
              },
              entityFavorites: { where: { deletedAt: null } },
              entityShareEvents: { where: { deletedAt: null } }
            }
          }
        })
      })
    );
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

    expect(fixture.serviceFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: expect.arrayContaining([
            { name: { contains: "massage" } },
            { name: { contains: "家政" } },
            { categoryId: { in: [3, 9] } }
          ])
        })
      })
    );
  });

  it("excludes services whose shop has no active formal public identifier", async () => {
    const fixture = createRepositoryFixture();

    await fixture.repository.search({
      entityType: "service",
      keywords: ["Sho"],
      categoryIds: [],
      page: 1,
      pageSize: 20
    });

    expect(fixture.serviceFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          shop: expect.objectContaining({
            deletedAt: null,
            status: "published",
            publicIdentifier: {
              is: expect.objectContaining({
                kind: "SHOP",
                status: "ACTIVE",
                deletedAt: null
              })
            }
          })
        })
      })
    );
  });

  it("counts only searchable technicians that have an eligible public location", async () => {
    const fixture = createRepositoryFixture();

    await expect(
      fixture.repository.countEligibleLocatedTechnicians({
        entityType: "technician",
        keywords: ["massage"],
        categoryIds: [3]
      })
    ).resolves.toBe(1);

    expect(fixture.technicianCount).toHaveBeenCalledWith({
      where: expect.objectContaining({
        deletedAt: null,
        status: "published",
        OR: expect.arrayContaining([
          { displayName: { contains: "massage" } },
          { technicianServices: { some: expect.any(Object) } }
        ]),
        AND: [
          {
            OR: expect.arrayContaining([
              expect.objectContaining({
                baseLatitude: { not: null },
                baseLongitude: { not: null }
              }),
              expect.objectContaining({ technicianShopAffiliations: { some: expect.any(Object) } })
            ])
          }
        ]
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

    await expect(
      repository.findEligibleTechniciansWithinBounds(
        { entityType: "technician", keywords: ["massage"], categoryIds: [3] },
        { latitude: 35.6762, longitude: 139.6503 },
        3
      )
    ).resolves.toEqual([
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

    expect(technicianFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
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
      })
    );
  });

  it("loads final card payloads by ranked IDs without exposing private coordinates", async () => {
    const fixture = createRepositoryFixture();

    const result = await fixture.repository.loadTechnicianCardsByRankedIds([41]);

    expect(result.get(41)).toMatchObject({ id: 41, publicId: "s5831047296" });
    expect(result.get(41)).not.toHaveProperty("baseLatitude");
    expect(fixture.technicianFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: { in: [41] } })
      })
    );
  });

  it("adds the formal review tag summary only to technician detail", async () => {
    const technician = {
      ...publishedTechnicianWithoutServices,
      bio: "肩颈护理",
      serviceArea: "港区",
      yearsExperience: 8,
      shop: publishedShopWithoutServices,
      technicianShopAffiliations: [],
      services: [],
      status: "published",
      deletedAt: null,
      createdAt: now,
      updatedAt: now
    };
    const findFirst = jest.fn(async () => technician);
    const client = {
      technicianProfile: { findFirst },
      orderReviewTag: {
        groupBy: jest.fn(async () => [
          { label: "服务精神", _count: { _all: 4 }, _min: { createdAt: now } },
          { label: "手法细致", _count: { _all: 2 }, _min: { createdAt: now } }
        ])
      }
    };
    const repository = new CoreReadRepository(client as never);

    await expect(repository.findTechnicianDetail(41, {
      latitude: 35.658034,
      longitude: 139.701636
    })).resolves.toMatchObject({
      id: 41,
      gender: "female",
      heightCm: 164,
      languages: ["日本語", "中文"],
      yearsExperience: 8,
      completedOrderCount: 1280,
      acceptanceRatePercent: 98,
      distanceKm: 0,
      reviewTagSummary: {
        special: [
          { code: "appeal_max", label: "魅力max", count: 0 },
          { code: "service_max", label: "服务max", count: 4 },
          { code: "emotion_max", label: "情绪max", count: 0 },
          { code: "energy_max", label: "元气max", count: 0 }
        ],
        custom: [{ label: "手法细致", count: 2 }]
      }
    });

    expect(findFirst).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: expect.objectContaining({
          id: 41,
          visibility: "public"
        })
      })
    );

    await expect(repository.findTechnicianDetail("s5831047296")).resolves.toMatchObject({
      id: 41,
      publicId: "s5831047296"
    });
    expect(findFirst).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: expect.objectContaining({
          visibility: "public",
          user: {
            identities: {
              some: expect.objectContaining({
                publicIdentifier: {
                  is: expect.objectContaining({
                    publicId: "s5831047296",
                    kind: "S",
                    status: "ACTIVE",
                    deletedAt: null
                  })
                }
              })
            }
          }
        })
      })
    );
  });
});

describe("CoreReadRepository public service reviews", () => {
  it("lists only completed persisted reviews with effective amendments and active media", async () => {
    const originalCreatedAt = new Date("2026-08-30T09:00:00.000Z");
    const amendedAt = new Date("2026-09-01T10:00:00.000Z");
    const serviceFindFirst = jest.fn(async () => ({ id: 61 }));
    const orderReviewCount = jest.fn(async () => 1);
    const orderReviewFindMany = jest.fn(async () => [
      {
        id: 901,
        rating: 4,
        comment: "原始正文",
        createdAt: originalCreatedAt,
        tags: [{ label: "原始标题" }],
        amendments: [
          {
            version: 2,
            rating: 5,
            comment: "修订后的真实正文",
            createdAt: amendedAt,
            tags: [{ label: "非常专业" }]
          }
        ],
        reviewer: {
          username: "u0000000901",
          avatarUrl: null,
          avatarBootstrapUrl: "/media/reviewer-bootstrap.jpg",
          customerProfile: {
            displayName: "小林",
            deletedAt: null
          }
        }
      }
    ]);
    const mediaAssetFindMany = jest.fn(async () => [
      {
        id: 7001,
        entityId: 901,
        url: "/media/reviews/901-1.jpg",
        mimeType: "image/jpeg",
        usageType: "review",
        width: 960,
        height: 720,
        altText: "服务完成后的照片",
        sortOrder: 0
      }
    ]);
    const repository = new CoreReadRepository({
      service: { findFirst: serviceFindFirst },
      orderReview: { count: orderReviewCount, findMany: orderReviewFindMany },
      mediaAsset: { findMany: mediaAssetFindMany }
    } as never);

    await expect(
      repository.listServiceReviews("83b6d591-d7ca-4ca0-b975-7a44363e1f3a", {
        page: 2,
        pageSize: 10
      })
    ).resolves.toEqual({
      list: [
        {
          id: 901,
          title: "非常专业",
          comment: "修订后的真实正文",
          rating: 5,
          createdAt: originalCreatedAt,
          reviewer: {
            displayName: "小林",
            avatarUrl: "/media/reviewer-bootstrap.jpg"
          },
          mediaAssets: [
            {
              id: 7001,
              url: "/media/reviews/901-1.jpg",
              mimeType: "image/jpeg",
              usageType: "review",
              width: 960,
              height: 720,
              altText: "服务完成后的照片",
              sortOrder: 0
            }
          ]
        }
      ],
      total: 1,
      page: 2,
      page_size: 10
    });

    expect(serviceFindFirst).toHaveBeenCalledWith({
      where: {
        publicId: "83b6d591-d7ca-4ca0-b975-7a44363e1f3a",
        deletedAt: null,
        status: "published"
      },
      select: { id: true }
    });
    expect(orderReviewFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          targetType: "TECHNICIAN",
          deletedAt: null,
          reviewer: { deletedAt: null },
          bookingOrder: {
            serviceId: 61,
            status: "COMPLETED",
            deletedAt: null
          }
        },
        skip: 10,
        take: 10,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }]
      })
    );
    expect(orderReviewCount).toHaveBeenCalledWith({
      where: expect.objectContaining({ bookingOrder: expect.objectContaining({ serviceId: 61 }) })
    });
    expect(mediaAssetFindMany).toHaveBeenCalledWith({
      where: {
        entityType: "order_review",
        entityId: { in: [901] },
        mimeType: { startsWith: "image/" },
        isActive: true,
        purgedAt: null,
        deletedAt: null
      },
      orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
      select: expect.objectContaining({ entityId: true, url: true })
    });
  });

  it("returns null without querying reviews when the public service does not exist", async () => {
    const orderReviewFindMany = jest.fn();
    const repository = new CoreReadRepository({
      service: { findFirst: jest.fn(async () => null) },
      orderReview: { count: jest.fn(), findMany: orderReviewFindMany },
      mediaAsset: { findMany: jest.fn() }
    } as never);

    await expect(repository.listServiceReviews(999, { page: 1, pageSize: 20 })).resolves.toBeNull();
    expect(orderReviewFindMany).not.toHaveBeenCalled();
  });
});
