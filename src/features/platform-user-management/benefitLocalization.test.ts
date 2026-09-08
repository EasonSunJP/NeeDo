import { describe, expect, it } from "vitest";
import { resolvePlatformBenefitLocalizedText } from "./benefitLocalization";

describe("platform membership benefit localization", () => {
  const translations = {
    zh: "简体名称",
    "zh-Hant": "繁體名稱",
    ja: "日本語名",
    en: "English name",
    ko: "한국어 이름"
  };

  it("uses the operations portal's current language", () => {
    expect(resolvePlatformBenefitLocalizedText(translations, "ja", "technical_code")).toBe("日本語名");
    expect(resolvePlatformBenefitLocalizedText(translations, "en", "technical_code")).toBe("English name");
  });

  it("falls back deterministically without exposing the code when formal copy exists", () => {
    expect(resolvePlatformBenefitLocalizedText({ ...translations, ja: "" }, "ja", "technical_code")).toBe("简体名称");
    expect(resolvePlatformBenefitLocalizedText({ ...translations, zh: "", ja: "" }, "ja", "technical_code")).toBe("繁體名稱");
  });

  it("uses localized neutral information instead of exposing the diagnostic code", () => {
    expect(resolvePlatformBenefitLocalizedText({ zh: "", "zh-Hant": "", ja: "", en: "", ko: "" }, "ko", "technical_code")).toBe("혜택 정보 없음");
  });
});
