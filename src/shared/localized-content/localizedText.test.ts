import { describe, expect, it } from "vitest";
import { contentLocaleForLanguage, localizedServiceName, localizedText } from "./localizedText";

describe("localized content follows the app UI language", () => {
  const slots = {
    "zh-CN": "简体槽",
    "zh-TW": "繁體槽",
    ja: "日本語のみでご案内します。",
    en: "English slot",
    ko: "한국어 슬롯"
  };

  it.each([
    ["zh", "zh-CN"],
    ["zh-Hant", "zh-TW"],
    ["ja", "ja"],
    ["en", "en"],
    ["ko", "ko"]
  ] as const)("maps UI %s to content %s", (language, locale) => {
    expect(contentLocaleForLanguage(language)).toBe(locale);
    expect(localizedText("fallback", slots, language)).toBe(slots[locale]);
  });

  it("allows Japanese text copied into every slot without inspecting its language", () => {
    const copied = Object.fromEntries(Object.keys(slots).map((locale) => [locale, slots.ja]));
    expect(localizedText("fallback", copied, "en")).toBe(slots.ja);
  });
});

describe("localizedServiceName", () => {
  const service = {
    name: "全身もみほぐし 60分",
    localizedContent: {
      "zh-CN": { name: "全身放松按摩 60分钟" },
      en: { name: "Full-Body Massage · 60 min" },
      ja: { name: "全身もみほぐし 60分" }
    }
  };

  it("uses the requested service locale", () => {
    expect(localizedServiceName(service, "zh")).toBe("全身放松按摩 60分钟");
    expect(localizedServiceName(service, "en")).toBe("Full-Body Massage · 60 min");
  });

  it("falls back to the source when a locale is missing", () => {
    expect(localizedServiceName(service, "ko")).toBe(service.name);
  });
});
