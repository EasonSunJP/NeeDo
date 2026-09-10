import { useEffect, useMemo, useState } from "react";
import { ApiClientError } from "../../api/httpClient";
import { TestFeatureBadge } from "../../components/ui/TestFeatureBadge";
import { cn } from "../../lib/utils";
import {
  merchantShopMembershipApi,
  type MerchantShopMembershipCard,
  type PaginatedShopMemberships,
  type ShopMembershipCardRedemption,
  type ShopMembershipCardRedemptionCandidate
} from "./api";
import { buildCardRedemptionAttempt, type CardRedemptionAttempt } from "./cardRedemptionModel";

const inset = "rounded-[20px] border border-[color:color-mix(in_srgb,var(--client-line)_68%,transparent)] bg-[color:color-mix(in_srgb,var(--client-elevated)_76%,transparent)]";
const panel = "rounded-[24px] border border-[color:var(--client-line)] bg-[color:var(--client-surface)]";

type Props = {
  card: MerchantShopMembershipCard;
  onClose: () => void;
  onCompleted: (redemption: ShopMembershipCardRedemption) => void;
};

type CandidateState =
  | { status: "loading"; data: null; message: "" }
  | { status: "ready"; data: PaginatedShopMemberships<ShopMembershipCardRedemptionCandidate>; message: "" }
  | { status: "error"; data: null; message: string };

function formatJpy(value: number) {
  return new Intl.NumberFormat("ja-JP", { currency: "JPY", maximumFractionDigits: 0, style: "currency" }).format(value);
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function formatRate(rateBps: number) {
  return `${new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 2 }).format(rateBps / 100)}%`;
}

function consumptionLabel(candidate: ShopMembershipCardRedemptionCandidate) {
  if (candidate.consumption.principalJpy > 0) return formatJpy(candidate.consumption.principalJpy);
  if (candidate.consumption.uses > 0) return `${candidate.consumption.uses} 次`;
  return "使用权益，不扣余额";
}

function balanceLabel(candidate: ShopMembershipCardRedemptionCandidate) {
  if (candidate.consumption.principalBalanceAfterJpy !== null) {
    return `${formatJpy(candidate.consumption.principalBalanceBeforeJpy ?? 0)} → ${formatJpy(candidate.consumption.principalBalanceAfterJpy)}`;
  }
  if (candidate.consumption.remainingUsesAfter !== null) {
    return `${candidate.consumption.remainingUsesBefore ?? 0} 次 → ${candidate.consumption.remainingUsesAfter} 次`;
  }
  return "权益卡状态不变";
}

function describeError(error: unknown, phase: "load" | "submit") {
  if (error instanceof ApiClientError) {
    if (error.status === 403) return phase === "load" ? "当前账号没有查看核销候选订单的权限" : "当前账号没有会员卡核销权限";
    if (error.status === 404) return "会员卡或已完成订单不存在，或不属于当前店铺";
    if (error.status === 409) return "卡余额、次数、待确认调整或订单核销状态已变化，请刷新后重试";
  }
  return phase === "load" ? "可核销订单读取失败，请稍后重试" : "核销未提交，请检查网络后重试";
}

export function CardRedemptionDialog({ card, onClose, onCompleted }: Props) {
  const [page, setPage] = useState(1);
  const [retryRevision, setRetryRevision] = useState(0);
  const [state, setState] = useState<CandidateState>({ status: "loading", data: null, message: "" });
  const [selectedOrderNo, setSelectedOrderNo] = useState("");
  const [attempt, setAttempt] = useState<CardRedemptionAttempt | null>(null);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState("");

  useEffect(() => {
    let active = true;
    setState({ status: "loading", data: null, message: "" });
    merchantShopMembershipApi.redemptionCandidates(card.publicId, { page, pageSize: 20 })
      .then((data) => {
        if (!active) return;
        setState({ status: "ready", data, message: "" });
        setSelectedOrderNo((current) => data.list.some((item) => item.orderNo === current) ? current : "");
      })
      .catch((error) => { if (active) setState({ status: "error", data: null, message: describeError(error, "load") }); });
    return () => { active = false; };
  }, [card.publicId, page, retryRevision]);

  const selected = useMemo(
    () => state.status === "ready" ? state.data.list.find((item) => item.orderNo === selectedOrderNo) ?? null : null,
    [selectedOrderNo, state]
  );
  const totalPages = state.status === "ready" ? Math.max(1, Math.ceil(state.data.total / state.data.page_size)) : 1;

  const submit = async () => {
    if (!selected) return;
    setSaving(true);
    setFeedback("");
    try {
      const nextAttempt = buildCardRedemptionAttempt(attempt, selected.orderNo, () => globalThis.crypto.randomUUID());
      setAttempt(nextAttempt);
      onCompleted(await merchantShopMembershipApi.redeemCard(card.publicId, nextAttempt));
    } catch (error) {
      setFeedback(describeError(error, "submit"));
    } finally {
      setSaving(false);
    }
  };

  return <div aria-modal="true" className="fixed inset-0 z-[145] grid place-items-end bg-black/64 p-2 backdrop-blur-sm sm:place-items-center sm:p-4" role="dialog">
    <section className="max-h-[94dvh] w-full max-w-[720px] overflow-y-auto rounded-[32px] border border-[color:var(--client-line)] bg-[color:var(--client-bg)] p-4 text-[color:var(--client-text)] shadow-[0_30px_100px_rgba(0,0,0,0.58)] sm:p-5">
      <header className="flex items-start justify-between gap-3">
        <div><div className="flex items-center gap-2"><p className="text-[11px] font-black uppercase tracking-[0.16em] text-[color:var(--client-primary)]">Completed service redemption</p><TestFeatureBadge /></div><h2 className="mt-1 text-xl font-black">会员卡核销</h2><p className="mt-1 text-xs font-semibold leading-5 text-[color:var(--client-muted)]">从该客户真实完成的订单中选择一笔；金额、次数与返点均由系统计算。</p></div>
        <button aria-label="关闭会员卡核销" className={cn(inset, "grid h-10 w-10 shrink-0 place-items-center text-lg font-black")} onClick={onClose} type="button">×</button>
      </header>

      <section className={cn(inset, "mt-4 p-4")}><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-bold text-[color:var(--client-muted)]">{card.customerDisplayName} · {card.customerNeedoId}</p><h3 className="mt-1 text-base font-black">{card.name}</h3><p className="mt-1 font-mono text-[11px] font-bold text-[color:var(--client-muted)]">{card.cardNoMasked}</p></div><span className="rounded-full bg-[color:var(--client-primary-soft)] px-3 py-1 text-[11px] font-black text-[color:var(--client-primary)]">真实订单</span></div></section>

      {feedback ? <p className={cn(inset, "mt-3 px-4 py-3 text-sm font-bold text-red-500")} role="alert">{feedback}</p> : null}
      <div className="mt-4 flex items-center justify-between"><div><p className="text-[11px] font-black uppercase tracking-[0.14em] text-[color:var(--client-primary)]">Eligible orders</p><h3 className="mt-1 text-base font-black">已完成服务</h3></div>{state.status === "ready" ? <span className="text-xs font-black text-[color:var(--client-muted)]">{state.data.total} 笔可核销</span> : null}</div>
      <div className="mt-3 space-y-2">
        {state.status === "loading" ? <div className={cn(panel, "py-9 text-center text-sm font-bold text-[color:var(--client-muted)]")}>正在读取可核销订单</div> : null}
        {state.status === "error" ? <div className={cn(panel, "p-5 text-center")}><p className="text-sm font-bold text-red-500" role="alert">{state.message}</p><button className="mt-3 min-h-10 rounded-full border border-[color:var(--client-primary)] px-4 text-xs font-black text-[color:var(--client-primary)]" onClick={() => setRetryRevision((value) => value + 1)} type="button">重新加载</button></div> : null}
        {state.status === "ready" && !state.data.list.length ? <div className={cn(panel, "py-9 text-center")}><strong className="text-sm font-black">暂无可核销订单</strong><p className="mt-2 text-xs font-semibold text-[color:var(--client-muted)]">只有同一客户已完成、未核销且当前会员卡足额可用的订单会显示。</p></div> : null}
        {state.status === "ready" ? state.data.list.map((candidate) => <label className={cn(panel, "block cursor-pointer p-4 transition", selectedOrderNo === candidate.orderNo && "border-[color:var(--client-primary)] bg-[color:var(--client-primary-soft)]")} key={candidate.orderNo}><div className="flex items-start gap-3"><input checked={selectedOrderNo === candidate.orderNo} className="mt-1 h-4 w-4 accent-[color:var(--client-primary)]" name="redemption-order" onChange={() => { setSelectedOrderNo(candidate.orderNo); setFeedback(""); }} type="radio" /><div className="min-w-0 flex-1"><div className="flex items-start justify-between gap-3"><div><strong className="block text-sm">{candidate.serviceName}</strong><p className="mt-1 text-[11px] font-bold text-[color:var(--client-muted)]">{candidate.orderNo} · {formatDate(candidate.serviceCompletedAt)}</p></div><strong className="shrink-0 text-sm">{formatJpy(candidate.eligibleAmountJpy)}</strong></div><div className="mt-3 grid grid-cols-2 gap-2 text-xs"><div><span className="font-bold text-[color:var(--client-muted)]">本次扣减</span><strong className="mt-1 block">{consumptionLabel(candidate)}</strong></div><div><span className="font-bold text-[color:var(--client-muted)]">核销后</span><strong className="mt-1 block">{balanceLabel(candidate)}</strong></div></div></div></div></label>) : null}
      </div>
      {state.status === "ready" && totalPages > 1 ? <nav aria-label="可核销订单分页" className="mt-3 flex items-center justify-between gap-3"><button className={cn(inset, "min-h-10 px-4 text-xs font-black disabled:opacity-35")} disabled={page <= 1} onClick={() => setPage((value) => value - 1)} type="button">上一页</button><span className="text-xs font-black text-[color:var(--client-muted)]">{page} / {totalPages}</span><button className={cn(inset, "min-h-10 px-4 text-xs font-black disabled:opacity-35")} disabled={page >= totalPages} onClick={() => setPage((value) => value + 1)} type="button">下一页</button></nav> : null}

      {selected ? <section className="mt-4 rounded-[24px] border border-[color:color-mix(in_srgb,var(--client-primary)_42%,var(--client-line))] bg-[color:var(--client-primary-soft)] p-4"><div className="flex items-center justify-between gap-3"><div><p className="text-[11px] font-black uppercase tracking-[0.14em] text-[color:var(--client-primary)]">NDP settlement</p><h3 className="mt-1 text-base font-black">返点与平台费</h3></div>{selected.reward.capped ? <span className="rounded-full bg-amber-500/15 px-3 py-1 text-[10px] font-black text-amber-500">已按上限调整</span> : null}</div><dl className="mt-4 grid grid-cols-3 gap-2"><div className={cn(inset, "p-3")}><dt className="text-[10px] font-black text-[color:var(--client-muted)]">客户获得</dt><dd className="mt-1 text-base font-black text-[color:var(--client-primary)]">+{selected.reward.customerRewardNdp.toLocaleString()} NDP</dd></div><div className={cn(inset, "p-3")}><dt className="text-[10px] font-black text-[color:var(--client-muted)]">平台费 {formatRate(selected.reward.platformFeeRateBps)}</dt><dd className="mt-1 text-base font-black">{selected.reward.platformFeeNdp.toLocaleString()} NDP</dd></div><div className={cn(inset, "p-3")}><dt className="text-[10px] font-black text-[color:var(--client-muted)]">店铺钱包合计扣除</dt><dd className="mt-1 text-base font-black">{selected.reward.totalShopDebitNdp.toLocaleString()} NDP</dd></div></dl></section> : null}

      <aside className="mt-4 rounded-[20px] border border-amber-500/35 bg-amber-500/10 p-4"><strong className="text-sm font-black text-amber-500">余额不足也会完成核销，不会冻结 NDP</strong><p className="mt-1 text-xs font-semibold leading-5 text-[color:var(--client-muted)]">会员卡扣减会先正式入账；返点记录标记为待发放。下次店铺钱包有足够余额时，系统从钱包一次性扣除客户返点与平台费，再向客户发放。</p></aside>

      <footer className="sticky bottom-0 -mx-4 mt-4 flex items-center justify-between gap-3 border-t border-[color:var(--client-line)] bg-[color:color-mix(in_srgb,var(--client-bg)_94%,transparent)] px-4 pb-1 pt-4 backdrop-blur-xl sm:-mx-5 sm:px-5"><button className="min-h-11 rounded-full border border-[color:var(--client-line)] px-5 text-sm font-black" onClick={onClose} type="button">取消</button><button className="min-h-12 rounded-full bg-[color:var(--client-primary)] px-6 text-sm font-black text-[color:var(--client-primary-contrast)] disabled:opacity-40" disabled={!selected || saving} onClick={() => void submit()} type="button">{saving ? "核销中" : "确认核销"}</button></footer>
    </section>
  </div>;
}
