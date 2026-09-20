/** @vitest-environment jsdom */

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useImLongPressAction } from "./useImLongPressAction";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function Harness({ onOpen }: { onOpen: () => void }) {
  const longPress = useImLongPressAction(onOpen);
  return <div data-testid="target" {...longPress.handlers}>target</div>;
}

afterEach(() => {
  vi.useRealTimers();
  document.body.replaceChildren();
});

describe("useImLongPressAction", () => {
  it("opens after the shared delay and cancels when the pointer moves", async () => {
    vi.useFakeTimers();
    const onOpen = vi.fn();
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    await act(async () => root.render(<Harness onOpen={onOpen} />));
    const target = container.firstElementChild as HTMLElement;

    await act(async () => {
      target.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, clientX: 10, clientY: 10 }));
      target.dispatchEvent(new MouseEvent("pointermove", { bubbles: true, clientX: 24, clientY: 10 }));
      vi.advanceTimersByTime(380);
    });
    expect(onOpen).not.toHaveBeenCalled();

    await act(async () => {
      target.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, clientX: 10, clientY: 10 }));
      vi.advanceTimersByTime(380);
    });
    expect(onOpen).toHaveBeenCalledOnce();
    await act(async () => root.unmount());
  });
});
