import { beforeEach, describe, expect, it, vi } from "vitest";
import { affiliatePlatformFeeApi } from "./affiliatePlatformFee";
import { httpClient } from "./httpClient";

vi.mock("./httpClient", () => ({ httpClient: { request: vi.fn() } }));

describe("affiliatePlatformFeeApi", () => {
  beforeEach(() => vi.clearAllMocks());

  it("uses the formal fee-rule and minimal shop-option endpoints", async () => {
    vi.mocked(httpClient.request).mockResolvedValue({});

    await affiliatePlatformFeeApi.listRules({
      page: 2,
      pageSize: 20,
      scopeType: "shop",
      shopId: 11
    });
    await affiliatePlatformFeeApi.getGlobalSummary();
    await affiliatePlatformFeeApi.searchShops({
      keyword: "GINZA",
      page: 1,
      pageSize: 10
    });
    await affiliatePlatformFeeApi.createRule({
      scopeType: "shop",
      shopId: 11,
      feeBps: 1250,
      expectedVersion: 2,
      effectiveFrom: "2026-09-01T00:00:00.000Z",
      reason: "季度调整"
    });

    expect(httpClient.request).toHaveBeenNthCalledWith(
      1,
      "/backoffice/affiliate/fee-rules",
      { query: { page: 2, pageSize: 20, scopeType: "shop", shopId: 11 } }
    );
    expect(httpClient.request).toHaveBeenNthCalledWith(
      2,
      "/backoffice/affiliate/fee-rules/summary",
      { query: { scopeType: "global" } }
    );
    expect(httpClient.request).toHaveBeenNthCalledWith(
      3,
      "/backoffice/affiliate/fee-rule-shops",
      { query: { keyword: "GINZA", page: 1, pageSize: 10 } }
    );
    expect(httpClient.request).toHaveBeenNthCalledWith(
      4,
      "/backoffice/affiliate/fee-rules",
      {
        method: "POST",
        body: {
          scopeType: "shop",
          shopId: 11,
          feeBps: 1250,
          expectedVersion: 2,
          effectiveFrom: "2026-09-01T00:00:00.000Z",
          reason: "季度调整"
        }
      }
    );
  });

  it("propagates formal API failures without fallback data", async () => {
    const failure = new Error("error.forbidden");
    vi.mocked(httpClient.request).mockRejectedValue(failure);

    await expect(affiliatePlatformFeeApi.getGlobalSummary()).rejects.toBe(failure);
    await expect(affiliatePlatformFeeApi.searchShops({ keyword: "GINZA" })).rejects.toBe(
      failure
    );
  });
});
