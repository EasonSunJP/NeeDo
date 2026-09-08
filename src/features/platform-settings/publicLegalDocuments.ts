import { useEffect, useState } from "react";
import { httpClient } from "../../api/httpClient";
import type { Language } from "../../i18n/translations";
import type { LegalDocumentLocale, PublicLegalDocument } from "../admin-system-settings/types";

export function languageToLegalLocale(language: Language): LegalDocumentLocale {
  if (language === "zh") return "zh-CN";
  if (language === "zh-Hant") return "zh-TW";
  return language;
}

export const publicLegalDocumentsApi = {
  getCurrent(slug: string, locale: LegalDocumentLocale) {
    return httpClient.request<PublicLegalDocument>(`/legal-documents/${encodeURIComponent(slug)}/current`, {
      auth: false,
      method: "GET",
      query: { locale },
      retryOnUnauthorized: false
    });
  }
};

export function usePublicLegalDocument(slug: string, language: Language) {
  const [state, setState] = useState<
    | { status: "loading"; document: null }
    | { status: "ready"; document: PublicLegalDocument }
    | { status: "unavailable"; document: null }
  >({ status: "loading", document: null });

  useEffect(() => {
    let active = true;
    setState({ status: "loading", document: null });
    void publicLegalDocumentsApi.getCurrent(slug, languageToLegalLocale(language)).then(
      (document) => {
        if (active) setState({ status: "ready", document });
      },
      () => {
        if (active) setState({ status: "unavailable", document: null });
      }
    );
    return () => { active = false; };
  }, [language, slug]);

  return state;
}
