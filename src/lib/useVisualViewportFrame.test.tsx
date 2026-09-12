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
  vi.unstubAllGlobals();
});

describe("useVisualViewportFrame", () => {
  it("keeps the visual viewport through blur until the keyboard viewport recovers", async () => {
    const visualViewport = new EventTarget() as VisualViewport;
    Object.defineProperties(visualViewport, {
      height: { configurable: true, value: 720 },
      offsetTop: { configurable: true, value: 12 },
      width: { configurable: true, value: 390 },
      offsetLeft: { configurable: true, value: 5 }
    });
    Object.defineProperty(window, "visualViewport", { configurable: true, value: visualViewport });
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 844 });
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 430 });

    const input = document.createElement("input");
    document.body.append(input);
    input.focus();

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
    expect(frame?.style.getPropertyValue("--im-visual-viewport-top")).toBe("auto");
    expect(frame?.style.getPropertyValue("--im-visual-viewport-width")).toBe("390px");
    expect(frame?.style.getPropertyValue("--im-visual-viewport-left")).toBe("5px");
    expect(frame?.style.getPropertyValue("--im-visual-viewport-right")).toBe("auto");
    expect(frame?.style.getPropertyValue("--im-conversation-room-height")).toBe("720px");
    expect(frame?.style.getPropertyValue("--im-visual-viewport-bottom")).toBe("112px");

    input.blur();
    Object.defineProperties(visualViewport, {
      height: { configurable: true, value: 680 },
      offsetTop: { configurable: true, value: 18 },
      width: { configurable: true, value: 380 },
      offsetLeft: { configurable: true, value: 8 }
    });
    await act(async () => visualViewport.dispatchEvent(new Event("resize")));

    expect(frame?.style.getPropertyValue("--im-visual-viewport-height")).toBe("680px");
    expect(frame?.style.getPropertyValue("--im-visual-viewport-top")).toBe("auto");
    expect(frame?.style.getPropertyValue("--im-visual-viewport-width")).toBe("380px");
    expect(frame?.style.getPropertyValue("--im-visual-viewport-left")).toBe("8px");
    expect(frame?.style.getPropertyValue("--im-visual-viewport-right")).toBe("auto");
    expect(frame?.style.getPropertyValue("--im-visual-viewport-bottom")).toBe("146px");
    Object.defineProperty(visualViewport, "height", { configurable: true, value: 844 });
    await act(async () => visualViewport.dispatchEvent(new Event("resize")));
    expect(frame?.style.getPropertyValue("--im-visual-viewport-height")).toBe("100dvh");
    expect(frame?.style.getPropertyValue("--im-visual-viewport-top")).toBe("auto");
    expect(frame?.style.getPropertyValue("--im-visual-viewport-bottom")).toBe("0px");
    expect(frame?.style.getPropertyValue("--im-visual-viewport-width")).toBe("auto");
    expect(frame?.style.getPropertyValue("--im-visual-viewport-left")).toBe("0px");
    expect(frame?.style.getPropertyValue("--im-visual-viewport-right")).toBe("0px");

    await act(async () => root.unmount());
  });

  it("keeps the shrinking visual viewport through the final keyboard-dismissal frames", async () => {
    const visualViewport = new EventTarget() as VisualViewport;
    Object.defineProperties(visualViewport, {
      height: { configurable: true, value: 600 },
      offsetTop: { configurable: true, value: 240 },
      width: { configurable: true, value: 390 },
      offsetLeft: { configurable: true, value: 0 }
    });
    Object.defineProperty(window, "visualViewport", { configurable: true, value: visualViewport });
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 956 });

    function Harness() {
      const ref = useRef<HTMLDivElement | null>(null);
      useVisualViewportFrame(ref);
      return <div data-testid="frame" ref={ref}><textarea /></div>;
    }

    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    await act(async () => root.render(<Harness />));
    const frame = container.querySelector<HTMLElement>("[data-testid='frame']")!;
    const editor = container.querySelector("textarea")!;

    await act(async () => editor.focus());
    expect(frame.style.getPropertyValue("--im-visual-viewport-height")).toBe("600px");
    await act(async () => editor.blur());

    Object.defineProperties(visualViewport, {
      height: { configurable: true, value: 900 },
      offsetTop: { configurable: true, value: 0 }
    });
    await act(async () => visualViewport.dispatchEvent(new Event("resize")));
    expect(frame.style.getPropertyValue("--im-visual-viewport-height")).toBe("900px");

    Object.defineProperty(visualViewport, "height", { configurable: true, value: 956 });
    await act(async () => visualViewport.dispatchEvent(new Event("resize")));
    expect(frame.style.getPropertyValue("--im-visual-viewport-height")).toBe("100dvh");

    await act(async () => root.unmount());
  });

  it("restores the bottom edge when a focused editor returns without a software keyboard", async () => {
    const viewport = new EventTarget() as VisualViewport;
    Object.defineProperties(viewport, {
      height: { configurable: true, value: 480 }, offsetTop: { configurable: true, value: 0 },
      width: { configurable: true, value: 390 }, offsetLeft: { configurable: true, value: 0 }
    });
    Object.defineProperty(window, "visualViewport", { configurable: true, value: viewport });
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 844 });
    function Harness() {
      const ref = useRef<HTMLDivElement | null>(null);
      useVisualViewportFrame(ref);
      return <div ref={ref} data-testid="frame"><textarea /></div>;
    }
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    await act(async () => root.render(<Harness />));
    await act(async () => container.querySelector("textarea")!.focus());
    const frame = container.querySelector<HTMLElement>("[data-testid='frame']")!;
    expect(frame.style.getPropertyValue("--im-visual-viewport-height")).toBe("480px");
    // iOS keeps the editor focused after hiding the keyboard or restoring the PWA.
    Object.defineProperty(viewport, "height", { configurable: true, value: 780 });
    await act(async () => window.dispatchEvent(new Event("pageshow")));
    expect(document.activeElement).toBe(container.querySelector("textarea"));
    expect(frame.style.getPropertyValue("--im-visual-viewport-height")).toBe("100dvh");
    expect(frame.style.getPropertyValue("--im-visual-viewport-bottom")).toBe("0px");
    await act(async () => root.unmount());
  });

  it("uses dynamic viewport height when standalone PWA pixel metrics are stale", async () => {
    const visualViewport = new EventTarget() as VisualViewport;
    Object.defineProperties(visualViewport, {
      height: { configurable: true, value: 690 },
      offsetTop: { configurable: true, value: 20 },
      width: { configurable: true, value: 380 },
      offsetLeft: { configurable: true, value: 5 }
    });
    Object.defineProperty(window, "visualViewport", { configurable: true, value: visualViewport });
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 760 });
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 430 });

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
    expect(frame?.style.getPropertyValue("--im-visual-viewport-height")).toBe("100dvh");
    expect(frame?.style.getPropertyValue("--im-visual-viewport-top")).toBe("auto");
    expect(frame?.style.getPropertyValue("--im-visual-viewport-bottom")).toBe("0px");
    expect(frame?.style.getPropertyValue("--im-visual-viewport-width")).toBe("auto");
    expect(frame?.style.getPropertyValue("--im-visual-viewport-left")).toBe("0px");
    expect(frame?.style.getPropertyValue("--im-visual-viewport-right")).toBe("0px");

    await act(async () => root.unmount());
  });
});


describe("iPhone standalone viewport", () => {
  async function mountIphoneFrame(standalone = true) {
    vi.stubGlobal("navigator", { userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X)", standalone });
    vi.stubGlobal("screen", { width: 393, height: 852 });
    vi.stubGlobal("innerWidth", 393);
    vi.stubGlobal("innerHeight", 759);
    const viewport = new EventTarget() as VisualViewport;
    Object.defineProperties(viewport, {
      height: { configurable: true, value: 759 },
      width: { configurable: true, value: 393 },
      offsetTop: { configurable: true, value: 0 },
      offsetLeft: { configurable: true, value: 0 }
    });
    vi.stubGlobal("visualViewport", viewport);
    function Harness() {
      const ref = useRef<HTMLDivElement | null>(null);
      useVisualViewportFrame(ref);
      return <div ref={ref}><textarea /></div>;
    }
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    await act(async () => root.render(<Harness />));
    return { root, viewport, frame: container.firstElementChild as HTMLElement };
  }

  it("uses dynamic height for iPhone standalone without trusting screen pixel height", async () => {
    const { root, frame } = await mountIphoneFrame();
    expect(frame.style.getPropertyValue("--im-visual-viewport-height")).toBe("759px");
    expect(frame.style.getPropertyValue("--im-conversation-room-height")).toBe("100dvh");
    expect(frame.style.getPropertyValue("--im-visual-viewport-bottom")).toBe("0px");
    await act(async () => root.unmount());
  });

  it("uses the keyboard viewport, then restores the full display after dismissal", async () => {
    const { root, frame, viewport } = await mountIphoneFrame();
    Object.defineProperty(viewport, "height", { value: 420, configurable: true });
    await act(async () => frame.querySelector("textarea")!.focus());
    expect(frame.style.getPropertyValue("--im-visual-viewport-height")).toBe("420px");
    expect(frame.style.getPropertyValue("--im-conversation-room-height")).toBe("420px");
    expect(frame.style.getPropertyValue("--im-visual-viewport-bottom")).toBe("339px");
    Object.defineProperty(viewport, "height", { value: 759, configurable: true });
    await act(async () => viewport.dispatchEvent(new Event("resize")));
    expect(frame.style.getPropertyValue("--im-visual-viewport-height")).toBe("759px");
    expect(frame.style.getPropertyValue("--im-conversation-room-height")).toBe("100dvh");
    expect(frame.style.getPropertyValue("--im-visual-viewport-bottom")).toBe("0px");
    await act(async () => root.unmount());
  });

  it("keeps dynamic sizing across rotation without retaining portrait screen pixels", async () => {
    const { root, frame, viewport } = await mountIphoneFrame();
    vi.stubGlobal("innerWidth", 852);
    vi.stubGlobal("innerHeight", 393);
    Object.defineProperties(viewport, {
      height: { configurable: true, value: 393 },
      width: { configurable: true, value: 852 }
    });
    await act(async () => window.dispatchEvent(new Event("resize")));
    expect(frame.style.getPropertyValue("--im-visual-viewport-height")).toBe("393px");
    await act(async () => root.unmount());
  });

  it("keeps ordinary Safari constrained to the browser viewport", async () => {
    const { root, frame } = await mountIphoneFrame(false);
    expect(frame.style.getPropertyValue("--im-visual-viewport-height")).toBe("100dvh");
    expect(frame.style.getPropertyValue("--im-visual-viewport-bottom")).toBe("0px");
    await act(async () => root.unmount());
  });

  it("does not use physical screen height for a window narrower than the display", async () => {
    const { root, frame } = await mountIphoneFrame();
    vi.stubGlobal("innerWidth", 320);
    await act(async () => window.dispatchEvent(new Event("resize")));
    expect(frame.style.getPropertyValue("--im-visual-viewport-height")).toBe("759px");
    await act(async () => root.unmount());
  });
});
