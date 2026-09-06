// @vitest-environment jsdom

import fs from "node:fs";
import path from "node:path";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LiveDashboardSnapshot } from "../../api/liveDashboard";
import { JapanRegionMap, mapAssetUrl } from "./JapanRegionMap";
import * as labelLayout from "./mapLabelLayout";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const readAsset = (file: string) => JSON.parse(fs.readFileSync(path.join(process.cwd(), file), "utf8"));
const country = readAsset("public/maps/jp/2026/country.json");
const tokyo = readAsset("public/maps/jp/2026/prefectures/13.json");
const searchIndex = readAsset("public/maps/jp/2026/search-index.json");
const money = { jpy: 0, ndp: 0, testNdp: 0 };
const childrenFor = (asset: typeof country) => asset.regions.map((region: { code: string; nameJa: string }, index: number) => ({
  code: region.code,
  name: region.nameJa,
  orderCount: index,
  confirmedPayments: { ...money, jpy: index * 1000 }
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
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    window.localStorage.clear();
  });

  it("lays labels out in physical viewport pixels after resize without fetching", async () => {
    let resize: ResizeObserverCallback = () => {};
    vi.stubGlobal("ResizeObserver", class {
      constructor(callback: ResizeObserverCallback) { resize = callback; }
      observe() {} disconnect() {}
    });
    const fetcher = vi.fn(async (url: string) => ({ ok: true, json: async () => url.includes("search-index") ? searchIndex : country }));
    vi.stubGlobal("fetch", fetcher);
    await act(async () => root.render(<JapanRegionMap children={childrenFor(country)} onSelectRegion={vi.fn()} scope={{ country: "JP", period: "today" }} />));
    await act(async () => resize([{ contentRect: { width: 880, height: 220 } } as ResizeObserverEntry], {} as ResizeObserver));
    const svg = container.querySelector("svg")!;
    expect(svg.getAttribute("viewBox")).toBe("0 0 880 220");
    expect(svg.querySelector("[data-map-projection]")).toBeTruthy();
    expect(svg.querySelector("[data-map-projection] [data-map-label]")).toBeNull();
    expect(svg.querySelectorAll("[data-map-label]")).toHaveLength(47);
    const labels = [...svg.querySelectorAll("[data-map-label]")];
    labels.forEach((label) => {
      expect(Number(label.getAttribute("x"))).toBeGreaterThan(0);
      expect(Number(label.getAttribute("y"))).toBeGreaterThan(0);
      expect(Number(label.getAttribute("y"))).toBeLessThan(220);
    });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("explains dense label capacity and retains every region with focus disclosure", async () => {
    const hokkaido = readAsset("public/maps/jp/2026/prefectures/01.json");
    let resize: ResizeObserverCallback = () => {};
    vi.stubGlobal("ResizeObserver", class { constructor(callback: ResizeObserverCallback) { resize = callback; } observe() {} disconnect() {} });
    vi.stubGlobal("fetch", vi.fn(async (url: string) => ({ ok: true, json: async () => url.includes("search-index") ? searchIndex : hokkaido })));
    await act(async () => root.render(<JapanRegionMap children={childrenFor(hokkaido)} onSelectRegion={vi.fn()} scope={{ country: "JP", admin1: "01", period: "today" }} />));
    await act(async () => resize([{ contentRect: { width: 880, height: 220 } } as ResizeObserverEntry], {} as ResizeObserver));
    expect(container.querySelectorAll("[data-map-region]")).toHaveLength(195);
    const labels = [...container.querySelectorAll("[data-map-label]")].map((label) => label.getAttribute("data-map-label"));
    expect(labels.length).toBeLessThan(195);
    expect(container.querySelector(".live-dashboard-map-label-status")?.textContent).toContain(`${labels.length} / 195`);
    const undisclosed = [...container.querySelectorAll<SVGPathElement>("[data-map-region]")].find((item) => !labels.includes(item.getAttribute("data-region-code")))!;
    await act(async () => undisclosed.dispatchEvent(new FocusEvent("focusin", { bubbles: true })));
    expect(container.querySelector(`[data-map-label="${undisclosed.getAttribute("data-region-code")}"]`)).toBeTruthy();
    const beforeZoom = [...container.querySelectorAll("[data-map-label]")].map((label) => label.getAttribute("data-map-label"));
    await act(async () => container.querySelector<HTMLButtonElement>('button[aria-label="放大地图"]')!.click());
    const afterZoom = [...container.querySelectorAll("[data-map-label]")].map((label) => label.getAttribute("data-map-label"));
    expect(afterZoom.some((code) => !beforeZoom.includes(code))).toBe(true);
    expect(container.querySelectorAll("[data-map-region]")).toHaveLength(195);
  });

  it("retains persistent Hokkaido selection alongside a different transient focus", async () => {
    const hokkaido = readAsset("public/maps/jp/2026/prefectures/01.json");
    let resize: ResizeObserverCallback = () => {};
    vi.stubGlobal("ResizeObserver", class { constructor(callback: ResizeObserverCallback) { resize = callback; } observe() {} disconnect() {} });
    vi.stubGlobal("fetch", vi.fn(async (url: string) => ({ ok: true, json: async () => url.includes("search-index") ? searchIndex : hokkaido })));
    await act(async () => root.render(<JapanRegionMap children={childrenFor(hokkaido)} onSelectRegion={vi.fn()} scope={{ country: "JP", admin1: "01", admin2: "01101", period: "today" }} />));
    await act(async () => resize([{ contentRect: { width: 880, height: 220 } } as ResizeObserverEntry], {} as ResizeObserver));
    const other = container.querySelector<SVGPathElement>('[data-region-code="01345"]')!;
    await act(async () => other.dispatchEvent(new FocusEvent("focusin", { bubbles: true })));
    expect(container.querySelector('[data-map-label="01101"]')).toBeTruthy();
    expect(container.querySelector('[data-map-label="01345"]')).toBeTruthy();
    let frame: FrameRequestCallback = () => {};
    vi.stubGlobal("requestAnimationFrame", vi.fn((callback: FrameRequestCallback) => { frame = callback; return 1; }));
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    const layout = vi.spyOn(labelLayout, "layoutMapLabels");
    await act(async () => container.querySelector<HTMLButtonElement>('button[aria-label="放大地图"]')!.click());
    const svg = container.querySelector("svg")!;
    Object.assign(svg, { setPointerCapture: vi.fn(), releasePointerCapture: vi.fn(), hasPointerCapture: () => true });
    vi.spyOn(svg, "getBoundingClientRect").mockReturnValue({ width: 880, height: 220 } as DOMRect);
    const pointer = async (type: string, x: number) => act(async () => {
      const event = new MouseEvent(type, { bubbles: true, clientX: x, clientY: 100 });
      Object.defineProperty(event, "pointerId", { value: 1 });
      svg.dispatchEvent(event);
    });
    const settled = layout.mock.calls.length;
    await pointer("pointerdown", 100);
    for (const x of [110, 120, 130]) {
      await pointer("pointermove", x);
      await act(async () => frame(0));
      expect(layout).toHaveBeenCalledTimes(settled);
    }
    await pointer("pointerup", 135);
    expect(layout).toHaveBeenCalledTimes(settled + 1);
    expect(container.querySelector('[data-map-label="01101"]')).toBeTruthy();
    expect(container.querySelector('[data-map-label="01345"]')).toBeTruthy();
    expect(fetch).toHaveBeenCalledTimes(2);
    await act(async () => other.dispatchEvent(new FocusEvent("focusout", { bubbles: true })));
    expect(container.querySelector('[data-map-label="01101"]')).toBeTruthy();
  });

  it("loads the local country asset and exposes all 47 prefectures", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => country }));
    const onSelect = vi.fn();
    await act(async () => root.render(
      <JapanRegionMap children={childrenFor(country)} onSelectRegion={onSelect} scope={{ country: "JP", period: "today" }} />
    ));
    await act(async () => Promise.resolve());
    const paths = container.querySelectorAll('[data-map-region][role="button"]');
    expect(paths).toHaveLength(47);
    expect(container.querySelector(".live-dashboard-map-inset")?.getAttribute("pointer-events"))
      .toBe("none");
    const tokyoPath = container.querySelector<SVGPathElement>('[data-region-code="13"]')!;
    expect(tokyoPath.getAttribute("aria-label")).toContain("東京都");
    await act(async () => tokyoPath.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(onSelect).toHaveBeenCalledWith({ country: "JP", admin1: "13", period: "today" });
  });

  it("loads Tokyo municipalities, supports keyboard selection, and keeps 23 wards", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => tokyo }));
    const onSelect = vi.fn();
    await act(async () => root.render(
      <JapanRegionMap children={childrenFor(tokyo)} onSelectRegion={onSelect} scope={{ country: "JP", admin1: "13", period: "today" }} />
    ));
    await act(async () => Promise.resolve());
    expect(container.querySelectorAll('[data-region-code^="131"]')).toHaveLength(23);
    const shinjuku = container.querySelector<SVGPathElement>('[data-region-code="13104"]')!;
    await act(async () => shinjuku.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })));
    expect(onSelect).toHaveBeenCalledWith({ country: "JP", admin1: "13", admin2: "13104", period: "today" });
    expect(container.querySelector('[role="tooltip"]')?.textContent).toContain("新宿区");
  });

  it("uses the same formal region data in a selector when the asset fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    const onSelect = vi.fn();
    await act(async () => root.render(
      <JapanRegionMap children={childrenFor(country)} onSelectRegion={onSelect} scope={{ country: "JP", period: "today" }} />
    ));
    await act(async () => Promise.resolve());
    const select = container.querySelector<HTMLSelectElement>('select[aria-label="都道府县"]')!;
    expect(select).toBeTruthy();
    expect(select.options).toHaveLength(48);
    select.value = "13";
    await act(async () => select.dispatchEvent(new Event("change", { bubbles: true })));
    expect(onSelect).toHaveBeenCalledWith({ country: "JP", admin1: "13", period: "today" });
  });

  it("maps scopes only to versioned same-origin assets", () => {
    expect(mapAssetUrl({ country: "JP", period: "today" })).toBe("/maps/jp/2026/country.json");
    expect(mapAssetUrl({ country: "JP", admin1: "13", admin2: "13104", period: "today" }))
      .toBe("/maps/jp/2026/prefectures/13.json");
  });

  it("retains nationwide search when the map alone fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => ({ ok: url.includes("search-index"), json: async () => searchIndex })));
    const onSelect = vi.fn();
    await act(async () => root.render(<JapanRegionMap children={childrenFor(country)} onSelectRegion={onSelect} scope={{ country: "JP", period: "last7days" }} />));
    expect(container.textContent).toContain("地图暂时无法显示");
    const input = container.querySelector<HTMLInputElement>('input[role="combobox"]')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "13104");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })));
    expect(onSelect).toHaveBeenCalledWith({ country: "JP", admin1: "13", admin2: "13104", period: "last7days" });
  });

  it("keeps local navigation outside the graphic and labels outside zoomed geometry", async () => {
    const fetcher = vi.fn(async (url: string) => ({ ok: true, json: async () => url.includes("search-index") ? searchIndex : country }));
    vi.stubGlobal("fetch", fetcher);
    const onSelect = vi.fn();
    await act(async () => root.render(<JapanRegionMap children={childrenFor(country)} onSelectRegion={onSelect} scope={{ country: "JP", period: "today" }} />));
    const graphic = container.querySelector(".live-dashboard-map-graphic")!;
    expect(container.querySelector(".live-dashboard-region-navigator")).toBeTruthy();
    expect(graphic?.querySelector(".live-dashboard-region-navigator")).toBeNull();
    expect(container.querySelectorAll("[data-map-label]")).toHaveLength(47);
    expect(container.querySelectorAll("[data-map-leader]").length).toBeGreaterThan(0);
    const geometry = container.querySelector("[data-map-geometry]")!;
    const stage = container.querySelector(".live-dashboard-map-stage")!;
    expect(stage.contains(geometry)).toBe(true);
    expect(stage.querySelector(".live-dashboard-map-leaders")).toBeTruthy();
    expect(stage.querySelector(".live-dashboard-region-navigator, .live-dashboard-map-toolbar")).toBeNull();
    expect(geometry.querySelector("[data-map-label]")).toBeNull();
    const button = (name: string) => container.querySelector<HTMLButtonElement>(`button[aria-label="${name}"]`)!;
    expect(button("缩小地图").disabled).toBe(true);
    for (let index = 0; index < 6; index++) await act(async () => button("放大地图").click());
    expect(geometry.getAttribute("transform")).toContain("scale(4)");
    expect(button("放大地图").disabled).toBe(true);
    await act(async () => button("还原地图").click());
    expect(geometry.getAttribute("transform")).toBe("translate(0 0) scale(1)");
    const input = container.querySelector<HTMLInputElement>('input[role="combobox"]')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "新宿");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(container.querySelector('[role="option"]')?.textContent).toContain("新宿区");
    expect(fetcher.mock.calls.map(([url]) => url).sort()).toEqual(["/maps/jp/2026/country.json", "/maps/jp/2026/search-index.json"]);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("preserves the selected Ogasawara geometry anchor through repeated zoom button clicks", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => ({ ok: true, json: async () => url.includes("search-index") ? searchIndex : tokyo })));
    await act(async () => root.render(<JapanRegionMap children={childrenFor(tokyo)} onSelectRegion={vi.fn()} scope={{ country: "JP", admin1: "13", admin2: "13421", period: "today" }} />));
    const anchor = tokyo.regions.find((region: { code: string }) => region.code === "13421").labelPoint;
    for (let step = 0; step < 6; step++) {
      await act(async () => container.querySelector<HTMLButtonElement>('button[aria-label="放大地图"]')!.click());
      const transform = container.querySelector("[data-map-geometry]")!.getAttribute("transform")!;
      const [, x, y, scale] = /translate\(([^ ]+) ([^)]+)\) scale\(([^)]+)\)/.exec(transform)!;
      expect(anchor[0] * Number(scale) + Number(x)).toBeCloseTo(anchor[0]);
      expect(anchor[1] * Number(scale) + Number(y)).toBeCloseTo(anchor[1]);
    }
  });

  it("keeps real country geometry visible after a maximum diagonal drag at 4x", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => ({ ok: true, json: async () => url.includes("search-index") ? searchIndex : country })));
    await act(async () => root.render(<JapanRegionMap children={childrenFor(country)} onSelectRegion={vi.fn()} scope={{ country: "JP", period: "today" }} />));
    for (let step = 0; step < 6; step++) await act(async () => container.querySelector<HTMLButtonElement>('button[aria-label="放大地图"]')!.click());
    const svg = container.querySelector("svg")!;
    Object.assign(svg, { setPointerCapture: vi.fn(), releasePointerCapture: vi.fn(), hasPointerCapture: () => true });
    vi.spyOn(svg, "getBoundingClientRect").mockReturnValue({ width: 1000, height: 1200 } as DOMRect);
    for (const [type, position] of [["pointerdown", 100], ["pointermove", 100000], ["pointerup", 100000]] as const) {
      await act(async () => {
        const event = new MouseEvent(type, { bubbles: true, clientX: position, clientY: position });
        Object.defineProperty(event, "pointerId", { value: 1 });
        svg.dispatchEvent(event);
      });
    }
    const transform = container.querySelector("[data-map-geometry]")!.getAttribute("transform")!;
    const [, x, y, scale] = /translate\(([^ ]+) ([^)]+)\) scale\(([^)]+)\)/.exec(transform)!;
    expect(Number(scale)).toBe(4);
    expect(country.regions.some((region: { labelPoint: [number, number] }) => {
      const px = region.labelPoint[0] * Number(scale) + Number(x);
      const py = region.labelPoint[1] * Number(scale) + Number(y);
      return px >= 0 && px <= 1000 && py >= 0 && py <= 1200;
    })).toBe(true);
  });

  it("pans only when zoomed, releases pointer capture and resets on scope changes", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => ({ ok: true, json: async () => url.includes("search-index") ? searchIndex : url.includes("prefectures") ? tokyo : country })));
    const onSelect = vi.fn();
    const render = async (admin1?: string, admin2?: string) => act(async () => root.render(<JapanRegionMap children={childrenFor(admin1 ? tokyo : country)} onSelectRegion={onSelect} scope={{ country: "JP", admin1, admin2, period: "today" }} />));
    await render();
    const svg = container.querySelector("svg")!;
    const capture = vi.fn(); const release = vi.fn();
    Object.assign(svg, { setPointerCapture: capture, releasePointerCapture: release, hasPointerCapture: () => true });
    vi.spyOn(svg, "getBoundingClientRect").mockReturnValue({ width: country.viewBox[2] / 2, height: country.viewBox[3] / 2 } as DOMRect);
    const pointer = async (type: string, x: number) => act(async () => {
      const event = new MouseEvent(type, { bubbles: true, clientX: x, clientY: 100 });
      Object.defineProperty(event, "pointerId", { value: 1 });
      svg.dispatchEvent(event);
    });
    await pointer("pointerdown", 100); await pointer("pointermove", 110);
    expect(capture).not.toHaveBeenCalled();
    await act(async () => container.querySelector<HTMLButtonElement>('button[aria-label="放大地图"]')!.click());
    const before = container.querySelector("[data-map-geometry]")!.getAttribute("transform");
    await pointer("pointerdown", 100); await pointer("pointermove", 110); await pointer("pointercancel", 110);
    expect(capture).toHaveBeenCalledWith(1);
    expect(release).toHaveBeenCalledWith(1);
    expect(container.querySelector("[data-map-geometry]")!.getAttribute("transform")).not.toBe(before);
    const translationX = (transform: string) => Number(/translate\(([-\d.]+)/.exec(transform)![1]);
    expect(translationX(container.querySelector("[data-map-geometry]")!.getAttribute("transform")!) - translationX(before!)).toBeCloseTo(20);
    await pointer("pointerdown", 110); await pointer("pointermove", 120); await pointer("pointerup", 120);
    expect(release).toHaveBeenCalledTimes(2);
    await act(async () => container.querySelector<SVGPathElement>('[data-region-code="13"]')!.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(onSelect).not.toHaveBeenCalled();
    await render("13");
    expect(container.querySelector("[data-map-geometry]")!.getAttribute("transform")).toBe("translate(0 0) scale(1)");
    await act(async () => container.querySelector<HTMLButtonElement>('button[aria-label="放大地图"]')!.click());
    await render("13", "13104");
    expect(container.querySelector("[data-map-geometry]")!.getAttribute("transform")).toBe("translate(0 0) scale(1)");
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("keeps clicks selectable and previews multiple drag frames with only one final label layout", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => ({ ok: true, json: async () => url.includes("search-index") ? searchIndex : country })));
    let frame: FrameRequestCallback | undefined;
    const requestFrame = vi.fn((callback: FrameRequestCallback) => { frame = callback; return 71; });
    const cancelFrame = vi.fn();
    vi.stubGlobal("requestAnimationFrame", requestFrame);
    vi.stubGlobal("cancelAnimationFrame", cancelFrame);
    const layout = vi.spyOn(labelLayout, "layoutMapLabels");
    const onSelect = vi.fn();
    await act(async () => root.render(<JapanRegionMap children={childrenFor(country)} onSelectRegion={onSelect} scope={{ country: "JP", period: "today" }} />));
    await act(async () => container.querySelector<HTMLButtonElement>('button[aria-label="放大地图"]')!.click());
    const svg = container.querySelector("svg")!;
    const region = container.querySelector<SVGPathElement>('[data-region-code="13"]')!;
    let captured = false;
    const capture = vi.fn(() => { captured = true; });
    const release = vi.fn(() => { captured = false; });
    Object.assign(svg, { setPointerCapture: capture, releasePointerCapture: release, hasPointerCapture: () => captured });
    vi.spyOn(svg, "getBoundingClientRect").mockReturnValue({ width: country.viewBox[2], height: country.viewBox[3] } as DOMRect);
    const pointer = async (type: string, x: number) => act(async () => {
      const event = new MouseEvent(type, { bubbles: true, clientX: x, clientY: 100 });
      Object.defineProperty(event, "pointerId", { value: 1 });
      (captured ? svg : region).dispatchEvent(event);
    });
    await pointer("pointerdown", 100);
    expect(capture).not.toHaveBeenCalled();
    await pointer("pointerup", 100);
    await act(async () => region.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(onSelect).toHaveBeenCalledTimes(1);
    onSelect.mockClear();
    const count = layout.mock.calls.length;
    await pointer("pointerdown", 100);
    for (let x = 110; x <= 150; x += 10) await pointer("pointermove", x);
    expect(capture).toHaveBeenCalledTimes(1);
    expect(requestFrame).toHaveBeenCalledTimes(1);
    expect(layout).toHaveBeenCalledTimes(count);
    await act(async () => frame!(0));
    expect(layout).toHaveBeenCalledTimes(count);
    for (const x of [152, 154, 156]) {
      await pointer("pointermove", x);
      await act(async () => frame!(0));
      expect(layout).toHaveBeenCalledTimes(count);
    }
    await pointer("pointermove", 160);
    await pointer("pointerup", 165);
    expect(cancelFrame).toHaveBeenCalledWith(71);
    expect(layout).toHaveBeenCalledTimes(count + 1);
    expect(layout.mock.calls.at(-1)![0].viewport.x).toBe(-country.viewBox[2] / 4 + 65);
    expect(container.querySelector("[data-map-geometry]")!.getAttribute("transform")).toContain(`translate(${-country.viewBox[2] / 4 + 65} `);
    await act(async () => svg.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(onSelect).not.toHaveBeenCalled();
    await pointer("pointerdown", 160); await pointer("pointermove", 170);
    await act(async () => frame!(0));
    expect(layout).toHaveBeenCalledTimes(count + 1);
    await pointer("pointercancel", 170);
    expect(layout).toHaveBeenCalledTimes(count + 2);
    expect(layout.mock.calls.at(-1)![0].viewport.x).toBe(-country.viewBox[2] / 4 + 75);
    await pointer("pointerdown", 170); await pointer("pointermove", 180);
    await act(async () => root.render(null));
    expect(layout).toHaveBeenCalledTimes(count + 2);
    expect(cancelFrame).toHaveBeenCalledTimes(2);
    expect(release).toHaveBeenCalledTimes(3);
  });

  it("clips map content at the stage without clipping the search results", async () => {
    const css = fs.readFileSync(path.join(process.cwd(), "src/styles.css"), "utf8");
    expect(css.match(/\.live-dashboard-map-stage\s*\{([^}]+)\}/)?.[1]).toMatch(/overflow:\s*hidden/);
    expect(css.match(/\.live-dashboard-map-card\s*\{([^}]+)\}/)?.[1]).not.toMatch(/overflow:\s*hidden/);
  });
});
