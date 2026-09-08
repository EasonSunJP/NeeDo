// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FormalTabs, type FormalLocalization } from "./FormalProfileDetailPanels";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

const localization: FormalLocalization = {
  language: "zh",
  locale: "zh-CN",
  t: (source) => source
};

function dispatchPointer(
  target: Element,
  type: "pointerdown" | "pointermove" | "pointerup",
  clientX: number
) {
  const event = new MouseEvent(type, {
    bubbles: true,
    button: 0,
    cancelable: true,
    clientX,
    clientY: 20
  });
  Object.defineProperties(event, {
    pointerId: { value: 1 },
    pointerType: { value: "mouse" }
  });
  target.dispatchEvent(event);
}

describe("FormalTabs desktop pointer interaction", () => {
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

  it("supports mouse dragging without turning the release into a tab click", async () => {
    const onChange = vi.fn();
    await act(async () => {
      root.render(
        <FormalTabs
          active="基础资料"
          idPrefix="technician"
          items={["基础资料", "状态与数据", "技能与服务", "排班偏好"]}
          localization={localization}
          onChange={onChange}
        />
      );
    });

    const tabList = container.querySelector<HTMLDivElement>('[role="tablist"]')!;
    const secondTab = container.querySelectorAll<HTMLButtonElement>('[role="tab"]')[1]!;

    await act(async () => secondTab.click());
    expect(onChange).toHaveBeenCalledWith("状态与数据");
    onChange.mockClear();

    await act(async () => {
      dispatchPointer(secondTab, "pointerdown", 120);
      dispatchPointer(secondTab, "pointermove", 50);
      dispatchPointer(secondTab, "pointerup", 50);
      secondTab.click();
    });

    expect(tabList.scrollLeft).toBe(70);
    expect(onChange).not.toHaveBeenCalled();
  });
});
