import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiClientError, httpClient } from "./httpClient";
import { serviceSearchAnalyticsApi } from "./serviceSearchAnalytics";

vi.mock("./httpClient", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./httpClient")>()),
  httpClient: { request: vi.fn() }
}));

const category = {
  id: 1,
  code: "home-care",
  sortOrder: 10,
  isActive: true,
  configurationVersion: 2,
  translations: [{ locale: "JA", value: "家政" }],
  keywordCount: 3,
  updatedAt: "2026-09-03T00:00:00.000Z"
};

describe("serviceSearchAnalyticsApi", () => {
  beforeEach(() => vi.clearAllMocks());

  it("reads versioned paginated categories from the formal endpoint", async () => {
    vi.mocked(httpClient.request).mockResolvedValue({
      list: [category], total: 1, page: 1, page_size: 20
    });
    const result = await serviceSearchAnalyticsApi.listCategories({ page: 1, pageSize: 20 });
    expect(httpClient.request).toHaveBeenCalledWith(
      "/backoffice/service-taxonomy/categories",
      { query: { page: 1, pageSize: 20 } }
    );
    expect(result.list[0]).toEqual(category);
  });

  it("preserves raw count and explicitly labelled normalized trend fields", async () => {
    vi.mocked(httpClient.request).mockResolvedValue({
      normalization: "global_max_0_100",
      timezone: "Asia/Tokyo",
      series: [{
        keyword: "家政",
        totalCount: 3,
        points: [{ date: "2026-09-03", rawCount: 3, normalizedIndex: 100 }]
      }]
    });
    const result = await serviceSearchAnalyticsApi.keywordTrend(
      { startAt: "2026-09-02T15:00:00.000Z", endAt: "2026-09-03T15:00:00.000Z" },
      ["家政"]
    );
    expect(result.series[0]?.points[0]).toEqual({
      date: "2026-09-03", rawCount: 3, normalizedIndex: 100
    });
    expect(httpClient.request).toHaveBeenCalledWith(
      "/backoffice/search-analytics/trends",
      expect.objectContaining({ query: expect.objectContaining({ keywords: ["家政"] }) })
    );
  });

  it("rejects malformed success payloads instead of rendering invented values", async () => {
    vi.mocked(httpClient.request).mockResolvedValue({
      list: [{ ...category, configurationVersion: "2" }], total: 1, page: 1, page_size: 20
    });
    await expect(serviceSearchAnalyticsApi.listCategories()).rejects.toMatchObject({
      message: "error.api.contract_invalid",
      status: 502
    });
  });

  it("propagates formal backend errors without fallback data", async () => {
    const failure = new ApiClientError("error.service_taxonomy.conflict", 41009, 409);
    vi.mocked(httpClient.request).mockRejectedValue(failure);
    await expect(serviceSearchAnalyticsApi.listCategories()).rejects.toBe(failure);
  });
});
