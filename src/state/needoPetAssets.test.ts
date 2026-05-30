import { afterEach, describe, expect, it, vi } from "vitest";

function createStorage(seed: Record<string, string> = {}) {
  const entries = new Map(Object.entries(seed));

  return {
    clear: vi.fn(() => entries.clear()),
    getItem: vi.fn((key: string) => entries.get(key) ?? null),
    key: vi.fn((index: number) => Array.from(entries.keys())[index] ?? null),
    removeItem: vi.fn((key: string) => {
      entries.delete(key);
    }),
    setItem: vi.fn((key: string, value: string) => {
      entries.set(key, value);
    }),
    get length() {
      return entries.size;
    }
  } satisfies Storage;
}

function stubWindow(localStorage: Storage) {
  vi.stubGlobal("window", {
    addEventListener: vi.fn(),
    localStorage,
    removeEventListener: vi.fn()
  });
}

function stubImageLoader(options: { failSrc?: (src: string) => boolean; onRequest?: (src: string) => void } = {}) {
  class FakeImage {
    complete = false;
    decoding: "async" | "auto" | "sync" = "auto";
    naturalWidth = 0;
    onerror: (() => void) | null = null;
    onload: (() => void) | null = null;
    private currentSrc = "";

    get src() {
      return this.currentSrc;
    }

    set src(value: string) {
      this.currentSrc = value;
      options.onRequest?.(value);

      queueMicrotask(() => {
        if (options.failSrc?.(value)) {
          this.onerror?.();
          return;
        }

        this.complete = true;
        this.naturalWidth = 132;
        this.onload?.();
      });
    }
  }

  vi.stubGlobal("Image", FakeImage);
}

afterEach(() => {
  vi.resetModules();
  vi.unstubAllGlobals();
});

describe("needoPetAssets", () => {
  it("preloads every Xiaobai asset before reporting ready", async () => {
    const localStorage = createStorage();
    const requestedSources: string[] = [];
    stubWindow(localStorage);
    stubImageLoader({ onRequest: (src) => requestedSources.push(src) });

    const {
      getNeedoPetAssetReadiness,
      preloadNeedoPetAssets,
      xiaobaiPetAssetManifest,
      xiaobaiPetAssetVersion
    } = await import("./needoPetAssets");

    expect(getNeedoPetAssetReadiness().status).toBe("idle");

    const result = await preloadNeedoPetAssets({ force: true });

    expect(result.status).toBe("ready");
    expect(result.loaded).toBe(xiaobaiPetAssetManifest.length);
    expect(requestedSources).toEqual(xiaobaiPetAssetManifest);

    const stored = JSON.parse(String(localStorage.getItem("needo.digital-pet.assets.v1"))) as { status: string; version: string };
    expect(stored).toMatchObject({
      status: "ready",
      version: xiaobaiPetAssetVersion
    });
  });

  it("keeps the feature unavailable when an asset fails to download", async () => {
    const localStorage = createStorage({
      "needo.digital-pet.assets.v1": JSON.stringify({ status: "ready", version: "old" })
    });
    stubWindow(localStorage);
    stubImageLoader({ failSrc: (src) => src.includes("xiao-bai-run-sprint") });

    const { preloadNeedoPetAssets } = await import("./needoPetAssets");

    const result = await preloadNeedoPetAssets({ force: true });

    expect(result.status).toBe("error");
    expect(result.ready).toBe(false);
    expect(result.failedSrc).toContain("xiao-bai-run-sprint");
    expect(localStorage.removeItem).toHaveBeenCalledWith("needo.digital-pet.assets.v1");
  });

  it("restores readiness from the matching local asset version", async () => {
    const version = "20260521h";
    const localStorage = createStorage({
      "needo.digital-pet.assets.v1": JSON.stringify({ status: "ready", version })
    });
    stubWindow(localStorage);

    const { getNeedoPetAssetReadiness } = await import("./needoPetAssets");

    expect(getNeedoPetAssetReadiness()).toMatchObject({
      ready: true,
      status: "ready",
      version
    });
  });
});
