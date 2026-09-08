// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SchedulePageHeader } from "./SchedulePageHeader";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

describe("SchedulePageHeader", () => {
  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  it("keeps back, search, and close in one shared header row", async () => {
    const onBack = vi.fn();
    const onChange = vi.fn();
    const onClose = vi.fn();

    await act(async () => root.render(
      <SchedulePageHeader
        onBack={onBack}
        onChange={onChange}
        onClose={onClose}
        placeholder="搜索排班"
        value=""
      />
    ));

    expect(container.querySelector('button[aria-label="返回"]')).not.toBeNull();
    expect(container.querySelector('input[aria-label="搜索排班"]')).not.toBeNull();
    expect(container.querySelector('button[aria-label="关闭"]')).not.toBeNull();
    expect(container.querySelector('[data-schedule-search-submit="true"]')).toBeNull();

    const input = container.querySelector<HTMLInputElement>('input[aria-label="搜索排班"]');
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, "预约");
      input?.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(onChange).toHaveBeenCalledWith("预约");

    await act(async () => {
      container.querySelector<HTMLButtonElement>('button[aria-label="返回"]')?.click();
      container.querySelector<HTMLButtonElement>('button[aria-label="关闭"]')?.click();
    });
    expect(onBack).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
