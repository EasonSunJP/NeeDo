import type { Language } from "../../i18n/translations";
import { contentLocaleForLanguage } from "../../shared/localized-content/localizedText";
import type { ExchangePost } from "./types";

export function localizedExchangePostText(
  post: Pick<ExchangePost, "title" | "detail" | "contentLocale" | "contentTranslations">,
  language: Language
): { title: string; detail: string } {
  const locale = contentLocaleForLanguage(language);
  if (locale === post.contentLocale) return { title: post.title, detail: post.detail };
  const translation = post.contentTranslations?.[locale];
  return translation?.title?.trim() && translation.detail?.trim()
    ? { title: translation.title, detail: translation.detail }
    : { title: post.title, detail: post.detail };
}
