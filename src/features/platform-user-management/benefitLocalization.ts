import type { Language } from "../../i18n/translations";
import type { PlatformBenefitLocalizedText } from "./types";

const fallbackOrder: readonly Language[] = ["zh", "zh-Hant", "ja", "en", "ko"];
const missingBenefitInformation: Record<Language, string> = {
  zh: "权益信息未配置",
  "zh-Hant": "權益資訊未設定",
  ja: "特典情報未設定",
  en: "Benefit information unavailable",
  ko: "혜택 정보 없음"
};

export function resolvePlatformBenefitLocalizedText(
  translations: PlatformBenefitLocalizedText,
  language: Language,
  _diagnosticCode: string
) {
  const localized = translations[language]?.trim();
  if (localized) return localized;

  for (const locale of fallbackOrder) {
    const fallback = translations[locale]?.trim();
    if (fallback) return fallback;
  }

  return missingBenefitInformation[language];
}
