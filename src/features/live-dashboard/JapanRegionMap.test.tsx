// @vitest-environment jsdom
import fs from "node:fs";
import path from "node:path";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LiveDashboardSnapshot } from "../../api/liveDashboard";
import { JapanRegionMap, mapAssetUrl } from "./JapanRegionMap";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const readAsset = (file: string) => JSON.parse(fs.readFileSync(path.join(process.cwd(), file), "utf8"));
const country = readAsset("public/maps/jp/2026/country.json");
const tokyo = readAsset("public/maps/jp/2026/prefectures/13.json");
const searchIndex = readAsset("public/maps/jp/2026/search-index.json");
const childrenFor = (asset: typeof country) => asset.regions.map((region: { code: string; nameJa: string }, index: number) => ({
  code: region.code,
  name: region.nameJa,
  orderCount: index,
  currentDayOrderCount: index,
  previousDayOrderCount: index,
  confirmedPayments: { jpy: index * 1000, ndp: 0, testNdp: 0 }
})) as LiveDashboardSnapshot["children"];

describe("JapanRegionMap", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    window.localStorage.setItem("needo.language.mode", "manual");
    window.localStorage.setItem("needo.language", "zh");
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    vi.stubGlobal("fetch", vi.fn(async (url: string) => ({ ok: true, json: async () => url.includes("search-index") ? searchIndex : url.includes("prefectures") ? tokyo : country })));
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    window.localStorage.clear();
  });

  const renderMap = async (asset = country, admin1?: string) => {
    await act(async () => root.render(
      <JapanRegionMap
        breadcrumbs={[]}
        children={childrenFor(asset)}
        evaluatedAt="2026-09-08T03:00:00.000Z"
        onSelectRegion={vi.fn()}
        scope={{ country: "JP", admin1, period: "today" }}
      />
    ));
    await act(async () => Promise.resolve());
  };

  it("uses local map assets and exposes every region for selection", async () => {
    await renderMap();
    expect(mapAssetUrl({ country: "JP", period: "today" })).toBe("/maps/jp/2026/country.json");
    expect(container.querySelectorAll("[data-map-region]")).toHaveLength(47);
    expect(container.querySelector('[data-region-code="13"]')?.getAttribute("aria-label")).toContain("東京都");
  });

  it("shows only prioritized internal names at national scale and has no leader lines", async () => {
    let resize: ResizeObserverCallback = () => {};
    vi.stubGlobal("ResizeObserver", class { constructor(callback: ResizeObserverCallback) { resize = callback; } observe() {} disconnect() {} });
    await renderMap();
    await act(async () => resize([{ contentRect: { width: 900, height: 360 } } as ResizeObserverEntry], {} as ResizeObserver));
    const labels = [...container.querySelectorAll("[data-map-label]")];
    expect(labels.length).toBeGreaterThan(0);
    expect(labels.length).toBeLessThanOrEqual(12);
    expect(container.querySelector("[data-map-leader], .live-dashboard-map-leaders")).toBeNull();
    expect(labels.some((label) => label.getAttribute("data-map-label") === "13")).toBe(true);
    expect(container.querySelector('[data-map-label="13"]')?.textContent).toBe("東京");
  });

  it("colors regions from green to red using yesterday's fixed minimum and maximum", async () => {
    await renderMap();
    expect(container.querySelector<SVGPathElement>('[data-region-code="01"]')?.style.fill).toBe("rgb(47, 158, 100)");
    expect(container.querySelector<SVGPathElement>('[data-region-code="47"]')?.style.fill).toBe("rgb(227, 77, 89)");
    expect(container.querySelector(".live-dashboard-map-heat-legend")?.textContent).toContain("2026-09-07");
    expect(container.querySelector(".live-dashboard-map-heat-legend")?.textContent).toContain("0");
    expect(container.querySelector(".live-dashboard-map-heat-legend")?.textContent).toContain("46");
  });

  it("replaces zoom buttons with a slider whose 100 percent endpoint is 8x", async () => {
    vi.useFakeTimers();
    await renderMap();
    expect(container.querySelector('button[aria-label="放大地图"], button[aria-label="缩小地图"]')).toBeNull();
    const slider = container.querySelector<HTMLInputElement>('input[type="range"][aria-label="地图缩放"]')!;
    expect(slider.max).toBe("100");
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(slider, "100");
      slider.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(container.querySelector("[data-map-geometry]")?.getAttribute("transform")).toContain("scale(8)");
    expect(container.querySelector(".live-dashboard-map-labels")?.getAttribute("data-hidden")).toBe("true");
    await act(async () => vi.advanceTimersByTime(250));
    expect(container.querySelector(".live-dashboard-map-labels")?.getAttribute("data-hidden")).toBe("false");
  });

  it("shows a region name on hover with current and previous day counts", async () => {
    await renderMap();
    const tokyoPath = container.querySelector<SVGPathElement>('[data-region-code="13"]')!;
    await act(async () => tokyoPath.dispatchEvent(new MouseEvent("mouseover", { bubbles: true })));
    expect(container.querySelector('[role="tooltip"]')?.textContent).toContain("東京都");
    expect(container.querySelector('[role="tooltip"]')?.textContent).toContain("今日订单");
    expect(container.querySelector('[role="tooltip"]')?.textContent).toContain("昨日订单");
  });

  it("supports two-pointer pinch zoom and hides names until the gesture settles", async () => {
    vi.useFakeTimers();
    await renderMap();
    const svg = container.querySelector<SVGSVGElement>(".live-dashboard-map-svg")!;
    Object.assign(svg, { setPointerCapture: vi.fn(), releasePointerCapture: vi.fn(), hasPointerCapture: () => true });
    vi.spyOn(svg, "getBoundingClientRect").mockReturnValue({ left: 0, top: 0, width: 1000, height: 800 } as DOMRect);
    const pointer = async (type: string, id: number, x: number, y: number) => act(async () => {
      const event = new MouseEvent(type, { bubbles: true, clientX: x, clientY: y });
      Object.defineProperties(event, { pointerId: { value: id }, pointerType: { value: "touch" }, button: { value: 0 } });
      svg.dispatchEvent(event);
    });
    await pointer("pointerdown", 1, 400, 400);
    await pointer("pointerdown", 2, 600, 400);
    await pointer("pointermove", 2, 800, 400);
    expect(container.querySelector("[data-map-geometry]")?.getAttribute("transform")).toContain("scale(2)");
    expect(container.querySelector(".live-dashboard-map-labels")?.getAttribute("data-hidden")).toBe("true");
    await pointer("pointerup", 1, 400, 400);
    await pointer("pointerup", 2, 800, 400);
    await act(async () => vi.advanceTimersByTime(250));
    expect(container.querySelector(".live-dashboard-map-labels")?.getAttribute("data-hidden")).toBe("false");
  });
});
