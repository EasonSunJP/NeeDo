/** @vitest-environment jsdom */

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useRef } from "react";

import { useVisualViewportFrame } from "./useVisualViewportFrame";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe("useVisualViewportFrame", () => {
  it("keeps a fixed conversation frame aligned to the live iOS visual viewport", async () => {
    const visualViewport = new EventTarget() as VisualViewport;
    Object.defineProperties(visualViewport, {
      height: { configurable: true, value: 720 },
      offsetTop: { configurable: true, value: 12 },
      width: { configurable: true, value: 390 },
      offsetLeft: { configurable: true, value: 5 }
    });
    Object.defineProperty(window, "visualViewport", { configurable: true, value: visualViewport });

    function Harness() {
      const ref = useRef<HTMLDivElement | null>(null);
      useVisualViewportFrame(ref);
      return <div data-testid="frame" ref={ref} />;
    }

    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    await act(async () => root.render(<Harness />));

    const frame = container.querySelector<HTMLElement>("[data-testid='frame']");
    expect(frame?.style.getPropertyValue("--im-visual-viewport-height")).toBe("720px");
    expect(frame?.style.getPropertyValue("--im-visual-viewport-top")).toBe("12px");
    expect(frame?.style.getPropertyValue("--im-visual-viewport-width")).toBe("390px");
    expect(frame?.style.getPropertyValue("--im-visual-viewport-left")).toBe("5px");

    Object.defineProperties(visualViewport, {
      height: { configurable: true, value: 844 },
      offsetTop: { configurable: true, value: 0 },
      width: { configurable: true, value: 430 },
      offsetLeft: { configurable: true, value: 0 }
    });
    await act(async () => visualViewport.dispatchEvent(new Event("resize")));

    expect(frame?.style.getPropertyValue("--im-visual-viewport-height")).toBe("844px");
    expect(frame?.style.getPropertyValue("--im-visual-viewport-top")).toBe("0px");
    expect(frame?.style.getPropertyValue("--im-visual-viewport-width")).toBe("430px");
    expect(frame?.style.getPropertyValue("--im-visual-viewport-left")).toBe("0px");

    await act(async () => root.unmount());
  });
});
