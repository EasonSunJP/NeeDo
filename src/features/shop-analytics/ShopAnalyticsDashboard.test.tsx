// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BackofficeDashboardPayload } from "../../api/backofficeRealData";
import type { Language } from "../../i18n/translations";
import type { Store } from "../../types/domain";
import { ShopAnalyticsDashboard } from "./ShopAnalyticsDashboard";

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

const dashboard: BackofficeDashboardPayload = {
  filter: {
    period: "last7days",
    from: "2026-08-31",
    to: "2026-09-06",
    previousFrom: "2026-08-24",
    previousTo: "2026-08-30",
    timeZone: "Asia/Tokyo",
    granularity: "day",
    city: null,
    availableCities: []
  },
  summary: {
    availableScheduleSlots: { current: 18, previous: 12, changeRatePercent: 50 },
    activeTechnicians: { current: 6, previous: 5, changeRatePercent: 20 },
    registeredTechnicians: { current: 8, previous: 8, changeRatePercent: 0 },
    shopCount: null,
    newCustomers: null,
    pendingOrders: 3,
    serviceGmvJpy: 128_000
  },
  series: {
    buckets: [
      {
        key: "2026-09-05",
        label: "9/5",
        orderCount: 4,
        serviceGmvJpy: 58_000,
        platformNetRevenueNdp: 0,
        frozenNdp: 0,
        shopCount: 0,
        registeredTechnicianCount: 8,
        shopEstimatedGrossProfitJpy: 34_000,
        scheduleTotalHours: 48,
        scheduleAvailableHours: 18,
        scheduleBookedHours: 8
      },
      {
        key: "2026-09-06",
        label: "9/6",
        orderCount: 5,
        serviceGmvJpy: 70_000,
        platformNetRevenueNdp: 0,
        frozenNdp: 0,
        shopCount: 0,
        registeredTechnicianCount: 8,
        shopEstimatedGrossProfitJpy: 41_000,
        scheduleTotalHours: 48,
        scheduleAvailableHours: 16,
        scheduleBookedHours: 10
      }
    ]
  },
  headlineSeries3d: {
    from: "2026-09-04",
    to: "2026-09-06",
    timeZone: "Asia/Tokyo",
    buckets: ["2026-09-04", "2026-09-05", "2026-09-06"].map((key, index) => ({
      key,
      label: key.slice(5),
      availableScheduleSlots: 16 + index,
      activeTechnicians: 4 + index,
      registeredTechnicians: 8,
      shopCount: 1,
      newCustomers: 0
    }))
  },
  finance: {
    platformNetRevenue: { ndp: 0, testNdp: 0 },
    frozen: { ndp: 0, testNdp: 0 },
    userReward: { ndp: 0, testNdp: 0 },
    walletStock: null,
    withdrawn: null,
    shopNdpCost: { totalNdp: 820, platformNdp: 620, userRewardNdp: 200 }
  },
  shop: {
    publicId: "shop0000000011",
    name: "LifeDance Wellness 渋谷",
    city: "Tokyo",
    address: "東京都渋谷区道玄坂1-12-1",
    status: "published",
    billing: null,
    wallet: {
      status: "available",
      currency: "NDP",
      availableBalance: 5_000,
      frozenBalance: 400
    }
  },
  membership: { memberCount: 32, memberDataStatus: "ready", completedCustomerCount: 19 },
  scope: { kind: "shop", shopPublicId: "shop0000000011" }
};

describe("ShopAnalyticsDashboard formal API", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    testI18n.language = "zh";
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

  it("loads the authenticated shop dashboard instead of rendering the retired placeholder", async () => {
    const loadDashboard = vi.fn().mockResolvedValue(dashboard);

    await act(async () => {
      root.render(<ShopAnalyticsDashboard loadDashboard={loadDashboard} store={store} />);
    });

    await waitFor(() => expect(container.textContent).toContain("128,000"));
    expect(loadDashboard).toHaveBeenCalledWith(
      "merchant-admin",
      { period: "last7days" },
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    );
    expect(container.textContent).toContain("shop0000000011");
    expect(container.textContent).toContain("LifeDance Wellness 渋谷");
    expect(container.textContent).toContain("32");
    expect(container.textContent).not.toContain("等待正式 Analytics API");
    expect(container.querySelector('[data-testid="shop-analytics-trend"]')).not.toBeNull();
  });

  it("refetches the same formal endpoint when the period changes", async () => {
    const loadDashboard = vi.fn().mockResolvedValue(dashboard);

    await act(async () => {
      root.render(<ShopAnalyticsDashboard loadDashboard={loadDashboard} store={store} />);
    });
    await waitFor(() => expect(loadDashboard).toHaveBeenCalledTimes(1));

    const monthButton = Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find(
      (button) => button.textContent === "本月"
    );
    expect(monthButton).not.toBeUndefined();
    await act(async () => monthButton?.click());

    await waitFor(() => expect(loadDashboard).toHaveBeenCalledTimes(2));
    expect(loadDashboard).toHaveBeenLastCalledWith(
      "merchant-admin",
      { period: "month" },
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    );
  });

  it("uses a revenue range selector to request presets and a valid custom range", async () => {
    const loadDashboard = vi.fn().mockResolvedValue(dashboard);

    await act(async () => {
      root.render(
        <ShopAnalyticsDashboard
          {...{ initialPeriod: "today", periodControl: "select" }}
          loadDashboard={loadDashboard}
          store={store}
        />
      );
    });

    await waitFor(() => expect(loadDashboard).toHaveBeenCalledTimes(1));
    expect(loadDashboard).toHaveBeenLastCalledWith(
      "merchant-admin",
      { period: "today" },
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    );

    const periodSelect = container.querySelector<HTMLSelectElement>('select[aria-label="选择数据期间"]');
    expect(periodSelect).not.toBeNull();
    expect(Array.from(periodSelect?.options ?? []).map((option) => option.value)).toEqual([
      "today", "last7days", "last30days", "week", "month", "year", "custom"
    ]);

    await act(async () => {
      if (!periodSelect) return;
      periodSelect.value = "year";
      periodSelect.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await waitFor(() => expect(loadDashboard).toHaveBeenCalledTimes(2));
    expect(loadDashboard).toHaveBeenLastCalledWith(
      "merchant-admin",
      { period: "year" },
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    );

    await act(async () => {
      if (!periodSelect) return;
      periodSelect.value = "custom";
      periodSelect.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(container.querySelector('input[aria-label="开始日期"]')).not.toBeNull();
    expect(container.querySelector('input[aria-label="结束日期"]')).not.toBeNull();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("请选择开始日期和结束日期");
    expect(loadDashboard).toHaveBeenCalledTimes(2);

    const fromInput = container.querySelector<HTMLInputElement>('input[aria-label="开始日期"]');
    const toInput = container.querySelector<HTMLInputElement>('input[aria-label="结束日期"]');
    await act(async () => {
      if (!fromInput) return;
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(fromInput, "2026-09-01");
      fromInput.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(loadDashboard).toHaveBeenCalledTimes(2);
    await act(async () => {
      if (!toInput) return;
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(toInput, "2026-09-06");
      toInput.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await waitFor(() => expect(loadDashboard).toHaveBeenCalledTimes(3));
    expect(loadDashboard).toHaveBeenLastCalledWith(
      "merchant-admin",
      { period: "custom", from: "2026-09-01", to: "2026-09-06" },
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    );
  });

  it("rejects reversed custom dates without issuing another formal dashboard request", async () => {
    const loadDashboard = vi.fn().mockResolvedValue(dashboard);

    await act(async () => {
      root.render(<ShopAnalyticsDashboard {...{ initialPeriod: "today", periodControl: "select" }} loadDashboard={loadDashboard} store={store} />);
    });
    await waitFor(() => expect(loadDashboard).toHaveBeenCalledTimes(1));

    const periodSelect = container.querySelector<HTMLSelectElement>('select[aria-label="选择数据期间"]');
    await act(async () => {
      if (!periodSelect) return;
      periodSelect.value = "custom";
      periodSelect.dispatchEvent(new Event("change", { bubbles: true }));
    });
    const fromInput = container.querySelector<HTMLInputElement>('input[aria-label="开始日期"]');
    const toInput = container.querySelector<HTMLInputElement>('input[aria-label="结束日期"]');
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(fromInput, "2026-09-06");
      fromInput?.dispatchEvent(new Event("input", { bubbles: true }));
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(toInput, "2026-09-01");
      toInput?.dispatchEvent(new Event("input", { bubbles: true }));
    });

    expect(container.querySelector('[role="alert"]')?.textContent).toContain("开始日期不能晚于结束日期");
    expect(loadDashboard).toHaveBeenCalledTimes(1);
  });

  it("aborts a replaced period request and ignores its late response", async () => {
    let resolveToday: ((payload: BackofficeDashboardPayload) => void) | undefined;
    let resolveYear: ((payload: BackofficeDashboardPayload) => void) | undefined;
    const todayResponse = new Promise<BackofficeDashboardPayload>((resolve) => { resolveToday = resolve; });
    const yearResponse = new Promise<BackofficeDashboardPayload>((resolve) => { resolveYear = resolve; });
    const loadDashboard = vi.fn()
      .mockImplementationOnce(() => todayResponse)
      .mockImplementationOnce(() => yearResponse);
    const yearDashboard: BackofficeDashboardPayload = {
      ...dashboard,
      summary: { ...dashboard.summary, serviceGmvJpy: 210_000 }
    };

    await act(async () => {
      root.render(<ShopAnalyticsDashboard {...{ initialPeriod: "today", periodControl: "select" }} loadDashboard={loadDashboard} store={store} />);
    });
    await waitFor(() => expect(loadDashboard).toHaveBeenCalledTimes(1));
    const todaySignal = (loadDashboard.mock.calls[0]?.[2] as { signal: AbortSignal }).signal;

    const periodSelect = container.querySelector<HTMLSelectElement>('select[aria-label="选择数据期间"]');
    await act(async () => {
      if (!periodSelect) return;
      periodSelect.value = "year";
      periodSelect.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await waitFor(() => expect(loadDashboard).toHaveBeenCalledTimes(2));
    expect(todaySignal.aborted).toBe(true);

    await act(async () => resolveYear?.(yearDashboard));
    await waitFor(() => expect(container.textContent).toContain("210,000"));
    await act(async () => resolveToday?.(dashboard));
    await act(async () => Promise.resolve());
    expect(container.textContent).toContain("210,000");
    expect(container.textContent).not.toContain("128,000");
  });

  it("shows an explicit retry state without falling back to browser aggregates", async () => {
    const loadDashboard = vi
      .fn()
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValueOnce(dashboard);

    await act(async () => {
      root.render(<ShopAnalyticsDashboard loadDashboard={loadDashboard} store={store} />);
    });
    await waitFor(() => expect(container.textContent).toContain("本店分析快照加载失败"));

    const retryButton = Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find(
      (button) => button.textContent === "重新加载"
    );
    await act(async () => retryButton?.click());

    await waitFor(() => expect(container.textContent).toContain("128,000"));
    expect(loadDashboard).toHaveBeenCalledTimes(2);
  });

  it("keeps unavailable formal metrics unknown instead of inventing zero values", async () => {
    const unavailableDashboard: BackofficeDashboardPayload = {
      ...dashboard,
      finance: { ...dashboard.finance, shopNdpCost: null },
      membership: null
    };
    const loadDashboard = vi.fn().mockResolvedValue(unavailableDashboard);

    await act(async () => {
      root.render(<ShopAnalyticsDashboard loadDashboard={loadDashboard} store={store} />);
    });
    await waitFor(() => expect(container.textContent).toContain("128,000"));

    const metricValues = Array.from(container.querySelectorAll<HTMLElement>(".shop-analytics-tile strong"))
      .map((element) => element.textContent);
    expect(metricValues).toEqual(["￥128,000", "3", "6", "—", "18", "—"]);
  });

  it("renders technician-style peak context and a visible node for every formal bucket", async () => {
    const loadDashboard = vi.fn().mockResolvedValue(dashboard);

    await act(async () => {
      root.render(<ShopAnalyticsDashboard loadDashboard={loadDashboard} store={store} />);
    });
    await waitFor(() => expect(container.textContent).toContain("128,000"));

    expect(container.textContent).toContain("同一期间 · 双独立刻度");
    expect(container.textContent).toContain("￥70,000 峰值");
    expect(container.textContent).toContain("5单 峰值");
    expect(
      container.querySelectorAll('[data-series="revenue"] [data-chart-node="true"]')
    ).toHaveLength(dashboard.series.buckets.length);
    expect(
      container.querySelectorAll('[data-series="orders"] [data-chart-node="true"]')
    ).toHaveLength(dashboard.series.buckets.length);
  });

  it("lets each bottom legend hide and restore only its own series", async () => {
    const loadDashboard = vi.fn().mockResolvedValue(dashboard);

    await act(async () => {
      root.render(<ShopAnalyticsDashboard loadDashboard={loadDashboard} store={store} />);
    });
    await waitFor(() => expect(container.textContent).toContain("128,000"));

    const revenueLegend = container.querySelector<HTMLButtonElement>(
      'button[aria-label="隐藏营业额趋势"]'
    );
    const ordersLegend = container.querySelector<HTMLButtonElement>(
      'button[aria-label="隐藏订单数趋势"]'
    );
    expect(revenueLegend?.getAttribute("aria-pressed")).toBe("true");
    expect(ordersLegend?.getAttribute("aria-pressed")).toBe("true");

    await act(async () => revenueLegend?.click());
    expect(container.querySelector('[data-series="revenue"]')).toBeNull();
    expect(container.querySelector('[data-series="orders"]')).not.toBeNull();
    expect(revenueLegend?.getAttribute("aria-label")).toBe("显示营业额趋势");

    await act(async () => revenueLegend?.click());
    await act(async () => ordersLegend?.click());
    expect(container.querySelector('[data-series="revenue"]')).not.toBeNull();
    expect(container.querySelector('[data-series="orders"]')).toBeNull();
    expect(ordersLegend?.getAttribute("aria-label")).toBe("显示订单数趋势");
  });

  it("renders translated subtitle, peaks, and both legend states in English", async () => {
    testI18n.language = "en";
    const loadDashboard = vi.fn().mockResolvedValue(dashboard);

    await act(async () => {
      root.render(<ShopAnalyticsDashboard loadDashboard={loadDashboard} store={store} />);
    });
    await waitFor(() => expect(container.textContent).toContain("128,000"));

    expect(container.textContent).toContain("Same period · two independent scales");
    expect(container.textContent).toContain("5 orders Peak");
    const revenueLegend = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Hide revenue trend"]'
    );
    const ordersLegend = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Hide order trend"]'
    );
    expect(revenueLegend).not.toBeNull();
    expect(ordersLegend).not.toBeNull();

    await act(async () => revenueLegend?.click());
    expect(revenueLegend?.getAttribute("aria-label")).toBe("Show revenue trend");
    await act(async () => revenueLegend?.click());
    await act(async () => ordersLegend?.click());
    expect(ordersLegend?.getAttribute("aria-label")).toBe("Show order trend");
  });

  it("centers a single zero-value bucket and keeps both nodes on the baseline", async () => {
    const zeroDashboard: BackofficeDashboardPayload = {
      ...dashboard,
      series: {
        buckets: [{
          ...dashboard.series.buckets[0]!,
          key: "2026-09-06",
          label: "9/6",
          orderCount: 0,
          serviceGmvJpy: 0
        }]
      }
    };
    const loadDashboard = vi.fn().mockResolvedValue(zeroDashboard);

    await act(async () => {
      root.render(<ShopAnalyticsDashboard loadDashboard={loadDashboard} store={store} />);
    });
    await waitFor(() => expect(container.textContent).toContain("￥0 峰值"));

    const nodes = container.querySelectorAll<SVGCircleElement>('[data-chart-node="true"]');
    expect(nodes).toHaveLength(2);
    nodes.forEach((node) => {
      expect(node.getAttribute("cx")).toBe("319");
      expect(node.getAttribute("cy")).toBe("206");
    });
    expect(container.textContent).toContain("0单 峰值");
  });

  it("keeps every trend bucket inside a 440px mobile chart card", async () => {
    const mobileDashboard: BackofficeDashboardPayload = {
      ...dashboard,
      series: {
        buckets: Array.from({ length: 7 }, (_, index) => ({
          ...dashboard.series.buckets[index % dashboard.series.buckets.length]!,
          key: `2026-09-${String(index + 4).padStart(2, "0")}`,
          label: `9/${index + 4}`,
          orderCount: index + 1,
          serviceGmvJpy: (index + 1) * 10_000
        }))
      }
    };
    const loadDashboard = vi.fn().mockResolvedValue(mobileDashboard);

    await act(async () => {
      root.render(<ShopAnalyticsDashboard loadDashboard={loadDashboard} store={store} />);
    });
    await waitFor(() => expect(container.textContent).toContain("70,000"));

    const svg = container.querySelector<SVGSVGElement>('[data-testid="shop-analytics-trend"] svg');
    expect(svg?.getAttribute("class")).toContain("w-full");
    expect(svg?.getAttribute("class")).not.toContain("min-w-[520px]");
    expect(container.querySelectorAll('[data-chart-node="true"]')).toHaveLength(14);
  });
});
