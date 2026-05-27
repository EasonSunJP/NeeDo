import { describe, expect, it } from "vitest";
// @ts-expect-error -- Vitest runs this source guard in Node; frontend tsconfig intentionally omits Node types.
import { readFileSync } from "node:fs";
import source from "./FloatingHomeHeader.tsx?raw";

const styles = readFileSync(new URL("../../styles.css", import.meta.url), "utf8");

describe("FloatingHomeHeader spacing guard", () => {
  it("prevents parent vertical rhythm utilities from pushing the fixed frame down", () => {
    expect(source).toContain('className={cn("pointer-events-none fixed inset-x-0 top-0 z-[35] !mt-0", frameClassName)}');
  });

  it("keeps every shared floating header on the Liquid Glass surface class", () => {
    expect(source).toContain('export const floatingHeaderLiquidGlassClassName = "client-liquid-glass-header";');
    expect(source).toContain("floatingHeaderLiquidGlassClassName,");
  });

  it("keeps the floating fullscreen header background translucent enough to refract content below", () => {
    expect(styles).toContain(".client-floating-header-glass-frame");
    expect(styles).toContain("color-mix(in srgb, var(--client-top-chrome-bg) 14%, transparent) 0%");
    expect(styles).not.toContain("color-mix(in srgb, var(--client-top-chrome-bg) 18%, var(--client-elevated) 12%)");
  });
});
