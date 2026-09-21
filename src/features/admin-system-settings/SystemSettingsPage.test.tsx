import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const pageSource = readFileSync(new URL("./SystemSettingsPage.tsx", import.meta.url), "utf8");
const basicSource = readFileSync(new URL("./BasicSettingsTab.tsx", import.meta.url), "utf8");
const retentionSource = readFileSync(new URL("./RetentionSettingsTab.tsx", import.meta.url), "utf8");
const paymentSource = readFileSync(new URL("./PaymentSettingsTab.tsx", import.meta.url), "utf8");

describe("operations system settings workspace", () => {
  it("provides six URL-addressable tabs with keyboard navigation", () => {
    for (const tab of ["basic", "legal", "storage", "payment", "ekyc", "test-ndp"]) {
      expect(pageSource).toContain(`id: "${tab}"`);
    }
    expect(pageSource).toContain('role="tablist"');
    expect(pageSource).toContain("ArrowRight");
    expect(pageSource).toContain("setSearchParams");
  });

  it("keeps login timing single-select and new-IP verification combinable", () => {
    expect(basicSource).toContain('type="radio"');
    expect(basicSource).toContain("passwordLoginOtpOnNewIp");
    expect(basicSource).toContain("loginProviderProjects");
    expect(basicSource).toContain("loginLogoMediaPublicId");
    expect(basicSource).toContain("requestButtonMediaPublicId");
  });

  it("accepts only positive whole-day retention values and explains server-only scope", () => {
    expect(retentionSource).toContain("Number.isInteger");
    expect(retentionSource).toContain("messageDays");
    expect(retentionSource).toContain("mediaDays");
    expect(retentionSource).toContain("不会删除用户设备本地");
  });

  it("makes only offline and NDP switches actionable", () => {
    expect(paymentSource).toContain("offlinePaymentEnabled");
    expect(paymentSource).toContain("ndpPaymentEnabled");
    for (const provider of ["paypay", "paypal", "stripe"]) {
      expect(paymentSource).toContain(`"${provider}"`);
    }
    expect(paymentSource).toContain("actionable: false");
  });
});
