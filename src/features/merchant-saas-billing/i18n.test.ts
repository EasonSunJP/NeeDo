import { describe, expect, it } from "vitest";
import { merchantSaasBillingTranslations } from "./i18n";

describe("merchant SaaS billing translations", () => {
  it("provides all list-view and selected-shop preview labels in every supported target language", () => {
    const labels = [
      "信息卡显示",
      "列表显示",
      "店名",
      "创建者",
      "地区",
      "平台抽成",
      "添加时间",
      "详情",
      "打开该店铺后台",
      "浏览器阻止了新页面，请允许弹出窗口后重试",
    ];

    for (const label of labels) {
      const translation = merchantSaasBillingTranslations[label];
      expect(translation, label).toBeDefined();
      for (const language of ["zh-Hant", "ja", "en", "ko"] as const) {
        expect(translation?.[language]?.trim(), `${label} (${language})`).toBeTruthy();
      }
    }
  });
});
