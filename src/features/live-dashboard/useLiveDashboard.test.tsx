// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { liveDashboardApi, type LiveDashboardSnapshot } from "../../api/liveDashboard";
import { openAuthenticatedSseStream } from "../../api/sseFetchStream";
import { retryDelayMs, useLiveDashboard } from "./useLiveDashboard";

vi.mock("../../api/sseFetchStream", () => ({ openAuthenticatedSseStream: vi.fn() }));

const snapshot = {
  scope: { country: "JP", admin1: null, admin2: null, breadcrumbs: [{ level: "country", code: "JP", name: "日本" }] },
  realtimeOrders: { list: [], total: 0, page: 1, page_size: 20 }
} as unknown as LiveDashboardSnapshot;

const mountedRoots: Root[] = [];
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const renderDashboardHook = async () => {
  const container = document.createElement("div");
  const root = createRoot(container);
  mountedRoots.push(root);
  let current!: ReturnType<typeof useLiveDashboard>;
  function Harness() {
    current = useLiveDashboard({ country: "JP", period: "today" });
    return null;
  }
  await act(async () => root.render(<Harness />));
  await act(async () => Promise.resolve());
  return { get current() { return current; } };
};

describe("useLiveDashboard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
    vi.spyOn(liveDashboardApi, "snapshot").mockResolvedValue(snapshot);
    vi.mocked(openAuthenticatedSseStream).mockImplementation(({ signal }) =>
      new Promise<void>((resolve) => signal.addEventListener("abort", () => resolve(), { once: true }))
    );
  });

  afterEach(async () => {
    await act(async () => mountedRoots.splice(0).forEach((root) => root.unmount()));
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("fetches immediately and reconciles once after five visible minutes", async () => {
    const result = await renderDashboardHook();
    expect(result.current.state.status).toBe("ready");
    expect(liveDashboardApi.snapshot).toHaveBeenCalledTimes(1);

    await act(async () => vi.advanceTimersByTimeAsync(299_999));
    expect(liveDashboardApi.snapshot).toHaveBeenCalledTimes(1);
    await act(async () => vi.advanceTimersByTimeAsync(1));
    expect(liveDashboardApi.snapshot).toHaveBeenCalledTimes(2);
  });

  it("pauses while hidden and performs exactly one recovery read", async () => {
    await renderDashboardHook();
    expect(liveDashboardApi.snapshot).toHaveBeenCalledTimes(1);
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
    document.dispatchEvent(new Event("visibilitychange"));
    await act(async () => vi.advanceTimersByTimeAsync(600_000));
    expect(liveDashboardApi.snapshot).toHaveBeenCalledTimes(1);

    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
    await act(async () => document.dispatchEvent(new Event("visibilitychange")));
    expect(liveDashboardApi.snapshot).toHaveBeenCalledTimes(2);
  });

  it("coalesces repeated metric invalidations to one read per minute", async () => {
    await renderDashboardHook();
    expect(liveDashboardApi.snapshot).toHaveBeenCalledTimes(1);
    const onEvent = vi.mocked(openAuthenticatedSseStream).mock.calls[0]?.[0].onEvent;
    const event = {
      id: "1700000000000-1",
      type: "metrics.invalidate" as const,
      scope: { countryCode: "JP" as const, admin1Code: null, admin2Code: null },
      payload: { sections: ["headline" as const] },
      createdAt: "2026-09-06T03:04:05.000Z"
    };
    act(() => {
      onEvent?.(event);
      onEvent?.({ ...event, id: "1700000000000-2" });
    });
    await act(async () => vi.advanceTimersByTimeAsync(59_999));
    expect(liveDashboardApi.snapshot).toHaveBeenCalledTimes(1);
    await act(async () => vi.advanceTimersByTimeAsync(1));
    expect(liveDashboardApi.snapshot).toHaveBeenCalledTimes(2);
  });

  it("uses bounded exponential retry delays", () => {
    expect(retryDelayMs(0, 0)).toBe(1000);
    expect(retryDelayMs(1, 0.5)).toBe(2375);
    expect(retryDelayMs(10, 1)).toBe(30_750);
  });
});
