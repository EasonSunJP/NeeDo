import {
  DefaultShopTaxonomyQuotaPolicy,
  type ShopTaxonomyQuotaPolicyPort
} from "../src/services/shop-taxonomy-quota.service";

describe("shop taxonomy quota policy", () => {
  it("returns the server-owned default 5/5 quota", async () => {
    await expect(new DefaultShopTaxonomyQuotaPolicy().resolve(42)).resolves.toEqual({
      categoryLimit: 5,
      keywordLimit: 5,
      source: "default"
    });
  });

  it("allows a paid Option provider to replace the quota without frontend changes", async () => {
    const optionPolicy: ShopTaxonomyQuotaPolicyPort = {
      resolve: async () => ({ categoryLimit: 8, keywordLimit: 12, source: "option" })
    };

    await expect(optionPolicy.resolve(42)).resolves.toEqual({
      categoryLimit: 8,
      keywordLimit: 12,
      source: "option"
    });
  });
});
