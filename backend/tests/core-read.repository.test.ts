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
  mediaAssets: [],
  reviewSummary: null,
  user: {
    avatarBootstrapUrl: null,
    identities: [{ publicIdentifier: activeTechnicianIdentifier }]
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

    await expect(fixture.repository.searchTechnicians({
      entityType: "technician",
      keywords: ["ひかり"],
      categoryIds: [],
      page: 1,
      pageSize: 20
    })).resolves.toMatchObject({
      list: [{ displayName: "橘 ひかり", publicId: "s5831047296" }],
      total: 1
    });

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
      skip: 0,
      take: 20
    }));
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
