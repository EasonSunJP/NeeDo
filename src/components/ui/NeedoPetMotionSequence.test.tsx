// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NeedoPetMotionSequence } from "./NeedoPet";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

class DeferredImage {
  static instances: DeferredImage[] = [];

  complete = false;
  decoding = "auto";
  naturalHeight = 0;
  naturalWidth = 0;
  onload: (() => void) | null = null;
  private source = "";

  constructor() {
    DeferredImage.instances.push(this);
  }

  get src() {
    return this.source;
  }

  set src(value: string) {
    this.source = value;
  }

  resolve() {
    this.complete = true;
    this.naturalHeight = 286;
    this.naturalWidth = 1_320;
    this.onload?.();
  }
}

const clips = [
  {
    columns: 10,
    durationMs: 1_000,
    frameCount: 2,
    frameDurationMs: 500,
    frameHeight: 143,
    frameWidth: 132,
    src: "/first-atlas.png"
  },
  {
    columns: 10,
    durationMs: 1_000,
    frameCount: 2,
    frameDurationMs: 500,
    frameHeight: 143,
    frameWidth: 132,
    src: "/second-atlas.png"
  }
] as const;

describe("NeedoPetMotionSequence", () => {
  let container: HTMLDivElement;
  let root: Root;
  let originalImage: typeof Image;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0);
    vi.spyOn(window, "requestAnimationFrame").mockReturnValue(1);
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => undefined);
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      clearRect: vi.fn(),
      drawImage: vi.fn()
    } as unknown as CanvasRenderingContext2D);
    DeferredImage.instances = [];
    originalImage = globalThis.Image;
    globalThis.Image = DeferredImage as unknown as typeof Image;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    globalThis.Image = originalImage;
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("keeps the current clip until the prefetched next atlas is ready", () => {
    act(() => root.render(<NeedoPetMotionSequence clips={clips} fallbackSrc="/fallback.png" sprite="idle" />));

    expect(DeferredImage.instances.filter((image) => image.src === "/second-atlas.png")).toHaveLength(1);

    act(() => vi.advanceTimersByTime(1_000));
    expect(DeferredImage.instances.filter((image) => image.src === "/second-atlas.png")).toHaveLength(1);

    const prefetchedAtlas = DeferredImage.instances.find((image) => image.src === "/second-atlas.png");
    act(() => prefetchedAtlas?.resolve());

    expect(DeferredImage.instances.filter((image) => image.src === "/second-atlas.png")).toHaveLength(2);
  });
});
