import { describe, expect, it } from "vitest";
import source from "./FloatingHomeHeader.tsx?raw";

describe("FloatingHomeHeader spacing guard", () => {
  it("prevents parent vertical rhythm utilities from pushing the fixed frame down", () => {
    expect(source).toContain('className={cn("pointer-events-none fixed inset-x-0 top-0 z-[35] !mt-0", frameClassName)}');
  });

  it("keeps every shared floating header on the Liquid Glass surface class", () => {
    expect(source).toContain('export const floatingHeaderLiquidGlassClassName = "client-liquid-glass-header";');
    expect(source).toContain("floatingHeaderLiquidGlassClassName,");
  });
});
