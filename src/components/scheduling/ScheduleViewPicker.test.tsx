// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ScheduleViewPicker } from "./ScheduleViewPicker";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

describe("ScheduleViewPicker", () => {
  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  it("opens a themed anchored menu and selects a view", async () => {
    const onChange = vi.fn();
    await act(async () => {
      root.render(
        <ScheduleViewPicker
          ariaLabel="切换排班展示范围"
          onChange={onChange}
          options={[
            { label: "1日", value: "day" },
            { label: "周", value: "week" },
            { label: "月", value: "month" },
          ]}
          value="week"
        />,
      );
    });

    const trigger = container.querySelector<HTMLButtonElement>('[aria-label="切换排班展示范围"]');
    expect(trigger?.getAttribute("aria-expanded")).toBe("false");
    await act(async () => trigger?.click());

    const menu = container.querySelector('[data-schedule-view-menu="true"]');
    expect(menu).not.toBeNull();
    expect(menu?.className).toContain("var(--client-surface)");
    expect(container.querySelector('[role="menuitemradio"][aria-checked="true"]')?.textContent).toContain("周");

    const month = Array.from(container.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]'))
      .find((item) => item.textContent?.includes("月"));
    await act(async () => month?.click());

    expect(onChange).toHaveBeenCalledWith("month");
    expect(container.querySelector('[data-schedule-view-menu="true"]')).toBeNull();
  });

  it("renders the reusable field variant with a visually centered value", async () => {
    await act(async () => {
      root.render(
        <ScheduleViewPicker
          ariaLabel="选择提醒时间"
          label=""
          onChange={vi.fn()}
          options={[{ label: "30 分钟前", value: "30" }]}
          value="30"
          variant="field"
        />,
      );
    });

    const trigger = container.querySelector<HTMLButtonElement>('[aria-label="选择提醒时间"]');
    expect(trigger?.dataset.schedulePickerVariant).toBe("field");
    expect(trigger?.className).toContain("justify-center");
    expect(trigger?.querySelector("strong")?.className).toContain("text-center");
    expect(trigger?.querySelector('[data-schedule-picker-chevron="true"]')?.className).toContain("absolute");
    expect(trigger?.textContent).toContain("30 分钟前");
  });
});
