// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  subscribeRealtimeEvents: vi.fn()
}));

vi.mock("../realtime/api", () => ({
  subscribeRealtimeEvents: mocks.subscribeRealtimeEvents
}));

import { useOrderRealtimeRefresh } from "./useOrderRealtimeRefresh";

let container: HTMLDivElement;
let root: Root;
let onEvent: ((event: { type: string; payload: unknown }) => void) | undefined;

function Probe({ onRefresh, orderId }: { onRefresh: () => Promise<void>; orderId?: number }) {
  useOrderRealtimeRefresh({ onRefresh, orderId, pollingIntervalMs: 15_000 });
  return null;
}

describe("useOrderRealtimeRefresh", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mocks.subscribeRealtimeEvents.mockImplementation((options: { onEvent: typeof onEvent }) => {
      onEvent = options.onEvent;
      return vi.fn();
    });
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.useRealTimers();
  });

  it("refreshes the matching order for status and generic order-change SSE events", async () => {
    const onRefresh = vi.fn(async () => undefined);
    await act(async () => root.render(<Probe onRefresh={onRefresh} orderId={88} />));

    await act(async () => onEvent?.({ type: "notification.order_status", payload: { payload: { orderId: 88 } } }));
    expect(onRefresh).toHaveBeenCalledTimes(1);

    await act(async () => onEvent?.({ type: "booking.order_changed", payload: { orderId: 88, changeType: "add_on" } }));
    expect(onRefresh).toHaveBeenCalledTimes(2);

    await act(async () => onEvent?.({ type: "booking.order_changed", payload: { orderId: 89, changeType: "timeline_comment" } }));
    expect(onRefresh).toHaveBeenCalledTimes(2);
  });

  it("uses one visible-page fallback refresh and never overlaps an in-flight refresh", async () => {
    let release!: () => void;
    const onRefresh = vi.fn(() => new Promise<void>((resolve) => { release = resolve; }));
    await act(async () => root.render(<Probe onRefresh={onRefresh} orderId={88} />));

    await act(async () => { await vi.advanceTimersByTimeAsync(15_000); });
    expect(onRefresh).toHaveBeenCalledTimes(1);
    await act(async () => onEvent?.({ type: "booking.order_changed", payload: { orderId: 88, changeType: "status" } }));
    expect(onRefresh).toHaveBeenCalledTimes(1);
    await act(async () => release());

    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });
});
