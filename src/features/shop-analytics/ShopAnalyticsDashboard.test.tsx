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

  it("does not force light client themes into the dark analytics shell", () => {
    expect(styles).toContain(".client-shell.client-theme-night.merchant-analytics-clean-shell");
    expect(styles).toContain(".client-shell.client-theme-day.merchant-analytics-clean-shell");
    expect(styles).toContain(".client-shell.client-theme-light-green.merchant-analytics-clean-shell");
    expect(styles).toContain(".client-shell.client-theme-vital-mono.merchant-analytics-clean-shell");
    expect(styles).toContain(".client-shell.client-theme-day.merchant-analytics-clean-shell .shop-analytics-panel");
  });
});
