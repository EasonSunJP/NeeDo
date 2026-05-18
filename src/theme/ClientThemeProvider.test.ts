import { afterEach, describe, expect, it, vi } from "vitest";
import { clientThemes, detectSystemClientTheme, getClientThemeClassName, getInitialClientThemeState, isNightClientTheme } from "./ClientThemeProvider";

function createStorage(seed: Record<string, string> = {}) {
  const entries = new Map(Object.entries(seed));

  return {
    get length() {
      return entries.size;
    },
    clear: vi.fn(() => {
      entries.clear();
    }),
    getItem: vi.fn((key: string) => (entries.has(key) ? entries.get(key)! : null)),
    key: vi.fn((index: number) => Array.from(entries.keys())[index] ?? null),
    removeItem: vi.fn((key: string) => {
      entries.delete(key);
    }),
    setItem: vi.fn((key: string, value: string) => {
      entries.set(key, value);
    })
  } satisfies Storage;
}

function stubWindow({
  localStorage,
  matches
}: {
  localStorage: Storage;
  matches: boolean;
}) {
  vi.stubGlobal("window", {
    localStorage,
    sessionStorage: localStorage,
    matchMedia: vi.fn(() => ({
      matches,
      media: "(prefers-color-scheme: dark)",
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn()
    })),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn()
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ClientThemeProvider theme boot logic", () => {
  it("uses cool-black-gray as the default when the device is in dark mode", () => {
    stubWindow({
      localStorage: createStorage(),
      matches: true
    });

    expect(detectSystemClientTheme()).toBe("cool-black-gray");
    expect(getInitialClientThemeState()).toEqual({
      theme: "cool-black-gray",
      preferenceMode: "auto"
    });
  });

  it("uses vital-mono as the default when the device is in light mode", () => {
    stubWindow({
      localStorage: createStorage(),
      matches: false
    });

    expect(detectSystemClientTheme()).toBe("vital-mono");
    expect(getInitialClientThemeState()).toEqual({
      theme: "vital-mono",
      preferenceMode: "auto"
    });
  });

  it("keeps the stored manual theme when manual mode is set", () => {
    stubWindow({
      localStorage: createStorage({
        "needo.client.theme": "light-green",
        "needo.client.theme.mode": "manual"
      }),
      matches: true
    });

    expect(getInitialClientThemeState()).toEqual({
      theme: "light-green",
      preferenceMode: "manual"
    });
  });

  it("keeps the stored neon theme when manual mode is set", () => {
    stubWindow({
      localStorage: createStorage({
        "needo.client.theme": "neon-pink",
        "needo.client.theme.mode": "manual"
      }),
      matches: false
    });

    expect(getInitialClientThemeState()).toEqual({
      theme: "neon-pink",
      preferenceMode: "manual"
    });
    expect(isNightClientTheme("neon-pink")).toBe(true);
    expect(getClientThemeClassName("lovely-neon")).toBe("client-theme-neon-pink");
  });

  it("keeps the stored black-gold theme when manual mode is set", () => {
    stubWindow({
      localStorage: createStorage({
        "needo.client.theme": "black-gold",
        "needo.client.theme.mode": "manual"
      }),
      matches: false
    });

    expect(getInitialClientThemeState()).toEqual({
      theme: "black-gold",
      preferenceMode: "manual"
    });
    expect(isNightClientTheme("black-gold")).toBe(true);
    expect(getClientThemeClassName("noir-gold")).toBe("client-theme-black-gold");
  });

  it("keeps the stored cool black gray theme when manual mode is set", () => {
    stubWindow({
      localStorage: createStorage({
        "needo.client.theme": "cool-black-gray",
        "needo.client.theme.mode": "manual"
      }),
      matches: false
    });

    expect(getInitialClientThemeState()).toEqual({
      theme: "cool-black-gray",
      preferenceMode: "manual"
    });
    expect(isNightClientTheme("cool-black-gray")).toBe(true);
    expect(getClientThemeClassName("cool-gray")).toBe("client-theme-cool-black-gray");
  });

  it("keeps the stored vital mono theme when manual mode is set", () => {
    stubWindow({
      localStorage: createStorage({
        "needo.client.theme": "vital-mono",
        "needo.client.theme.mode": "manual"
      }),
      matches: true
    });

    expect(getInitialClientThemeState()).toEqual({
      theme: "vital-mono",
      preferenceMode: "manual"
    });
    expect(isNightClientTheme("vital-mono")).toBe(false);
    expect(getClientThemeClassName("black-white")).toBe("client-theme-vital-mono");
  });

  it("prefers the system theme over legacy stored theme when no manual mode is recorded", () => {
    stubWindow({
      localStorage: createStorage({
        "needo.client.theme": "light-green"
      }),
      matches: true
    });

    expect(getInitialClientThemeState()).toEqual({
      theme: "cool-black-gray",
      preferenceMode: "auto"
    });
  });

  it("orders selectable themes by the requested UI sequence", () => {
    expect(clientThemes.map((theme) => theme.id)).toEqual(["vital-mono", "cool-black-gray", "light-green", "dark-green", "neon-pink", "black-gold"]);
  });

  it("exposes the neon theme in the selectable theme list", () => {
    expect(clientThemes.map((theme) => theme.id)).toContain("neon-pink");
  });

  it("exposes the black-gold theme in the selectable theme list", () => {
    expect(clientThemes.map((theme) => theme.id)).toContain("black-gold");
  });

  it("exposes the vital mono theme in the selectable theme list", () => {
    expect(clientThemes.map((theme) => theme.id)).toContain("vital-mono");
  });

  it("exposes the cool black gray theme in the selectable theme list", () => {
    expect(clientThemes.map((theme) => theme.id)).toContain("cool-black-gray");
  });
});
