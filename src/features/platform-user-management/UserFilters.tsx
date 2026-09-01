import { useEffect, useState, type FormEvent } from "react";
import type { PlatformTierCode, UserListQuery } from "./types";

type FilterDraft = Pick<UserListQuery, "keyword" | "tier" | "identityType" | "state" | "ekyc">;

export function UserFilters({ value, onSubmit, onReset }: { value: FilterDraft; onSubmit: (value: FilterDraft) => void; onReset: () => void }) {
  const [draft, setDraft] = useState<FilterDraft>(value);
  useEffect(() => setDraft(value), [value]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    onSubmit({ ...draft, keyword: draft.keyword?.trim() || undefined });
  };

  return (
    <form className="rounded-xl border border-line bg-white p-4 shadow-sm" onSubmit={submit}>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <label className="text-xs font-bold text-ink/60">用户搜索<input className="mt-1 h-10 w-full rounded-lg border border-line bg-paper px-3 text-sm text-ink outline-none focus:border-moss" onChange={(event) => setDraft((current) => ({ ...current, keyword: event.target.value }))} placeholder="NeeDo ID、昵称、手机或邮箱" value={draft.keyword ?? ""} /></label>
        <SelectField label="会员类型" onChange={(value) => setDraft((current) => ({ ...current, tier: value as PlatformTierCode | undefined }))} options={[["", "全部"], ["free", "免费会员"], ["silver", "白银会员"], ["gold", "黄金会员"], ["black_diamond", "黑钻会员"]]} value={draft.tier ?? ""} />
        <SelectField label="身份" onChange={(value) => setDraft((current) => ({ ...current, identityType: value || undefined }))} options={[["", "全部"], ["customer", "用户"], ["technician", "技师"], ["shop_owner", "店铺商户"], ["admin", "运营成员"]]} value={draft.identityType ?? ""} />
        <SelectField label="账号状态" onChange={(value) => setDraft((current) => ({ ...current, state: value as UserListQuery["state"] }))} options={[["", "全部"], ["active", "正常"], ["inactive", "停用"]]} value={draft.state ?? ""} />
        <SelectField label="eKYC" onChange={(value) => setDraft((current) => ({ ...current, ekyc: value as UserListQuery["ekyc"] }))} options={[["", "全部"], ["verified", "已验证"], ["unverified", "未验证"]]} value={draft.ekyc ?? ""} />
      </div>
      <div className="mt-4 flex justify-end gap-2"><button className="h-9 rounded-full border border-line bg-white px-4 text-sm font-bold text-ink" onClick={onReset} type="button">重置</button><button className="h-9 rounded-full bg-moss px-5 text-sm font-bold text-white" type="submit">查询</button></div>
    </form>
  );
}

function SelectField({ label, value, options, onChange }: { label: string; value: string; options: Array<[string, string]>; onChange: (value: string) => void }) {
  return <label className="text-xs font-bold text-ink/60">{label}<select className="mt-1 h-10 w-full rounded-lg border border-line bg-paper px-3 text-sm text-ink outline-none focus:border-moss" onChange={(event) => onChange(event.target.value)} value={value}>{options.map(([optionValue, optionLabel]) => <option key={optionValue} value={optionValue}>{optionLabel}</option>)}</select></label>;
}
