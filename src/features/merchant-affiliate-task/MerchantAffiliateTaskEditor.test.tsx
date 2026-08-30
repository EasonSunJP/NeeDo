// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  MerchantAffiliatePublisherOption,
  MerchantAffiliateServiceOption,
  MerchantAffiliateShopOption,
  MerchantAffiliateTask
} from "../../api/merchantAffiliateTasks";
import { merchantAffiliateTasksApi } from "../../api/merchantAffiliateTasks";
import { MerchantAffiliateTaskEditor } from "./MerchantAffiliateTaskEditor";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

vi.mock("../../api/merchantAffiliateTasks", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../api/merchantAffiliateTasks")>();
  return {
    ...original,
    merchantAffiliateTasksApi: {
      ...original.merchantAffiliateTasksApi,
      getTask: vi.fn(),
      createDraft: vi.fn(),
      updateDraft: vi.fn(),
      listPublishers: vi.fn(),
      listShops: vi.fn(),
      listServices: vi.fn()
    }
  };
});

vi.mock("../../i18n/I18nProvider", () => ({
  useI18n: () => ({ language: "zh" })
}));

const publishers: MerchantAffiliatePublisherOption[] = [
  {
    publisherType: "shop",
    merchantAccountId: null,
    shopId: 11,
    publicId: "shop0000000011",
    displayName: "Shibuya Shop",
    current: true,
    manageableShopCount: 1
  },
  {
    publisherType: "merchant_account",
    merchantAccountId: 31,
    shopId: null,
    publicId: null,
    displayName: "NeeDo Group",
    current: false,
    manageableShopCount: 2
  }
];

const shops: MerchantAffiliateShopOption[] = [
  {
    shopId: 11,
    publicId: "shop0000000011",
    name: "Shibuya Shop",
    city: "Tokyo",
    activeServiceCount: 1
  },
  {
    shopId: 12,
    publicId: "shop0000000012",
    name: "Shinjuku Shop",
    city: "Tokyo",
    activeServiceCount: 1
  }
];

const services: MerchantAffiliateServiceOption[] = [
  {
    serviceId: 101,
    shopId: 11,
    serviceName: "Cut",
    priceJpy: 5_000,
    shopName: "Shibuya Shop",
    shopPublicId: "shop0000000011"
  },
  {
    serviceId: 102,
    shopId: 12,
    serviceName: "Color",
    priceJpy: 8_000,
    shopName: "Shinjuku Shop",
    shopPublicId: "shop0000000012"
  }
];

const task: MerchantAffiliateTask = {
  id: 81,
  taskCode: "AFF-2026-000081",
  lineageKey: "lineage-81",
  version: 1,
  lockVersion: 2,
  publisherType: "merchant_account",
  publisherMerchantAccountId: 31,
  publisherShopId: null,
  publisherDisplayName: "NeeDo Group",
  translations: {
    ja: {
      name: "保存済みキャンペーン",
      description: "保存済み説明",
      sourceLocale: "ja",
      isInitialCopy: false
    }
  },
  name: "保存済みキャンペーン",
  description: "保存済み説明",
  coverMediaAssetId: 41,
  rewardNdpPerCompletedOrder: 1_000,
  totalBudgetNdp: 2_000_000,
  platformFeeRuleId: null,
  platformFeeBps: 0,
  platformFeeReserveNdp: 0,
  reservedBudgetNdp: 0,
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
  serviceScopeMode: "selected_services",
  status: "draft",
  reviewedById: null,
  reviewedAt: null,
  rejectionReason: null,
  submittedAt: null,
  activatedAt: null,
  createdAt: "2026-08-30T02:00:00.000Z",
  updatedAt: "2026-08-30T02:00:00.000Z",
  shops: shops.map((shop, index) => ({
    id: index + 1,
    shopId: shop.shopId,
    shopNameSnapshot: shop.name,
    publicId: shop.publicId
  })),
  services: services.map((service, index) => ({
    id: index + 1,
    shopId: service.shopId,
    serviceId: service.serviceId,
    serviceNameSnapshot: service.serviceName,
    servicePriceJpySnapshot: service.priceJpy
  })),
  budgetReservation: null
};

const flush = async () => {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
};

const setSelect = async (element: HTMLSelectElement | null, value: string) => {
  await act(async () => {
    if (!element) return;
    element.value = value;
    element.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await flush();
};

const setInput = async (element: HTMLInputElement | null, value: string) => {
  await act(async () => {
    if (!element) return;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    setter?.call(element, value);
    element.dispatchEvent(new Event("input", { bubbles: true }));
  });
};

describe("MerchantAffiliateTaskEditor", () => {
  let container: HTMLDivElement;
  let root: Root;
  const api = {
    getTask: vi.mocked(merchantAffiliateTasksApi.getTask),
    createDraft: vi.mocked(merchantAffiliateTasksApi.createDraft),
    updateDraft: vi.mocked(merchantAffiliateTasksApi.updateDraft),
    listPublishers: vi.mocked(merchantAffiliateTasksApi.listPublishers),
    listShops: vi.mocked(merchantAffiliateTasksApi.listShops),
    listServices: vi.mocked(merchantAffiliateTasksApi.listServices)
  };

  beforeEach(() => {
    vi.clearAllMocks();
    api.listPublishers.mockResolvedValue({ list: publishers, total: 2, page: 1, page_size: 20 });
    api.listShops.mockResolvedValue({ list: shops, total: 2, page: 1, page_size: 20 });
    api.listServices.mockResolvedValue({ list: services, total: 2, page: 1, page_size: 20 });
    api.getTask.mockResolvedValue(task);
    api.createDraft.mockResolvedValue(task);
    api.updateDraft.mockResolvedValue(task);
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  it("loads formal publisher, shop, and service options and clears descendants", async () => {
    await act(async () => root.render(<MerchantAffiliateTaskEditor canWrite onPersisted={vi.fn()} taskId={null} />));
    await flush();
    expect(api.listPublishers).toHaveBeenCalledWith({ page: 1, pageSize: 20 });

    await act(async () => {
      container.querySelector<HTMLButtonElement>('[data-step="scope"]')?.click();
    });
    await setSelect(container.querySelector<HTMLSelectElement>('[data-field="publisher"]'), "merchant_account:31");
    expect(api.listShops).toHaveBeenCalledWith(
      expect.objectContaining({ publisherType: "merchant_account", merchantAccountId: 31 })
    );

    await act(async () => {
      container.querySelector<HTMLInputElement>('[data-shop-public-id="shop0000000011"]')?.click();
      container.querySelector<HTMLInputElement>('[data-shop-public-id="shop0000000012"]')?.click();
    });
    await flush();
    expect(api.listServices).toHaveBeenCalledWith(
      expect.objectContaining({
        publisherType: "merchant_account",
        merchantAccountId: 31,
        shopIds: "11,12"
      })
    );

    await setSelect(
      container.querySelector<HTMLSelectElement>('[data-field="serviceScopeMode"]'),
      "selected_services"
    );

    await act(async () => {
      container.querySelector<HTMLInputElement>('[data-service-name="Cut"]')?.click();
      container.querySelector<HTMLInputElement>('[data-service-name="Color"]')?.click();
      container.querySelector<HTMLInputElement>('[data-shop-public-id="shop0000000012"]')?.click();
    });
    await flush();
    expect(container.querySelector<HTMLInputElement>('[data-service-name="Color"]')?.checked).not.toBe(true);
    expect(container.textContent).toContain("shop0000000011");
    expect(container.textContent).not.toMatch(/(^|\s)31(\s|$)/);
    expect(container.textContent).not.toMatch(/(^|\s)101(\s|$)/);
    expect(container.textContent).not.toMatch(/(^|\s)102(\s|$)/);
  });

  it("creates a shop draft without merchant account or shop keys", async () => {
    const onPersisted = vi.fn();
    await act(async () => root.render(<MerchantAffiliateTaskEditor canWrite onPersisted={onPersisted} taskId={null} />));
    await flush();
    await setInput(container.querySelector<HTMLInputElement>('[data-field="name"]'), "New shop campaign");

    await act(async () => {
      container.querySelector<HTMLButtonElement>('[data-action="save-affiliate-draft"]')?.click();
    });
    await flush();

    const body = api.createDraft.mock.calls[0]?.[0] as unknown as Record<string, unknown>;
    expect(body).toMatchObject({
      publisherType: "shop",
      sourceLocale: "ja",
      coverMediaAssetId: null
    });
    expect(body).not.toHaveProperty("merchantAccountId");
    expect(body).not.toHaveProperty("shopIds");
    expect(container.querySelector('[data-field="coverMediaAssetId"]')).toBeNull();
    expect(onPersisted).toHaveBeenCalled();
  });

  it("creates a merchant draft with its selected multi-shop scope", async () => {
    await act(async () => root.render(<MerchantAffiliateTaskEditor canWrite onPersisted={vi.fn()} taskId={null} />));
    await flush();
    await setInput(container.querySelector<HTMLInputElement>('[data-field="name"]'), "New group campaign");
    await act(async () => {
      container.querySelector<HTMLButtonElement>('[data-step="scope"]')?.click();
    });
    await setSelect(container.querySelector<HTMLSelectElement>('[data-field="publisher"]'), "merchant_account:31");
    await act(async () => {
      container.querySelector<HTMLInputElement>('[data-shop-public-id="shop0000000011"]')?.click();
      container.querySelector<HTMLInputElement>('[data-shop-public-id="shop0000000012"]')?.click();
    });
    await flush();

    await act(async () => {
      container.querySelector<HTMLButtonElement>('[data-action="save-affiliate-draft"]')?.click();
    });
    await flush();
    expect(api.createDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        publisherType: "merchant_account",
        merchantAccountId: 31,
        shopIds: [11, 12],
        sourceLocale: "ja"
      })
    );
  });

  it("reloads persisted server values and preserves hidden cover media on update", async () => {
    await act(async () => root.render(<MerchantAffiliateTaskEditor canWrite onPersisted={vi.fn()} taskId={81} />));
    await flush();
    expect(api.getTask).toHaveBeenCalledWith(81);
    expect(container.querySelector<HTMLInputElement>('[data-field="name"]')?.value).toBe(
      "保存済みキャンペーン"
    );

    await act(async () => {
      container.querySelector<HTMLButtonElement>('[data-action="save-affiliate-draft"]')?.click();
    });
    await flush();
    expect(api.updateDraft).toHaveBeenCalledWith(
      81,
      expect.objectContaining({ lockVersion: 2, coverMediaAssetId: 41 })
    );
    expect(container.querySelector('[data-field="coverMediaAssetId"]')).toBeNull();
  });
});
