import { useEffect, useMemo, useState } from "react";
import { ApiClientError } from "../../api/httpClient";
import { TestFeatureBadge } from "../../components/ui/TestFeatureBadge";
import { cn } from "../../lib/utils";
import {
  merchantShopMembershipApi,
  type MerchantShopMembershipListItem,
  type ShopMembershipCardIssuanceResult,
  type ShopMembershipCardPlan
} from "./api";
import {
  buildCardIssuanceAttempt,
  cardIssuanceExpirySummary,
  cardIssuanceRewardSummary,
  createCardIssuanceEditor,
  type CardIssuanceAttempt
} from "./cardIssuanceModel";

const inset = "rounded-[19px] border border-[color:color-mix(in_srgb,var(--client-line)_68%,transparent)] bg-[color:color-mix(in_srgb,var(--client-elevated)_76%,transparent)]";
const field = "min-h-11 w-full rounded-[16px] border border-[color:var(--client-line)] bg-[color:var(--client-bg)] px-3 text-sm font-bold text-[color:var(--client-text)] outline-none focus:border-[color:var(--client-primary)]";
const primary = "min-h-12 rounded-full bg-[color:var(--client-primary)] px-6 text-sm font-black text-[color:var(--client-primary-contrast)] disabled:opacity-40";

type Props = { onClose: () => void; onIssued: (card: ShopMembershipCardIssuanceResult) => void };

function describeError(error: unknown) {
  if (error instanceof ApiClientError) {
    if (error.status === 400) return "初始值或来源说明不符合已发布方案";
    if (error.status === 403) return "当前账号没有正式开卡权限";
    if (error.status === 404) return "会员或卡方案不存在，或不属于当前店铺";
    if (error.status === 409) return "会员、卡方案或本次开卡请求已发生变化，请重新检查";
  }
  if (error instanceof Error && error.message === "range") return "初始值不在此方案允许的范围内";
  if (error instanceof Error && error.message === "source") return "请补充本次开卡来源的参考号或说明";
  if (error instanceof Error && error.message === "plan") return "请选择仍在启用的已发布卡方案";
  return "开卡未完成，请检查填写内容或网络后重试";
}

function typeLabel(plan: ShopMembershipCardPlan) {
  const type = plan.currentVersion?.cardType;
  return type === "stored_value" ? "储值卡" : type === "count" ? "次数卡" : "权益卡";
}

function initialRange(plan: ShopMembershipCardPlan) {
  const version = plan.currentVersion;
  if (!version || version.cardType === "benefit") return "无需录入金额或次数";
  const issuance = version.issuance;
  const minimum = version.cardType === "stored_value" ? issuance.minInitialPrincipalJpy : issuance.minInitialUses;
  const maximum = version.cardType === "stored_value" ? issuance.maxInitialPrincipalJpy : issuance.maxInitialUses;
  const unit = version.cardType === "stored_value" ? "JPY" : "次";
  return `允许范围 ${minimum ?? 0}–${maximum ?? "不限"} ${unit}`;
}

export function CardIssuanceDialog({ onClose, onIssued }: Props) {
  const [keyword, setKeyword] = useState("");
  const [members, setMembers] = useState<MerchantShopMembershipListItem[]>([]);
  const [plans, setPlans] = useState<ShopMembershipCardPlan[]>([]);
  const [selectedMembershipPublicId, setSelectedMembershipPublicId] = useState("");
  const [selectedPlanPublicId, setSelectedPlanPublicId] = useState("");
  const [editor, setEditor] = useState(createCardIssuanceEditor);
  const [attempt, setAttempt] = useState<CardIssuanceAttempt | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState("");
  const selectedPlan = useMemo(() => plans.find((plan) => plan.publicId === selectedPlanPublicId) ?? null, [plans, selectedPlanPublicId]);

  const load = async (searchKeyword = "") => {
    setLoading(true);
    setFeedback("");
    try {
      const [memberPage, planPage] = await Promise.all([
        merchantShopMembershipApi.list({ page: 1, pageSize: 20, keyword: searchKeyword.trim() || undefined, status: "active" }),
        merchantShopMembershipApi.listCardPlans({ page: 1, pageSize: 100 })
      ]);
      const activePlans = planPage.list.filter((plan) => plan.status === "active" && plan.currentVersion?.status === "published");
      setMembers(memberPage.list);
      setPlans(activePlans);
      setSelectedMembershipPublicId((current) => memberPage.list.some((member) => member.publicId === current) ? current : memberPage.list[0]?.publicId ?? "");
      setSelectedPlanPublicId((current) => activePlans.some((plan) => plan.publicId === current) ? current : activePlans[0]?.publicId ?? "");
    } catch (error) {
      setFeedback(describeError(error));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const submit = async () => {
    if (!selectedPlan) { setFeedback("请选择仍在启用的已发布卡方案"); return; }
    setSaving(true);
    setFeedback("");
    try {
      const nextAttempt = buildCardIssuanceAttempt(attempt, selectedMembershipPublicId, selectedPlan, editor, () => globalThis.crypto.randomUUID());
      setAttempt(nextAttempt);
      onIssued(await merchantShopMembershipApi.issueCard(selectedMembershipPublicId, nextAttempt.request));
    } catch (error) {
      setFeedback(describeError(error));
    } finally {
      setSaving(false);
    }
  };

  const version = selectedPlan?.currentVersion ?? null;
  return <div aria-modal="true" className="fixed inset-0 z-[130] grid place-items-end bg-black/62 p-2 backdrop-blur-sm sm:place-items-center sm:p-4" role="dialog">
    <section className="max-h-[94dvh] w-full max-w-[680px] overflow-y-auto rounded-[32px] border border-[color:var(--client-line)] bg-[color:var(--client-bg)] p-4 text-[color:var(--client-text)] shadow-[0_30px_100px_rgba(0,0,0,0.58)] sm:p-5">
      <header className="flex items-start justify-between gap-3"><div><div className="flex items-center gap-2"><p className="text-[11px] font-black uppercase tracking-[0.16em] text-[color:var(--client-primary)]">Formal card issuance</p><TestFeatureBadge /></div><h2 className="mt-1 text-xl font-black">正式开卡</h2><p className="mt-1 text-xs font-semibold leading-5 text-[color:var(--client-muted)]">按已发布方案写入最终初始值；开卡不会自动发放 NDP。</p></div><button aria-label="关闭开卡" className={cn(inset, "grid h-10 w-10 shrink-0 place-items-center text-lg font-black")} onClick={onClose} type="button">×</button></header>

      {feedback ? <p className={cn(inset, "mt-4 px-4 py-3 text-sm font-bold text-red-500")} role="alert">{feedback}</p> : null}
      {loading ? <p className="py-10 text-center text-sm font-bold text-[color:var(--client-muted)]">正在读取有效会员与已发布方案</p> : <div className="mt-4 space-y-4">
        <section className={cn(inset, "p-3")}><div className="flex items-center justify-between gap-3"><div><p className="text-[11px] font-black text-[color:var(--client-primary)]">1 · 选择会员</p><h3 className="mt-0.5 text-sm font-black">当前店铺有效会员</h3></div><span className="text-xs font-bold text-[color:var(--client-muted)]">{members.length} 位</span></div><form className="mt-3 flex gap-2" onSubmit={(event) => { event.preventDefault(); void load(keyword); }}><input aria-label="搜索有效会员" className={field} onChange={(event) => setKeyword(event.target.value)} placeholder="NeeDoID 或姓名" value={keyword} /><button className="min-h-11 rounded-full border border-[color:var(--client-primary)] px-4 text-xs font-black text-[color:var(--client-primary)]" type="submit">搜索</button></form><div className="mt-3 grid gap-2 sm:grid-cols-2">{members.map((member) => <button aria-pressed={selectedMembershipPublicId === member.publicId} className={cn("rounded-[17px] border p-3 text-left", selectedMembershipPublicId === member.publicId ? "border-[color:var(--client-primary)] bg-[color:var(--client-primary-soft)]" : "border-[color:var(--client-line)] bg-[color:var(--client-bg)]")} key={member.publicId} onClick={() => setSelectedMembershipPublicId(member.publicId)} type="button"><strong className="block truncate text-sm">{member.displayName}</strong><span className="mt-1 block truncate text-xs font-semibold text-[color:var(--client-muted)]">{member.customerNeedoId} · {member.cardCount} 张卡</span></button>)}{!members.length ? <p className="py-4 text-sm font-bold text-[color:var(--client-muted)]">没有找到有效会员</p> : null}</div></section>

        <section className={cn(inset, "p-3")}><p className="text-[11px] font-black text-[color:var(--client-primary)]">2 · 选择卡方案</p><h3 className="mt-0.5 text-sm font-black">已启用的发布版本</h3><div className="mt-3 grid gap-2">{plans.map((plan) => <button aria-pressed={selectedPlanPublicId === plan.publicId} className={cn("rounded-[17px] border p-3 text-left", selectedPlanPublicId === plan.publicId ? "border-[color:var(--client-primary)] bg-[color:var(--client-primary-soft)]" : "border-[color:var(--client-line)] bg-[color:var(--client-bg)]")} key={plan.publicId} onClick={() => { setSelectedPlanPublicId(plan.publicId); setEditor(createCardIssuanceEditor()); setAttempt(null); }} type="button"><div className="flex items-start justify-between gap-3"><strong className="text-sm">{plan.currentVersion?.name}</strong><span className="text-[11px] font-black text-[color:var(--client-primary)]">{typeLabel(plan)} · v{plan.currentVersion?.version}</span></div><p className="mt-1 text-xs font-semibold text-[color:var(--client-muted)]">{cardIssuanceExpirySummary(plan)}</p><p className="mt-1 text-xs font-black text-[color:var(--client-primary)]">{cardIssuanceRewardSummary(plan)}</p></button>)}{!plans.length ? <p className="py-4 text-sm font-bold text-[color:var(--client-muted)]">请先发布并启用至少一个卡方案</p> : null}</div></section>

        <section className={cn(inset, "p-3")}><p className="text-[11px] font-black text-[color:var(--client-primary)]">3 · 开卡初始值与来源</p><h3 className="mt-0.5 text-sm font-black">确认最终写入内容</h3>{version ? <div className="mt-3 space-y-3">{version.cardType !== "benefit" ? <label className="block"><span className="mb-1.5 block text-xs font-black text-[color:var(--client-muted)]">{version.cardType === "stored_value" ? "初始金额（JPY）" : "初始次数"}</span><input className={field} inputMode="numeric" onChange={(event) => setEditor((current) => ({ ...current, initialValue: event.target.value }))} placeholder={initialRange(selectedPlan!)} value={editor.initialValue} /></label> : <p className="rounded-[16px] border border-dashed border-[color:var(--client-line)] px-3 py-3 text-xs font-bold text-[color:var(--client-muted)]">权益卡无需录入初始金额或次数</p>}<label className="block"><span className="mb-1.5 block text-xs font-black text-[color:var(--client-muted)]">开卡来源</span><select className={field} onChange={(event) => setEditor((current) => ({ ...current, issuanceSource: event.target.value as typeof current.issuanceSource }))} value={editor.issuanceSource}><option value="offline_paid">线下已付款</option><option value="historical_replacement">历史补卡</option><option value="manual_grant">人工发放</option></select></label><div className="grid gap-3 sm:grid-cols-2"><label><span className="mb-1.5 block text-xs font-black text-[color:var(--client-muted)]">业务参考号</span><input className={field} maxLength={160} onChange={(event) => setEditor((current) => ({ ...current, issuanceReference: event.target.value }))} value={editor.issuanceReference} /></label><label><span className="mb-1.5 block text-xs font-black text-[color:var(--client-muted)]">开卡说明</span><input className={field} maxLength={500} onChange={(event) => setEditor((current) => ({ ...current, issuanceNote: event.target.value }))} value={editor.issuanceNote} /></label></div><div className="rounded-[18px] border border-[color:color-mix(in_srgb,var(--client-primary)_40%,var(--client-line))] bg-[color:var(--client-primary-soft)] p-3"><p className="text-xs font-black">NDP 返点规则</p><p className="mt-1 text-xs font-semibold leading-5">{cardIssuanceRewardSummary(selectedPlan!)}</p><p className="mt-1 text-xs font-semibold text-[color:var(--client-muted)]">平台费仅在以后实际发生返点时从店铺钱包扣除；本次开卡不扣款、不发 NDP。</p></div></div> : null}</section>
      </div>}

      <footer className="sticky bottom-0 -mx-4 mt-4 flex items-center justify-between gap-3 border-t border-[color:var(--client-line)] bg-[color:color-mix(in_srgb,var(--client-bg)_94%,transparent)] px-4 pb-1 pt-4 backdrop-blur-xl sm:-mx-5 sm:px-5"><button className="min-h-11 rounded-full border border-[color:var(--client-line)] px-5 text-sm font-black" onClick={onClose} type="button">取消</button><button className={primary} disabled={loading || saving || !selectedMembershipPublicId || !selectedPlan} onClick={() => void submit()} type="button">{saving ? "开卡中" : "确认开卡"}</button></footer>
    </section>
  </div>;
}
