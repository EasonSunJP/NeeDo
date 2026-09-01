import { beforeEach, describe, expect, it, vi } from "vitest";
import { httpClient } from "../../api/httpClient";
import { shopTaxonomyApi } from "./api";

vi.mock("../../api/httpClient", () => ({
  httpClient: { request: vi.fn() }
}));

describe("shop taxonomy API", () => {
  beforeEach(() => vi.clearAllMocks());

  it("loads the localized catalog and current merchant selection", async () => {
    vi.mocked(httpClient.request)
      .mockResolvedValueOnce({ list: [], total: 0, page: 1, page_size: 100 })
      .mockResolvedValueOnce({ list: [], total: 0, page: 1, page_size: 100 })
      .mockResolvedValueOnce({
        revision: 2,
        categoryLimit: 5,
        keywordLimit: 5,
        selectedCategories: [],
        selectedKeywords: [],
        removedKeywordIds: []
      });

    await shopTaxonomyApi.listCategories("ja");
    await shopTaxonomyApi.listKeywords(7, "ja");
    await shopTaxonomyApi.getMine("ja");

    expect(httpClient.request).toHaveBeenNthCalledWith(1, "/service-categories", {
      query: { locale: "ja", page: 1, pageSize: 100 }
    });
    expect(httpClient.request).toHaveBeenNthCalledWith(2, "/service-categories/7/keywords", {
      query: { locale: "ja", page: 1, pageSize: 100 }
    });
    expect(httpClient.request).toHaveBeenNthCalledWith(3, "/merchant-admin/shop/service-taxonomy", {
      query: { locale: "ja" }
    });
  });

  it("replaces the complete merchant selection with revision and idempotency protection", async () => {
    vi.mocked(httpClient.request).mockResolvedValue({});

    await shopTaxonomyApi.replaceMine("en", {
      categoryIds: [1, 2],
      keywordIds: [11],
      expectedRevision: 4,
      idempotencyKey: "11111111-1111-4111-8111-111111111111"
    });

    expect(httpClient.request).toHaveBeenCalledWith("/merchant-admin/shop/service-taxonomy", {
      method: "PUT",
      query: { locale: "en" },
      body: {
        categoryIds: [1, 2],
        keywordIds: [11],
        expectedRevision: 4,
        idempotencyKey: "11111111-1111-4111-8111-111111111111"
      }
    });
  });
});
