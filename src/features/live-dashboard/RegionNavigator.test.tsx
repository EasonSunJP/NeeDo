// @vitest-environment jsdom

import fs from "node:fs";
import path from "node:path";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LiveDashboardScope } from "../../api/liveDashboard";
import { RegionNavigator } from "./RegionNavigator";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const index = JSON.parse(fs.readFileSync(path.join(process.cwd(), "public/maps/jp/2026/search-index.json"), "utf8"));
const scope: LiveDashboardScope = { country: "JP", admin1: "13", admin2: "13104", period: "last7days" };
const breadcrumbs = [
  { level: "country" as const, code: "JP", name: "日本" },
  { level: "admin1" as const, code: "13", name: "東京都" },
  { level: "admin2" as const, code: "13104", name: "新宿区" }
];

async function settle() {
  await act(async () => Promise.resolve());
}

function byRole<T extends Element>(container: HTMLElement, role: string, name: string): T {
  return [...container.querySelectorAll<T>(`[role="${role}"]`)].find((element) => element.getAttribute("aria-label") === name || element.textContent === name)!;
}

describe("RegionNavigator", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    window.localStorage.setItem("needo.language.mode", "manual");
    window.localStorage.setItem("needo.language", "zh");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => index }));
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    window.localStorage.clear();
  });

  async function render(onSelectRegion = vi.fn(), nextScope = scope) {
    await act(async () => root.render(<RegionNavigator breadcrumbs={breadcrumbs} onSelectRegion={onSelectRegion} scope={nextScope} />));
    await settle();
    return onSelectRegion;
  }

  async function typeIntoSearch(value: string) {
    const input = container.querySelector<HTMLInputElement>('[role="combobox"][aria-label="全国地区搜索"]')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    return input;
  }

  it("renders labelled search and cascading selectors for the current scope", async () => {
    await render();
    expect(container.querySelector('[role="combobox"][aria-label="全国地区搜索"]')).toBeTruthy();
    expect(container.querySelector<HTMLSelectElement>('select[aria-label="都道府县"]')?.value).toBe("13");
    expect(container.querySelector<HTMLSelectElement>('select[aria-label="市区町村"]')?.value).toBe("13104");
  });

  it("selects a nationwide search result with Enter and preserves the period", async () => {
    const onSelectRegion = await render(vi.fn(), { country: "JP", admin1: "13", period: "last7days" });
    const input = await typeIntoSearch("新宿");
    expect(byRole(container, "option", "日本 / 東京都 / 新宿区")).toBeTruthy();
    await act(async () => input.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Enter" })));
    expect(onSelectRegion).toHaveBeenCalledWith({ country: "JP", admin1: "13", admin2: "13104", period: "last7days" });
  });

  it("supports ArrowDown, ArrowUp, and Escape for search results", async () => {
    await render();
    const input = await typeIntoSearch("市");
    await act(async () => input.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "ArrowDown" })));
    expect(input.getAttribute("aria-activedescendant")).toBeTruthy();
    await act(async () => input.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "ArrowUp" })));
    await act(async () => input.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Escape" })));
    expect(container.querySelector('[role="listbox"]')).toBeNull();
  });

  it("shows an empty result state and does not navigate from the current scope", async () => {
    const onSelectRegion = await render();
    const input = await typeIntoSearch("不存在");
    expect(container.textContent).toContain("没有匹配结果");
    await act(async () => input.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Enter" })));
    expect(onSelectRegion).not.toHaveBeenCalled();
  });

  it("cascades prefecture and municipality selection and returns to Japan", async () => {
    const onSelectRegion = await render();
    const prefecture = container.querySelector<HTMLSelectElement>('select[aria-label="都道府县"]')!;
    await act(async () => {
      prefecture.value = "14";
      prefecture.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await act(async () => root.render(<RegionNavigator breadcrumbs={breadcrumbs} onSelectRegion={onSelectRegion} scope={{ country: "JP", admin1: "14", period: "last7days" }} />));
    const municipality = container.querySelector<HTMLSelectElement>('select[aria-label="市区町村"]')!;
    await act(async () => {
      municipality.value = "14100";
      municipality.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await act(async () => root.render(<RegionNavigator breadcrumbs={breadcrumbs} onSelectRegion={onSelectRegion} scope={{ country: "JP", admin1: "14", admin2: "14100", period: "last7days" }} />));
    const updatedPrefecture = container.querySelector<HTMLSelectElement>('select[aria-label="都道府县"]')!;
    await act(async () => {
      updatedPrefecture.value = "";
      updatedPrefecture.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(onSelectRegion.mock.calls).toEqual([
      [{ country: "JP", admin1: "14", period: "last7days" }],
      [{ country: "JP", admin1: "14", admin2: "14100", period: "last7days" }],
      [{ country: "JP", period: "last7days" }]
    ]);
  });

  it("keeps current breadcrumbs available when the index fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    await render();
    expect(container.textContent).toContain("实时数据暂不可用");
    expect(container.textContent).toContain("日本 / 東京都 / 新宿区");
  });

  it("does not navigate when the selected scope is already current", async () => {
    const onSelectRegion = await render();
    const municipality = container.querySelector<HTMLSelectElement>('select[aria-label="市区町村"]')!;
    await act(async () => {
      municipality.value = "13104";
      municipality.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(onSelectRegion).not.toHaveBeenCalled();
  });
});
