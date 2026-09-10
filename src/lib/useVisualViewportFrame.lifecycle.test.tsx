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
  vi.useRealTimers();
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
const roomHeightOf = (frame: HTMLElement) => frame.style.getPropertyValue("--im-conversation-room-height");

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
    expect(roomHeightOf(frame)).toBe("auto");
    expect(frame.style.getPropertyValue("--im-visual-viewport-top")).toBe("0px");
    expect(frame.style.getPropertyValue("--im-visual-viewport-bottom")).toBe("0px");
  });

  it("releases an installed iPhone PWA room when keyboard dismissal settles below layout height", async () => {
    document.documentElement.dataset.needoDisplayMode = "standalone";
    vi.stubGlobal("navigator", {
      ...window.navigator,
      userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)"
    });
    const { viewport, setViewport, frame, editor } = await setup();

    await act(async () => {
      editor.focus();
      setViewport(540);
      viewport.dispatchEvent(new Event("resize"));
    });
    expect(heightOf(frame)).toBe("540px");
    expect(frame.style.getPropertyValue("--im-visual-viewport-bottom")).toBe("416px");

    await act(async () => {
      setViewport(690);
      viewport.dispatchEvent(new Event("resize"));
    });
    expect(frame.style.getPropertyValue("--im-visual-viewport-bottom")).toBe("266px");

    // Installed iOS PWAs can settle below innerHeight after the keyboard has
    // disappeared. The remaining browser/display inset must not keep the
    // conversation pinned above an empty bottom region.
    await act(async () => {
      setViewport(759);
      viewport.dispatchEvent(new Event("resize"));
    });
    expect(document.activeElement).toBe(editor);
    expect(heightOf(frame)).toBe("759px");
    expect(roomHeightOf(frame)).toBe("auto");
    expect(frame.style.getPropertyValue("--im-visual-viewport-bottom")).toBe("0px");
  });

  it("releases a stale installed iPhone keyboard frame after viewport expansion settles", async () => {
    vi.useFakeTimers();
    document.documentElement.dataset.needoDisplayMode = "standalone";
    vi.stubGlobal("navigator", {
      ...window.navigator,
      userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)"
    });
    const { viewport, setViewport, frame, editor } = await setup();

    await act(async () => {
      editor.focus();
      setViewport(520);
      viewport.dispatchEvent(new Event("resize"));
      setViewport(690);
      viewport.dispatchEvent(new Event("resize"));
      setViewport(704);
      viewport.dispatchEvent(new Event("resize"));
    });

    expect(document.activeElement).toBe(editor);
    expect(frame.style.getPropertyValue("--im-visual-viewport-bottom")).toBe("252px");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(220);
    });

    expect(heightOf(frame)).toBe("704px");
    expect(roomHeightOf(frame)).toBe("auto");
    expect(frame.style.getPropertyValue("--im-visual-viewport-bottom")).toBe("0px");
  });

  it("bounds an installed Android PWA room to the visible viewport when the keyboard is closed", async () => {
    document.documentElement.dataset.needoDisplayMode = "standalone";
    vi.stubGlobal("navigator", {
      ...window.navigator,
      userAgent: "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 Chrome/140.0 Mobile Safari/537.36"
    });
    const { viewport, setViewport, frame } = await setup();

    await act(async () => {
      setViewport(876);
      viewport.dispatchEvent(new Event("resize"));
    });

    expect(heightOf(frame)).toBe("876px");
    expect(roomHeightOf(frame)).toBe("auto");
    expect(frame.style.getPropertyValue("--im-visual-viewport-top")).toBe("0px");
    expect(frame.style.getPropertyValue("--im-visual-viewport-bottom")).toBe("0px");
  });

  it("restores an installed Android PWA room after the keyboard closes", async () => {
    document.documentElement.dataset.needoDisplayMode = "standalone";
    vi.stubGlobal("navigator", {
      ...window.navigator,
      userAgent: "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 Chrome/140.0 Mobile Safari/537.36"
    });
    const { viewport, setViewport, frame, editor } = await setup();

    await act(async () => {
      editor.focus();
      setViewport(540);
      viewport.dispatchEvent(new Event("resize"));
    });
    expect(heightOf(frame)).toBe("540px");
    expect(roomHeightOf(frame)).toBe("auto");
    expect(frame.style.getPropertyValue("--im-visual-viewport-bottom")).toBe("416px");

    await act(async () => {
      editor.blur();
      setViewport(876);
      viewport.dispatchEvent(new Event("resize"));
    });
    expect(heightOf(frame)).toBe("876px");
    expect(roomHeightOf(frame)).toBe("auto");
    expect(frame.style.getPropertyValue("--im-visual-viewport-bottom")).toBe("0px");
  });

  it("keeps Android browser tabs on the dynamic CSS viewport", async () => {
    vi.stubGlobal("navigator", {
      ...window.navigator,
      userAgent: "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 Chrome/140.0 Mobile Safari/537.36"
    });
    const { viewport, setViewport, frame } = await setup();

    await act(async () => {
      setViewport(876);
      viewport.dispatchEvent(new Event("resize"));
    });

    expect(heightOf(frame)).toBe("100dvh");
    expect(roomHeightOf(frame)).toBe("100dvh");
    expect(frame.style.getPropertyValue("--im-visual-viewport-bottom")).toBe("auto");
  });

  it("keeps the room inside a keyboard viewport even when focus pans its top edge", async () => {
    const { viewport, setViewport, frame, editor } = await setup();
    await act(async () => {
      editor.focus();
      setViewport(600, 300);
      viewport.dispatchEvent(new Event("resize"));
    });
    expect(heightOf(frame)).toBe("600px");
    expect(roomHeightOf(frame)).toBe("auto");
    expect(frame.style.getPropertyValue("--im-visual-viewport-top")).toBe("300px");
    expect(frame.style.getPropertyValue("--im-visual-viewport-bottom")).toBe("56px");
  });

  it("anchors an iPhone Safari room to the keyboard edge without leaving a visual gap", async () => {
    vi.stubGlobal("navigator", {
      ...window.navigator,
      userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1"
    });
    const { viewport, setViewport, frame, editor } = await setup();

    await act(async () => {
      editor.focus();
      setViewport(518, 72);
      viewport.dispatchEvent(new Event("resize"));
    });

    expect(heightOf(frame)).toBe("518px");
    expect(roomHeightOf(frame)).toBe("auto");
    expect(frame.style.getPropertyValue("--im-visual-viewport-top")).toBe("72px");
    expect(frame.style.getPropertyValue("--im-visual-viewport-bottom")).toBe("366px");
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
