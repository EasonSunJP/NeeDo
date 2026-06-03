import { describe, expect, it } from "vitest";
// @ts-expect-error Vitest runs in Node; the app tsconfig does not include Node types.
import { readFileSync } from "fs";
import source from "./ShopAnalyticsDashboard.tsx?raw";

const styles = readFileSync(new URL("../../styles.css", import.meta.url), "utf8") as string;

describe("ShopAnalyticsDashboard theme surfaces", () => {
  it("uses theme-aware semantic classes for analytics panels", () => {
    expect(source).toContain("shop-analytics-dashboard");
    expect(source).toContain("shop-analytics-panel");
    expect(source).toContain("shop-analytics-filter-panel");
    expect(source).toContain("shop-analytics-control-inactive");
    expect(source).toContain("shop-analytics-hero-overlay");
  });

  it("bridges the admin analytics surface to merchant admin theme tokens", () => {
    expect(source).toContain("merchant-admin-analytics-surface");
    expect(styles).toContain(".merchant-admin-shell .merchant-admin-analytics-surface");
    expect(styles).toContain("--shop-analytics-page-bg: var(--admin-bg");
    expect(styles).toContain("--client-primary: var(--admin-accent");
  });

  it("does not force light client themes into the dark analytics shell", () => {
    expect(styles).toContain(".client-shell.client-theme-night.merchant-analytics-clean-shell");
    expect(styles).toContain(".client-shell.client-theme-day.merchant-analytics-clean-shell");
    expect(styles).toContain(".client-shell.client-theme-light-green.merchant-analytics-clean-shell");
    expect(styles).toContain(".client-shell.client-theme-vital-mono.merchant-analytics-clean-shell");
    expect(styles).toContain(".client-shell.client-theme-day.merchant-analytics-clean-shell .shop-analytics-panel");
  });

  it("uses the shared mobile fullscreen header for data-center detail pages", () => {
    const headerFunction = source.slice(
      source.indexOf("function AnalyticsFullscreenHeader"),
      source.indexOf("function DrilldownDrawer")
    );

    expect(headerFunction).toContain("<MobileFullscreenHeader");
    expect(headerFunction).toContain("showSpacer={false}");
    expect(headerFunction).toContain('subtitle={subtitle}');
    expect(headerFunction).not.toContain("<header className=");
    expect(headerFunction).not.toContain("dark");
    expect(headerFunction).not.toContain("spacerGapPx={24}");
    expect(headerFunction).not.toContain("!backdrop-blur-none");
    expect(headerFunction).not.toContain("!bg-[color:var(--client-bg)]");
  });

  it("does not place extra gradient masks under data-center fullscreen headers", () => {
    expect(source).toContain("<MobileFullscreenPage>{content}</MobileFullscreenPage>");
    expect(source).toContain("pt-[calc(env(safe-area-inset-top)+86px)]");
    expect(source).not.toContain("bg-[radial-gradient(circle_at_18%_0%");
    expect(source).not.toContain("bg-[linear-gradient(180deg,color-mix(in_srgb,var(--client-surface)_94%,var(--client-bg)_6%)");
  });
});
