// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import source from "./LiveDashboardPage.tsx?raw";
import { LiveDashboardPage } from "./LiveDashboardPage";

vi.mock("../../features/live-dashboard/useLiveDashboard", () => ({
  useLiveDashboard: () => ({
    state: { snapshot: null, status: "loading", realtimeStatus: "connecting", error: null },
    retry: vi.fn()
  })
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("LiveDashboardPage", () => {
  let root: Root;
  let container: HTMLDivElement;
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
    window.localStorage.clear();
  });

  it("renders a standalone operations screen shell", async () => {
    await act(async () => root.render(<MemoryRouter initialEntries={["/admin/live-screen?country=JP&period=today"]}><LiveDashboardPage /></MemoryRouter>));
    expect(container.querySelector('[data-testid="live-dashboard-grid"]')).toBeTruthy();
    expect(container.querySelector(".admin-sidebar")).toBeNull();
    expect(container.textContent).toContain("NeeDo 实时运营数据");
    expect(source).not.toContain("AdminLayout");
  });
});
