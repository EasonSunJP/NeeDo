/** @vitest-environment jsdom */
import { act, useRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useDocumentScrollLock, useIosScrollContainer } from "./useIosScrollContainer";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | undefined;

afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  root = undefined;
  document.documentElement.className = "";
  document.documentElement.style.cssText = "";
  document.body.className = "";
  document.body.style.cssText = "";
  document.body.replaceChildren();
  vi.useRealTimers();
});

function ScrollSurface() {
  const ref = useRef<HTMLDivElement>(null);
  useIosScrollContainer(ref);
  return <div data-testid="scroll-surface" ref={ref} />;
}

function ScrollLockHarness() {
  useDocumentScrollLock(true);
  return <div />;
}

function touchEvent(type: string, clientY?: number) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, "touches", {
    configurable: true,
    value: clientY === undefined ? [] : [{ clientY }]
  });
  return event;
}

describe("useDocumentScrollLock", () => {
  it("locks document overflow without making body a fixed PWA containing block", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => root!.render(<ScrollLockHarness />));

    expect(document.documentElement.classList.contains("im-conversation-scroll-lock")).toBe(true);
    expect(document.body.classList.contains("im-conversation-scroll-lock")).toBe(true);
    expect(document.documentElement.style.overflow).toBe("hidden");
    expect(document.body.style.overflow).toBe("hidden");
    expect(document.body.style.position).toBe("");
    expect(document.body.style.top).toBe("");

    await act(async () => root!.unmount());
    root = undefined;
    expect(document.documentElement.classList.contains("im-conversation-scroll-lock")).toBe(false);
    expect(document.body.classList.contains("im-conversation-scroll-lock")).toBe(false);
    expect(document.documentElement.style.overflow).toBe("");
    expect(document.body.style.overflow).toBe("");
  });
});

describe("useIosScrollContainer", () => {
  it("shows a damped bottom-boundary pull and springs back on release", async () => {
    vi.useFakeTimers();
    const container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    await act(async () => root!.render(<ScrollSurface />));

    const surface = container.querySelector<HTMLElement>("[data-testid='scroll-surface']")!;
    Object.defineProperties(surface, {
      clientHeight: { configurable: true, value: 400 },
      scrollHeight: { configurable: true, value: 1_000 },
      scrollTop: { configurable: true, writable: true, value: 600 }
    });

    surface.dispatchEvent(touchEvent("touchstart", 300));
    const move = touchEvent("touchmove", 250);
    surface.dispatchEvent(move);

    expect(move.defaultPrevented).toBe(true);
    expect(surface.style.transform).toMatch(/^translate3d\(0, -[\d.]+px, 0\)$/);

    surface.dispatchEvent(touchEvent("touchend"));
    expect(surface.style.transform).toBe("translate3d(0, 0, 0)");
    expect(surface.style.transition).toContain("180ms");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });
    expect(surface.style.transform).toBe("");
  });
});
