import { ERROR_CODES } from "./error-codes";
import { AppError } from "../utils/app-error";

export const CONTENT_LOCALES = ["zh-CN", "zh-TW", "en", "ja", "ko"] as const;

export type ContentLocaleCode = (typeof CONTENT_LOCALES)[number];

const localeAliases: Readonly<Record<string, ContentLocaleCode>> = {
  "zh-CN": "zh-CN",
  zh: "zh-CN",
  "zh-TW": "zh-TW",
  "zh-Hant": "zh-TW",
  en: "en",
  ja: "ja",
  ko: "ko"
};

export function normalizeContentLocale(value: unknown): ContentLocaleCode {
  const locale = typeof value === "string" ? localeAliases[value] : undefined;
  if (!locale) {
    throw new AppError({
      code: ERROR_CODES.VALIDATION,
      message: "error.content.locale_invalid",
      statusCode: 400
    });
  }
  return locale;
}

export function initializeContentTranslations<T extends object>(
  sourceLocale: ContentLocaleCode,
  value: T
): Record<ContentLocaleCode, T> {
  normalizeContentLocale(sourceLocale);
  return Object.fromEntries(
    CONTENT_LOCALES.map((locale) => [locale, structuredClone(value)])
  ) as Record<ContentLocaleCode, T>;
}
