import { useEffect, useMemo, useState } from "react";
import { ApiClientError } from "../../api/httpClient";
import { Button } from "../../components/ui/Button";
import type { NdpExperienceCampaign } from "./types";
import { platformUserManagementApi } from "./api";

const japanTimeZone = "Asia/Tokyo";
const toJapanInput = (value: string) => new Date(value).toLocaleString("sv-SE", { timeZone: japanTimeZone, hour12: false }).replace(" ", "T").slice(0, 16);
const fromJapanInput = (value: string) => new Date(`${value}:00+09:00`).toISOString();

export function NdpExperienceCampaignEditor({ campaigns, canWrite, onReload }: { campaigns: NdpExperienceCampaign[]; canWrite: boolean; onReload: () => void }) {
  const published = campaigns.find((item) => item.status === "published") ?? null;
  const draft = campaigns.find((item) => item.status === "draft") ?? null;
  const initial = draft ?? published;
  const [name, setName] = useState(initial?.name ?? "NDP经验倍率活动");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [factor, setFactor] = useState((initial?.factorBps ?? 10_000) / 10_000);
  const [effectiveFrom, setEffectiveFrom] = useState(toJapanInput(initial?.effectiveFrom ?? new Date().toISOString()));
  const [effectiveTo, setEffectiveTo] = useState(toJapanInput(initial?.effectiveTo ?? new Date(Date.now() + 7 * 86_400_000).toISOString()));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  useEffect(() => { if (!initial) return; setName(initial.name); setDescription(initial.description ?? ""); setFactor(initial.factorBps / 10_000); setEffectiveFrom(toJapanInput(initial.effectiveFrom)); setEffectiveTo(toJapanInput(initial.effectiveTo)); }, [initial?.versionPublicId, initial?.lockVersion]);
  const status = useMemo(() => published && new Date(published.effectiveFrom).getTime() > Date.now() ? "scheduled" : published ? "published" : draft ? "draft" : "none", [draft, published]);
  const example = Math.max(0, factor);

  const handleError = (error: unknown) => {
    if (error instanceof ApiClientError && error.status === 409) { setConflict(true); setError("服务端版本已变化或活动时间重叠（409）"); }
    else setError("NDP经验活动保存失败");
  };
  const save = async () => {
    setSaving(true); setError(null); setConflict(false);
    try { await platformUserManagementApi.saveCampaignDraft({ expectedPublishedVersion: published?.version ?? 0, expectedDraftLockVersion: draft?.lockVersion ?? null, name: name.trim(), description: description.trim() || null, factorBps: Math.round(factor * 10_000), effectiveFrom: fromJapanInput(effectiveFrom), effectiveTo: fromJapanInput(effectiveTo) }); onReload(); }
    catch (error) { handleError(error); } finally { setSaving(false); }
  };
  const publish = async () => {
    if (!draft) return; setSaving(true); setError(null); setConflict(false);
    try { await platformUserManagementApi.publishCampaign(draft.versionPublicId, { expectedVersion: draft.version, expectedLockVersion: draft.lockVersion }); onReload(); }
    catch (error) { handleError(error); } finally { setSaving(false); }
  };

  return <section className="rounded-xl border border-line bg-white p-5 shadow-sm"><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-lg font-black">NDP 与 EXP 临时倍率</h2><p className="mt-1 text-sm text-ink/50">基础规则为 100 NDP = 1 EXP；活动倍率仍会再计算会员倍率。</p></div><span className="rounded-full bg-paper px-3 py-1 text-xs font-black uppercase text-ink/55">{status}</span></div>
    <div className="mt-5 grid gap-4 lg:grid-cols-2"><label className="text-sm font-bold">活动名称<input className="mt-2 h-11 w-full rounded-lg border border-line bg-paper px-3" disabled={!canWrite} onChange={(event) => setName(event.target.value)} value={name} /></label><label className="text-sm font-bold">倍率<input className="mt-2 h-11 w-full rounded-lg border border-line bg-paper px-3" disabled={!canWrite} min="0.0001" onChange={(event) => setFactor(Number(event.target.value))} step="0.1" type="number" value={factor} /></label><label className="text-sm font-bold">开始时间（日本时间）<input className="mt-2 h-11 w-full rounded-lg border border-line bg-paper px-3" disabled={!canWrite} onChange={(event) => setEffectiveFrom(event.target.value)} type="datetime-local" value={effectiveFrom} /></label><label className="text-sm font-bold">结束时间（日本时间）<input className="mt-2 h-11 w-full rounded-lg border border-line bg-paper px-3" disabled={!canWrite} onChange={(event) => setEffectiveTo(event.target.value)} type="datetime-local" value={effectiveTo} /></label><label className="lg:col-span-2 text-sm font-bold">说明<textarea className="mt-2 min-h-24 w-full rounded-lg border border-line bg-paper p-3" disabled={!canWrite} onChange={(event) => setDescription(event.target.value)} value={description} /></label></div>
    <div className="mt-4 rounded-lg border border-moss/20 bg-moss/5 p-3 text-sm"><strong>实时示例：</strong>消费 100 NDP 时，活动基础经验为 {example.toLocaleString()} EXP，之后再乘当前会员类型倍率。</div>
    {error ? <div className="mt-4 rounded-lg border border-coral/25 bg-coral/5 p-3 text-sm font-bold text-coral">{error}{conflict ? <div className="mt-3 flex gap-2"><Button onClick={onReload} size="sm" variant="secondary">重新读取服务端</Button><Button onClick={() => setConflict(false)} size="sm" variant="ghost">保留本地草稿</Button></div> : null}</div> : null}
    {canWrite ? <div className="mt-5 flex justify-end gap-2"><Button disabled={saving || !name.trim() || factor <= 0 || effectiveFrom >= effectiveTo} onClick={() => void save()} variant="secondary">保存活动草稿</Button><Button disabled={saving || !draft} onClick={() => void publish()}>发布活动</Button></div> : <p className="mt-4 text-right text-xs font-bold text-ink/40">当前账号只有读取权限</p>}
  </section>;
}
