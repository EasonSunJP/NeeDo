import { useEffect, useState } from "react";
import { ApiClientError } from "../../api/httpClient";
import { useAuth } from "../../auth/AuthProvider";
import { AdminToggleSwitch } from "../../components/admin/AdminToggleSwitch";
import { Button } from "../../components/ui/Button";
import { useI18n } from "../../i18n/I18nProvider";
import { platformUserManagementApi } from "../platform-user-management/api";
import type { UserGlobalPolicy } from "../platform-user-management/types";
import { adminSystemSettingsText } from "./i18n";

export const ekycRequirements = [
  ["requireMerchantApplicationEkyc", "店铺申请必须通过 eKYC"],
  ["requireTechnicianApplicationEkyc", "技师申请必须通过 eKYC"],
  ["requireHomeServiceEkyc", "用户预约上门服务必须通过 eKYC"],
  ["requireStoreServiceEkyc", "用户预约到店服务必须通过 eKYC"]
] as const;
type Switches = Pick<UserGlobalPolicy, (typeof ekycRequirements)[number][0]>;
const readSwitches = (policy: UserGlobalPolicy): Switches => Object.fromEntries(ekycRequirements.map(([key]) => [key, policy[key]])) as Switches;

export function EkycSettingsTab({ onDirtyChange }: { onDirtyChange: (dirty: boolean) => void }) {
  const { hasPermission } = useAuth();
  const { language } = useI18n();
  const t = (source: string) => adminSystemSettingsText(source, language);
  const canRead = hasPermission("backoffice:user-policy:read");
  const canWrite = hasPermission("backoffice:user-policy:publish");
  const [settings, setSettings] = useState<{current: UserGlobalPolicy | null; draft: UserGlobalPolicy | null} | null>(null);
  const [switches, setSwitches] = useState<Switches | null>(null);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    if (!canRead) return;
    let active = true;
    setBusy(true); setError("");
    platformUserManagementApi.getGlobalSettings().then(value => {
      if (!active) return;
      setSettings(value);
      const policy = value.draft ?? value.current;
      setSwitches(policy ? readSwitches(policy) : null);
      if (!policy) setError("设置读取失败");
    }).catch(() => active && setError("设置读取失败")).finally(() => active && setBusy(false));
    return () => { active = false; };
  }, [canRead, revision]);
  const current = settings?.current;
  const serverDraft = settings?.draft;
  const baseline = serverDraft ?? current;
  const dirty = Boolean(switches && baseline && JSON.stringify(switches) !== JSON.stringify(readSwitches(baseline)));
  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);
  const otherDraftChanges = Boolean(serverDraft && current && (["requirePhone", "requireEmail", "ndpPerBaseExp", "baseExpUnitsPerThreshold"] as const).some(key => serverDraft[key] !== current[key]));
  const save = async () => {
    if (!current || !switches || !canWrite || otherDraftChanges) return;
    setBusy(true); setError(""); setSaved(false);
    try {
      const { requirePhone, requireEmail, ndpPerBaseExp, baseExpUnitsPerThreshold } = current;
      const effectiveFrom = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().replace("Z", "+09:00");
      const draft = await platformUserManagementApi.saveGlobalSettingsDraft({ expectedCurrentVersion: current.version, expectedDraftLockVersion: serverDraft?.lockVersion ?? null, requirePhone, requireEmail, ndpPerBaseExp, baseExpUnitsPerThreshold, ...switches, effectiveFrom });
      setSettings({ current, draft });
      const published = await platformUserManagementApi.publishGlobalSettings({ expectedVersion: draft.version, expectedLockVersion: draft.lockVersion, effectiveImmediately: true });
      setSettings({ current: published, draft: null }); setSwitches(readSwitches(published)); setSaved(true);
    } catch (cause) {
      setError(cause instanceof ApiClientError && cause.status === 409 ? "版本已变化，当前草稿已保留，请读取最新版本后重新确认。" : "设置保存失败，请重试。");
    } finally { setBusy(false); }
  };
  if (!canRead) return <p>{t("没有读取 eKYC 设置的权限")}</p>;
  return <div className="space-y-5">
    <div><h2 className="text-lg font-black">{t("eKYC 必须设置")}</h2><p className="mt-2 text-sm text-ink/50">{t("开启后，相应申请或预约必须通过本人验证。默认仅上门服务开启。")}</p></div>
    {busy && !switches ? <p>{t("正在读取正式设置…")}</p> : null}
    {error ? <div className="rounded-xl border border-coral/30 bg-coral/10 p-4 text-coral" role="alert">{t(error)}<Button className="ml-3" disabled={busy} onClick={() => setRevision(value => value + 1)} variant="secondary">{t("重新读取")}</Button></div> : null}
    {otherDraftChanges ? <p className="text-sm text-coral">{t("已有其他全局策略草稿，请先在用户全局设置中处理后再发布 eKYC 设置。")}</p> : null}
    {switches ? <div className="grid gap-4 md:grid-cols-2">{ekycRequirements.map(([key, label]) => <div className="flex items-center justify-between gap-4 rounded-xl border border-line bg-paper p-4" key={key}>
      <span className="font-bold">{t(label)}</span><AdminToggleSwitch ariaLabel={t(label)} checked={switches[key]} disabled={!canWrite || busy || otherDraftChanges} onChange={checked => {setSwitches({...switches, [key]:checked});setSaved(false);}} />
    </div>)}</div> : null}
    {saved ? <p className="text-sm font-bold text-emerald-700" role="status">{t("已发布新版本")}</p> : null}
    <div className="flex justify-end"><Button disabled={!canWrite || busy || !switches || otherDraftChanges || (!dirty && !serverDraft)} onClick={() => void save()}>{t(busy ? "正在保存…" : "保存并发布")}</Button></div>
  </div>;
}
