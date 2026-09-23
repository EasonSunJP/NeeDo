import type { Language } from "../../i18n/translations";

export type ContentLocale = "zh-CN" | "zh-TW" | "ja" | "en" | "ko";
export const contentLocales: Array<{ code: ContentLocale; label: string }> = [
  { code: "zh-CN", label: "简体中文" },
  { code: "zh-TW", label: "繁體中文" },
  { code: "ja", label: "日本語" },
  { code: "en", label: "English" },
  { code: "ko", label: "한국어" }
];

export function contentLocaleForLanguage(language: Language): ContentLocale {
  return language === "zh" ? "zh-CN" : language === "zh-Hant" ? "zh-TW" : language;
}

export function localizedText(fallback: string | null, translations: Partial<Record<ContentLocale, string>> | undefined, language: Language): string | null {
  return translations?.[contentLocaleForLanguage(language)]?.trim() || fallback;
}

export function localizedServiceName(
  service: { name: string; localizedContent?: Partial<Record<ContentLocale, { name?: string }>> },
  language: Language
): string {
  return service.localizedContent?.[contentLocaleForLanguage(language)]?.name?.trim() || service.name;
}
