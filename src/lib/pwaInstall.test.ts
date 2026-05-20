import { describe, expect, it, vi } from "vitest";
import {
  detectPwaInstallPlatform,
  isPwaStandaloneWindow,
  normalizePwaInstallPromptOutcome,
  shouldShowPwaInstallSetting
} from "./pwaInstall";

function makeWindow({
  displayMode,
  standalone,
  datasetMode
}: {
  displayMode?: string;
  standalone?: boolean;
  datasetMode?: string;
} = {}) {
  return {
    document: {
      documentElement: {
        dataset: datasetMode ? { needoDisplayMode: datasetMode } : {}
      }
    },
    matchMedia: vi.fn((query: string) => ({
      matches: displayMode ? query === `(display-mode: ${displayMode})` : false
    })),
    navigator: {
      standalone,
      userAgent: "Mozilla/5.0",
      platform: "MacIntel",
      maxTouchPoints: 0
    }
  } as unknown as Window;
}

describe("pwa install helpers", () => {
  it("detects standalone launch modes", () => {
    expect(isPwaStandaloneWindow(makeWindow({ displayMode: "standalone" }))).toBe(true);
    expect(isPwaStandaloneWindow(makeWindow({ displayMode: "fullscreen" }))).toBe(true);
    expect(isPwaStandaloneWindow(makeWindow({ standalone: true }))).toBe(true);
    expect(isPwaStandaloneWindow(makeWindow({ datasetMode: "standalone" }))).toBe(true);
  });

  it("shows the settings entry only for browser mode", () => {
    expect(shouldShowPwaInstallSetting(makeWindow())).toBe(true);
    expect(shouldShowPwaInstallSetting(makeWindow({ displayMode: "standalone" }))).toBe(false);
  });

  it("detects install platform from mobile user agents", () => {
    expect(detectPwaInstallPlatform({ userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)" })).toBe("ios");
    expect(detectPwaInstallPlatform({ userAgent: "Mozilla/5.0 (Linux; Android 15; Pixel 9)" })).toBe("android");
    expect(detectPwaInstallPlatform({ userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", platform: "MacIntel", maxTouchPoints: 5 })).toBe("ios");
  });

  it("normalizes native prompt outcomes", () => {
    expect(normalizePwaInstallPromptOutcome({ outcome: "accepted" })).toBe("accepted");
    expect(normalizePwaInstallPromptOutcome({ outcome: "dismissed" })).toBe("dismissed");
    expect(normalizePwaInstallPromptOutcome({ outcome: "unknown" })).toBe("unavailable");
  });
});
