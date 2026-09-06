import { describe, expect, it } from "vitest";
import customer from "../../pages/user/UserOrderDetailPage.tsx?raw";
import technician from "../technician-schedule/route-pages.tsx?raw";
import admin from "../../components/admin/AdminLayout.tsx?raw";
import merchant from "../../components/merchant-admin/MerchantAdminLayout.tsx?raw";
import toolbar from "./BackofficeHeaderActions.tsx?raw";
import { sosText } from "./i18n";

describe("SOS portal integration", () => {
  it("binds the same sender into each existing booking header action slot", () => {
    expect(customer).toContain("actions={order ? <BookingSosButton");
    expect(technician).toContain("action={<BookingSosButton");
    expect(technician).toContain("action={action}");
  });
  it("replaces the static review link with the common backoffice toolbar in both portals", () => {
    expect(admin).toContain("<BackofficeHeaderActions");
    expect(merchant).toContain("<BackofficeHeaderActions");
    expect(admin).not.toContain("/admin/reviews?module=sos");
    const offsets = ["<SosAlertsButton", "<LanguageSwitcher", "<AdminThemeMenu", "aria-label={t(\"messages\")}", "aria-label={t(\"support\")}"].map((text) => toolbar.indexOf(text));
    expect(offsets.every((position, index) => position >= 0 && (index === 0 || position > offsets[index - 1]))).toBe(true);
  });
  it("localizes the SOS action in all existing languages", () => {
    for (const locale of ["zh-Hant", "ja", "en", "ko"] as const) {
      expect(sosText("send", locale)).not.toBe(sosText("send", "zh"));
      expect(sosText("connectionError", locale)).not.toBe(sosText("connectionError", "zh"));
    }
  });
});
