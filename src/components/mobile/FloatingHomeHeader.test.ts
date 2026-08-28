import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import appScaffoldSource from "../client-ui/AppScaffold.tsx?raw";
import source from "./FloatingHomeHeader.tsx?raw";

const styles = readFileSync(new URL("../../styles.css", import.meta.url), "utf8");

describe("FloatingHomeHeader spacing guard", () => {
  it("prevents parent vertical rhythm utilities from pushing the fixed frame down", () => {
    expect(source).toContain('className={cn("pointer-events-none fixed inset-x-0 top-0 z-[35] !mt-0", frameClassName)}');
  });

  it("keeps every shared floating header on the framed Liquid Glass surface class", () => {
    expect(source).toContain('export const floatingHeaderLiquidGlassClassName = "client-liquid-glass-header";');
    expect(source).toContain("client-floating-header-glass-frame");
    expect(source).toContain("floatingHeaderLiquidGlassClassName,");
    expect(source).not.toContain("client-floating-header-frameless");
  });

  it("keeps shared floating headers on the common framed surface", () => {
    expect(source).toContain("safe-header-top rounded-[28px] border px-4 pb-3 backdrop-blur-2xl backdrop-saturate-150");
    expect(styles).toContain(".client-shell .client-floating-header-glass-frame {");
    expect(styles).toContain("color-mix(in srgb, var(--client-top-chrome-bg) 14%, transparent) 0%");
    expect(styles).toContain("0 18px 42px color-mix(in srgb, var(--client-bg) 22%, rgba(0, 0, 0, 0.18))");
    expect(styles).toContain("blur(18px) saturate(1.7) contrast(1.04) brightness(1.03)");
    expect(styles).not.toContain(".client-shell .client-floating-header-frameless");
  });

  it("rounds every remaining floating top header to 28px on all four corners", () => {
    expect(source).toContain("client-floating-header-glass-frame !rounded-[28px]");
    expect(source).not.toContain("rounded-t-none");
    expect(source).not.toContain("rounded-b-[28px]");

    const cpsTabsStart = styles.indexOf(".business-cps-segmented-tabs {");
    const cpsTabsEnd = styles.indexOf(".business-cps-segmented-tabs .business-cps-segmented-tab", cpsTabsStart);
    const cpsTabsStyles = styles.slice(cpsTabsStart, cpsTabsEnd);
    expect(cpsTabsStyles).toContain("border-radius: 28px;");
    expect(cpsTabsStyles).not.toContain("border-radius: 0 0 28px 28px;");
  });

  it("keeps the original shared AppTopBar proportions", () => {
    expect(source).toContain('export const floatingHeaderInnerClassName = "px-3 pb-3";');
    expect(appScaffoldSource).toContain("h-11 w-11 items-center justify-center rounded-full border border-[color:color-mix(in_srgb,var(--client-line)_72%,transparent)]");
    expect(appScaffoldSource).toContain("grid-cols-[44px_minmax(0,1fr)_auto]");
    expect(appScaffoldSource).toContain("row-start-1 flex h-11 min-w-0 items-center");
    expect(appScaffoldSource).toContain("truncate text-[20px] font-black leading-none");
  });

});
