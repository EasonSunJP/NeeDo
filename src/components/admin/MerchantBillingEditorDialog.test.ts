import { describe, expect, it } from "vitest";
import source from "./MerchantBillingEditorDialog.tsx?raw";

describe("MerchantBillingEditorDialog billing history", () => {
  it("renders persisted invoice and payment history at the bottom of the dialog", () => {
    expect(source).toContain("历史付费记录");
    expect(source).toContain("invoices.map");
    expect(source).toContain("invoice.payments");
    expect(source).toContain("暂无历史付费记录");
  });

  it("keeps the end-trial action on one line", () => {
    expect(source).toContain('className="whitespace-nowrap"');
    expect(source).toContain('t("解除试用")');
  });
});
