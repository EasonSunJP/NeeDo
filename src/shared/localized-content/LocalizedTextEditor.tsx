import { useState } from "react";
import { useOptionalI18n } from "../../i18n/I18nProvider";
import { translateText } from "../../i18n/translations";
import { contentLocaleForLanguage, contentLocales, type ContentLocale } from "./localizedText";

type Field = { key: string; label: string; maxLength: number; multiline?: boolean };

export function LocalizedTextEditor({ fields, fallback, translations, onSave, disabled = false }: {
  fields: readonly Field[];
  fallback: Record<string, string>;
  translations: Partial<Record<ContentLocale, Record<string, string>>> | undefined;
  onSave: (locale: ContentLocale, values: Record<string, string>) => Promise<void>;
  disabled?: boolean;
}) {
  const { language } = useOptionalI18n();
  const t = (value: string) => translateText(value, language);
  const [locale, setLocale] = useState<ContentLocale>(() => contentLocaleForLanguage(language));
  const [drafts, setDrafts] = useState<Partial<Record<ContentLocale, Record<string, string>>>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const saved = translations?.[locale] ?? {};
  const draft = drafts[locale] ?? saved;
  const changed = fields.some(({ key }) => (draft[key] ?? "") !== (saved[key] ?? ""));
  const save = async () => {
    if (disabled || saving || !changed) return;
    setSaving(true);
    setError("");
    try {
      await onSave(locale, Object.fromEntries(fields.map(({ key }) => [key, draft[key] ?? ""])));
      setDrafts((current) => ({ ...current, [locale]: undefined }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "保存失败，请重试");
    } finally {
      setSaving(false);
    }
  };
  return <section className="rounded-[18px] border border-[color:var(--client-line)] bg-[color:color-mix(in_srgb,var(--client-elevated)_55%,var(--client-bg))] p-3" data-testid="localized-text-editor">
    <div aria-label={t("内容语言")} className="flex max-w-full gap-1.5 overflow-x-auto pb-1" role="tablist">
      {contentLocales.map((item) => <button aria-selected={locale === item.code} className={locale === item.code
        ? "shrink-0 rounded-full border border-[color:var(--client-primary)] bg-[color:var(--client-primary-soft)] px-3 py-2 text-xs font-bold text-[color:var(--client-primary-strong)]"
        : "shrink-0 rounded-full border border-[color:var(--client-line)] bg-[color:var(--client-surface)] px-3 py-2 text-xs font-bold text-[color:var(--client-muted)]"}
        key={item.code} onClick={() => { setLocale(item.code); setError(""); }} role="tab" type="button">{item.label}</button>)}
    </div>
    <div className="mt-3 space-y-3">
      {fields.map((field) => <label className="block text-xs font-bold" key={field.key}>
        <span className="text-[color:var(--client-muted)]">{t(field.label)}</span>
        {field.multiline
          ? <textarea className="mt-1 min-h-24 w-full rounded-[14px] border border-[color:var(--client-line)] bg-[color:var(--client-surface)] px-3 py-2 text-sm leading-6 text-[color:var(--client-text)]" data-no-i18n disabled={disabled || saving} maxLength={field.maxLength} onChange={(event) => setDrafts((current) => ({ ...current, [locale]: { ...draft, [field.key]: event.target.value } }))} placeholder={fallback[field.key] ?? ""} value={draft[field.key] ?? ""} />
          : <input className="mt-1 h-10 w-full rounded-[14px] border border-[color:var(--client-line)] bg-[color:var(--client-surface)] px-3 text-sm text-[color:var(--client-text)]" data-no-i18n disabled={disabled || saving} maxLength={field.maxLength} onChange={(event) => setDrafts((current) => ({ ...current, [locale]: { ...draft, [field.key]: event.target.value } }))} placeholder={fallback[field.key] ?? ""} value={draft[field.key] ?? ""} />}
      </label>)}
      <p className="text-xs text-[color:var(--client-muted)]">{t("留空时使用原始内容。每种语言单独保存。")}</p>
      {error ? <p role="alert" className="text-xs text-red-500">{error}</p> : null}
      <button className="rounded-full bg-[color:var(--client-primary)] px-4 py-2 text-xs font-bold text-[color:var(--client-primary-contrast)]" disabled={disabled || saving || !changed} onClick={() => void save()} type="button">{saving ? t("保存中…") : t("保存当前语言")}</button>
    </div>
  </section>;
}
