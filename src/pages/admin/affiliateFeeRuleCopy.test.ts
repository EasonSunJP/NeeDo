import { describe, expect, it } from "vitest";
import {
  affiliateFeeRuleLanguageOrder,
  getAffiliateFeeRuleCopy
} from "./affiliateFeeRuleCopy";

describe("Affiliate fee rule operations copy", () => {
  it("uses the required language order and product names", () => {
    expect(affiliateFeeRuleLanguageOrder).toEqual(["ja", "en", "ko", "zh-Hant", "zh"]);
    expect(getAffiliateFeeRuleCopy("ja").title).toBe("アフィリエイト手数料ルール");
    expect(getAffiliateFeeRuleCopy("en").title).toBe("Affiliate fee rules");
    expect(getAffiliateFeeRuleCopy("ko").title).toBe("제휴 마케팅 수수료 규칙");
    expect(getAffiliateFeeRuleCopy("zh-Hant").title).toBe("聯盟行銷抽成規則");
    expect(getAffiliateFeeRuleCopy("zh").title).toBe("联盟营销抽成规则");
  });

  it("defines the same complete non-empty copy contract in every language", () => {
    const referenceKeys = Object.keys(getAffiliateFeeRuleCopy("ja")).sort();
    expect(referenceKeys.length).toBeGreaterThan(50);

    for (const language of affiliateFeeRuleLanguageOrder) {
      const copy = getAffiliateFeeRuleCopy(language);
      expect(Object.keys(copy).sort()).toEqual(referenceKeys);
      for (const value of Object.values(copy)) {
        if (typeof value === "string") expect(value.trim()).not.toBe("");
      }
    }
  });

  it("does not reuse English as the Korean fallback", () => {
    const korean = getAffiliateFeeRuleCopy("ko");
    const english = getAffiliateFeeRuleCopy("en");
    expect(korean.description).not.toBe(english.description);
    expect(korean.permissionDenied).not.toBe(english.permissionDenied);
    expect(korean.conflict).not.toBe(english.conflict);
  });
});
