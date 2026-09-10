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
    const onOpenDetail = vi.fn();
    await act(async () => root.render(
      <AnalyticsRankingPanel
        categories={[{ id: 7, name: "放松休闲" }]}
        kind="technician"
        onOpenDetail={onOpenDetail}
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
    const detail = container.querySelector<HTMLButtonElement>(
      '[data-ranking-detail-control="true"]'
    );
    expect(detail).not.toBeNull();
    expect(detail?.getAttribute("aria-label")).toContain("美咲");
    await act(async () => detail?.click());
    expect(onOpenDetail).toHaveBeenCalledWith(response("technician").list[0]);

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
        onOpenDetail={() => undefined}
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
        onOpenDetail={() => undefined}
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
        onOpenDetail={() => undefined}
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
        onOpenDetail={() => undefined}
        query={{ period: "last7days" }}
        title="技师排行 TOP10"
      />
    ));
    expect(apiMocks.analyticsRankings).toHaveBeenLastCalledWith("technician", {
      metric: "gmv", period: "last7days", page: 1, pageSize: 10
    }, expect.objectContaining({ signal: expect.any(AbortSignal) }));
  });
  it("filters service rankings and opens the full paginated list with the current scope", async () => {
    apiMocks.analyticsRankings.mockImplementation(async (kind, query) => ({
      ...response(kind, query.metric),
      filter: { ...response(kind, query.metric).filter, categoryId: query.categoryId ?? null },
      page: query.page,
      total: 21,
      list: [{ ...response(kind).list[0], rank: (query.page - 1) * 10 + 1,
        displayName: `服务第${query.page}页` }]
    }));
    const onOpenDetail = vi.fn();
    await act(async () => root.render(
      <AnalyticsRankingPanel categories={[{ id: 7, name: "放松休闲" }]}
        kind="service" onOpenDetail={onOpenDetail}
        query={{ period: "custom", from: "2026-08-01", to: "2026-08-31", city: "东京" }}
        title="服务项目排行 TOP10" />
    ));
    const select = container.querySelector<HTMLSelectElement>("select");
    expect(select).not.toBeNull();
    await act(async () => {
      select!.value = "7";
      select!.dispatchEvent(new Event("change", { bubbles: true }));
      container.querySelector<HTMLButtonElement>('button[aria-label="服务项目排行 TOP10按完成次数排序"]')!.click();
    });
    const expectedQuery = { period: "custom", from: "2026-08-01", to: "2026-08-31", city: "东京",
      categoryId: 7, metric: "completedCount", page: 1, pageSize: 10 };
    expect(apiMocks.analyticsRankings).toHaveBeenLastCalledWith("service", expectedQuery, expect.anything());
    const more = container.querySelector<HTMLButtonElement>('[data-ranking-list-control]');
    expect(more?.textContent).toContain("查看详细");
    await act(async () => more!.click());
    const dialog = container.querySelector<HTMLElement>('[data-ranking-full-list]')!;
    expect(dialog).not.toBeNull();
    expect(dialog.textContent).toContain("服务项目排行详情");
    expect(dialog.textContent).not.toContain("TOP10");
    expect(apiMocks.analyticsRankings).toHaveBeenLastCalledWith("service", expectedQuery, expect.anything());
    await act(async () => dialog.querySelector<HTMLButtonElement>('button[aria-label="下一页"]')!.click());
    expect(apiMocks.analyticsRankings).toHaveBeenLastCalledWith("service", { ...expectedQuery, page: 2 }, expect.anything());
    expect(dialog.textContent).toContain("服务第2页");
    expect(dialog.textContent).toContain("11");
    await act(async () => dialog.querySelector<HTMLButtonElement>('[data-ranking-detail-control]')!.click());
    expect(onOpenDetail).toHaveBeenCalledWith(expect.objectContaining({ rank: 11 }));
    await act(async () => {
      const detailCategory = dialog.querySelector<HTMLSelectElement>('select[aria-label="服务项目排行详情服务类型"]')!;
      detailCategory.value = "";
      detailCategory.dispatchEvent(new Event("change", { bubbles: true }));
    });
    const { categoryId: _categoryId, ...unfiltered } = expectedQuery;
    expect(apiMocks.analyticsRankings).toHaveBeenLastCalledWith("service", unfiltered, expect.anything());
    await act(async () => dialog.querySelector<HTMLButtonElement>('button[aria-label="下一页"]')!.click());
    await act(async () => dialog.querySelector<HTMLButtonElement>('button[aria-label="下一页"]')!.click());
    expect(dialog.textContent).toContain("服务第3页");
    expect(dialog.querySelector<HTMLButtonElement>('button[aria-label="下一页"]')!.disabled).toBe(true);
    await act(async () => dialog.querySelector<HTMLButtonElement>('button[aria-label="上一页"]')!.click());
    expect(dialog.textContent).toContain("服务第2页");
    const requestCount = apiMocks.analyticsRankings.mock.calls.length;
    await act(async () => dialog.querySelector<HTMLButtonElement>('button[aria-label="关闭排行详情"]')!.click());
    expect(container.querySelector('[data-ranking-full-list]')).toBeNull();
    expect(container.querySelector<HTMLSelectElement>("select")!.value).toBe("7");
    expect(apiMocks.analyticsRankings.mock.calls.length).toBe(requestCount);
  });

  it("ignores stale page responses and retries failed detail loads without showing stale rows", async () => {
    let finishSecondPage: ((value: unknown) => void) | undefined;
    apiMocks.analyticsRankings.mockImplementation(async (kind, query) => {
      if (query.page === 2) return new Promise((resolve) => { finishSecondPage = resolve; });
      return { ...response(kind, query.metric), total: 21 };
    });
    await act(async () => root.render(<AnalyticsRankingPanel kind="service" variant="detail"
      onOpenDetail={() => undefined} query={{ period: "last7days" }} title="服务项目排行详情" />));
    await act(async () => container.querySelector<HTMLButtonElement>('button[aria-label="下一页"]')!.click());
    expect(container.textContent).not.toContain("肩颈舒缓");
    expect(container.querySelector<HTMLButtonElement>('button[aria-label="下一页"]')!.disabled).toBe(true);
    apiMocks.analyticsRankings.mockRejectedValueOnce(new Error("offline"));
    await act(async () => container.querySelector<HTMLButtonElement>('button[aria-label="服务项目排行详情按完成次数排序"]')!.click());
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("排行榜加载失败");
    await act(async () => finishSecondPage?.({ ...response("service"), list: [{ ...response("service").list[0], displayName: "过期响应" }], page: 2 }));
    expect(container.textContent).not.toContain("过期响应");
    await act(async () => [...container.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent === "重试加载排行榜")!.click());
    expect(container.textContent).toContain("肩颈舒缓");
    expect(apiMocks.analyticsRankings).toHaveBeenLastCalledWith("service", expect.objectContaining({ page: 1, metric: "completedCount" }), expect.anything());
  });

  it.each(["service", "technician", "customer"] as const)("queries time, city and 10/50/100 records in %s details independently", async (kind) => {
    await act(async () => root.render(<AnalyticsRankingPanel kind={kind} variant="detail" cities={["東京都", "大阪府"]}
      onOpenDetail={() => undefined} query={{ period: "last7days" }} title="排行详情" />));
    const pageSize = container.querySelector<HTMLSelectElement>('select[aria-label="每页条数"]');
    expect(pageSize).not.toBeNull();
    expect([...pageSize!.options].map((item) => item.value)).toEqual(["10", "50", "100"]);
    await act(async () => {
      pageSize!.value = "50"; pageSize!.dispatchEvent(new Event("change", { bubbles: true }));
      const city = container.querySelector<HTMLSelectElement>('select[aria-label="所属城市"]')!;
      city.value = "大阪府"; city.dispatchEvent(new Event("change", { bubbles: true }));
      const period = container.querySelector<HTMLSelectElement>('select[aria-label="统计期间"]')!;
      period.value = "month"; period.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await act(async () => container.querySelector('form')!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    expect(apiMocks.analyticsRankings).toHaveBeenLastCalledWith(kind, expect.objectContaining({ period: "month", city: "大阪府", page: 1, pageSize: 50 }), expect.anything());
    await act(async () => { pageSize!.value = "100"; pageSize!.dispatchEvent(new Event("change", { bubbles: true })); });
    expect(apiMocks.analyticsRankings).toHaveBeenLastCalledWith(kind, expect.objectContaining({ pageSize: 100, city: "大阪府" }), expect.anything());
  });

});
