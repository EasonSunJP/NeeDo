import { useEffect, useState } from "react";
import "./registerI18n";
import { useAuth } from "../../auth/AuthProvider";
import { ModuleShell } from "../../components/admin/ModuleShell";
import { Button } from "../../components/ui/Button";
import { platformUserManagementApi } from "./api";
import { platformTierCodes, type PlatformTierAdministration, type PlatformTierCode } from "./types";
import { MembershipTierEditor } from "./MembershipTierEditor";

const labels: Record<PlatformTierCode, string> = { free: "免费会员", silver: "白银会员", gold: "黄金会员", black_diamond: "黑钻会员" };

export function MembershipTiersPage() {
  const { hasPermission } = useAuth();
  const [tiers, setTiers] = useState<PlatformTierAdministration[]>([]);
  const [selected, setSelected] = useState<PlatformTierCode>("free");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  useEffect(() => { let active = true; setLoading(true); setError(null); platformUserManagementApi.listTiers().then((value) => active && setTiers(value)).catch(() => active && setError("会员等级读取失败")).finally(() => active && setLoading(false)); return () => { active = false; }; }, [reloadToken]);
  const malformed = tiers.length > 0 && (tiers.length !== platformTierCodes.length || platformTierCodes.some((code, index) => tiers[index]?.tierCode !== code));
  const activeTier = tiers.find((tier) => tier.tierCode === selected) ?? null;
  return <ModuleShell title="会员等级设置" description="四种固定会员类型使用版本化草稿与发布；卡片预览复用用户端和聊天中的实际组件。">
    {loading ? <div className="rounded-xl border border-line bg-white p-10 text-center text-sm font-bold text-ink/50">正在读取会员等级…</div> : null}{error ? <div className="rounded-xl border border-coral/25 bg-white p-10 text-center"><p className="text-sm font-bold text-coral">{error}</p><Button className="mt-4" onClick={() => setReloadToken((value) => value + 1)} variant="secondary">重新加载</Button></div> : null}{malformed ? <div className="rounded-lg border border-coral/25 bg-coral/5 p-4 text-sm font-bold text-coral">正式接口必须且只能返回 free、silver、gold、black_diamond 四个固定等级。</div> : null}
    {!loading && !error && !malformed ? <><div className="grid grid-cols-2 gap-2 rounded-xl border border-line bg-white p-2 shadow-sm md:grid-cols-4">{platformTierCodes.map((code) => <button className={`rounded-lg px-4 py-3 text-sm font-black ${selected === code ? "bg-ink text-white" : "bg-paper text-ink/60"}`} key={code} onClick={() => setSelected(code)} type="button">{labels[code]}</button>)}</div>{activeTier ? <MembershipTierEditor canWrite={hasPermission("backoffice:membership-tier:publish")} onReload={() => setReloadToken((value) => value + 1)} tier={activeTier} /> : null}</> : null}
  </ModuleShell>;
}
