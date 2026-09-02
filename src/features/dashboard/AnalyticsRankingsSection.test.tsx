// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AnalyticsRankingsSection } from "./AnalyticsRankingsSection";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const coreMocks = vi.hoisted(() => ({ listCategories: vi.fn() }));
vi.mock("../core-read/api", () => ({ coreReadApi: coreMocks }));
vi.mock("./AnalyticsRankingPanel", () => ({
  AnalyticsRankingPanel: ({ kind, title, categories }: { kind: string; title: string; categories?: unknown[] }) => (
    <div data-categories={categories?.length ?? 0} data-kind={kind}>{title}</div>
  )
}));
vi.mock("../../i18n/I18nProvider", () => ({ useI18n: () => ({ language: "zh" }) }));

describe("AnalyticsRankingsSection", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.clearAllMocks();
    coreMocks.listCategories.mockResolvedValue({
      list: [
        { id: 7, name: "放松休闲", isActive: true },
        { id: 8, name: "已停用", isActive: false }
      ],
      total: 2,
      page: 1,
      page_size: 100
    });
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("renders the three requested Top10 panels with active formal service categories", async () => {
    await act(async () => root.render(<AnalyticsRankingsSection query={{ period: "last7days" }} />));
    expect(coreMocks.listCategories).toHaveBeenCalledWith({ page: 1, pageSize: 100 });
    expect([...container.querySelectorAll("[data-kind]")].map((node) => node.getAttribute("data-kind")))
      .toEqual(["service", "technician", "customer"]);
    expect(container.textContent).toContain("服务项目排行 TOP10");
    expect(container.textContent).toContain("技师排行 TOP10");
    expect(container.textContent).toContain("用户消费排行 TOP10");
    expect(container.querySelector('[data-kind="technician"]')?.getAttribute("data-categories")).toBe("1");
  });

  it("loads every formal category page before exposing the ranking filters", async () => {
    coreMocks.listCategories
      .mockResolvedValueOnce({
        list: [{ id: 7, name: "放松休闲", isActive: true }],
        total: 101,
        page: 1,
        page_size: 100
      })
      .mockResolvedValueOnce({
        list: [{ id: 107, name: "宠物相关", isActive: true }],
        total: 101,
        page: 2,
        page_size: 100
      });

    await act(async () => root.render(<AnalyticsRankingsSection query={{ period: "last7days" }} />));

    expect(coreMocks.listCategories).toHaveBeenNthCalledWith(1, { page: 1, pageSize: 100 });
    expect(coreMocks.listCategories).toHaveBeenNthCalledWith(2, { page: 2, pageSize: 100 });
    expect(container.querySelector('[data-kind="technician"]')?.getAttribute("data-categories")).toBe("2");
  });
});
