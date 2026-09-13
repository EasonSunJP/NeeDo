import { beforeEach, describe, expect, it, vi } from "vitest";
import { httpClient } from "./httpClient";
import { exchangeOperationsApi } from "./exchangeOperations";

vi.mock("./httpClient", () => ({ httpClient: { request: vi.fn() } }));

const page = { list: [], total: 0, page: 2, page_size: 20 };

describe("exchangeOperationsApi", () => {
  beforeEach(() => vi.mocked(httpClient.request).mockReset());

  it("uses the protected paginated list and detail endpoints", async () => {
    vi.mocked(httpClient.request).mockResolvedValueOnce(page).mockResolvedValueOnce({
      id: 6,
      type: "demand",
      status: "published",
      title: "正式需求",
      publisher: { publicIdMasked: "u0000••••01", displayNameMasked: "E•••n", identityType: "customer" },
      serviceMode: "store",
      areaLabel: "東京都千代田区",
      serviceStartAt: "2026-09-14T01:00:00.000Z",
      serviceEndAt: "2026-09-14T02:00:00.000Z",
      expiresAt: "2026-09-14T03:00:00.000Z",
      publishedAt: "2026-09-13T01:00:00.000Z",
      budgetMinJpy: null,
      budgetMaxJpy: 8000,
      matchMode: "quick",
      claimCount: 0,
      activeClaimCount: 0,
      matchedCount: 0,
      financial: null,
      detail: "正式数据",
      contentLocale: "ja-JP",
      demand: {
        targetProviderCount: 1,
        targetProviderLimitSnapshot: 1,
        publisherCapacitySource: "customer_membership",
        membershipLevelSnapshot: "standard",
        matchMode: "quick",
        budgetMode: "total",
        budgetMinJpy: null,
        budgetMaxJpy: 8000,
        serviceMode: "store",
        addressLine1: "東京都千代田区"
      },
      intelligence: null,
      claims: [],
      matching: null,
      timeline: []
    });

    await exchangeOperationsApi.list({ type: "demand", status: "published", matchMode: "quick", page: 2, pageSize: 20 });
    await exchangeOperationsApi.detail(6);

    expect(httpClient.request).toHaveBeenNthCalledWith(1, "/backoffice/exchange/posts", {
      query: { type: "demand", status: "published", match_mode: "quick", publisher_identity_type: undefined, keyword: undefined, page: 2, page_size: 20 },
      signal: undefined
    });
    expect(httpClient.request).toHaveBeenNthCalledWith(2, "/backoffice/exchange/posts/6", { signal: undefined });
  });

  it("rejects responses that expose private contact or address fields", async () => {
    vi.mocked(httpClient.request).mockResolvedValue({
      ...page,
      list: [{ id: 1, email: "private@example.com" }]
    });

    await expect(exchangeOperationsApi.list({ page: 2, pageSize: 20 })).rejects.toThrow(
      "exchange.operations.invalid_response"
    );
  });
});
