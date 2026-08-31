import { useEffect, useState } from "react";
import { ApiClientError } from "../../api/httpClient";
import { TestFeatureBadge } from "../../components/ui/TestFeatureBadge";
import { cn } from "../../lib/utils";
import {
  customerShopMembershipApi,
  merchantShopMembershipApi,
  type PaginatedShopMemberships,
  type ShopMembershipCardTopUp
} from "./api";

const panel = "rounded-[26px] border border-[color:color-mix(in_srgb,var(--client-line)_76%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_90%,var(--client-bg)_10%)] p-4 text-[color:var(--client-text)]";
const inset = "rounded-[18px] border border-[color:var(--client-line)] bg-[color:var(--client-elevated)]";

type Props = { mode: "merchant" | "customer"; revision: number; cardPublicId?: string };
type State =
  | { status: "loading"; data: null; message: "" }
  | { status: "ready"; data: PaginatedShopMemberships<ShopMembershipCardTopUp>; message: "" }
  | { status: "error"; data: null; message: string };

function formatJpy(value: number) {
  return new Intl.NumberFormat("ja-JP", { currency: "JPY", maximumFractionDigits: 0, style: "currency" }).format(value);
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

const paymentLabels: Record<ShopMembershipCardTopUp["paymentMethod"], string> = {
  cash: "现金",
  card: "银行卡",
  paypay: "PayPay",
  bank_transfer: "银行转账",
  other: "其他"
};

function describeError(error: unknown) {
  if (error instanceof ApiClientError && error.status === 403) return "当前身份没有查看充值记录的权限";
  return "充值记录读取失败，请稍后重试";
}

export function CardTopUpHistory({ mode, revision, cardPublicId }: Props) {
  const [page, setPage] = useState(1);
  const [retryRevision, setRetryRevision] = useState(0);
  const [state, setState] = useState<State>({ status: "loading", data: null, message: "" });

  useEffect(() => {
    let active = true;
    setState({ status: "loading", data: null, message: "" });
    const query = { page, pageSize: 20, ...(cardPublicId ? { cardPublicId } : {}) };
    const request = mode === "merchant" ? merchantShopMembershipApi.topUps(query) : customerShopMembershipApi.topUps(query);
    request.then((data) => { if (active) setState({ status: "ready", data, message: "" }); })
      .catch((error) => { if (active) setState({ status: "error", data: null, message: describeError(error) }); });
    return () => { active = false; };
  }, [cardPublicId, mode, page, retryRevision, revision]);

  const totalPages = state.status === "ready" ? Math.max(1, Math.ceil(state.data.total / state.data.page_size)) : 1;
  return <section className="space-y-3">
    <header className={cn(panel, "flex flex-wrap items-start justify-between gap-3")}><div><div className="flex items-center gap-2"><p className="text-[11px] font-black uppercase tracking-[0.15em] text-[color:var(--client-primary)]">Top-up ledger</p><TestFeatureBadge /></div><h2 className="mt-1 text-lg font-black">充值记录</h2><p className="mt-1 text-xs font-semibold text-[color:var(--client-muted)]">每笔均为不可修改的正式记录，可核对收款金额、经办人和充值后本金。</p></div>{state.status === "ready" ? <span className="rounded-full bg-[color:var(--client-primary-soft)] px-3 py-1 text-xs font-black text-[color:var(--client-primary)]">{state.data.total} 笔</span> : null}</header>
    {state.status === "loading" ? <div className={cn(panel, "py-10 text-center text-sm font-bold text-[color:var(--client-muted)]")}>正在读取充值记录</div> : null}
    {state.status === "error" ? <div className={cn(panel, "py-8 text-center")}><p className="text-sm font-bold text-red-500" role="alert">{state.message}</p><button className="mt-3 min-h-10 rounded-full border border-[color:var(--client-primary)] px-4 text-xs font-black text-[color:var(--client-primary)]" onClick={() => setRetryRevision((value) => value + 1)} type="button">重新加载</button></div> : null}
    {state.status === "ready" && !state.data.list.length ? <div className={cn(panel, "py-10 text-center")}><strong className="text-sm font-black">暂无充值记录</strong><p className="mt-2 text-xs font-semibold text-[color:var(--client-muted)]">线下收款并完成正式充值后，记录会显示在这里。</p></div> : null}
    {state.status === "ready" ? state.data.list.map((item) => <article className={panel} key={item.publicId}><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-bold text-[color:var(--client-muted)]">{mode === "merchant" ? `${item.customer.displayName} · ${item.customer.needoId}` : item.shop.name}</p><h3 className="mt-1 text-base font-black">{item.card.name}</h3><p className="mt-1 font-mono text-[11px] font-bold text-[color:var(--client-muted)]">{item.card.cardNoMasked}</p></div><div className="text-right"><p className="text-[10px] font-black text-[color:var(--client-muted)]">充值金额</p><strong className="mt-1 block text-lg font-black text-[color:var(--client-primary)]">+{formatJpy(item.amountJpy)}</strong></div></div><div className="mt-4 grid grid-cols-[1fr_auto_1fr] items-center gap-2"><div className={cn(inset, "p-3")}><p className="text-[10px] font-black text-[color:var(--client-muted)]">充值前</p><strong className="mt-1 block text-sm font-black">{formatJpy(item.principalBalanceBeforeJpy)}</strong></div><span className="font-black text-[color:var(--client-primary)]">→</span><div className={cn(inset, "border-[color:color-mix(in_srgb,var(--client-primary)_42%,var(--client-line))] p-3")}><p className="text-[10px] font-black text-[color:var(--client-primary)]">充值后</p><strong className="mt-1 block text-sm font-black">{formatJpy(item.principalBalanceAfterJpy)}</strong></div></div><dl className="mt-3 grid grid-cols-2 gap-2 text-xs"><div><dt className="font-black text-[color:var(--client-muted)]">收款方式</dt><dd className="mt-1 font-bold">{paymentLabels[item.paymentMethod]}</dd></div><div><dt className="font-black text-[color:var(--client-muted)]">处理时间</dt><dd className="mt-1 font-bold">{formatDate(item.createdAt)}</dd></div><div><dt className="font-black text-[color:var(--client-muted)]">收款凭证</dt><dd className="mt-1 break-all font-bold">{item.paymentReference ?? "—"}</dd></div><div><dt className="font-black text-[color:var(--client-muted)]">经办人</dt><dd className="mt-1 font-bold">{item.createdBy.displayName}</dd></div></dl>{item.note ? <p className="mt-3 rounded-[15px] bg-[color:var(--client-elevated)] px-3 py-2 text-xs font-semibold leading-5">{item.note}</p> : null}</article>) : null}
    {state.status === "ready" && totalPages > 1 ? <nav aria-label="充值记录分页" className="flex items-center justify-between gap-3"><button className={cn(inset, "min-h-10 px-4 text-xs font-black disabled:opacity-35")} disabled={page <= 1} onClick={() => setPage((value) => value - 1)} type="button">上一页</button><span className="text-xs font-black text-[color:var(--client-muted)]">{page} / {totalPages}</span><button className={cn(inset, "min-h-10 px-4 text-xs font-black disabled:opacity-35")} disabled={page >= totalPages} onClick={() => setPage((value) => value + 1)} type="button">下一页</button></nav> : null}
  </section>;
}
