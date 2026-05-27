import { describe, expect, it } from "vitest";
import source from "./MobileFullscreenHeader.tsx?raw";

describe("MobileFullscreenHeader overlay modes", () => {
  it("keeps fullscreen overlays on the shared floating glass header contract", () => {
    expect(source).toContain("<FloatingHomeHeader");
    expect(source).toContain("spacerGapPx={0}");
    expect(source).not.toContain("floating = true");
    expect(source).not.toContain("if (!floating) {");
  });
});
