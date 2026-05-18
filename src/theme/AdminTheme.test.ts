import { afterEach, describe, expect, it, vi } from "vitest";
import { defaultDayAdminTheme, defaultNightAdminTheme, detectSystemAdminTheme, getAdminThemeOption, normalizeAdminTheme, sharedAdminThemeOptions } from "./AdminTheme";

function stubWindow(matches: boolean) {
  vi.stubGlobal("window", {
    matchMedia: vi.fn(() => ({
      matches
    }))
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("AdminTheme", () => {
  it("orders shared admin themes by the requested UI sequence", () => {
    expect(sharedAdminThemeOptions.map((theme) => theme.id)).toEqual(["pink-purple-black", "classic-white-black", "blue-black"]);
  });

  it("exposes pink-purple-black as a selectable admin theme", () => {
    expect(sharedAdminThemeOptions.map((theme) => theme.id)).toContain("pink-purple-black");
    expect(getAdminThemeOption("pink-purple-black").label).toBe("粉紫黑");
    expect(getAdminThemeOption("pink-purple-black").mode).toBe("light");
  });

  it("exposes classic blue-black as a shared admin theme", () => {
    expect(sharedAdminThemeOptions.map((theme) => theme.id)).toContain("blue-black");
    expect(getAdminThemeOption("blue-black").label).toBe("经典蓝黑");
    expect(getAdminThemeOption("blue-black").mode).toBe("dark");
  });

  it("exposes classic white-black as a shared admin theme", () => {
    expect(sharedAdminThemeOptions.map((theme) => theme.id)).toContain("classic-white-black");
    expect(getAdminThemeOption("classic-white-black").label).toBe("经典白黑");
    expect(getAdminThemeOption("classic-white-black").mode).toBe("light");
  });

  it("normalizes deleted dark admin theme ids to classic blue-black", () => {
    expect(normalizeAdminTheme("black-gold", "pink-purple-black", sharedAdminThemeOptions, "blue-black")).toBe("blue-black");
    expect(normalizeAdminTheme("dark-green", "pink-purple-black", sharedAdminThemeOptions, "blue-black")).toBe("blue-black");
  });

  it("normalizes deleted light and pink aliases to pink-purple-black", () => {
    expect(normalizeAdminTheme("light-green", "blue-black", sharedAdminThemeOptions, "blue-black")).toBe("pink-purple-black");
    expect(normalizeAdminTheme("neon-pink", "blue-black", sharedAdminThemeOptions, "blue-black")).toBe("pink-purple-black");
  });

  it("normalizes white-black aliases to classic white-black", () => {
    expect(normalizeAdminTheme("white-black", "pink-purple-black", sharedAdminThemeOptions, "blue-black")).toBe("classic-white-black");
    expect(normalizeAdminTheme("black-white", "pink-purple-black", sharedAdminThemeOptions, "blue-black")).toBe("classic-white-black");
  });

  it("detects the shared admin theme from the system color scheme", () => {
    expect(defaultDayAdminTheme).toBe("classic-white-black");
    expect(defaultNightAdminTheme).toBe("blue-black");

    stubWindow(true);
    expect(detectSystemAdminTheme(defaultDayAdminTheme, defaultNightAdminTheme, sharedAdminThemeOptions)).toBe("blue-black");

    stubWindow(false);
    expect(detectSystemAdminTheme(defaultDayAdminTheme, defaultNightAdminTheme, sharedAdminThemeOptions)).toBe("classic-white-black");
    expect(detectSystemAdminTheme()).toBe("classic-white-black");
  });

  it("defaults to classic-white-black when no stored theme is available", () => {
    expect(normalizeAdminTheme(null, undefined, sharedAdminThemeOptions, "blue-black")).toBe("classic-white-black");
  });
});
