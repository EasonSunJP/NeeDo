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
    const select = container.querySelector<HTMLSelectElement>("select")!;
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
});
