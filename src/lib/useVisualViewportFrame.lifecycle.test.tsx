/** @vitest-environment jsdom */
import { act, useRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useVisualViewportFrame } from "./useVisualViewportFrame";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root | undefined;
afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  root = undefined;
  document.body.replaceChildren();
  delete document.documentElement.dataset.needoDisplayMode;
  vi.unstubAllGlobals();
});

function Frame() {
  const ref = useRef<HTMLDivElement>(null);
  useVisualViewportFrame(ref);
  return <div ref={ref}><textarea aria-label="Composer" /></div>;
}

async function setup() {
  vi.stubGlobal("innerHeight", 956);
  const viewport = new EventTarget();
  const setViewport = (height: number, offsetTop = 0) => Object.defineProperties(viewport, {
    height: { configurable: true, value: height },
    offsetTop: { configurable: true, value: offsetTop },
    width: { configurable: true, value: 440 },
    offsetLeft: { configurable: true, value: 0 }
  });
  setViewport(956);
  vi.stubGlobal("visualViewport", viewport);
  const container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root!.render(<Frame />));
  const frame = container.firstElementChild as HTMLElement;
  const editor = container.querySelector("textarea")!;
  return { viewport, setViewport, frame, editor };
}
const heightOf = (frame: HTMLElement) => frame.style.getPropertyValue("--im-visual-viewport-height");

describe("chat visual viewport lifecycle", () => {
  it("bounds an installed iPhone PWA room to the visible viewport when the keyboard is closed", async () => {
    document.documentElement.dataset.needoDisplayMode = "standalone";
    vi.stubGlobal("navigator", {
      ...window.navigator,
      userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)"
    });
    const { viewport, setViewport, frame } = await setup();

    await act(async () => {
      setViewport(876);
      viewport.dispatchEvent(new Event("resize"));
    });

    expect(heightOf(frame)).toBe("876px");
    expect(frame.style.getPropertyValue("--im-visual-viewport-top")).toBe("0px");
  });

  it("keeps the room inside a keyboard viewport even when focus pans its top edge", async () => {
    const { viewport, setViewport, frame, editor } = await setup();
    await act(async () => {
      editor.focus();
      setViewport(600, 300);
      viewport.dispatchEvent(new Event("resize"));
    });
    expect(heightOf(frame)).toBe("600px");
    expect(frame.style.getPropertyValue("--im-visual-viewport-top")).toBe("300px");
  });

  it("does not expand beneath a still-open keyboard when the editor blurs", async () => {
    const { viewport, setViewport, frame, editor } = await setup();
    await act(async () => {
      editor.focus();
      setViewport(600);
      viewport.dispatchEvent(new Event("resize"));
    });
    expect(heightOf(frame)).toBe("600px");
    await act(async () => editor.blur());
    expect(heightOf(frame)).toBe("600px");
    await act(async () => {
      setViewport(956);
      viewport.dispatchEvent(new Event("resize"));
    });
    expect(heightOf(frame)).toBe("100dvh");
  });

  it("refreshes a cached keyboard frame when the page is shown again", async () => {
    const { viewport, setViewport, frame, editor } = await setup();
    await act(async () => {
      editor.focus();
      setViewport(600);
      viewport.dispatchEvent(new Event("resize"));
    });
    expect(heightOf(frame)).toBe("600px");
    await act(async () => {
      setViewport(956);
      window.dispatchEvent(new Event("pageshow"));
    });
    expect(heightOf(frame)).toBe("100dvh");
  });

  it("does not treat a short stale viewport as a keyboard without a focus transition", async () => {
    const { viewport, setViewport, frame } = await setup();
    await act(async () => {
      setViewport(690);
      viewport.dispatchEvent(new Event("resize"));
    });
    expect(heightOf(frame)).toBe("100dvh");
  });
});
