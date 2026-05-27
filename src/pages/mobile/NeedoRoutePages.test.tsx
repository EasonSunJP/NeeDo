import { describe, expect, it } from "vitest";
import source from "./NeedoRoutePages.tsx?raw";

describe("NeedoRoutePages", () => {
  it("keeps intelligence and demand detail content behind the glass header", () => {
    const componentStart = source.indexOf("function NeedoPostDetailContent");
    const componentEnd = source.indexOf("function NeedoCustomerDetailContent");
    const componentSource = source.slice(componentStart, componentEnd);

    expect(componentSource).toContain('<MobileFullscreenPage innerClassName="client-glass-page-surface">');
    expect(componentSource).toContain("showSpacer={false}");
    expect(componentSource).toContain("pt-[calc(env(safe-area-inset-top)+86px)]");
  });
});
