import { describe, expect, it } from "vitest";
import {
  languageToTaxonomyLocale,
  toggleTaxonomyCategory,
  toggleTaxonomyKeyword
} from "./model";

describe("shop taxonomy editor model", () => {
  it("maps every supported application language to a formal taxonomy locale", () => {
    expect(languageToTaxonomyLocale).toEqual({
      zh: "zh-CN",
      "zh-Hant": "zh-TW",
      ja: "ja",
      en: "en",
      ko: "ko"
    });
  });

  it("removes dependent keywords when a category is deselected", () => {
    expect(toggleTaxonomyCategory({
      categoryId: 1,
      categoryIds: [1, 2],
      categoryLimit: 5,
      keywordIds: [10, 20],
      keywords: [
        { id: 10, categoryId: 1 },
        { id: 20, categoryId: 2 }
      ]
    })).toEqual({ categoryIds: [2], keywordIds: [20], removedKeywordIds: [10] });
  });

  it("enforces category and keyword limits before issuing a request", () => {
    expect(() => toggleTaxonomyCategory({
      categoryId: 3,
      categoryIds: [1, 2],
      categoryLimit: 2,
      keywordIds: [],
      keywords: []
    })).toThrow("category_limit");

    expect(() => toggleTaxonomyKeyword({
      keywordId: 30,
      keywordIds: [10, 20],
      keywordLimit: 2
    })).toThrow("keyword_limit");
  });
});
