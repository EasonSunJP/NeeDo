import { AppError } from "../src/utils/app-error";
import {
  ShopTaxonomyService,
  type ShopTaxonomyQualificationPort
} from "../src/services/shop-taxonomy.service";
import type { ShopTaxonomyQuotaPolicyPort } from "../src/services/shop-taxonomy-quota.service";
import type { ShopTaxonomyRepositoryPort } from "../src/repositories/shop-taxonomy.repository";

const defaultQuota: ShopTaxonomyQuotaPolicyPort = {
  resolve: async () => ({ categoryLimit: 5, keywordLimit: 5, source: "default" })
};

describe("shop taxonomy selection policy", () => {
  it("rejects a sixth category and a sixth total keyword", async () => {
    const service = new ShopTaxonomyService(defaultQuota, { assertSelectable: async () => undefined });

    await expect(
      service.assertSelectionPolicy({
        shopId: 1,
        categoryIds: [1, 2, 3, 4, 5, 6],
        keywordIds: [],
        at: new Date()
      })
    ).rejects.toBeInstanceOf(AppError);

    await expect(
      service.assertSelectionPolicy({
        shopId: 1,
        categoryIds: [1, 2],
        keywordIds: [10, 11, 12, 20, 21, 22],
        at: new Date()
      })
    ).rejects.toBeInstanceOf(AppError);
  });

  it("accepts an injected 8/12 Option quota", async () => {
    const optionQuota: ShopTaxonomyQuotaPolicyPort = {
      resolve: async () => ({ categoryLimit: 8, keywordLimit: 12, source: "option" })
    };
    const service = new ShopTaxonomyService(optionQuota, { assertSelectable: async () => undefined });

    await expect(
      service.assertSelectionPolicy({
        shopId: 1,
        categoryIds: [1, 2, 3, 4, 5, 6, 7, 8],
        keywordIds: [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21],
        at: new Date()
      })
    ).resolves.toMatchObject({ categoryLimit: 8, keywordLimit: 12, source: "option" });
  });

  it("delegates active exact qualification checks for every selection", async () => {
    const calls: Array<{ shopId: number; categoryIds: number[]; keywordIds: number[]; at: Date }> = [];
    const qualificationPort: ShopTaxonomyQualificationPort = {
      assertSelectable: async (input) => {
        calls.push(input);
      }
    };
    const service = new ShopTaxonomyService(defaultQuota, qualificationPort);
    const at = new Date("2026-09-01T00:00:00.000Z");

    await service.assertSelectionPolicy({
      shopId: 9,
      categoryIds: [2, 1],
      keywordIds: [11, 10],
      at
    });

    expect(calls).toEqual([{ shopId: 9, categoryIds: [1, 2], keywordIds: [10, 11], at }]);
  });

  it("propagates missing, expired, and revoked qualification failures", async () => {
    const reasons = ["missing", "expired", "revoked"];

    for (const reason of reasons) {
      const qualificationPort: ShopTaxonomyQualificationPort = {
        assertSelectable: async () => {
          throw new AppError({
            code: 40990,
            message: `error.shop_taxonomy.qualification_${reason}`,
            statusCode: 409
          });
        }
      };
      const service = new ShopTaxonomyService(defaultQuota, qualificationPort);

      await expect(
        service.assertSelectionPolicy({
          shopId: 1,
          categoryIds: [8],
          keywordIds: [80],
          at: new Date()
        })
      ).rejects.toMatchObject({ message: `error.shop_taxonomy.qualification_${reason}` });
    }
  });

  it("reads and replaces the current merchant shop using normalized full-set commands", async () => {
    const repository = {
      listCategories: jest.fn(),
      listKeywords: jest.fn(),
      assertSelectable: jest.fn(async () => undefined),
      getShopSelectionState: jest.fn(async () => ({
        revision: 2,
        selectedCategories: [],
        selectedKeywords: []
      })),
      replaceShopSelection: jest.fn(async (input) => ({
        revision: 3,
        categoryLimit: input.categoryLimit,
        keywordLimit: input.keywordLimit,
        selectedCategories: [],
        selectedKeywords: [],
        removedKeywordIds: [99]
      }))
    } as unknown as jest.Mocked<ShopTaxonomyRepositoryPort>;
    const service = new ShopTaxonomyService(defaultQuota, repository, repository);
    const actor = {
      userId: 7,
      currentIdentityType: "merchant",
      currentIdentityScopeType: "shop",
      currentIdentityScopeId: 9
    } as never;

    await expect(service.getShopTaxonomy(actor, "ja")).resolves.toMatchObject({
      revision: 2,
      categoryLimit: 5,
      keywordLimit: 5
    });
    await service.replaceShopTaxonomy(
      actor,
      {
        categoryIds: [2, 1],
        keywordIds: [20, 10],
        expectedRevision: 2,
        idempotencyKey: "taxonomy-command-0001"
      },
      "ja",
      new Date("2026-09-01T00:00:00.000Z")
    );

    expect(repository.replaceShopSelection).toHaveBeenCalledWith(
      expect.objectContaining({
        shopId: 9,
        actorUserId: 7,
        categoryIds: [1, 2],
        keywordIds: [10, 20],
        expectedRevision: 2,
        idempotencyKey: "taxonomy-command-0001",
        requestFingerprint: expect.stringMatching(/^[a-f0-9]{64}$/),
        categoryLimit: 5,
        keywordLimit: 5
      })
    );
  });
});
