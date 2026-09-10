// @vitest-environment jsdom
import { act } from "react";
import type { ComponentType } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { backofficeRealDataApi, type BackofficeDashboardPayload } from "../../api/backofficeRealData";
import type { Language } from "../../i18n/translations";
import type { Store } from "../../types/domain";
import * as MerchantPortalPage from "./MerchantPortalPage";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const testI18n = vi.hoisted(() => ({ language: "zh" as Language }));
vi.mock("../../i18n/I18nProvider", () => ({
  useOptionalI18n: () => ({ language: testI18n.language, setLanguage: vi.fn() })
}));

const store: Store = {
  id: "11",
  systemId: "shop0000000011",
  merchantId: "merchant-11",
  name: "LifeDance Wellness 渋谷",
  area: "Tokyo",
  address: "東京都渋谷区道玄坂1-12-1",
  rating: 4.8,
  reviewCount: 24,
  priceLabel: "¥6,500 - ¥12,000",
  tags: [],
  openStatus: "open",
  nextSlot: "可预约",
  cover: "/store.jpg",
  gallery: ["/store.jpg"],
  description: "Wellness",
  rankLabel: "公开店铺",
  businessHours: "10:00-22:00",
  mode: "store"
};

const dashboard = {
  filter: { from: "2026-09-06", to: "2026-09-06" },
  summary: {
    availableScheduleSlots: { current: 18 },
    activeTechnicians: { current: 6 },
    pendingOrders: 3,
    serviceGmvJpy: 128_000
  },
  series: { buckets: [{ key: "2026-09-06", label: "9/6", orderCount: 5, serviceGmvJpy: 128_000 }] },
  finance: { shopNdpCost: { totalNdp: 820 } },
  shop: { publicId: "shop0000000011", name: "LifeDance Wellness 渋谷" },
  membership: { memberCount: 32 }
} as BackofficeDashboardPayload;

type MerchantRevenueDrilldownProps = {
  loadDashboard?: typeof backofficeRealDataApi.dashboard;
  onExit: () => void;
  store: Store;
};
const MerchantRevenueDrilldown = (MerchantPortalPage as unknown as {
  MerchantRevenueDrilldown: ComponentType<MerchantRevenueDrilldownProps>;
}).MerchantRevenueDrilldown;

describe("MerchantRevenueDrilldown", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  async function waitFor(assertion: () => void) {
    let lastError: unknown;
    for (let attempt = 0; attempt < 30; attempt += 1) {
      try {
        assertion();
        return;
      } catch (error) {
        lastError = error;
        await act(async () => Promise.resolve());
      }
    }
    throw lastError;
  }

  it("renders the revenue header controls and focuses the formal period selector from search", async () => {
    const loadDashboard = vi.fn().mockResolvedValue(dashboard);
    const onExit = vi.fn();

    await act(async () => {
      root.render(<MerchantRevenueDrilldown loadDashboard={loadDashboard} onExit={onExit} store={store} />);
    });

    await waitFor(() => expect(loadDashboard).toHaveBeenCalledTimes(1));
    expect(loadDashboard).toHaveBeenLastCalledWith(
      "merchant-admin",
      { period: "today" },
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    );
    const periodSelect = container.querySelector<HTMLSelectElement>('select[aria-label="选择数据期间"]');
    const searchControl = container.querySelector<HTMLButtonElement>('button[aria-label="查询营业额日期"]');
    expect(periodSelect).not.toBeNull();
    expect(searchControl).not.toBeNull();

    await act(async () => searchControl?.click());
    expect(document.activeElement).toBe(periodSelect);

    await act(async () => container.querySelector<HTMLButtonElement>('button[aria-label="返回"]')?.click());
    await act(async () => container.querySelector<HTMLButtonElement>('button[aria-label="关闭"]')?.click());
    expect(onExit).toHaveBeenCalledTimes(2);
  });
});
