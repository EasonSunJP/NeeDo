import { describe, expect, it } from "vitest";
import applicationUiSource from "./ApplicationUi.tsx?raw";
import merchantApplicationSource from "./MerchantApplicationPage.tsx?raw";

describe("identity application page chrome", () => {
  it("hides the regular user navigation throughout the merchant application flow", () => {
    expect(applicationUiSource).toContain("hideNavigation?: boolean;");
    expect(applicationUiSource).toContain("navItems={hideNavigation ? [] : undefined}");
    expect(merchantApplicationSource).toContain("<ApplicationShell hideNavigation");
  });

  it("uses formal category-first taxonomy selection instead of free-text service tags", () => {
    expect(merchantApplicationSource).toContain("ShopTaxonomyRegistrationField");
    expect(merchantApplicationSource).toContain("serviceCategoryIds: form.serviceCategoryIds");
    expect(merchantApplicationSource).toContain("businessKeywordIds: form.businessKeywordIds");
    expect(merchantApplicationSource).not.toContain('updateForm("tags"');
  });
});
