import { useEffect, useState, type FormEvent } from "react";
import { translateText, type Language } from "../../i18n/translations";
import { platformUserManagementCopy } from "./i18n";
import type { PlatformTierCode, UserListQuery } from "./types";
import type { TopFilterField } from "./UnifiedUserDirectory";

type FilterDraft = Pick<UserListQuery, "keyword" | "tier" | "identityType" | "state" | "ekyc">;
const searchPlaceholders: Record<Language, string> = {
  zh: "NeeDo ID、姓名、邮箱、手机或城市",
  "zh-Hant": "NeeDo ID、姓名、信箱、手機或城市",
  ja: "NeeDo ID・氏名・メール・電話番号・都市",
  en: "NeeDo ID, name, email, phone, or city",
  ko: "NeeDo ID, 이름, 이메일, 전화번호 또는 도시"
};

const filterFields: TopFilterField[] = ["keyword", "tier", "identityType", "state", "ekyc"];

export function UserFilters({ language, value, onSubmit, onReset }: { language: Language; value: FilterDraft; onSubmit: (value: FilterDraft, changedFields: TopFilterField[]) => void; onReset: () => void }) {
  const [draft, setDraft] = useState<FilterDraft>(value);
  useEffect(() => setDraft(value), [value]);
  const copy = platformUserManagementCopy[language];

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const normalized = { ...draft, keyword: draft.keyword?.trim() || undefined };
    const changedFields = filterFields.filter((field) => normalized[field] !== value[field]);
    onSubmit(normalized, changedFields);
  };

  return (
    <form className="rounded-xl border border-line bg-white p-4 shadow-sm" onSubmit={submit}>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <label className="text-xs font-bold text-ink/60">{copy.search}<input className="mt-1 h-10 w-full rounded-lg border border-line bg-paper px-3 text-sm text-ink outline-none focus:border-moss" onChange={(event) => setDraft((current) => ({ ...current, keyword: event.target.value }))} placeholder={searchPlaceholders[language]} value={draft.keyword ?? ""} /></label>
        <SelectField label={copy.membership} onChange={(value) => setDraft((current) => ({ ...current, tier: value as PlatformTierCode | undefined }))} options={[["", translateText("全部", language)], ["free", copy.tierFree], ["silver", copy.tierSilver], ["gold", copy.tierGold], ["black_diamond", copy.tierBlackDiamond]]} value={draft.tier ?? ""} />
        <SelectField label={copy.identities} onChange={(value) => setDraft((current) => ({ ...current, identityType: value as UserListQuery["identityType"] || undefined }))} options={[["", translateText("全部", language)], ["customer", copy.user], ["technician", translateText("技师", language)], ["merchant", translateText("商户", language)], ["platform", translateText("运营", language)], ["broker", translateText("经纪人", language)], ["scout", translateText("星探", language)]]} value={draft.identityType ?? ""} />
        <SelectField label={copy.status} onChange={(value) => setDraft((current) => ({ ...current, state: value as UserListQuery["state"] }))} options={[["", translateText("全部", language)], ["active", copy.active], ["inactive", copy.inactive]]} value={draft.state ?? ""} />
        <SelectField label={copy.ekyc} onChange={(value) => setDraft((current) => ({ ...current, ekyc: value as UserListQuery["ekyc"] }))} options={[["", translateText("全部", language)], ["verified", copy.verified], ["unverified", copy.unverified]]} value={draft.ekyc ?? ""} />
      </div>
      <div className="mt-4 flex justify-end gap-2"><button className="h-9 rounded-full border border-line bg-white px-4 text-sm font-bold text-ink" onClick={onReset} type="button">{copy.reset}</button><button className="h-9 rounded-full bg-moss px-5 text-sm font-bold text-white" type="submit">{copy.search}</button></div>
    </form>
  );
}

function SelectField({ label, value, options, onChange }: { label: string; value: string; options: Array<[string, string]>; onChange: (value: string) => void }) {
  return <label className="text-xs font-bold text-ink/60">{label}<select className="mt-1 h-10 w-full rounded-lg border border-line bg-paper px-3 text-sm text-ink outline-none focus:border-moss" onChange={(event) => onChange(event.target.value)} value={value}>{options.map(([optionValue, optionLabel]) => <option key={optionValue} value={optionValue}>{optionLabel}</option>)}</select></label>;
}
