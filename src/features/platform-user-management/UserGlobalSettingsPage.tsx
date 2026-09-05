import { useEffect, useState } from "react";
import "./registerI18n";
import { ApiClientError } from "../../api/httpClient";
import { useAuth } from "../../auth/AuthProvider";
import { AdminLayout } from "../../components/admin/AdminLayout";
import { ModuleShell } from "../../components/admin/ModuleShell";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { ToggleSwitch } from "../../components/ui/ToggleSwitch";
import { platformUserManagementApi } from "./api";
import { NdpExperienceCampaignEditor } from "./NdpExperienceCampaignEditor";
import type { NdpExperienceCampaign, UserGlobalPolicy } from "./types";

type PolicyDraft = Pick<UserGlobalPolicy, "requirePhone" | "requireEmail" | "requireHomeServiceEkyc" | "requireStoreServiceEkyc" | "ndpPerBaseExp" | "baseExpUnitsPerThreshold" | "effectiveFrom">;
const defaultDraft = (): PolicyDraft => ({ requirePhone: false, requireEmail: false, requireHomeServiceEkyc: false, requireStoreServiceEkyc: false, ndpPerBaseExp: 100, baseExpUnitsPerThreshold: 10_000, effectiveFrom: new Date().toISOString() });
const fromPolicy = (policy: UserGlobalPolicy | null): PolicyDraft => policy ? { requirePhone: policy.requirePhone, requireEmail: policy.requireEmail, requireHomeServiceEkyc: policy.requireHomeServiceEkyc, requireStoreServiceEkyc: policy.requireStoreServiceEkyc, ndpPerBaseExp: policy.ndpPerBaseExp, baseExpUnitsPerThreshold: policy.baseExpUnitsPerThreshold, effectiveFrom: policy.effectiveFrom } : defaultDraft();

export function UserGlobalSettingsPage() {
  const { hasPermission } = useAuth();
  const canWritePolicy = hasPermission("backoffice:user-policy:publish");
  const canWriteCampaign = hasPermission("backoffice:ndp-experience-campaign:publish");
  const [current, setCurrent] = useState<UserGlobalPolicy | null>(null);
  const [serverDraft, setServerDraft] = useState<UserGlobalPolicy | null>(null);
  const [localDraft, setLocalDraft] = useState<PolicyDraft>(defaultDraft);
  const [campaigns, setCampaigns] = useState<NdpExperienceCampaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let active = true; setLoading(true); setError(null);
    Promise.all([platformUserManagementApi.getGlobalSettings(), platformUserManagementApi.listCampaigns({ page: 1, page_size: 100 })]).then(([policy, campaignPage]) => { if (!active) return; setCurrent(policy.current); setServerDraft(policy.draft); setLocalDraft(fromPolicy(policy.draft ?? policy.current)); setCampaigns(campaignPage.list); }).catch(() => active && setError("用户全局设置读取失败")).finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [reloadToken]);

  const handleError = (cause: unknown) => { if (cause instanceof ApiClientError && cause.status === 409) { setConflict(true); setError("服务端策略版本已变化（409），请重新读取后再发布"); } else setError("用户全局设置保存失败"); };
  const saveDraft = async () => {
    setSaving(true); setError(null); setConflict(false);
    try { const saved = await platformUserManagementApi.saveGlobalSettingsDraft({ expectedCurrentVersion: current?.version ?? 0, expectedDraftLockVersion: serverDraft?.lockVersion ?? null, ...localDraft }); setServerDraft(saved); setLocalDraft(fromPolicy(saved)); }
    catch (cause) { handleError(cause); } finally { setSaving(false); }
  };
  const publish = async () => {
    if (!serverDraft) return; setSaving(true); setError(null); setConflict(false);
    try { await platformUserManagementApi.publishGlobalSettings({ expectedVersion: serverDraft.version, expectedLockVersion: serverDraft.lockVersion }); setReloadToken((value) => value + 1); }
    catch (cause) { handleError(cause); } finally { setSaving(false); }
  };
  const dirty = JSON.stringify(localDraft) !== JSON.stringify(fromPolicy(serverDraft ?? current));

  return <AdminLayout><ModuleShell title="用户全局设置" description="管理账号绑定、服务 eKYC 基础规则，以及按日本时间发布的 NDP 经验倍率活动。">
    {loading ? <div className="rounded-xl border border-line bg-white p-10 text-center text-sm font-bold text-ink/50">正在读取全局策略…</div> : null}
    {error ? <div className="rounded-lg border border-coral/25 bg-coral/5 p-4 text-sm font-bold text-coral">{error}{conflict ? <div className="mt-3 flex gap-2"><Button onClick={() => setReloadToken((value) => value + 1)} size="sm" variant="secondary">重新读取服务端</Button><Button onClick={() => setConflict(false)} size="sm" variant="ghost">保留本地草稿</Button></div> : null}</div> : null}
    {!loading ? <section className="rounded-xl border border-line bg-white p-5 shadow-sm"><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-lg font-black">账号与服务准入</h2><p className="mt-1 text-sm text-ink/50">当前生效与草稿分开显示；本地修改不会直接改变线上规则。</p></div><div className="flex gap-2"><Badge tone="green">当前生效 v{current?.version ?? 0}</Badge>{serverDraft ? <Badge tone="yellow">草稿 v{serverDraft.version}</Badge> : null}{dirty ? <Badge tone="red">未保存修改</Badge> : null}</div></div>
      <div className="mt-5 grid gap-3 md:grid-cols-2">{[
        ["requirePhone", "要求绑定手机", "新用户进入受保护功能前必须绑定手机"], ["requireEmail", "要求绑定邮箱", "新用户进入受保护功能前必须绑定邮箱"], ["requireHomeServiceEkyc", "上门服务必须通过 eKYC", "上门服务下单前验证实名状态"], ["requireStoreServiceEkyc", "到店服务必须通过 eKYC", "到店服务下单前验证实名状态"]
      ].map(([key, title, description]) => <div className="flex items-center justify-between gap-4 rounded-xl border border-line bg-paper p-4" key={key}><div><p className="font-black">{title}</p><p className="mt-1 text-xs text-ink/50">{description}</p></div><ToggleSwitch ariaLabel={title} checked={Boolean(localDraft[key as keyof PolicyDraft])} disabled={!canWritePolicy} onChange={(checked) => setLocalDraft((value) => ({ ...value, [key]: checked }))} /></div>)}</div>
      <div className="mt-4 rounded-xl border border-line bg-paper p-4"><label className="text-sm font-bold">基础兑换：每多少 NDP 产生 1 EXP<input className="ml-3 h-10 w-32 rounded-lg border border-line bg-white px-3" disabled={!canWritePolicy} min={1} onChange={(event) => setLocalDraft((value) => ({ ...value, ndpPerBaseExp: Number(event.target.value) }))} type="number" value={localDraft.ndpPerBaseExp} /></label><p className="mt-2 text-xs text-ink/50">默认 100 NDP = 1 EXP。会员类型倍率在基础经验之后计算；各会员额外赠送经验在会员等级设置中配置且不乘倍率。</p></div>
      {canWritePolicy ? <div className="mt-5 flex justify-end gap-2"><Button disabled={saving || !dirty || localDraft.ndpPerBaseExp < 1} onClick={() => void saveDraft()} variant="secondary">保存草稿</Button><Button disabled={saving || !serverDraft || dirty} onClick={() => void publish()}>发布</Button></div> : <p className="mt-4 text-right text-xs font-bold text-ink/40">当前账号只有读取权限</p>}
    </section> : null}
    {!loading ? <NdpExperienceCampaignEditor campaigns={campaigns} canWrite={canWriteCampaign} onReload={() => setReloadToken((value) => value + 1)} /> : null}
  </ModuleShell></AdminLayout>;
}
