/** @vitest-environment jsdom */

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ImMessageActionSheet } from "./components";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function buildRect({
  bottom,
  height,
  left,
  top,
  width
}: {
  bottom: number;
  height: number;
  left: number;
  top: number;
  width: number;
}): DOMRect {
  return {
    bottom,
    height,
    left,
    right: left + width,
    top,
    width,
    x: left,
    y: top,
    toJSON: () => ({})
  } as DOMRect;
}

afterEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe("ImMessageActionSheet", () => {
  it("portals above its message anchor and flips below only when the upper space is insufficient", async () => {
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 800 });
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 640 });

    const anchor = document.createElement("div");
    let anchorRect = buildRect({ bottom: 560, height: 60, left: 220, top: 500, width: 200 });
    document.body.append(anchor);

    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      if (this === anchor) {
        return anchorRect;
      }

      if (this.dataset.imMessageActionSheet === "true") {
        return buildRect({ bottom: 292, height: 280, left: 40, top: 12, width: 560 });
      }

      return buildRect({ bottom: 0, height: 0, left: 0, top: 0, width: 0 });
    });
    vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockImplementation(function (this: HTMLElement) {
      return this.dataset.imMessageActionSheet === "true" ? 280 : 0;
    });

    const shell = document.createElement("div");
    shell.className = "client-shell client-theme-night";
    const container = document.createElement("div");
    shell.append(container);
    document.body.append(shell);
    const root = createRoot(container);

    await act(async () => {
      root.render(createElement(ImMessageActionSheet, {
        actions: [
          { icon: "reply", key: "reply", label: "回复", onClick: vi.fn() },
          { icon: "forward", key: "forward", label: "转发", onClick: vi.fn() },
          { icon: "copy", key: "copy", label: "复制", onClick: vi.fn() },
          { icon: "pin", key: "pin", label: "信息置顶", onClick: vi.fn() },
          { icon: "delete", key: "recall", label: "撤回", onClick: vi.fn() },
          { icon: "delete", key: "delete", label: "删除", onClick: vi.fn() }
        ],
        anchorElement: anchor,
        expanded: false,
        isNight: true,
        onClose: vi.fn(),
        onExpandedChange: vi.fn(),
        onReact: vi.fn()
      }));
    });

    const menu = document.querySelector<HTMLElement>("[data-im-message-action-sheet='true']");
    const menuPositioner = menu?.parentElement;
    const arrow = menuPositioner?.querySelector<HTMLElement>("[aria-hidden='true']");
    const reactions = menu?.querySelector<HTMLElement>('[data-im-message-action-section="reactions"]');
    const actionGrid = menu?.querySelector<HTMLElement>('[data-im-message-action-section="actions"]');
    const actionItem = menu?.querySelector<HTMLElement>('[data-im-message-action-item="true"]');

    expect(menu).not.toBeNull();
    expect(container.contains(menu)).toBe(false);
    expect(shell.contains(menu)).toBe(true);
    expect(menuPositioner?.style.position).toBe("fixed");
    expect(menuPositioner?.style.top).toBe("210px");
    expect(arrow?.className).toContain("-bottom-2");
    expect(actionGrid?.compareDocumentPosition(reactions!)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(actionGrid?.className).toContain("grid-cols-6");
    expect(actionGrid?.querySelectorAll('[data-im-message-action-item="true"]')).toHaveLength(6);
    expect(actionItem?.className).toContain("py-2");
    expect(actionItem?.querySelector("span")?.className).toContain("h-8");
    expect(
      [...menu!.querySelectorAll("button")].some((button) => button.textContent?.trim() === "收起")
    ).toBe(false);

    anchorRect = buildRect({ bottom: 84, height: 60, left: 220, top: 24, width: 200 });
    await act(async () => {
      window.dispatchEvent(new Event("resize"));
    });

    expect(menuPositioner?.style.top).toBe("94px");
    expect(arrow?.className).toContain("-top-2");
    expect(reactions?.compareDocumentPosition(actionGrid!)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);

    await act(async () => root.unmount());
  });
});
