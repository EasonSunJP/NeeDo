import { describe, expect, it } from "vitest";
import { translateText, type Language } from "../../i18n/translations";
import { fieldJobTranslations } from "./i18n";
import "./registerI18n";

describe("field-job feature translations", () => {
  it("keeps every page entry complete in all target languages", () => {
    for (const [source, translation] of Object.entries(fieldJobTranslations)) {
      for (const language of ["zh-Hant", "ja", "en", "ko"] as const satisfies readonly Language[]) {
        expect(translation[language], `${source}:${language}`).toBeTruthy();
      }
    }
  });

  it("registers feature copy before the field-job page renders", () => {
    expect(translateText("搜索上门工单", "ja")).toBe("訪問作業を検索");
    expect(translateText("履约地址", "en")).toBe("Service address");
  });
});
