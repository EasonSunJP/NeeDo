import { afterEach, describe, expect, it, vi } from "vitest";
import { preloadSplashImage } from "./splashImageCache";

const originalImage = globalThis.Image;

afterEach(() => {
  vi.stubGlobal("Image", originalImage);
});

describe("portal splash image cache", () => {
  it("reuses a warmed image while switching to its portal", async () => {
    const images: Array<{ onload: (() => void) | null; onerror: (() => void) | null }> = [];
    class FakeImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      src = "";
      constructor() { images.push(this); }
    }
    vi.stubGlobal("Image", FakeImage);

    const warm = preloadSplashImage("/technician-splash.jpg");
    const switchLoad = preloadSplashImage("/technician-splash.jpg");
    expect(images).toHaveLength(1);
    images[0]?.onload?.();
    await expect(Promise.all([warm, switchLoad])).resolves.toEqual([undefined, undefined]);
    await preloadSplashImage("/technician-splash.jpg");
    expect(images).toHaveLength(1);
  });

  it("allows a failed warmup to retry on portal entry", async () => {
    const images: Array<{ onload: (() => void) | null; onerror: (() => void) | null }> = [];
    class FakeImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      src = "";
      constructor() { images.push(this); }
    }
    vi.stubGlobal("Image", FakeImage);

    const failedWarm = preloadSplashImage("/merchant-splash.jpg");
    images[0]?.onerror?.();
    await failedWarm;
    const retry = preloadSplashImage("/merchant-splash.jpg");
    expect(images).toHaveLength(2);
    images[1]?.onload?.();
    await retry;
  });

  it("does not hold the splash open when image decoding throws", async () => {
    const images: FakeImage[] = [];
    class FakeImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      src = "";
      decode() { throw new Error("decode unavailable"); }
      constructor() { images.push(this); }
    }
    vi.stubGlobal("Image", FakeImage);

    const ready = preloadSplashImage("/decode-error.jpg");
    images[0]?.onload?.();
    await expect(ready).resolves.toBeUndefined();
  });
});
