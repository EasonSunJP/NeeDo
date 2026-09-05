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

  it("provides independent titled containers and a themed file chooser", () => {
    expect(applicationUiSource).toContain("export function ApplicationSection");
    expect(applicationUiSource).toContain("TitleWithInfo");
    expect(applicationUiSource).toContain("export function ApplicationFileUpload");
    expect(applicationUiSource).toContain('type="file"');
    expect(applicationUiSource).toContain("sr-only");
  });

  it("keeps the application header above preview chrome and fixes the action at home-nav position", () => {
    expect(applicationUiSource).toContain('headerFrameClassName="z-[140]"');
    expect(applicationUiSource).toContain("export function ApplicationBottomAction");
    expect(applicationUiSource).toContain("fixed inset-x-0 bottom-0 z-[100]");
    expect(applicationUiSource).toContain("--client-bottom-nav-inline-gap");
  });
});
