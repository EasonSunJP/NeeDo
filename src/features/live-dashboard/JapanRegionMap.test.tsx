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
});
