import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveClientPerformanceProfile } from "./clientPerformance";

const appSource = readFileSync(resolve(process.cwd(), "src/App.tsx"), "utf8");
const stylesSource = readFileSync(resolve(process.cwd(), "src/styles.css"), "utf8");

describe("client performance profile", () => {
  it("classifies the reported OPPO Reno A Android 9 class as reduced", () => {
    expect(resolveClientPerformanceProfile({
      deviceMemory: 6,
      hardwareConcurrency: 8,
      prefersReducedMotion: false,
      userAgent: "Mozilla/5.0 (Linux; Android 9; CPH1983 Build/PKQ1.190616.001) AppleWebKit/537.36 Chrome/101.0 Mobile Safari/537.36"
    })).toBe("reduced");
  });

  it("keeps a capable current Android device on the full profile", () => {
    expect(resolveClientPerformanceProfile({
      deviceMemory: 8,
      hardwareConcurrency: 8,
      prefersReducedMotion: false,
      userAgent: "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 Chrome/140.0 Mobile Safari/537.36"
    })).toBe("full");
  });

  it("reduces effects on constrained Android hardware without targeting a model name", () => {
    expect(resolveClientPerformanceProfile({
      deviceMemory: 4,
      hardwareConcurrency: 8,
      prefersReducedMotion: false,
      userAgent: "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/130.0 Mobile Safari/537.36"
    })).toBe("reduced");
  });

  it("does not use Android heuristics for iPhone", () => {
    expect(resolveClientPerformanceProfile({
      deviceMemory: 2,
      hardwareConcurrency: 2,
      prefersReducedMotion: false,
      userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148"
    })).toBe("full");
  });

  it("avoids eager pet work and expensive glass effects on the reduced profile", () => {
    expect(appSource).toContain("<NeedoPetAssetBootstrap disabled={reducedPerformance} />");
    expect(appSource).toContain("<NeedoPet disabled={Boolean(splashPortal) || reducedPerformance} />");
    expect(appSource).toContain("reducedPerformance ? 140 : 920");
    expect(appSource).toContain('decoding={reducedPerformance ? "async" : "sync"}');
    expect(stylesSource).toContain('html[data-needo-performance-profile="reduced"]');
    expect(stylesSource).toContain("backdrop-filter: none !important");
    expect(stylesSource).toContain("animation-duration: 0.01ms !important");
    expect(stylesSource).toContain("will-change: auto !important");
    expect(stylesSource).toContain('html[data-needo-performance-profile="reduced"] .client-shell :where(.border, .border-x, .border-y, .border-t, .border-r, .border-b, .border-l)');
  });
});
