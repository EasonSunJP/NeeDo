// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MerchantAffiliateTask } from "../../api/merchantAffiliateTasks";
import { merchantAffiliateTasksApi } from "../../api/merchantAffiliateTasks";
import { ApiClientError } from "../../api/httpClient";
import appSource from "../../App.tsx?raw";
import {
  MerchantAffiliateTasksContent,
  describeMerchantAffiliateTaskListError
} from "./MerchantAffiliateTasksPage";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

vi.mock("../../api/merchantAffiliateTasks", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../api/merchantAffiliateTasks")>();
  return {
    ...original,
    merchantAffiliateTasksApi: {
      ...original.merchantAffiliateTasksApi,
      listTasks: vi.fn()
    }
  };
});

vi.mock("../../i18n/I18nProvider", () => ({
  useI18n: () => ({ language: "zh" })
}));

const task: MerchantAffiliateTask = {
  id: 81,
  taskCode: "AFF-2026-000081",
  lineageKey: "lineage-81",
  version: 1,
  lockVersion: 2,
  publisherType: "shop",
  publisherMerchantAccountId: null,
  publisherShopId: 11,
  publisherDisplayName: "Shibuya Shop",
  translations: {
    ja: {
      name: "渋谷紹介キャンペーン",
      description: null,
      sourceLocale: "ja",
      isInitialCopy: false
    }
  },
  name: "渋谷紹介キャンペーン",
  description: null,
  coverMediaAssetId: null,
  rewardNdpPerCompletedOrder: 1_000,
  totalBudgetNdp: 2_000_000,
  platformFeeRuleId: null,
  platformFeeBps: 1_000,
  platformFeeReserveNdp: 200_000,
  reservedBudgetNdp: 2_200_000,
  allocatedBudgetNdp: 0,
  settledBudgetNdp: 0,
  settledPlatformFeeNdp: 0,
  releasedBudgetNdp: 0,
  releasedPlatformFeeNdp: 0,
  customerDiscountType: "none",
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
  serviceScopeMode: "all_current_services",
  status: "draft",
  reviewedById: null,
  reviewedAt: null,
  rejectionReason: null,
  submittedAt: null,
  activatedAt: null,
  createdAt: "2026-08-30T02:00:00.000Z",
  updatedAt: "2026-08-30T02:00:00.000Z",
  shops: [
    {
      id: 1,
      shopId: 11,
      shopNameSnapshot: "Shibuya Shop",
      publicId: "shop0000000011"
    }
  ],
  services: [],
  budgetReservation: null
};

const flush = async () => {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
};

describe("MerchantAffiliateTasksPage", () => {
  let container: HTMLDivElement;
  let root: Root;
  const listTasks = vi.mocked(merchantAffiliateTasksApi.listTasks);

  beforeEach(() => {
    vi.clearAllMocks();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  it("wires the exact route through the merchant permission guard", () => {
    expect(appSource).toContain('path="/merchant-admin/affiliate/tasks"');
    expect(appSource).toContain(
      'protectPermission("merchant", "page:merchant-affiliate-task"'
    );
  });

  it("renders formal server-page rows and computes pagination from total", async () => {
    listTasks.mockResolvedValue({ list: [task], total: 41, page: 2, page_size: 20 });
    const onSelectTask = vi.fn();

    await act(async () => {
      root.render(
        <MerchantAffiliateTasksContent initialPage={2} onSelectTask={onSelectTask} />
      );
    });
    await flush();

    expect(container.textContent).toContain("AFF-2026-000081");
    expect(container.textContent).toContain("shop0000000011");
    expect(container.textContent).not.toContain("merchantAccountId");
    expect(container.textContent).not.toContain("serviceId");
    expect(container.textContent).not.toContain("第 2 / 1 页");
    expect(container.textContent).toContain("第 2 / 3 页");
    expect(listTasks).toHaveBeenCalledWith(
      expect.objectContaining({ page: 2, pageSize: 20 })
    );

    await act(async () => {
      container.querySelector<HTMLTableRowElement>('[data-task-code="AFF-2026-000081"]')?.click();
    });
    expect(onSelectTask).toHaveBeenCalledWith(81);
  });

  it("keeps loading and empty resource states explicit", async () => {
    let resolveRequest: ((value: { list: MerchantAffiliateTask[]; total: number; page: number; page_size: number }) => void) | null = null;
    listTasks.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveRequest = resolve;
        })
    );

    await act(async () => root.render(<MerchantAffiliateTasksContent />));
    expect(container.textContent).toContain("正在加载联盟营销任务");

    await act(async () => {
      resolveRequest?.({ list: [], total: 0, page: 1, page_size: 20 });
    });
    await flush();
    expect(container.textContent).toContain("暂无联盟营销任务");
  });

  it("maps safe errors and retries the formal request", async () => {
    listTasks
      .mockRejectedValueOnce(new ApiClientError("raw-internal", 50001, 500))
      .mockResolvedValueOnce({ list: [], total: 0, page: 1, page_size: 20 });

    await act(async () => root.render(<MerchantAffiliateTasksContent />));
    await flush();
    expect(container.textContent).toContain("服务暂时不可用");
    expect(container.textContent).not.toContain("raw-internal");

    await act(async () => {
      container.querySelector<HTMLButtonElement>('[data-action="retry-affiliate-tasks"]')?.click();
    });
    await flush();
    expect(listTasks).toHaveBeenCalledTimes(2);
    expect(container.textContent).toContain("暂无联盟营销任务");
  });

  it("resets server pagination when keyword, status, or publisher filters change", async () => {
    listTasks.mockResolvedValue({ list: [task], total: 41, page: 2, page_size: 20 });
    await act(async () => root.render(<MerchantAffiliateTasksContent initialPage={2} />));
    await flush();

    const keyword = container.querySelector<HTMLInputElement>('[data-filter="keyword"]');
    const status = container.querySelector<HTMLSelectElement>('[data-filter="status"]');
    const publisher = container.querySelector<HTMLSelectElement>('[data-filter="publisher"]');
    await act(async () => {
      if (keyword) {
        keyword.value = "Shibuya";
        keyword.dispatchEvent(new Event("input", { bubbles: true }));
      }
    });
    await flush();
    await act(async () => {
      if (status) {
        status.value = "draft";
        status.dispatchEvent(new Event("change", { bubbles: true }));
      }
    });
    await flush();
    await act(async () => {
      if (publisher) {
        publisher.value = "shop";
        publisher.dispatchEvent(new Event("change", { bubbles: true }));
      }
    });
    await flush();

    expect(listTasks).toHaveBeenLastCalledWith(
      expect.objectContaining({ page: 1, pageSize: 20, status: "draft", publisherType: "shop" })
    );
  });

  it("distinguishes authentication, authorization, and server failures", () => {
    expect(
      describeMerchantAffiliateTaskListError(new ApiClientError("expired", 40101, 401), "zh")
    ).toContain("登录");
    expect(
      describeMerchantAffiliateTaskListError(new ApiClientError("forbidden", 40301, 403), "zh")
    ).toContain("权限");
    expect(
      describeMerchantAffiliateTaskListError(new ApiClientError("server", 50001, 500), "zh")
    ).toContain("服务暂时不可用");
  });
});
