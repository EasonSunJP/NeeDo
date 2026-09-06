// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AdminEventTimeline } from "./AdminEventTimeline";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("admin timeline bubble disclosure", () => {
  let container: HTMLDivElement;
  let root: Root;
  let contentHeight: number;
  let resize: () => void;
  beforeEach(() => {
    contentHeight = 220;
    resize = () => {};
    vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockImplementation(() => contentHeight);
    vi.stubGlobal("ResizeObserver", class {
      constructor(callback: () => void) { resize = callback; }
      observe() {}
      disconnect() {}
    });
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });
  afterEach(() => { act(() => root.unmount()); container.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
  const renderTimeline = () => act(() => root.render(<AdminEventTimeline title="用户LOG" showCommentComposer={false} events={[
    { id: "audit-1", atLabel: "2026-09-06", title: "更新", actorName: "管理员", message: <span>完整日志内容</span> }
  ]} />));

  it("collapses content beyond ten lines and supports expand then collapse", () => {
    renderTimeline();
    const button = container.querySelector<HTMLButtonElement>("button[aria-expanded]");
    expect(button?.textContent).toBe("Expand");
    expect(button?.getAttribute("aria-expanded")).toBe("false");
    const content = document.getElementById(button!.getAttribute("aria-controls")!);
    expect(content?.style.maxHeight).toBe("200px");
    act(() => button!.click());
    expect(button?.textContent).toBe("Collapse");
    expect(content?.style.maxHeight).toBe("");
    expect(content?.textContent).toContain("完整日志内容");
    act(() => button!.click());
    expect(content?.style.maxHeight).toBe("200px");
  });

  it("does not collapse ten lines and rechecks overflow on width changes", () => {
    contentHeight = 200;
    renderTimeline();
    expect(container.querySelector("button[aria-expanded]")).toBeNull();
    contentHeight = 220;
    act(() => resize());
    expect(container.querySelector("button[aria-expanded]")?.getAttribute("aria-expanded")).toBe("false");
  });
});
