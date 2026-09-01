import { describe, expect, it } from "vitest";
import source from "./MobileFullscreenHeader.tsx?raw";

describe("MobileFullscreenHeader overlay modes", () => {
  it("keeps fullscreen overlays on the shared floating glass header contract", () => {
    expect(source).toContain("<FloatingHomeHeader");
    expect(source).toContain("spacerGapPx={0}");
    expect(source).not.toContain("floating = true");
    expect(source).not.toContain("if (!floating) {");
  });

  it("lets feature selectors share the glass header at their own content width", () => {
    expect(source).toContain('maxWidth?: CSSProperties["maxWidth"]');
    expect(source).toContain("maxWidth={maxWidth ?? \"480px\"}");
    expect(source).toContain("footer?: ReactNode");
    expect(source).toContain("{footer ? <div");
  });
});
