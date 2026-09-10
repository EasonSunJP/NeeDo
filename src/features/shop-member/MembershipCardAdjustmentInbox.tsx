import { useEffect, useRef, useState } from "react";
import { ApiClientError } from "../../api/httpClient";
import { TestFeatureBadge } from "../../components/ui/TestFeatureBadge";
import { cn } from "../../lib/utils";
import {
  customerShopMembershipApi,
  type ShopMembershipCardAdjustment
} from "./api";
import { formatAdjustmentDeadline } from "./cardAdjustmentModel";

const panel = "rounded-[28px] border border-[color:color-mix(in_srgb,var(--client-primary)_32%,var(--client-line))] bg-[linear-gradient(145deg,color-mix(in_srgb,var(--client-primary)_10%,var(--client-surface)),var(--client-surface))] p-4 text-[color:var(--client-text)] shadow-[0_18px_48px_color-mix(in_srgb,var(--client-primary)_10%,transparent)]";
const inset = "rounded-[18px] border border-[color:var(--client-line)] bg-[color:var(--client-elevated)]";

type Props = { onChanged: () => void };
type PendingDecision = { publicId: string; decision: "approve" | "reject" } | null;

const statusCopy: Record<ShopMembershipCardAdjustment["status"], string> = {
  pending: "待客户确认",
  approved: "客户已同意",
  rejected: "客户已拒绝",
  cancelled: "店铺已撤回",
  expired: "已超时失效",
  invalidated: "卡状态变化，已失效"
};

function formatValue(item: ShopMembershipCardAdjustment, value: number) {
  return item.dimension === "principal_balance"
    ? new Intl.NumberFormat("ja-JP", { style: "currency", currency: "JPY", maximumFractionDigits: 0 }).format(value)
    : `${value.toLocaleString()} 次`;
}

function describeError(error: unknown) {
  if (error instanceof ApiClientError && error.status === 409) return "申请已到期或会员卡状态已变化，请重新加载";
  if (error instanceof ApiClientError && error.status === 403) return "当前身份不能处理此会员卡调整";
  return "调整申请处理失败，请稍后重试";
}

export function MembershipCardAdjustmentInbox({ onChanged }: Props) {
  const [requests, setRequests] = useState<ShopMembershipCardAdjustment[]>([]);
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  const [feedback, setFeedback] = useState("");
  const [pendingDecision, setPendingDecision] = useState<PendingDecision>(null);
  const [busy, setBusy] = useState(false);
  const decisionKeys = useRef<Record<string, string>>({});

  useEffect(() => {
    let active = true;
    setLoading(true);
    customerShopMembershipApi.adjustmentRequests({ page: 1, pageSize: 50 })
      .then((data) => { if (active) { setRequests(data.list); setFeedback(""); } })
      .catch(() => { if (active) setFeedback("待确认调整读取失败，请稍后重试"); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [revision]);

  const decide = async () => {
    if (!pendingDecision) return;
    const keyName = `${pendingDecision.publicId}:${pendingDecision.decision}`;
    const idempotencyKey = decisionKeys.current[keyName] ?? globalThis.crypto.randomUUID();
    decisionKeys.current[keyName] = idempotencyKey;
    setBusy(true);
    setFeedback("");
    try {
      await customerShopMembershipApi.decideCardAdjustment(pendingDecision.publicId, {
        decision: pendingDecision.decision,
        idempotencyKey
      });
      delete decisionKeys.current[keyName];
      setPendingDecision(null);
      setRevision((value) => value + 1);
      onChanged();
    } catch (error) {
      setFeedback(describeError(error));
      if (error instanceof ApiClientError && error.status === 409) {
        setPendingDecision(null);
        setRevision((value) => value + 1);
        onChanged();
      }
    } finally {
      setBusy(false);
    }
  };

  const pendingRequests = requests.filter((item) => item.status === "pending");
  const terminalRequests = requests.filter((item) => item.status !== "pending");

  if (!loading && !feedback && requests.length === 0) return null;
  return <section className={cn(panel, "mb-4")} aria-label="待确认的会员卡调整">
    <div className="flex items-start justify-between gap-3"><div><div className="flex items-center gap-2"><p className="text-[11px] font-black uppercase tracking-[0.15em] text-[color:var(--client-primary)]">Action required</p><TestFeatureBadge /></div><h2 className="mt-1 text-lg font-black">待确认的会员卡调整</h2><p className="mt-1 text-xs font-semibold leading-5 text-[color:var(--client-muted)]">请在 72 小时内决定；到期不会自动同意。</p></div>{pendingRequests.length ? <span className="grid h-8 min-w-8 place-items-center rounded-full bg-[color:var(--client-primary)] px-2 text-xs font-black text-[color:var(--client-primary-contrast)]">{pendingRequests.length}</span> : null}</div>
    {loading ? <p className="py-5 text-center text-sm font-bold text-[color:var(--client-muted)]">正在读取待确认申请</p> : null}
    {feedback ? <div className={cn(inset, "mt-3 px-3 py-3")}><p className="text-xs font-bold text-red-500" role="alert">{feedback}</p><button className="mt-2 text-xs font-black text-[color:var(--client-primary)]" onClick={() => setRevision((value) => value + 1)} type="button">重新加载</button></div> : null}
    <div className="mt-3 space-y-3">{pendingRequests.map((item) => {
      const confirmation = pendingDecision?.publicId === item.publicId ? pendingDecision.decision : null;
      return <article className={cn(inset, "p-3.5")} key={item.publicId}><div className="flex items-start justify-between gap-3"><div><p className="text-[11px] font-black text-[color:var(--client-primary)]">{item.shop.name}</p><h3 className="mt-1 text-sm font-black">{item.card.name}</h3><p className="mt-1 font-mono text-[10px] font-bold text-[color:var(--client-muted)]">{item.card.cardNoMasked}</p></div><span className="rounded-full bg-amber-500/15 px-2.5 py-1 text-[10px] font-black text-amber-500">{formatAdjustmentDeadline(item.expiresAt)}</span></div><div className="mt-3 grid grid-cols-[1fr_auto_1fr] items-center gap-2"><div className="rounded-[15px] border border-[color:var(--client-line)] bg-[color:var(--client-bg)] p-3"><p className="text-[10px] font-black text-[color:var(--client-muted)]">变更前</p><strong className="mt-1 block text-base font-black">{formatValue(item, item.beforeValue)}</strong></div><span className="font-black text-[color:var(--client-primary)]">→</span><div className="rounded-[15px] border border-[color:color-mix(in_srgb,var(--client-primary)_42%,var(--client-line))] bg-[color:var(--client-primary-soft)] p-3"><p className="text-[10px] font-black text-[color:var(--client-primary)]">变更后</p><strong className="mt-1 block text-base font-black">{formatValue(item, item.targetValue)}</strong></div></div><div className="mt-3 rounded-[15px] bg-[color:var(--client-bg)] px-3 py-2.5"><p className="text-[10px] font-black text-[color:var(--client-muted)]">店铺说明</p><p className="mt-1 text-xs font-semibold leading-5">{item.reason}</p></div>{confirmation ? <div className="mt-3 rounded-[16px] border border-[color:var(--client-primary)] bg-[color:var(--client-primary-soft)] p-3"><strong className="text-xs font-black">{confirmation === "approve" ? "确认同意这次修改？" : "确认拒绝这次修改？"}</strong><p className="mt-1 text-[11px] font-semibold leading-5 text-[color:var(--client-muted)]">{confirmation === "approve" ? "同意后将按上方目标值立即更新会员卡。" : "拒绝后会员卡保持当前值不变。"}</p><div className="mt-3 flex justify-end gap-2"><button className="min-h-9 rounded-full border border-[color:var(--client-line)] px-4 text-xs font-black" disabled={busy} onClick={() => setPendingDecision(null)} type="button">返回</button><button className={cn("min-h-9 rounded-full px-4 text-xs font-black text-white disabled:opacity-40", confirmation === "approve" ? "bg-[color:var(--client-primary)]" : "bg-red-500")} disabled={busy} onClick={() => void decide()} type="button">{busy ? "处理中" : "确认提交"}</button></div></div> : <div className="mt-3 grid grid-cols-2 gap-2"><button className="min-h-11 rounded-full border border-red-500/60 text-xs font-black text-red-500" onClick={() => setPendingDecision({ publicId: item.publicId, decision: "reject" })} type="button">拒绝修改</button><button className="min-h-11 rounded-full bg-[color:var(--client-primary)] text-xs font-black text-[color:var(--client-primary-contrast)]" onClick={() => setPendingDecision({ publicId: item.publicId, decision: "approve" })} type="button">同意修改</button></div>}</article>;
    })}</div>
    {terminalRequests.length ? <div className="mt-5 border-t border-[color:var(--client-line)] pt-4"><h3 className="text-xs font-black text-[color:var(--client-muted)]">最近处理记录</h3><div className="mt-3 space-y-2">{terminalRequests.map((item) => <article className={cn(inset, "flex items-center justify-between gap-3 px-3.5 py-3")} key={item.publicId}><div className="min-w-0"><p className="truncate text-sm font-black">{item.shop.name} · {item.card.name}</p><p className="mt-1 text-[11px] font-semibold text-[color:var(--client-muted)]">{formatValue(item, item.beforeValue)} → {formatValue(item, item.targetValue)}</p></div><span className="shrink-0 rounded-full border border-[color:var(--client-line)] px-2.5 py-1 text-[10px] font-black text-[color:var(--client-muted)]">{statusCopy[item.status]}</span></article>)}</div></div> : null}
  </section>;
}
