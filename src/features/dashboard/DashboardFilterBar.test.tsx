// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../../i18n/I18nProvider";
import { DashboardFilterBar, type DashboardFilterValue } from "./DashboardFilterBar";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("DashboardFilterBar", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  async function render(
    value: DashboardFilterValue,
    options: {
      cities?: string[];
      loading?: boolean;
      onApply?: (value: DashboardFilterValue) => void;
      onReset?: () => void;
    } = {}
  ) {
    await act(async () => {
      root.render(
        <I18nProvider>
          <DashboardFilterBar
            cities={options.cities}
            loading={options.loading ?? false}
            onApply={options.onApply ?? vi.fn()}
            onReset={options.onReset ?? vi.fn()}
            value={value}
          />
        </I18nProvider>
      );
    });
  }

  async function setValue(element: HTMLInputElement | HTMLSelectElement, value: string) {
    const prototype = element instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, "value")?.set?.call(element, value);
    await act(async () => element.dispatchEvent(new Event("change", { bubbles: true })));
  }

  it("uses the required last-seven-days default and supports keyboard focus", async () => {
    await render({ period: "last7days" });

    expect(container.querySelector<HTMLSelectElement>('[aria-label="统计期间"]')?.value).toBe("last7days");
    const apply = container.querySelector<HTMLButtonElement>('button[type="submit"]')!;
    apply.focus();
    expect(document.activeElement).toBe(apply);
    expect(apply.className).toContain("focus-visible");
  });

  it("reveals custom dates and applies the exact query with a city", async () => {
    const onApply = vi.fn();
    await render({ period: "last7days" }, { cities: ["东京", "大阪"], onApply });
    await setValue(container.querySelector('[aria-label="统计期间"]')!, "custom");
    await setValue(container.querySelector('[aria-label="开始日期"]')!, "2026-08-01");
    await setValue(container.querySelector('[aria-label="结束日期"]')!, "2026-08-31");
    await setValue(container.querySelector('[aria-label="所属城市"]')!, "东京");
    await act(async () => container.querySelector<HTMLFormElement>("form")?.requestSubmit());

    expect(onApply).toHaveBeenCalledWith({
      city: "东京",
      from: "2026-08-01",
      period: "custom",
      to: "2026-08-31"
    });
  });

  it("omits city completely for merchant usage", async () => {
    const onApply = vi.fn();
    await render({ city: "东京", period: "last7days" }, { onApply });

    expect(container.querySelector('[aria-label="所属城市"]')).toBeNull();
    await act(async () => container.querySelector<HTMLFormElement>("form")?.requestSubmit());
    expect(onApply).toHaveBeenCalledWith({ period: "last7days" });
  });

  it("resets the visible draft and asks the parent to reload defaults", async () => {
    const onReset = vi.fn();
    await render(
      { city: "东京", from: "2026-08-01", period: "custom", to: "2026-08-31" },
      { cities: ["东京"], onReset }
    );
    await act(async () => container.querySelector<HTMLButtonElement>('button[type="button"]')?.click());

    expect(onReset).toHaveBeenCalledTimes(1);
    expect(container.querySelector<HTMLSelectElement>('[aria-label="统计期间"]')?.value).toBe("last7days");
    expect(container.querySelector('[aria-label="开始日期"]')).toBeNull();
    expect(container.querySelector<HTMLSelectElement>('[aria-label="所属城市"]')?.value).toBe("");
  });

  it("disables apply while loading without discarding a failed-query draft", async () => {
    const initial = { period: "last7days" as const };
    await render(initial, { loading: false });
    await setValue(container.querySelector('[aria-label="统计期间"]')!, "custom");
    await setValue(container.querySelector('[aria-label="开始日期"]')!, "2026-08-01");
    await setValue(container.querySelector('[aria-label="结束日期"]')!, "2026-08-31");

    await render(initial, { loading: true });

    expect(container.querySelector<HTMLButtonElement>('button[type="submit"]')?.disabled).toBe(true);
    expect(container.querySelector<HTMLSelectElement>('[aria-label="统计期间"]')?.value).toBe("custom");
    expect(container.querySelector<HTMLInputElement>('[aria-label="开始日期"]')?.value).toBe("2026-08-01");
    expect(container.querySelector<HTMLInputElement>('[aria-label="结束日期"]')?.value).toBe("2026-08-31");
  });
});
