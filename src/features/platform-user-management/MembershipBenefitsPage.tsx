import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../../auth/AuthProvider";
import "./registerI18n";
import { ModuleShell } from "../../components/admin/ModuleShell";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { platformUserManagementApi } from "./api";
import { MembershipBenefitEditor } from "./MembershipBenefitEditor";
import {
  platformBenefitCodes,
  type PlatformBenefitAdministration,
  type PlatformBenefitCode
} from "./types";

const benefitCatalog: Array<{ code: PlatformBenefitCode; capabilityConnected: boolean }> = [
  { code: "ndp_experience", capabilityConnected: true },
  { code: "member_sign_in", capabilityConnected: true },
  { code: "priority_request", capabilityConnected: true },
  { code: "support_service", capabilityConnected: false },
  { code: "exclusive_discount", capabilityConnected: false },
  { code: "member_day", capabilityConnected: false },
  { code: "birthday_gift", capabilityConnected: false }
];

export function MembershipBenefitsPage() {
  const { hasPermission } = useAuth();
  const canWrite = hasPermission("backoffice:membership-benefit:write");
  const [benefits, setBenefits] = useState<PlatformBenefitAdministration[]>([]);
  const [selectedCode, setSelectedCode] = useState<PlatformBenefitCode | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    platformUserManagementApi.listBenefits()
      .then((value) => active && setBenefits(value))
      .catch(() => active && setError("会员权益读取失败"))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [reloadToken]);

  const malformed = benefits.length > 0 && (
    benefits.length !== platformBenefitCodes.length ||
    platformBenefitCodes.some((code) => !benefits.some((benefit) => benefit.code === code))
  );
  const rows = useMemo(() => [...benefits].sort((left, right) => left.sortOrder - right.sortOrder), [benefits]);
  const selected = benefits.find((benefit) => benefit.code === selectedCode) ?? null;

  return <ModuleShell title="会员权益说明" description="七项系统权益的全局状态、显示顺序与五语言说明。等级内点亮状态在会员等级设置中管理。">
    <div className="mb-4 rounded-xl border border-sky-200 bg-sky-50 p-4 text-sm font-bold text-sky-900">全局停用优先于各会员等级中的点亮状态。能力状态只反映正式业务链路是否接通，不代表已经发放权益。</div>
    {loading ? <div className="rounded-xl border border-line bg-white p-10 text-center text-sm font-bold text-ink/50">正在读取会员权益…</div> : null}
    {error ? <div className="rounded-xl border border-coral/25 bg-white p-10 text-center"><p className="text-sm font-bold text-coral">{error}</p><Button className="mt-4" onClick={() => setReloadToken((value) => value + 1)} variant="secondary">重新加载</Button></div> : null}
    {malformed ? <div className="rounded-lg border border-coral/25 bg-coral/5 p-4 text-sm font-bold text-coral">正式接口必须且只能返回七项固定系统权益。</div> : null}
    {!loading && !error && !malformed ? <div className="overflow-hidden rounded-xl border border-line bg-white shadow-sm"><div className="overflow-x-auto"><table className="min-w-full text-left text-sm"><thead className="bg-paper text-xs font-black text-ink/45"><tr><th className="px-4 py-3">顺序</th><th className="px-4 py-3">权益</th><th className="px-4 py-3">说明</th><th className="px-4 py-3">全局状态</th><th className="px-4 py-3">交付能力</th><th className="px-4 py-3 text-right">操作</th></tr></thead><tbody className="divide-y divide-line">{rows.map((benefit) => {
      const catalog = benefitCatalog.find((item) => item.code === benefit.code)!;
      return <tr key={benefit.code}><td className="px-4 py-4 font-black text-ink/45">{benefit.sortOrder}</td><td className="px-4 py-4"><p className="font-black">{benefit.nameTranslations.zh}</p><p className="mt-1 text-xs text-ink/40">{benefit.code}</p></td><td className="max-w-xl px-4 py-4 text-ink/60">{benefit.descriptionTranslations.zh}</td><td className="px-4 py-4">{benefit.isGloballyEnabled ? <Badge tone="green">已配置</Badge> : <Badge tone="red">全局停用</Badge>}</td><td className="px-4 py-4">{catalog.capabilityConnected ? <Badge tone="green">能力已接通</Badge> : <Badge tone="yellow">能力未接通</Badge>}</td><td className="px-4 py-4 text-right"><Button onClick={() => setSelectedCode(benefit.code)} size="sm" variant="secondary">{canWrite ? "编辑" : "查看"}</Button></td></tr>;
    })}</tbody></table></div></div> : null}
    {selected ? <MembershipBenefitEditor benefit={selected} canWrite={canWrite} onCancel={() => setSelectedCode(null)} onSaved={(updated) => { setBenefits((current) => current.map((benefit) => benefit.code === updated.code ? updated : benefit)); setSelectedCode(null); }} /> : null}
  </ModuleShell>;
}
