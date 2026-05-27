import { describe, expect, it } from "vitest";
import source from "./UserOrdersPage.tsx?raw";

describe("UserOrdersPage", () => {
  it("lets the appointment list content sit behind the glass header", () => {
    expect(source).toContain('<MobileFullscreenPage innerClassName="client-glass-page-surface">');
    expect(source).toContain('className={cn(fullscreenHeaderClassName, "needo-orders-glass-header")}');
    expect(source).toContain("onClose={closePage}");
    expect(source).toContain("showSpacer={false}");
    expect(source).toContain("pt-[calc(env(safe-area-inset-top)+86px)]");
  });
});
