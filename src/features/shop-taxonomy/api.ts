import { httpClient } from "../../api/httpClient";

export type ShopTaxonomyLocale = "zh-CN" | "zh-TW" | "ja" | "en" | "ko";
export type ShopTaxonomyCategory = {
  id: number;
  code: string;
  label: string;
  qualificationPolicy: string;
};
export type ShopTaxonomyKeyword = {
  id: number;
  code: string;
  categoryId: number;
  label: string;
  qualificationPolicy: string;
};
export type ShopTaxonomyPage<T> = { list: T[]; total: number; page: number; page_size: number };
export type ShopTaxonomySelection = {
  revision: number;
  categoryLimit: number;
  keywordLimit: number;
  selectedCategories: ShopTaxonomyCategory[];
  selectedKeywords: ShopTaxonomyKeyword[];
  removedKeywordIds: number[];
};
export type ReplaceShopTaxonomyInput = {
  categoryIds: number[];
  keywordIds: number[];
  expectedRevision: number;
  idempotencyKey: string;
};

export type ShopTaxonomyApi = typeof shopTaxonomyApi;

export const shopTaxonomyApi = {
  listCategories(locale: ShopTaxonomyLocale) {
    return httpClient.request<ShopTaxonomyPage<ShopTaxonomyCategory>>("/service-categories", {
      query: { locale, page: 1, pageSize: 100 }
    });
  },
  listKeywords(categoryId: number, locale: ShopTaxonomyLocale) {
    return httpClient.request<ShopTaxonomyPage<ShopTaxonomyKeyword>>(`/service-categories/${categoryId}/keywords`, {
      query: { locale, page: 1, pageSize: 100 }
    });
  },
  getMine(locale: ShopTaxonomyLocale) {
    return httpClient.request<ShopTaxonomySelection>("/merchant-admin/shop/service-taxonomy", {
      query: { locale }
    });
  },
  replaceMine(locale: ShopTaxonomyLocale, body: ReplaceShopTaxonomyInput) {
    return httpClient.request<ShopTaxonomySelection>("/merchant-admin/shop/service-taxonomy", {
      method: "PUT",
      query: { locale },
      body
    });
  }
};
