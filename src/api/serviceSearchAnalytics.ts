import { ApiClientError, httpClient } from "./httpClient";

export type TaxonomyLocale = "ZH_CN" | "ZH_TW" | "JA" | "EN" | "KO";
export type LocalizedTaxonomyValue = { locale: TaxonomyLocale; value: string };
export type Paginated<T> = { list: T[]; total: number; page: number; page_size: number };

export type ServiceTaxonomyCategory = {
  id: number;
  code: string;
  sortOrder: number;
  isActive: boolean;
  configurationVersion: number;
  translations: LocalizedTaxonomyValue[];
  keywordCount: number;
  updatedAt: string;
};

export type ServiceTaxonomyKeyword = {
  id: number;
  categoryId: number;
  code: string;
  sortOrder: number;
  isActive: boolean;
  configurationVersion: number;
  translations: LocalizedTaxonomyValue[];
  aliasCount: number;
  updatedAt: string;
};

export type SearchKeywordAlias = {
  id: number;
  categoryId: number;
  businessKeywordId: number;
  alias: string;
  normalizedAlias: string;
  isActive: boolean;
  configurationVersion: number;
  updatedAt: string;
};

export type SearchAnalyticsFilter = {
  startAt: string;
  endAt: string;
  city?: string;
  categoryId?: number;
};

export type SearchKeywordTopPayload = {
  timezone: "Asia/Tokyo";
  list: Array<{
    normalizedKeyword: string;
    searchCount: number;
    resultCount: number;
    firstEventId: number;
  }>;
};

export type SearchKeywordTrendPayload = {
  normalization: "global_max_0_100";
  timezone: "Asia/Tokyo";
  series: Array<{
    keyword: string;
    totalCount: number;
    points: Array<{ date: string; rawCount: number; normalizedIndex: number }>;
  }>;
};

type TaxonomyBaseInput = {
  code: string;
  sortOrder: number;
  isActive: boolean;
  translations: Array<{ locale: "zh-CN" | "zh-TW" | "ja" | "en" | "ko"; value: string }>;
  reason: string;
};

const apiContractError = () => new ApiClientError("error.api.contract_invalid", 502, 502);
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const stringValue = (value: unknown) => {
  if (typeof value !== "string") throw apiContractError();
  return value;
};
const numberValue = (value: unknown) => {
  if (typeof value !== "number" || !Number.isFinite(value)) throw apiContractError();
  return value;
};
const booleanValue = (value: unknown) => {
  if (typeof value !== "boolean") throw apiContractError();
  return value;
};

function translations(value: unknown): LocalizedTaxonomyValue[] {
  if (!Array.isArray(value)) throw apiContractError();
  return value.map((item) => {
    if (!isRecord(item)) throw apiContractError();
    const locale = stringValue(item.locale);
    if (!["ZH_CN", "ZH_TW", "JA", "EN", "KO"].includes(locale)) throw apiContractError();
    return { locale: locale as TaxonomyLocale, value: stringValue(item.value) };
  });
}

function category(value: unknown): ServiceTaxonomyCategory {
  if (!isRecord(value)) throw apiContractError();
  return {
    id: numberValue(value.id),
    code: stringValue(value.code),
    sortOrder: numberValue(value.sortOrder),
    isActive: booleanValue(value.isActive),
    configurationVersion: numberValue(value.configurationVersion),
    translations: translations(value.translations),
    keywordCount: numberValue(value.keywordCount),
    updatedAt: stringValue(value.updatedAt)
  };
}

function keyword(value: unknown): ServiceTaxonomyKeyword {
  if (!isRecord(value)) throw apiContractError();
  return {
    id: numberValue(value.id),
    categoryId: numberValue(value.categoryId),
    code: stringValue(value.code),
    sortOrder: numberValue(value.sortOrder),
    isActive: booleanValue(value.isActive),
    configurationVersion: numberValue(value.configurationVersion),
    translations: translations(value.translations),
    aliasCount: numberValue(value.aliasCount),
    updatedAt: stringValue(value.updatedAt)
  };
}

function alias(value: unknown): SearchKeywordAlias {
  if (!isRecord(value)) throw apiContractError();
  return {
    id: numberValue(value.id),
    categoryId: numberValue(value.categoryId),
    businessKeywordId: numberValue(value.businessKeywordId),
    alias: stringValue(value.alias),
    normalizedAlias: stringValue(value.normalizedAlias),
    isActive: booleanValue(value.isActive),
    configurationVersion: numberValue(value.configurationVersion),
    updatedAt: stringValue(value.updatedAt)
  };
}

function page<T>(value: unknown, item: (value: unknown) => T): Paginated<T> {
  if (!isRecord(value) || !Array.isArray(value.list)) throw apiContractError();
  return {
    list: value.list.map(item),
    total: numberValue(value.total),
    page: numberValue(value.page),
    page_size: numberValue(value.page_size)
  };
}

function topPayload(value: unknown): SearchKeywordTopPayload {
  if (!isRecord(value) || value.timezone !== "Asia/Tokyo" || !Array.isArray(value.list)) {
    throw apiContractError();
  }
  return {
    timezone: "Asia/Tokyo",
    list: value.list.map((item) => {
      if (!isRecord(item)) throw apiContractError();
      return {
        normalizedKeyword: stringValue(item.normalizedKeyword),
        searchCount: numberValue(item.searchCount),
        resultCount: numberValue(item.resultCount),
        firstEventId: numberValue(item.firstEventId)
      };
    })
  };
}

function trendPayload(value: unknown): SearchKeywordTrendPayload {
  if (
    !isRecord(value) ||
    value.timezone !== "Asia/Tokyo" ||
    value.normalization !== "global_max_0_100" ||
    !Array.isArray(value.series)
  ) throw apiContractError();
  return {
    timezone: "Asia/Tokyo",
    normalization: "global_max_0_100",
    series: value.series.map((series) => {
      if (!isRecord(series) || !Array.isArray(series.points)) throw apiContractError();
      return {
        keyword: stringValue(series.keyword),
        totalCount: numberValue(series.totalCount),
        points: series.points.map((point) => {
          if (!isRecord(point)) throw apiContractError();
          return {
            date: stringValue(point.date),
            rawCount: numberValue(point.rawCount),
            normalizedIndex: numberValue(point.normalizedIndex)
          };
        })
      };
    })
  };
}

export const serviceSearchAnalyticsApi = {
  async listCategories(query: { page?: number; pageSize?: number; keyword?: string } = {}) {
    return page(
      await httpClient.request<unknown>("/backoffice/service-taxonomy/categories", { query }),
      category
    );
  },
  async listKeywords(categoryId: number, query: { page?: number; pageSize?: number; keyword?: string } = {}) {
    return page(
      await httpClient.request<unknown>(`/backoffice/service-taxonomy/categories/${categoryId}/keywords`, { query }),
      keyword
    );
  },
  async listAliases(keywordId: number, query: { page?: number; pageSize?: number; keyword?: string } = {}) {
    return page(
      await httpClient.request<unknown>(`/backoffice/service-taxonomy/keywords/${keywordId}/aliases`, { query }),
      alias
    );
  },
  async createCategory(body: TaxonomyBaseInput) {
    return category(await httpClient.request<unknown>("/backoffice/service-taxonomy/categories", { method: "POST", body }));
  },
  async updateCategory(id: number, body: TaxonomyBaseInput & { expectedVersion: number }) {
    return category(await httpClient.request<unknown>(`/backoffice/service-taxonomy/categories/${id}`, { method: "PATCH", body }));
  },
  async createKeyword(body: TaxonomyBaseInput & { categoryId: number }) {
    return keyword(await httpClient.request<unknown>("/backoffice/service-taxonomy/keywords", { method: "POST", body }));
  },
  async updateKeyword(id: number, body: TaxonomyBaseInput & { categoryId: number; expectedVersion: number }) {
    return keyword(await httpClient.request<unknown>(`/backoffice/service-taxonomy/keywords/${id}`, { method: "PATCH", body }));
  },
  async createAlias(body: { categoryId: number; businessKeywordId: number; alias: string; isActive: boolean; reason: string }) {
    return alias(await httpClient.request<unknown>("/backoffice/service-taxonomy/aliases", { method: "POST", body }));
  },
  async updateAlias(id: number, body: { categoryId: number; businessKeywordId: number; alias: string; isActive: boolean; expectedVersion: number; reason: string }) {
    return alias(await httpClient.request<unknown>(`/backoffice/service-taxonomy/aliases/${id}`, { method: "PATCH", body }));
  },
  async topKeywords(filter: SearchAnalyticsFilter) {
    return topPayload(await httpClient.request<unknown>("/backoffice/search-analytics/top-keywords", { query: filter }));
  },
  async keywordTrend(filter: SearchAnalyticsFilter, keywords: string[]) {
    return trendPayload(await httpClient.request<unknown>("/backoffice/search-analytics/trends", { query: { ...filter, keywords } }));
  }
};
