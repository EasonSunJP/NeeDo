import type { Language } from "../../i18n/translations";
import type { ShopTaxonomyLocale } from "./api";

export const languageToTaxonomyLocale: Record<Language, ShopTaxonomyLocale> = {
  zh: "zh-CN",
  "zh-Hant": "zh-TW",
  ja: "ja",
  en: "en",
  ko: "ko"
};

export function toggleTaxonomyCategory(input: {
  categoryId: number;
  categoryIds: number[];
  categoryLimit: number;
  keywordIds: number[];
  keywords: Array<{ id: number; categoryId: number }>;
}) {
  if (input.categoryIds.includes(input.categoryId)) {
    const dependentKeywordIds = new Set(
      input.keywords.filter((keyword) => keyword.categoryId === input.categoryId).map((keyword) => keyword.id)
    );
    const removedKeywordIds = input.keywordIds.filter((id) => dependentKeywordIds.has(id));
    return {
      categoryIds: input.categoryIds.filter((id) => id !== input.categoryId),
      keywordIds: input.keywordIds.filter((id) => !dependentKeywordIds.has(id)),
      removedKeywordIds
    };
  }

  if (input.categoryIds.length >= input.categoryLimit) {
    if (input.categoryLimit === 1) {
      return {
        categoryIds: [input.categoryId],
        keywordIds: [],
        removedKeywordIds: input.keywordIds
      };
    }
    throw new Error("category_limit");
  }

  return {
    categoryIds: [...input.categoryIds, input.categoryId],
    keywordIds: input.keywordIds,
    removedKeywordIds: []
  };
}

export function toggleTaxonomyKeyword(input: {
  keywordId: number;
  keywordIds: number[];
  keywordLimit: number;
}) {
  if (input.keywordIds.includes(input.keywordId)) {
    return input.keywordIds.filter((id) => id !== input.keywordId);
  }
  if (input.keywordIds.length >= input.keywordLimit) {
    throw new Error("keyword_limit");
  }
  return [...input.keywordIds, input.keywordId];
}
