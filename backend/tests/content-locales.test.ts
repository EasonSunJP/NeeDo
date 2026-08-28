import {
  CONTENT_LOCALES,
  initializeContentTranslations,
  normalizeContentLocale
} from "../src/constants/content-locales";

describe("content locale contract", () => {
  it("normalizes only the five approved locales", () => {
    expect(CONTENT_LOCALES).toEqual(["zh-CN", "zh-TW", "en", "ja", "ko"]);
    expect(normalizeContentLocale("zh")).toBe("zh-CN");
    expect(normalizeContentLocale("zh-Hant")).toBe("zh-TW");
    expect(() => normalizeContentLocale("fr")).toThrow("error.content.locale_invalid");
  });

  it("copies the first value to all five locale rows", () => {
    expect(initializeContentTranslations("ja", { title: "お知らせ" })).toEqual({
      "zh-CN": { title: "お知らせ" },
      "zh-TW": { title: "お知らせ" },
      en: { title: "お知らせ" },
      ja: { title: "お知らせ" },
      ko: { title: "お知らせ" }
    });
  });
});
