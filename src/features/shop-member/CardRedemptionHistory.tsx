import { useEffect, useState } from "react";
import { ApiClientError } from "../../api/httpClient";
import { TestFeatureBadge } from "../../components/ui/TestFeatureBadge";
import { cn } from "../../lib/utils";
import {
  customerShopMembershipApi,
  merchantShopMembershipApi,
  type PaginatedShopMemberships,
  type ShopMembershipCardRedemption
} from "./api";

const panel = "rounded-[26px] border border-[color:color-mix(in_srgb,var(--client-line)_76%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_90%,var(--client-bg)_10%)] p-4 text-[color:var(--client-text)]";
const inset = "rounded-[18px] border border-[color:var(--client-line)] bg-[color:var(--client-elevated)]";

type Props = { mode: "merchant" | "customer"; revision: number; cardPublicId?: string };
type State =
  | { status: "loading"; data: null; message: "" }
  | { status: "ready"; data: PaginatedShopMemberships<ShopMembershipCardRedemption>; message: "" }
  | { status: "error"; data: null; message: string };

function formatJpy(value: number) {
  return new Intl.NumberFormat("ja-JP", { currency: "JPY", maximumFractionDigits: 0, style: "currency" }).format(value);
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function consumption(item: ShopMembershipCardRedemption) {
  if (item.consumedPrincipalJpy > 0) return `${formatJpy(item.consumedPrincipalJpy)} 本金`;
  if (item.consumedUses > 0) return `${item.consumedUses} 次`;
  return "权益使用";
}

const rewardStatus: Record<ShopMembershipCardRedemption["rewardStatus"], { label: string; className: string }> = {
  none: { label: "本次无返点", className: "bg-[color:var(--client-elevated)] text-[color:var(--client-muted)]" },
  pending_funds: { label: "返点待发放", className: "bg-amber-500/15 text-amber-500" },
  paid: { label: "返点已到账", className: "bg-[color:var(--client-primary-soft)] text-[color:var(--client-primary)]" },
  reversed: { label: "返点已撤回", className: "bg-[color:var(--client-elevated)] text-[color:var(--client-muted)]" }
};

function describeError(error: unknown) {
  if (error instanceof ApiClientError && error.status === 403) return "当前身份没有查看核销记录的权限";
  return "核销记录读取失败，请稍后重试";
}

export function CardRedemptionHistory({ mode, revision, cardPublicId }: Props) {
  const [page, setPage] = useState(1);
  const [retryRevision, setRetryRevision] = useState(0);
  const [state, setState] = useState<State>({ status: "loading", data: null, message: "" });

  useEffect(() => {
    let active = true;
    setState({ status: "loading", data: null, message: "" });
    const query = { page, pageSize: 20, ...(cardPublicId ? { cardPublicId } : {}) };
    const request = mode === "merchant" ? merchantShopMembershipApi.redemptions(query) : customerShopMembershipApi.redemptions(query);
    request.then((data) => { if (active) setState({ status: "ready", data, message: "" }); })
      .catch((error) => { if (active) setState({ status: "error", data: null, message: describeError(error) }); });
    return () => { active = false; };
  }, [cardPublicId, mode, page, retryRevision, revision]);

  const totalPages = state.status === "ready" ? Math.max(1, Math.ceil(state.data.total / state.data.page_size)) : 1;
  return <section className="space-y-3">
    <header className={cn(panel, "flex flex-wrap items-start justify-between gap-3")}><div><div className="flex items-center gap-2"><p className="text-[11px] font-black uppercase tracking-[0.15em] text-[color:var(--client-primary)]">Redemption ledger</p><TestFeatureBadge /></div><h2 className="mt-1 text-lg font-black">核销记录</h2><p className="mt-1 text-xs font-semibold leading-5 text-[color:var(--client-muted)]">核对真实订单、会员卡扣减、客户返点与平台费。待发放记录不会冻结 NDP。</p></div>{state.status === "ready" ? <span className="rounded-full bg-[color:var(--client-primary-soft)] px-3 py-1 text-xs font-black text-[color:var(--client-primary)]">{state.data.total} 笔</span> : null}</header>
    {state.status === "loading" ? <div className={cn(panel, "py-10 text-center text-sm font-bold text-[color:var(--client-muted)]")}>正在读取核销记录</div> : null}
    {state.status === "error" ? <div className={cn(panel, "py-8 text-center")}><p className="text-sm font-bold text-red-500" role="alert">{state.message}</p><button className="mt-3 min-h-10 rounded-full border border-[color:var(--client-primary)] px-4 text-xs font-black text-[color:var(--client-primary)]" onClick={() => setRetryRevision((value) => value + 1)} type="button">重新加载</button></div> : null}
    {state.status === "ready" && !state.data.list.length ? <div className={cn(panel, "py-10 text-center")}><strong className="text-sm font-black">暂无核销记录</strong><p className="mt-2 text-xs font-semibold text-[color:var(--client-muted)]">使用会员卡核销正式完成订单后，记录会显示在这里。</p></div> : null}
    {state.status === "ready" ? state.data.list.map((item) => <article className={panel} key={item.publicId}><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate text-xs font-bold text-[color:var(--client-muted)]">{mode === "merchant" ? `${item.customer.displayName} · ${item.customer.needoId}` : item.shop.name}</p><h3 className="mt-1 truncate text-base font-black">{item.order.serviceName}</h3><p className="mt-1 text-[11px] font-bold text-[color:var(--client-muted)]">{item.order.orderNo} · {formatDate(item.redeemedAt)}</p></div><div className="flex shrink-0 flex-col items-end gap-1.5"><span className="rounded-full bg-[color:var(--client-primary-soft)] px-3 py-1 text-[10px] font-black text-[color:var(--client-primary)]">{item.status === "applied" ? "已核销" : "已退款"}</span><span className={cn("rounded-full px-3 py-1 text-[10px] font-black", rewardStatus[item.rewardStatus].className)}>{rewardStatus[item.rewardStatus].label}</span></div></div><div className="mt-4 grid grid-cols-2 gap-2"><div className={cn(inset, "p-3")}><p className="text-[10px] font-black text-[color:var(--client-muted)]">本次扣减</p><strong className="mt-1 block text-sm font-black">{consumption(item)}</strong></div><div className={cn(inset, "p-3")}><p className="text-[10px] font-black text-[color:var(--client-muted)]">订单金额</p><strong className="mt-1 block text-sm font-black">{formatJpy(item.order.eligibleAmountJpy)}</strong></div></div><dl className="mt-3 grid grid-cols-3 gap-2"><div className={cn(inset, "p-3")}><dt className="text-[10px] font-black text-[color:var(--client-muted)]">客户返点</dt><dd className="mt-1 text-sm font-black text-[color:var(--client-primary)]">+{item.customerRewardNdp.toLocaleString()} NDP</dd></div><div className={cn(inset, "p-3")}><dt className="text-[10px] font-black text-[color:var(--client-muted)]">平台费</dt><dd className="mt-1 text-sm font-black">{item.platformFeeNdp.toLocaleString()} NDP</dd></div><div className={cn(inset, "p-3")}><dt className="text-[10px] font-black text-[color:var(--client-muted)]">店铺合计</dt><dd className="mt-1 text-sm font-black">{item.totalShopDebitNdp.toLocaleString()} NDP</dd></div></dl>{item.rewardStatus === "pending_funds" ? <p className="mt-3 rounded-[16px] border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-xs font-bold leading-5 text-amber-500"><span>店铺钱包余额不足；核销已生效。钱包补足后会一次性扣除</span> {item.outstandingRewardNdp.toLocaleString()} NDP <span>并发放返点。</span></p> : null}<div className="mt-3 flex items-center justify-between gap-3 border-t border-[color:var(--client-line)] pt-3"><p className="min-w-0 truncate font-mono text-[10px] font-bold text-[color:var(--client-muted)]">{item.card.cardNoMasked}</p><p className="shrink-0 text-[11px] font-bold text-[color:var(--client-muted)]">经办：{item.redeemedBy.displayName}</p></div></article>) : null}
    {state.status === "ready" && totalPages > 1 ? <nav aria-label="核销记录分页" className="flex items-center justify-between gap-3"><button className={cn(inset, "min-h-10 px-4 text-xs font-black disabled:opacity-35")} disabled={page <= 1} onClick={() => setPage((value) => value - 1)} type="button">上一页</button><span className="text-xs font-black text-[color:var(--client-muted)]">{page} / {totalPages}</span><button className={cn(inset, "min-h-10 px-4 text-xs font-black disabled:opacity-35")} disabled={page >= totalPages} onClick={() => setPage((value) => value + 1)} type="button">下一页</button></nav> : null}
  </section>;
}
