// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LiveDashboardShell } from "./LiveDashboardShell";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("LiveDashboardShell", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    window.localStorage.setItem("needo.language.mode", "manual");
    window.localStorage.setItem("needo.language", "zh");
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    Object.defineProperty(document, "fullscreenElement", { configurable: true, value: null });
    Object.defineProperty(document.documentElement, "requestFullscreen", { configurable: true, value: vi.fn().mockResolvedValue(undefined) });
    Object.defineProperty(document, "exitFullscreen", { configurable: true, value: vi.fn().mockResolvedValue(undefined) });
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    window.localStorage.clear();
  });

  it("uses the saved admin theme without rendering the admin layout", async () => {
    window.localStorage.setItem("needo.admin.theme.mode", "manual");
    window.localStorage.setItem("needo.admin.theme", "blue-black");
    await act(async () => root.render(<LiveDashboardShell header={<span>header</span>}><div>map</div></LiveDashboardShell>));
    const classes = container.querySelector("main")?.classList;
    expect(classes?.contains("admin-shell")).toBe(true);
    expect(classes?.contains("admin-theme-blue-black")).toBe(true);
    expect(classes?.contains("live-dashboard-shell")).toBe(true);
    expect(container.querySelector(".admin-sidebar")).toBeNull();
  });

  it("enters, exits, and synchronizes fullscreen state", async () => {
    await act(async () => root.render(<LiveDashboardShell header={<span>header</span>}><div>map</div></LiveDashboardShell>));
    const enter = container.querySelector<HTMLButtonElement>(".live-dashboard-fullscreen-button")!;
    await act(async () => enter.click());
    expect(document.documentElement.requestFullscreen).toHaveBeenCalledTimes(1);
    Object.defineProperty(document, "fullscreenElement", { configurable: true, value: document.documentElement });
    await act(async () => document.dispatchEvent(new Event("fullscreenchange")));
    const exit = container.querySelector<HTMLButtonElement>(".live-dashboard-fullscreen-button")!;
    expect(exit.textContent).toContain("退出全屏");
    await act(async () => exit.click());
    expect(document.exitFullscreen).toHaveBeenCalledTimes(1);
  });

  it("reports fullscreen rejection without hiding content", async () => {
    vi.mocked(document.documentElement.requestFullscreen).mockRejectedValueOnce(new Error("denied"));
    await act(async () => root.render(<LiveDashboardShell header={<span>header</span>}><div>map</div></LiveDashboardShell>));
    await act(async () => container.querySelector<HTMLButtonElement>(".live-dashboard-fullscreen-button")!.click());
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("无法进入全屏，当前页面仍可正常使用");
    expect(container.textContent).toContain("map");
  });
});
