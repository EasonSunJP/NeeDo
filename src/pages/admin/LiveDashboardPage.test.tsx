// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import source from "./LiveDashboardPage.tsx?raw";
import { LiveDashboardPage } from "./LiveDashboardPage";

const hookMock = vi.hoisted(() => ({
  retry: vi.fn(),
  state: { snapshot: null, status: "loading", realtimeStatus: "connecting", error: null } as Record<string, unknown>
}));
vi.mock("../../features/live-dashboard/useLiveDashboard", () => ({
  useLiveDashboard: () => ({ state: hookMock.state, retry: hookMock.retry })
}));

const money = { jpy: 0, ndp: 0, testNdp: 0 };
const snapshot = {
  testNdpVisible: true,
  scope: { country: "JP", admin1: null, admin2: null, breadcrumbs: [{ level: "country", code: "JP", name: "日本" }] },
  evaluatedAt: "2026-09-06T03:04:05.000Z",
  cachedAt: "2026-09-06T03:04:05.000Z",
  freshnessSeconds: 1,
  cacheStatus: "miss",
  children: [],
  headline: { newOrders: 0, completedOrders: 0, newCustomers: 0, onboardedTechnicians: 0 },
  confirmedPayments: money,
  orders: { total: 0, serviceGmv: money, platformNetRevenue: money, agentCommission: null },
  realtimeOrders: { list: [], total: 0, page: 1, page_size: 20 },
  activity: [],
  trend: [],
  serviceRanking: [],
  technicianRanking: [],
  coverage: { total: 0, attributed: 0, unresolved: 0, completenessPercent: 0 }
};

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("LiveDashboardPage", () => {
  let root: Root;
  let container: HTMLDivElement;
  beforeEach(() => {
    vi.clearAllMocks();
    hookMock.state = { snapshot: null, status: "loading", realtimeStatus: "connecting", error: null };
    window.localStorage.setItem("needo.language.mode", "manual");
    window.localStorage.setItem("needo.language", "zh");
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });
  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it("keeps region navigation mounted at phone width without installing page scaling", async () => {
    vi.spyOn(window, "innerWidth", "get").mockReturnValue(390);
    const listener = vi.spyOn(window, "addEventListener");
    hookMock.state = { snapshot, status: "ready", realtimeStatus: "connected", error: null };
    await act(async () => root.render(<MemoryRouter><LiveDashboardPage /></MemoryRouter>));
    expect(container.querySelector(".live-dashboard-region-navigator")).toBeTruthy();
    expect(container.querySelector(".live-dashboard-workspace")?.getAttribute("style")).toBeNull();
    expect(listener.mock.calls.filter(([event]) => event === "resize")).toHaveLength(0);
  });

  it("renders a standalone operations screen shell", async () => {
    await act(async () => root.render(<MemoryRouter initialEntries={["/admin/live-screen?country=JP&period=today"]}><LiveDashboardPage /></MemoryRouter>));
    expect(container.querySelector('[data-testid="live-dashboard-grid"]')).toBeTruthy();
    expect(container.querySelector(".admin-sidebar")).toBeNull();
    expect(container.textContent).toContain("NeeDo 实时运营数据");
    expect(source).not.toContain("AdminLayout");
  });

  it("offers retry and a safe return route after first-load failure", async () => {
    hookMock.state = { snapshot: null, status: "error", realtimeStatus: "recovering", error: "error.dashboard.unavailable" };
    await act(async () => root.render(<MemoryRouter initialEntries={["/admin/live-screen?country=JP&period=today"]}><LiveDashboardPage /></MemoryRouter>));
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("无法读取运营数据");
    expect(container.querySelector<HTMLAnchorElement>('a[href="/pf-admin.html#/admin"]')?.textContent).toBe("返回数据大盘");
    await act(async () => [...container.querySelectorAll("button")].find((item) => item.textContent === "重试")!.click());
    expect(hookMock.retry).toHaveBeenCalledTimes(1);
  });

  it("keeps committed data visible and marks a failed refresh stale", async () => {
    hookMock.state = { snapshot, status: "stale", realtimeStatus: "recovering", error: "error.dashboard.unavailable" };
    await act(async () => root.render(<MemoryRouter initialEntries={["/admin/live-screen?country=JP&period=today"]}><LiveDashboardPage /></MemoryRouter>));
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("数据可能已过期");
    expect(container.textContent).toContain("实时概览");
    expect(container.querySelector('[role="status"]')?.textContent).toContain("实时连接恢复中");
  });

  it("contains one-second local clock and URL-first scope controls without data requests", () => {
    expect(source).toContain('timeZone: "Asia/Tokyo"');
    expect(source).toContain("window.setInterval(() => setNow(new Date()), 1000)");
    expect(source).toContain('params.set("period", nextScope.period)');
    expect(source).toContain("navigate({ pathname: location.pathname");
  });
});
