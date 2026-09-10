import { beforeEach, describe, expect, it, vi } from "vitest";
import { merchantAffiliateTasksApi } from "./merchantAffiliateTasks";
import { httpClient } from "./httpClient";

vi.mock("./httpClient", () => ({ httpClient: { request: vi.fn() } }));

describe("merchantAffiliateTasksApi", () => {
  beforeEach(() => vi.clearAllMocks());

  it("uses the formal merchant task, resource, and fee-preview contracts", async () => {
    vi.mocked(httpClient.request).mockResolvedValue({});

    await merchantAffiliateTasksApi.listTasks({ page: 2, pageSize: 20, status: "draft" });
    await merchantAffiliateTasksApi.listPublishers({ page: 1, pageSize: 20 });
    await merchantAffiliateTasksApi.listShops({
      publisherType: "merchant_account",
      merchantAccountId: 31,
      page: 1,
      pageSize: 20
    });
    await merchantAffiliateTasksApi.listServices({
      publisherType: "merchant_account",
      merchantAccountId: 31,
      shopIds: "11,12",
      page: 1,
      pageSize: 20
    });
    await merchantAffiliateTasksApi.previewFee({
      publisherType: "merchant_account",
      merchantAccountId: 31,
      shopIds: [11, 12],
      totalBudgetNdp: 2_000_000
    });

    expect(httpClient.request).toHaveBeenNthCalledWith(1, "/merchant-admin/affiliate/tasks", {
      query: { page: 2, pageSize: 20, status: "draft" }
    });
    expect(httpClient.request).toHaveBeenNthCalledWith(2, "/merchant-admin/affiliate/publishers", {
      query: { page: 1, pageSize: 20 }
    });
    expect(httpClient.request).toHaveBeenNthCalledWith(3, "/merchant-admin/affiliate/shops", {
      query: {
        publisherType: "merchant_account",
        merchantAccountId: 31,
        page: 1,
        pageSize: 20
      }
    });
    expect(httpClient.request).toHaveBeenNthCalledWith(4, "/merchant-admin/affiliate/services", {
      query: {
        publisherType: "merchant_account",
        merchantAccountId: 31,
        shopIds: "11,12",
        page: 1,
        pageSize: 20
      }
    });
    expect(httpClient.request).toHaveBeenNthCalledWith(
      5,
      "/merchant-admin/affiliate/tasks/fee-preview",
      {
        method: "POST",
        body: {
          publisherType: "merchant_account",
          merchantAccountId: 31,
          shopIds: [11, 12],
          totalBudgetNdp: 2_000_000
        }
      }
    );
  });

  it("uses the existing persisted draft, locale, and submit endpoints", async () => {
    vi.mocked(httpClient.request).mockResolvedValue({});
    const createBody = {
      publisherType: "shop" as const,
      sourceLocale: "ja" as const,
      name: "紹介キャンペーン",
      description: null,
      coverMediaAssetId: null,
      rewardNdpPerCompletedOrder: 1_000,
      totalBudgetNdp: 2_000_000,
      customerDiscountType: "none" as const,
      fixedDiscountJpy: 0,
      discountRateBps: 0,
      discountCapJpy: 0,
      minimumOrderAmountJpy: 0,
      claimStartsAt: "2026-09-01T00:00:00.000Z",
      claimEndsAt: "2026-09-20T00:00:00.000Z",
      taskStartsAt: "2026-09-01T00:00:00.000Z",
      taskEndsAt: "2026-09-30T00:00:00.000Z",
      attributionWindowDays: 30,
      maxCompletedOrdersPerClaim: null,
      maxCompletedOrdersPerCustomer: 1,
      serviceScopeMode: "all_current_services" as const,
      selectedServiceIds: []
    };
    const { publisherType: _publisherType, sourceLocale: _sourceLocale, ...editableBody } =
      createBody;
    const updateBody = { ...editableBody, lockVersion: 2 };

    await merchantAffiliateTasksApi.getTask(81);
    await merchantAffiliateTasksApi.createDraft(createBody);
    await merchantAffiliateTasksApi.updateDraft(81, updateBody);
    await merchantAffiliateTasksApi.updateLocale(81, "en", {
      lockVersion: 2,
      name: "Referral campaign",
      description: null,
      syncToAll: false
    });
    await merchantAffiliateTasksApi.submit(81);

    expect(httpClient.request).toHaveBeenNthCalledWith(1, "/merchant-admin/affiliate/tasks/81");
    expect(httpClient.request).toHaveBeenNthCalledWith(2, "/merchant-admin/affiliate/tasks", {
      method: "POST",
      body: createBody
    });
    expect(httpClient.request).toHaveBeenNthCalledWith(3, "/merchant-admin/affiliate/tasks/81", {
      method: "PATCH",
      body: updateBody
    });
    expect(httpClient.request).toHaveBeenNthCalledWith(
      4,
      "/merchant-admin/affiliate/tasks/81/locales/en",
      {
        method: "PUT",
        body: {
          lockVersion: 2,
          name: "Referral campaign",
          description: null,
          syncToAll: false
        }
      }
    );
    expect(httpClient.request).toHaveBeenNthCalledWith(
      5,
      "/merchant-admin/affiliate/tasks/81/submit",
      { method: "POST" }
    );
  });

  it("propagates formal API failures without fallback data", async () => {
    const failure = new Error("error.forbidden");
    vi.mocked(httpClient.request).mockRejectedValue(failure);

    await expect(merchantAffiliateTasksApi.listTasks()).rejects.toBe(failure);
    await expect(merchantAffiliateTasksApi.listPublishers()).rejects.toBe(failure);
    await expect(
      merchantAffiliateTasksApi.listServices({
        publisherType: "shop",
        shopIds: "11",
        page: 1,
        pageSize: 20
      })
    ).rejects.toBe(failure);
  });
});
