/** @vitest-environment jsdom */

import { afterEach, describe, expect, it, vi } from "vitest";
import { getImReturnScrollBehavior, observeImLatestPosition } from "./conversation-scroll";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

describe("observeImLatestPosition", () => {
  it("reports sentinel intersection and disconnects the observer", () => {
    const disconnect = vi.fn();
    const observe = vi.fn();
    let callback: IntersectionObserverCallback | undefined;

    class IntersectionObserverMock {
      constructor(nextCallback: IntersectionObserverCallback) {
        callback = nextCallback;
      }

      disconnect = disconnect;
      observe = observe;
    }

    vi.stubGlobal("IntersectionObserver", IntersectionObserverMock);

    const root = document.createElement("div");
    const target = document.createElement("div");
    const onVisibilityChange = vi.fn();
    const cleanup = observeImLatestPosition({ onVisibilityChange, root, target });

    callback?.([{ isIntersecting: false } as IntersectionObserverEntry], {} as IntersectionObserver);

    expect(observe).toHaveBeenCalledWith(target);
    expect(onVisibilityChange).toHaveBeenLastCalledWith(false);
    cleanup();
    expect(disconnect).toHaveBeenCalledOnce();
  });

  it("falls back to the existing near-bottom distance calculation", () => {
    vi.stubGlobal("IntersectionObserver", undefined);
    const root = document.createElement("div");
    Object.defineProperties(root, {
      clientHeight: { configurable: true, value: 400 },
      scrollHeight: { configurable: true, value: 1_000 },
      scrollTop: { configurable: true, value: 300, writable: true }
    });
    const onVisibilityChange = vi.fn();
    const cleanup = observeImLatestPosition({
      onVisibilityChange,
      root,
      target: document.createElement("div")
    });

    expect(onVisibilityChange).toHaveBeenLastCalledWith(false);
    root.scrollTop = 550;
    root.dispatchEvent(new Event("scroll"));
    expect(onVisibilityChange).toHaveBeenLastCalledWith(true);
    cleanup();
  });
});

describe("getImReturnScrollBehavior", () => {
  it("disables smooth scrolling for reduced motion", () => {
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: true })));
    expect(getImReturnScrollBehavior()).toBe("auto");
  });

  it("uses smooth scrolling otherwise", () => {
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false })));
    expect(getImReturnScrollBehavior()).toBe("smooth");
  });
});
