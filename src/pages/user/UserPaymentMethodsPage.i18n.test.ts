import { describe, expect, it } from "vitest";
import { translateText } from "../../i18n/translations";
import { paymentMethodsText } from "./userPaymentMethodsI18n";

describe("user payment-method i18n", () => {
  it.each([
    ["zh", "支付方式", "已可用", "暂不可用", "未接入"],
    ["zh-Hant", "支付方式", "可使用", "暫時無法使用", "尚未串接"],
    ["ja", "支払い方法", "利用可能", "現在利用できません", "未連携"],
    ["en", "Payment methods", "Available", "Temporarily unavailable", "Not integrated"],
    ["ko", "결제 수단", "사용 가능", "현재 사용 불가", "미연동"],
  ] as const)("provides complete %s payment status copy", (language, title, available, unavailable, unintegrated) => {
    expect(paymentMethodsText("title", language)).toBe(title);
    expect(paymentMethodsText("available", language)).toBe(available);
    expect(paymentMethodsText("unavailable", language)).toBe(unavailable);
    expect(paymentMethodsText("unintegrated", language)).toBe(unintegrated);
  });

  it("registers the personal-center payment entry copy with the shared runtime i18n", () => {
    expect(translateText("现金、NDP 与外部渠道状态", "ja")).toBe(
      "現金・NDP・外部決済の状況",
    );
    expect(translateText("现金、NDP 与外部渠道状态", "en")).toBe(
      "Cash, NDP, and external channel status",
    );
  });
});
