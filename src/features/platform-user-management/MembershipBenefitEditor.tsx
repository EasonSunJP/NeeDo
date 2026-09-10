import { useEffect, useMemo, useState } from "react";
import { ApiClientError } from "../../api/httpClient";
import { useI18n } from "../../i18n/I18nProvider";
import { Button } from "../../components/ui/Button";
import { AdminToggleSwitch } from "../../components/admin/AdminToggleSwitch";
import { platformUserManagementApi } from "./api";
import { resolvePlatformBenefitLocalizedText } from "./benefitLocalization";
import type {
  PlatformBenefitAdministration,
  PlatformBenefitLocalizedText
} from "./types";

const locales = ["zh", "zh-Hant", "ja", "en", "ko"] as const;
const localeLabels: Record<(typeof locales)[number], string> = {
  "zh": "简体中文",
  "zh-Hant": "繁體中文",
  "ja": "日本語",
  "en": "English",
  "ko": "한국어"
};

type BenefitDraft = Pick<
  PlatformBenefitAdministration,
  "isGloballyEnabled" | "sortOrder" | "nameTranslations" | "descriptionTranslations"
>;

const draftFrom = (benefit: PlatformBenefitAdministration): BenefitDraft => ({
  isGloballyEnabled: benefit.isGloballyEnabled,
  sortOrder: benefit.sortOrder,
  nameTranslations: { ...benefit.nameTranslations },
  descriptionTranslations: { ...benefit.descriptionTranslations }
});

export function MembershipBenefitEditor({
  benefit,
  canWrite,
  onCancel,
  onSaved
}: {
  benefit: PlatformBenefitAdministration;
  canWrite: boolean;
  onCancel: () => void;
  onSaved: (benefit: PlatformBenefitAdministration) => void;
}) {
  const { language } = useI18n();
  const [draft, setDraft] = useState<BenefitDraft>(() => draftFrom(benefit));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setDraft(draftFrom(benefit)), [benefit]);

  const valid = useMemo(
    () => Number.isInteger(draft.sortOrder) && draft.sortOrder >= 0 && draft.sortOrder <= 10_000 &&
      locales.every((locale) => draft.nameTranslations[locale].trim().length > 0 &&
        draft.descriptionTranslations[locale].trim().length > 0),
    [draft]
  );

  const updateLocalized = (
    field: "nameTranslations" | "descriptionTranslations",
    locale: keyof PlatformBenefitLocalizedText,
    value: string
  ) => setDraft((current) => ({
    ...current,
    [field]: { ...current[field], [locale]: value }
  }));

  const save = async () => {
    if (!canWrite || !valid) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await platformUserManagementApi.updateBenefit(benefit.code, {
        isGloballyEnabled: draft.isGloballyEnabled,
        sortOrder: draft.sortOrder,
        nameTranslations: draft.nameTranslations,
        descriptionTranslations: draft.descriptionTranslations,
        expectedLockVersion: benefit.lockVersion
      });
      onSaved(updated);
    } catch (cause) {
      setError(cause instanceof ApiClientError && cause.status === 409
        ? "数据已被其他运营成员更新，请重新载入后再编辑"
        : "会员权益保存失败");
    } finally {
      setSaving(false);
    }
  };

  return <section className="mt-5 rounded-xl border border-line bg-white p-5 shadow-sm">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div><p className="text-xs font-black text-ink/45">{resolvePlatformBenefitLocalizedText(benefit.nameTranslations, language, benefit.code)}</p><h2 className="mt-1 text-lg font-black">编辑权益说明</h2></div>
      <div className="flex items-center gap-3 rounded-lg border border-line bg-paper px-3 py-2"><span className="text-sm font-bold">全局启用</span><AdminToggleSwitch ariaLabel="全局启用" checked={draft.isGloballyEnabled} disabled={!canWrite} onChange={(checked) => setDraft((current) => ({ ...current, isGloballyEnabled: checked }))} /></div>
    </div>
    {error ? <p className="mt-4 rounded-lg border border-coral/25 bg-coral/5 p-3 text-sm font-bold text-coral">{error}</p> : null}
    <label className="mt-5 block text-sm font-bold">显示顺序<input className="ml-3 h-10 w-28 rounded-lg border border-line bg-paper px-3" disabled={!canWrite} max={10_000} min={0} onChange={(event) => setDraft((current) => ({ ...current, sortOrder: Number(event.target.value) }))} type="number" value={draft.sortOrder} /></label>
    <div className="mt-5 grid gap-4 xl:grid-cols-2">
      {locales.map((locale) => <div className="rounded-xl border border-line bg-paper p-4" key={locale}>
        <p className="text-xs font-black uppercase tracking-[0.14em] text-ink/45">{localeLabels[locale]}</p>
        <label className="mt-3 block text-sm font-bold">权益名称<input className="mt-2 h-10 w-full rounded-lg border border-line bg-white px-3" disabled={!canWrite} maxLength={80} onChange={(event) => updateLocalized("nameTranslations", locale, event.target.value)} value={draft.nameTranslations[locale]} /></label>
        <label className="mt-3 block text-sm font-bold">权益说明<textarea className="mt-2 min-h-24 w-full resize-y rounded-lg border border-line bg-white p-3 text-sm" disabled={!canWrite} maxLength={500} onChange={(event) => updateLocalized("descriptionTranslations", locale, event.target.value)} value={draft.descriptionTranslations[locale]} /></label>
      </div>)}
    </div>
    <div className="mt-5 flex justify-end gap-2"><Button onClick={onCancel} variant="secondary">取消</Button>{canWrite ? <Button disabled={saving || !valid} onClick={() => void save()}>{saving ? "保存中…" : "保存"}</Button> : null}</div>
  </section>;
}
