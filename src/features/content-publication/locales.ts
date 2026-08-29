import type { ContentLocaleCode } from "../../api/contentPublication";
import type { Language } from "../../i18n/translations";

const contentLocaleByLanguage: Record<Language, ContentLocaleCode> = {
  zh: "zh-CN",
  "zh-Hant": "zh-TW",
  en: "en",
  ja: "ja",
  ko: "ko"
};

export function toContentLocale(language: Language): ContentLocaleCode {
  return contentLocaleByLanguage[language];
}
