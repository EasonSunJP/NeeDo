import { AppError } from "../src/utils/app-error";
import {
  ShopTaxonomyService,
  type ShopTaxonomyQualificationPort
} from "../src/services/shop-taxonomy.service";
import type { ShopTaxonomyQuotaPolicyPort } from "../src/services/shop-taxonomy-quota.service";

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
});
