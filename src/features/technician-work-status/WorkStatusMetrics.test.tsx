// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WorkStatusMetrics } from "./WorkStatusMetrics";
import { workStatusApi } from "./api";
vi.mock("./api", async (original) => ({
  ...(await original<typeof import("./api")>()),
  workStatusApi: { snapshot: vi.fn(), events: vi.fn(), comment: vi.fn() },
}));
vi.mock("./refresh", () => ({ subscribeWorkStatusRefresh: () => () => {} }));
let root: Root, container: HTMLDivElement;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  vi.mocked(workStatusApi.snapshot).mockResolvedValue({
    technicianProfileId: 31,
    status: "on_duty",
    version: 2,
    syncedAt: null,
    currentShop: null,
    month: { lateCount: 12, earlyLeaveCount: 3, from: "", to: "" },
  });
  vi.mocked(workStatusApi.events)
    .mockReset()
    .mockResolvedValue({ list: [], page: 1, page_size: 10, total: 0 });
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});
describe("monthly attendance drill-down", () => {
  it("uses server totals and queries only incidents with server-side date/type filters", async () => {
    await act(async () =>
      root.render(
        <WorkStatusMetrics
          target={{ scope: "backoffice", technicianProfileId: 31 }}
        />,
      ),
    );
    expect(container.textContent).toContain("12 late");
    expect(container.textContent).toContain("3 early");
    await act(async () =>
      container
        .querySelector<HTMLButtonElement>(
          '[data-testid="work-status-month-metrics"]',
        )!
        .click(),
    );
    expect(workStatusApi.events).toHaveBeenLastCalledWith(
      { scope: "backoffice", technicianProfileId: 31 },
      expect.objectContaining({
        page: 1,
        page_size: 10,
        incidentsOnly: true,
        from: expect.any(String),
        to: expect.any(String),
      }),
    );
    const type = container.querySelector<HTMLSelectElement>(
      'select[aria-label="Lateness / early departure"]',
    )!;
    await act(async () => {
      type.value = "early_leave";
      type.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(workStatusApi.events).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({
        kind: "early_leave",
        page: 1,
        incidentsOnly: true,
      }),
    );
  });
  it("does not show fake zero when summary fails", async () => {
    vi.mocked(workStatusApi.snapshot).mockRejectedValue(new Error("offline"));
    await act(async () =>
      root.render(
        <WorkStatusMetrics
          target={{ scope: "backoffice", technicianProfileId: 31 }}
        />,
      ),
    );
    expect(container.textContent).toContain("Could not load");
    expect(container.textContent).not.toContain("0 late");
  });
});
