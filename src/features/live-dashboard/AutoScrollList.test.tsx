// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AutoScrollList } from "./AutoScrollList";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const items = [{ id: "a" }, { id: "b" }, { id: "c" }];

describe("AutoScrollList", () => {
  let container: HTMLDivElement;
  let root: Root;
  beforeEach(() => {
    vi.useFakeTimers();
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
    Object.defineProperty(window, "matchMedia", { configurable: true, value: vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })) });
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });
  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.useRealTimers();
  });

  it("advances one real row without duplicating data", async () => {
    act(() => root.render(<AutoScrollList getKey={(item) => item.id} intervalMs={3000} items={items} renderItem={(item) => <span>{item.id}</span>} visibleCount={2} />));
    expect(container.querySelector('[data-testid="auto-scroll-window"]')?.getAttribute("data-start-index")).toBe("0");
    await act(async () => vi.advanceTimersByTimeAsync(3000));
    expect(container.querySelector('[data-testid="auto-scroll-window"]')?.getAttribute("data-start-index")).toBe("1");
    expect(container.textContent).toBe("bc");
  });

  it("does not start movement for a short list", async () => {
    act(() => root.render(<AutoScrollList getKey={(item) => item.id} intervalMs={3000} items={[items[0]!]} renderItem={(item) => <span>{item.id}</span>} visibleCount={2} />));
    await act(async () => vi.advanceTimersByTimeAsync(6000));
    expect(container.textContent).toBe("a");
    expect(container.querySelectorAll("span")).toHaveLength(1);
  });

  it("pauses on hover and while the page is hidden", async () => {
    act(() => root.render(<AutoScrollList getKey={(item) => item.id} intervalMs={3000} items={items} renderItem={(item) => <span>{item.id}</span>} visibleCount={2} />));
    const list = container.querySelector<HTMLElement>('[data-testid="auto-scroll-window"]')!;
    act(() => list.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true })));
    await act(async () => vi.advanceTimersByTimeAsync(6000));
    expect(list.getAttribute("data-start-index")).toBe("0");
    act(() => list.dispatchEvent(new MouseEvent("mouseleave", { bubbles: true })));
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    await act(async () => vi.advanceTimersByTimeAsync(6000));
    expect(list.getAttribute("data-start-index")).toBe("0");
  });
});
