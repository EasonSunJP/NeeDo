import { beforeEach, describe, expect, it, vi } from "vitest";
import { httpClient } from "./httpClient";
import { affiliateMarketplaceApi } from "./affiliateMarketplace";

vi.mock("./httpClient", () => ({
  httpClient: { request: vi.fn() }
}));

describe("affiliate marketplace API client", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(httpClient.request).mockResolvedValue({});
  });

  it("uses the formal marketplace list, detail, claim, and claim-history contracts", async () => {
    const controller = new AbortController();

    await affiliateMarketplaceApi.listTasks({
      keyword: "massage",
      page: 2,
      pageSize: 12,
      signal: controller.signal
    });
    await affiliateMarketplaceApi.getTask(22, { signal: controller.signal });
    await affiliateMarketplaceApi.claimTask(22, { signal: controller.signal });
    await affiliateMarketplaceApi.listMyClaims({
      page: 3,
      pageSize: 10,
      status: "active",
      signal: controller.signal
    });

    expect(httpClient.request).toHaveBeenNthCalledWith(1, "/affiliate/tasks", {
      query: { keyword: "massage", page: 2, pageSize: 12 },
      signal: controller.signal
    });
    expect(httpClient.request).toHaveBeenNthCalledWith(2, "/affiliate/tasks/22", {
      signal: controller.signal
    });
    expect(httpClient.request).toHaveBeenNthCalledWith(3, "/affiliate/tasks/22/claims", {
      method: "POST",
      body: {},
      signal: controller.signal
    });
    expect(httpClient.request).toHaveBeenNthCalledWith(4, "/affiliate/claims", {
      query: { page: 3, pageSize: 10, status: "active" },
      signal: controller.signal
    });
  });

  it("omits undefined query values instead of serializing them", async () => {
    await affiliateMarketplaceApi.listTasks({ page: 1, keyword: undefined });

    expect(httpClient.request).toHaveBeenCalledWith("/affiliate/tasks", {
      query: { page: 1 }
    });
  });
});
