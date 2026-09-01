export type ShopTaxonomyQuota = {
  categoryLimit: number;
  keywordLimit: number;
  source: "default" | "option";
};

export interface ShopTaxonomyQuotaPolicyPort {
  resolve(shopId: number): Promise<ShopTaxonomyQuota>;
}

export class DefaultShopTaxonomyQuotaPolicy implements ShopTaxonomyQuotaPolicyPort {
  public async resolve(shopId: number): Promise<ShopTaxonomyQuota> {
    void shopId;
    return {
      categoryLimit: 5,
      keywordLimit: 5,
      source: "default"
    };
  }
}
