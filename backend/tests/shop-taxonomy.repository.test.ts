import { ShopTaxonomyRepository } from "../src/repositories/shop-taxonomy.repository";

describe("shop taxonomy public repository", () => {
  it("lists only active categories with an authoritative requested translation", async () => {
    const category = {
      findMany: jest.fn(async () => [
        {
          id: 1,
          code: "massage",
          qualificationPolicy: "PLATFORM_REVIEW",
          translations: [{ name: "マッサージ" }]
        }
      ]),
      count: jest.fn(async () => 1)
    };
    const repository = new ShopTaxonomyRepository({ category } as never);

    await expect(
      repository.listCategories({ locale: "ja", page: 1, pageSize: 20 })
    ).resolves.toEqual({
      list: [
        {
          id: 1,
          code: "massage",
          label: "マッサージ",
          qualificationPolicy: "PLATFORM_REVIEW"
        }
      ],
      total: 1,
      page: 1,
      page_size: 20
    });

    expect(category.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          isActive: true,
          deletedAt: null,
          translations: { some: { locale: "JA", deletedAt: null } }
        }),
        orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
        skip: 0,
        take: 20
      })
    );
  });

  it("lists keywords only under an active parent and never returns the category label", async () => {
    const businessKeyword = {
      findMany: jest.fn(async () => [
        {
          id: 10,
          code: "massage_home_visit",
          categoryId: 1,
          qualificationPolicy: "PLATFORM_REVIEW",
          translations: [{ label: "訪問マッサージ" }]
        }
      ]),
      count: jest.fn(async () => 1)
    };
    const repository = new ShopTaxonomyRepository({ businessKeyword } as never);

    const result = await repository.listKeywords(1, { locale: "ja", page: 1, pageSize: 20 });

    expect(result.list).toEqual([
      {
        id: 10,
        code: "massage_home_visit",
        categoryId: 1,
        label: "訪問マッサージ",
        qualificationPolicy: "PLATFORM_REVIEW"
      }
    ]);
    expect(businessKeyword.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          categoryId: 1,
          isActive: true,
          deletedAt: null,
          category: { isActive: true, deletedAt: null },
          translations: { some: { locale: "JA", deletedAt: null } }
        })
      })
    );
  });
});
