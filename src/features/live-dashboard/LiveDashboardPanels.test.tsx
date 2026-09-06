// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { LiveDashboardSnapshot } from "../../api/liveDashboard";
import { LiveDashboardPanels } from "./LiveDashboardPanels";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const money = { jpy: 12000, ndp: 32, testNdp: 4 };
const order = { orderNo: "NDO-100", status: "confirmed", serviceName: "家政服务", amountJpy: 12000, occurredAt: "2026-09-06T03:04:05.000Z" };
const snapshot = {
  scope: { country: "JP", admin1: "13", admin2: null, breadcrumbs: [{ level: "country", code: "JP", name: "日本" }, { level: "admin1", code: "13", name: "東京都" }] },
  evaluatedAt: "2026-09-06T03:04:05.000Z",
  cachedAt: "2026-09-06T03:04:05.000Z",
  freshnessSeconds: 2,
  cacheStatus: "miss",
  children: [],
  headline: { newOrders: 8, completedOrders: 5, newCustomers: 3, onboardedTechnicians: 2 },
  confirmedPayments: money,
  orders: { total: 8, serviceGmv: money, platformNetRevenue: { jpy: 500, ndp: 2, testNdp: 1 }, agentCommission: null },
  realtimeOrders: { list: [order], total: 1, page: 1, page_size: 20 },
  activity: [order],
  trend: [{ key: "2026-09-06", label: "09-06", orderCount: 8, confirmedPayments: money }],
  serviceRanking: [{ rank: 1, entityPublicId: "shop-1", displayName: "LifeDance", avatarUrl: null, gmvJpy: 12000, completedCount: 5 }],
  technicianRanking: [{ rank: 1, entityPublicId: "tech-1", displayName: "技师 A", avatarUrl: null, gmvJpy: 9000, completedCount: 4 }],
  coverage: { total: 8, attributed: 7, unresolved: 1, completenessPercent: 87.5 }
} as LiveDashboardSnapshot;

describe("LiveDashboardPanels", () => {
  let container: HTMLDivElement;
  let root: Root;
  beforeEach(() => {
    window.localStorage.setItem("needo.language.mode", "manual");
    window.localStorage.setItem("needo.language", "zh");
    Object.defineProperty(window, "matchMedia", { configurable: true, value: () => ({ matches: true, addEventListener() {}, removeEventListener() {} }) });
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });
  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    window.localStorage.clear();
  });

  it("keeps all operating panels on the committed scope and separates currencies", () => {
    act(() => root.render(<LiveDashboardPanels map={<div data-testid="map">map</div>} snapshot={snapshot} />));
    expect(container.querySelectorAll('[data-scope-label="日本 / 東京都"]').length).toBeGreaterThanOrEqual(5);
    expect(container.textContent).toContain("¥12,000");
    expect(container.textContent).toContain("32 NDP");
    expect(container.textContent).toContain("4 Test NDP");
    expect(container.textContent).toContain("代理商分佣暂不可用");
    expect(container.querySelector('[data-testid="map"]')).toBeTruthy();
  });

  it("renders only non-PII formal order fields", () => {
    act(() => root.render(<LiveDashboardPanels map={<div>map</div>} snapshot={snapshot} />));
    const text = container.textContent ?? "";
    expect(text).toContain("NDO-100");
    expect(text).toContain("家政服务");
    expect(text).not.toMatch(/customer|address|note/i);
  });

  it("shows truthful empty states without fabricated rows", () => {
    const empty = { ...snapshot, realtimeOrders: { ...snapshot.realtimeOrders, list: [], total: 0 }, activity: [], serviceRanking: [], technicianRanking: [] };
    act(() => root.render(<LiveDashboardPanels map={<div>map</div>} snapshot={empty} />));
    expect(container.textContent?.match(/暂无数据/g)?.length).toBeGreaterThanOrEqual(3);
    expect(container.querySelectorAll('[data-order-row]')).toHaveLength(0);
  });
});
