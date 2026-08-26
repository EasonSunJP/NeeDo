import { describe, expect, it } from "vitest";
import applicationUiSource from "./ApplicationUi.tsx?raw";
import merchantApplicationSource from "./MerchantApplicationPage.tsx?raw";

describe("identity application page chrome", () => {
  it("hides the regular user navigation throughout the merchant application flow", () => {
    expect(applicationUiSource).toContain("hideNavigation?: boolean;");
    expect(applicationUiSource).toContain("navItems={hideNavigation ? [] : undefined}");
    expect(merchantApplicationSource).toContain("<ApplicationShell hideNavigation");
  });
});
