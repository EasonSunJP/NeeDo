// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AnalyticsRankingPanel } from "./AnalyticsRankingPanel";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const apiMocks = vi.hoisted(() => ({ analyticsRankings: vi.fn() }));
vi.mock("../../api/backofficeRealData", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../api/backofficeRealData")>()),
  backofficeRealDataApi: apiMocks
}));
vi.mock("../../i18n/I18nProvider", () => ({ useI18n: () => ({ language: "zh" }) }));

const response = (kind: "service" | "technician" | "customer", metric = "gmv") => ({
  dataStatus: "ready" as const,
  filter: {
    kind,
    metric,
    period: "last7days" as const,
    from: "2026-08-27",
    to: "2026-09-02",
    timeZone: "Asia/Tokyo" as const,
    city: null,
    categoryId: null,
    evaluatedAt: "2026-09-02T05:00:00.000Z"
  },
  list: [{
    rank: 1,
    entityType: kind === "service" ? "service" as const : kind,
    entityPublicId: `${kind}-1`,
    entityNumericId: 1,
    displayName: kind === "technician" ? "美咲" : "肩颈舒缓",
    avatarUrl: null,
    categoryId: 7,
    gmvJpy: 12800,
    completedCount: 4,
    testGmvJpy: kind === "service" ? 12800 : kind === "technician" ? 6400 : 0,
    testCompletedCount: kind === "service" ? 4 : kind === "technician" ? 2 : 0,
    dataComposition: kind === "service" ? "test" as const : kind === "technician" ? "mixed" as const : "formal" as const,
    registeredAt: "2026-01-01T00:00:00.000Z"
  }],
  total: 1,
  page: 1,
  page_size: 10
});

describe("AnalyticsRankingPanel", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.clearAllMocks();
    apiMocks.analyticsRankings.mockImplementation(async (kind: "service" | "technician" | "customer", query: { metric: string; categoryId?: number }) => ({
      ...response(kind, query.metric),
      filter: { ...response(kind, query.metric).filter, categoryId: query.categoryId ?? null }
    }));
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("switches technician ranking between GMV and completed count using the formal API", async () => {
    await act(async () => root.render(
      <AnalyticsRankingPanel
        categories={[{ id: 7, name: "放松休闲" }]}
        kind="technician"
        query={{ period: "last7days" }}
        title="技师排行 TOP10"
      />
    ));

    expect(apiMocks.analyticsRankings).toHaveBeenCalledWith("technician", {
      metric: "gmv", period: "last7days", page: 1, pageSize: 10
    }, expect.objectContaining({ signal: expect.any(AbortSignal) }));
    expect(container.textContent).toContain("美咲");
    expect(container.textContent).toContain("¥12,800");
    expect(container.textContent).toContain("4 单");
    expect(
      container.querySelector('[data-ranking-header-row="primary"]')?.classList.contains("min-h-9")
    ).toBe(true);
    expect(container.querySelector('[data-dashboard-test-badge="true"]')?.textContent).toBe("TEST");

    await act(async () => {
      container.querySelector<HTMLButtonElement>('button[aria-label="技师排行 TOP10按完成次数排序"]')?.click();
    });
    expect(apiMocks.analyticsRankings).toHaveBeenLastCalledWith("technician", {
      metric: "completedCount", period: "last7days", page: 1, pageSize: 10
    }, expect.objectContaining({ signal: expect.any(AbortSignal) }));
  });

  it.each([
    ["service", true],
    ["technician", true],
    ["customer", false]
  ] as const)("renders test composition for %s without labelling formal rows", async (kind, expected) => {
    await act(async () => root.render(
      <AnalyticsRankingPanel
        kind={kind}
        query={{ period: "last7days" }}
        title="排行榜 TOP10"
      />
    ));

    expect(Boolean(container.querySelector('[data-dashboard-test-badge="true"]'))).toBe(expected);
  });

  it("applies the selected formal service category without client-side ranking", async () => {
    await act(async () => root.render(
      <AnalyticsRankingPanel
        categories={[{ id: 7, name: "放松休闲" }]}
        kind="customer"
        query={{ period: "last7days", city: "东京" }}
        title="用户消费排行 TOP10"
      />
    ));
    const select = container.querySelector<HTMLSelectElement>('select[aria-label="用户消费排行 TOP10服务类型"]')!;
    await act(async () => {
      select.value = "7";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(apiMocks.analyticsRankings).toHaveBeenLastCalledWith("customer", {
      metric: "gmv", period: "last7days", city: "东京", categoryId: 7, page: 1, pageSize: 10
    }, expect.objectContaining({ signal: expect.any(AbortSignal) }));
  });

  it("clears a selected category when the formal catalog no longer contains it", async () => {
    await act(async () => root.render(
      <AnalyticsRankingPanel
        categories={[{ id: 7, name: "放松休闲" }]}
        kind="technician"
        query={{ period: "last7days" }}
        title="技师排行 TOP10"
      />
    ));
    const select = container.querySelector<HTMLSelectElement>('select[aria-label="技师排行 TOP10服务类型"]')!;
    await act(async () => {
      select.value = "7";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(apiMocks.analyticsRankings).toHaveBeenLastCalledWith("technician", {
      metric: "gmv", period: "last7days", categoryId: 7, page: 1, pageSize: 10
    }, expect.objectContaining({ signal: expect.any(AbortSignal) }));

    await act(async () => root.render(
      <AnalyticsRankingPanel
        categories={[{ id: 8, name: "宠物相关" }]}
        kind="technician"
        query={{ period: "last7days" }}
        title="技师排行 TOP10"
      />
    ));
    expect(apiMocks.analyticsRankings).toHaveBeenLastCalledWith("technician", {
      metric: "gmv", period: "last7days", page: 1, pageSize: 10
    }, expect.objectContaining({ signal: expect.any(AbortSignal) }));
  });
});
