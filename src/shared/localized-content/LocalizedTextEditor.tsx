import { useState } from "react";
import { useOptionalI18n } from "../../i18n/I18nProvider";
import { registerTranslationEntries, translateText } from "../../i18n/translations";
import { DangerConfirmDialog } from "../../components/ui/DangerConfirmDialog";
import { contentLocaleForLanguage, type ContentLocale } from "./localizedText";
import { LocalizedContentLocaleRail } from "./LocalizedContentLocaleRail";

type Field = { key: string; label: string; maxLength: number; multiline?: boolean };

registerTranslationEntries({
  "同步到全部语言版本": { "zh-Hant": "同步到全部語言版本", ja: "すべての言語版に同期", en: "Copy to all language versions", ko: "모든 언어 버전에 복사" },
  "确认同步": { "zh-Hant": "確認同步", ja: "同期を確認", en: "Confirm copy", ko: "복사 확인" },
  "当前版本的文字会覆盖其他四个版本。": { "zh-Hant": "目前版本的文字會覆蓋其他四個版本。", ja: "現在の版のテキストで他の4つの版を上書きします。", en: "This text will replace the other four versions.", ko: "현재 버전의 텍스트가 다른 네 버전을 덮어씁니다." }
});

export function LocalizedTextEditor({ fields, fallback, translations, onSave, onSyncAll, disabled = false }: {
  fields: readonly Field[];
  fallback: Record<string, string>;
  translations: Partial<Record<ContentLocale, Record<string, string>>> | undefined;
  onSave: (locale: ContentLocale, values: Record<string, string>) => Promise<void>;
  onSyncAll?: (locale: ContentLocale, values: Record<string, string>) => Promise<void>;
  disabled?: boolean;
}) {
  const { language } = useOptionalI18n();
  const t = (value: string) => translateText(value, language);
  const [locale, setLocale] = useState<ContentLocale>(() => contentLocaleForLanguage(language));
  const [drafts, setDrafts] = useState<Partial<Record<ContentLocale, Record<string, string>>>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [syncOpen, setSyncOpen] = useState(false);
  const saved = translations?.[locale] ?? {};
  const draft = drafts[locale] ?? saved;
  const changed = fields.some(({ key }) => (draft[key] ?? "") !== (saved[key] ?? ""));
  const values = () => Object.fromEntries(fields.map(({ key }) => [key, draft[key] ?? ""]));
  const save = async () => {
    if (disabled || saving || !changed) return;
    setSaving(true);
    setError("");
    try {
      await onSave(locale, values());
      setDrafts((current) => ({ ...current, [locale]: undefined }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "保存失败，请重试");
    } finally {
      setSaving(false);
    }
  };
  const syncAll = async () => {
    if (!onSyncAll || disabled || saving) return;
    setSaving(true);
    setError("");
    try {
      const content = values();
      await onSyncAll(locale, content);
      setDrafts({});
      setSyncOpen(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "同步失败，请重试");
    } finally {
      setSaving(false);
    }
  };
  return <section className="rounded-[18px] border border-[color:var(--client-line)] bg-[color:color-mix(in_srgb,var(--client-elevated)_55%,var(--client-bg))] p-3" data-testid="localized-text-editor">
    <LocalizedContentLocaleRail
      ariaLabel={t("内容语言")}
      locale={locale}
      onSelect={(next) => { setLocale(next); setError(""); }}
      saveAction={{ label: saving ? t("保存中…") : t("保存当前语言"), disabled: disabled || saving || !changed, onClick: () => void save() }}
      syncAction={onSyncAll ? { label: t("同步"), ariaLabel: "同步到全部语言版本", disabled: disabled || saving, onClick: () => setSyncOpen(true) } : undefined}
      testId="localized-content-locale-rail"
    />
    <div className="mt-3 space-y-3">
      {fields.map((field) => <label className="block text-xs font-bold" key={field.key}>
        <span className="text-[color:var(--client-muted)]">{t(field.label)}</span>
        {field.multiline
          ? <textarea className="mt-1 min-h-24 w-full rounded-[14px] border border-[color:var(--client-line)] bg-[color:var(--client-surface)] px-3 py-2 text-sm leading-6 text-[color:var(--client-text)]" data-no-i18n disabled={disabled || saving} maxLength={field.maxLength} onChange={(event) => setDrafts((current) => ({ ...current, [locale]: { ...draft, [field.key]: event.target.value } }))} placeholder={fallback[field.key] ?? ""} value={draft[field.key] ?? ""} />
          : <input className="mt-1 h-10 w-full rounded-[14px] border border-[color:var(--client-line)] bg-[color:var(--client-surface)] px-3 text-sm text-[color:var(--client-text)]" data-no-i18n disabled={disabled || saving} maxLength={field.maxLength} onChange={(event) => setDrafts((current) => ({ ...current, [locale]: { ...draft, [field.key]: event.target.value } }))} placeholder={fallback[field.key] ?? ""} value={draft[field.key] ?? ""} />}
      </label>)}
      <p className="text-xs text-[color:var(--client-muted)]">{t("留空时使用原始内容。每种语言单独保存。")}</p>
      {error ? <p role="alert" className="text-xs text-red-500">{error}</p> : null}
    </div>
    {onSyncAll ? <DangerConfirmDialog confirmLabel="确认同步" description="当前版本的文字会覆盖其他四个版本。" error={syncOpen ? error : undefined} onCancel={() => setSyncOpen(false)} onConfirm={syncAll} open={syncOpen} pending={saving} title="同步到全部语言版本" /> : null}
  </section>;
}
