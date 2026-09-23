import type { ContentLocaleCode } from "../constants/content-locales";
import { CONTENT_LOCALES } from "../constants/content-locales";

export type TechnicianServiceLocalizedText = { name?: string; description?: string };

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export function readLocalizedBioMap(value: unknown): Partial<Record<ContentLocaleCode, string>> {
  const source = record(value);
  return Object.fromEntries(CONTENT_LOCALES.flatMap((locale) => typeof source[locale] === "string" ? [[locale, source[locale]]] : []));
}

export function mergeLocalizedBio(
  value: unknown,
  edit: { locale: ContentLocaleCode; bio: string; syncAll?: boolean }
): Partial<Record<ContentLocaleCode, string>> {
  if (edit.syncAll) return Object.fromEntries(CONTENT_LOCALES.map((locale) => [locale, edit.bio]));
  return { ...readLocalizedBioMap(value), [edit.locale]: edit.bio };
}

export function readLocalizedServiceMap(value: unknown): Partial<Record<ContentLocaleCode, TechnicianServiceLocalizedText>> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const result: Partial<Record<ContentLocaleCode, TechnicianServiceLocalizedText>> = {};
  for (const locale of CONTENT_LOCALES) {
    const entry = record(value)[locale];
    if (entry && typeof entry === "object" && !Array.isArray(entry)) {
      const name = (entry as Record<string, unknown>).name;
      const description = (entry as Record<string, unknown>).description;
      const text = {
        ...(typeof name === "string" ? { name } : {}),
        ...(typeof description === "string" ? { description } : {})
      };
      if (Object.keys(text).length) result[locale] = text;
    }
  }
  return result;
}

export function mergeLocalizedService(
  value: unknown,
  edit: { locale: ContentLocaleCode; name?: string; description?: string; syncAll?: boolean }
): Partial<Record<ContentLocaleCode, TechnicianServiceLocalizedText>> {
  const current = readLocalizedServiceMap(value);
  const next = {
    ...(edit.name !== undefined ? { name: edit.name } : {}),
    ...(edit.description !== undefined ? { description: edit.description } : {})
  };
  if (edit.syncAll) return Object.fromEntries(CONTENT_LOCALES.map((locale) => [locale, { ...current[edit.locale], ...next }]));
  return { ...current, [edit.locale]: { ...current[edit.locale], ...next } };
}
