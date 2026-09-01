import { useEffect, useState } from "react";
import { ApiClientError } from "../../api/httpClient";
import { Button } from "../../components/ui/Button";
import { ToggleSwitch } from "../../components/ui/ToggleSwitch";
import { PlatformMembershipDetailCard } from "../../shared/profile-card/PlatformMembershipDetailCard";
import { PlatformMembershipSimpleCard } from "../../shared/profile-card/PlatformMembershipSimpleCard";
import { isAccessibleMembershipTheme } from "../../shared/profile-card/platformMembershipTheme";
import { platformUserManagementApi } from "./api";
import { platformBenefitCodes, type PlatformMembershipTheme, type PlatformTierAdministration, type PlatformTierVersion, type TierBenefitDraft } from "./types";

const tierLabels = { free: "免费会员", silver: "白银会员", gold: "黄金会员", black_diamond: "黑钻会员" } as const;
const themeLabels: Record<keyof PlatformMembershipTheme, string> = { detailAccentColor: "详细卡强调色", detailSurfaceColor: "详细卡大面积底色", detailItemSurfaceColor: "项目底色", detailOuterBorderColor: "详细卡外边框", detailItemBorderColor: "项目边框", detailAvatarBorderColor: "头像边框", simpleTopColor: "简易卡上部颜色", simpleBottomColor: "简易卡下部颜色" };
const defaultTheme: PlatformMembershipTheme = { detailAccentColor: "#A7FF1E", detailSurfaceColor: "#10242D", detailItemSurfaceColor: "#09161D", detailOuterBorderColor: "#5D8B35", detailItemBorderColor: "#29424D", detailAvatarBorderColor: "#79A84B", simpleTopColor: "#0D2F27", simpleBottomColor: "#132630" };
const defaultBenefits = (): TierBenefitDraft[] => platformBenefitCodes.map((code) => ({ code, isEnabled: true, configuration: code === "ndp_experience" ? { extraThresholdNdp: null, extraAwardExpUnits: null } : {} }));

type Editable = Pick<PlatformTierVersion, "durationDays" | "monthlyValueNdp" | "annualBillingMonths" | "experienceMultiplier" | "description" | "theme" | "benefits">;
const toEditable = (tier: PlatformTierAdministration): Editable => {
  const version = tier.draftVersion ?? tier.publishedVersion;
  return version ? { durationDays: version.durationDays, monthlyValueNdp: version.monthlyValueNdp, annualBillingMonths: version.annualBillingMonths, experienceMultiplier: version.experienceMultiplier, description: version.description, theme: version.theme, benefits: version.benefits } : { durationDays: tier.tierCode === "free" ? null : 30, monthlyValueNdp: 0, annualBillingMonths: tier.tierCode === "free" ? 0 : 10, experienceMultiplier: 1, description: null, theme: defaultTheme, benefits: defaultBenefits() };
};

export function MembershipTierEditor({ tier, canWrite, onReload }: { tier: PlatformTierAdministration; canWrite: boolean; onReload: () => void }) {
  const [draft, setDraft] = useState<Editable>(() => toEditable(tier));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  useEffect(() => { setDraft(toEditable(tier)); setError(null); setConflict(false); }, [tier]);
  const base = tier.draftVersion ?? tier.publishedVersion;
  const accessible = isAccessibleMembershipTheme(draft.theme);
  const updateTheme = (key: keyof PlatformMembershipTheme, value: string) => setDraft((current) => ({ ...current, theme: { ...current.theme, [key]: value.toUpperCase() } }));
  const updateBenefit = (code: TierBenefitDraft["code"], enabled: boolean) => setDraft((current) => ({ ...current, benefits: current.benefits.map((benefit) => benefit.code === code ? { ...benefit, isEnabled: enabled } : benefit) }));
  const handleError = (cause: unknown) => { if (cause instanceof ApiClientError && cause.status === 409) { setConflict(true); setError("服务端等级版本已变化（409）"); } else setError("等级草稿保存失败"); };
  const save = async () => {
    if (!base || !accessible) return; setSaving(true); setError(null); setConflict(false);
    try { await platformUserManagementApi.saveTierDraft(tier.tierCode, { expectedVersion: base.version, expectedLockVersion: base.lockVersion, ...draft }); onReload(); }
    catch (cause) { handleError(cause); } finally { setSaving(false); }
  };
  const publish = async () => {
    if (!tier.draftVersion) return; setSaving(true); setError(null); setConflict(false);
    try { await platformUserManagementApi.publishTier(tier.tierCode, { expectedVersion: tier.draftVersion.version, expectedLockVersion: tier.draftVersion.lockVersion }); onReload(); }
    catch (cause) { handleError(cause); } finally { setSaving(false); }
  };

  return <div className="grid gap-5 2xl:grid-cols-[minmax(420px,0.9fr)_minmax(520px,1.1fr)]"><section className="rounded-xl border border-line bg-paper p-5"><div className="sticky top-28"><h2 className="font-black">实际卡片预览</h2><div className="mt-4 space-y-5"><PlatformMembershipDetailCard age={25} avatarUrl="/images/generated/profiles/profile-02.jpg" bio="偏好在预约前确认时间、语言和付款方式。" credit="5.0 /5" displayName="Mia" ekycVerified entityKind="customer" gender="女" heightCm={164} languages={["日本語", "中文"]} level={37} needoId="preview-id" points="18,420" theme={draft.theme} tierLabel={tierLabels[tier.tierCode]} usageCount={38} /><PlatformMembershipSimpleCard avatarUrl="/images/generated/profiles/profile-02.jpg" bio="偏好在预约前确认时间、语言和付款方式。" displayName="Mia" ekycVerified entityKind="customer" level={37} needoId="preview-id" simpleBottomColor={draft.theme.simpleBottomColor} simpleTopColor={draft.theme.simpleTopColor} /></div></div></section>
    <section className="rounded-xl border border-line bg-white p-5 shadow-sm"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-black text-moss">固定等级</p><h2 className="mt-1 text-xl font-black">{tierLabels[tier.tierCode]}</h2></div><div className="text-right text-xs text-ink/45"><p>已发布 v{tier.publishedVersion?.version ?? "—"}</p><p>草稿 v{tier.draftVersion?.version ?? "—"}</p></div></div>
      <div className="mt-5 grid gap-4 sm:grid-cols-2"><NumberField disabled={!canWrite || tier.tierCode === "free"} label="月费价值（NDP）" min={tier.tierCode === "free" ? 0 : 1} onChange={(value) => setDraft((current) => ({ ...current, monthlyValueNdp: value }))} value={draft.monthlyValueNdp} /><NumberField disabled={!canWrite} label="会员经验倍率" min={0.0001} onChange={(value) => setDraft((current) => ({ ...current, experienceMultiplier: value }))} step={0.1} value={draft.experienceMultiplier} /><NumberField disabled={!canWrite || tier.tierCode === "free"} label="有效期（天，免费为永久）" min={1} onChange={(value) => setDraft((current) => ({ ...current, durationDays: tier.tierCode === "free" ? null : value }))} value={draft.durationDays ?? 0} /><NumberField disabled={!canWrite || tier.tierCode === "free"} label="年费按月数计价" max={12} min={1} onChange={(value) => setDraft((current) => ({ ...current, annualBillingMonths: value }))} value={draft.annualBillingMonths} /></div>
      <label className="mt-4 block text-sm font-bold">等级说明<textarea className="mt-2 min-h-24 w-full rounded-lg border border-line bg-paper p-3" disabled={!canWrite} maxLength={500} onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value || null }))} value={draft.description ?? ""} /></label>
      <h3 className="mt-6 font-black">等级权益</h3><div className="mt-3 grid gap-2 sm:grid-cols-2">{draft.benefits.map((benefit) => <div className="flex items-center justify-between rounded-lg border border-line bg-paper p-3" key={benefit.code}><span className="text-sm font-bold">{benefit.code}</span><ToggleSwitch ariaLabel={benefit.code} checked={benefit.isEnabled} disabled={!canWrite} onChange={(checked) => updateBenefit(benefit.code, checked)} /></div>)}</div>
      <h3 className="mt-6 font-black">会员卡颜色</h3><div className="mt-3 grid gap-3 sm:grid-cols-2">{(Object.keys(themeLabels) as Array<keyof PlatformMembershipTheme>).map((key) => <label className="flex items-center gap-3 rounded-lg border border-line bg-paper p-3 text-xs font-bold" key={key}><input className="h-9 w-12 rounded border-0 bg-transparent" disabled={!canWrite} onChange={(event) => updateTheme(key, event.target.value)} type="color" value={draft.theme[key]} /><span>{themeLabels[key]}<small className="mt-1 block font-mono text-ink/45">{draft.theme[key]}</small></span></label>)}</div>
      {!accessible ? <p className="mt-4 rounded-lg border border-coral/25 bg-coral/5 p-3 text-sm font-bold text-coral">强调色与详细卡底色对比不足，无法保存或发布。</p> : null}{error ? <div className="mt-4 rounded-lg border border-coral/25 bg-coral/5 p-3 text-sm font-bold text-coral">{error}{conflict ? <Button className="mt-3" onClick={onReload} size="sm" variant="secondary">重新读取服务端</Button> : null}</div> : null}
      {canWrite ? <div className="mt-6 flex justify-end gap-2"><Button disabled={saving} onClick={() => setDraft(toEditable(tier))} variant="ghost">取消</Button><Button disabled={saving || !base || !accessible} onClick={() => void save()} variant="secondary">保存草稿</Button><Button disabled={saving || !tier.draftVersion || !accessible} onClick={() => void publish()}>发布</Button></div> : <p className="mt-5 text-right text-xs font-bold text-ink/40">当前账号只有读取权限</p>}
    </section></div>;
}

function NumberField({ label, value, onChange, disabled, min, max, step = 1 }: { label: string; value: number; onChange: (value: number) => void; disabled: boolean; min: number; max?: number; step?: number }) {
  return <label className="text-sm font-bold">{label}<input className="mt-2 h-11 w-full rounded-lg border border-line bg-paper px-3" disabled={disabled} max={max} min={min} onChange={(event) => onChange(Number(event.target.value))} step={step} type="number" value={value} /></label>;
}
