/** @vitest-environment jsdom */

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MessagePressable } from "./pages";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function dispatchPointer(target: HTMLElement, type: "pointerdown" | "pointerup") {
  target.dispatchEvent(new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX: 24,
    clientY: 24
  }));
}

afterEach(() => {
  vi.useRealTimers();
  document.body.replaceChildren();
});

describe("MessagePressable", () => {
  it("suppresses the media activation click emitted when a long press is released", async () => {
    vi.useFakeTimers();
    const onOpenMenu = vi.fn();
    const onPreviewMedia = vi.fn();
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <MessagePressable onOpenMenu={onOpenMenu}>
          <button onClick={onPreviewMedia} type="button">media</button>
        </MessagePressable>
      );
    });

    const mediaButton = container.querySelector("button");
    expect(mediaButton).not.toBeNull();

    await act(async () => {
      dispatchPointer(mediaButton!, "pointerdown");
      vi.advanceTimersByTime(380);
    });
    expect(onOpenMenu).toHaveBeenCalledTimes(1);

    await act(async () => {
      dispatchPointer(mediaButton!, "pointerup");
      vi.advanceTimersByTime(1);
      mediaButton!.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    });

    expect(onPreviewMedia).not.toHaveBeenCalled();

    await act(async () => {
      mediaButton!.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    });
    expect(onPreviewMedia).toHaveBeenCalledTimes(1);
    await act(async () => root.unmount());
  });

  it("opens the NeeDo menu and cancels the browser menu on right click", async () => {
    const onOpenMenu = vi.fn();
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <MessagePressable onOpenMenu={onOpenMenu}>
          <span>message</span>
        </MessagePressable>
      );
    });

    const message = container.querySelector<HTMLElement>("span");
    const event = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
    await act(async () => {
      message?.dispatchEvent(event);
    });

    expect(event.defaultPrevented).toBe(true);
    expect(onOpenMenu).toHaveBeenCalledOnce();
    await act(async () => root.unmount());
  });

  it("keeps an ordinary media click available when no long press occurred", async () => {
    vi.useFakeTimers();
    const onOpenMenu = vi.fn();
    const onPreviewMedia = vi.fn();
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <MessagePressable onOpenMenu={onOpenMenu}>
          <button onClick={onPreviewMedia} type="button">media</button>
        </MessagePressable>
      );
    });

    const mediaButton = container.querySelector("button");
    expect(mediaButton).not.toBeNull();

    await act(async () => {
      dispatchPointer(mediaButton!, "pointerdown");
      vi.advanceTimersByTime(100);
      dispatchPointer(mediaButton!, "pointerup");
      mediaButton!.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    });

    expect(onOpenMenu).not.toHaveBeenCalled();
    expect(onPreviewMedia).toHaveBeenCalledTimes(1);
    await act(async () => root.unmount());
  });
});
