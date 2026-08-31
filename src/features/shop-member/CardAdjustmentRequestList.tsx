import { useEffect, useState } from "react";
import { ApiClientError } from "../../api/httpClient";
import { TestFeatureBadge } from "../../components/ui/TestFeatureBadge";
import { cn } from "../../lib/utils";
import {
  merchantShopMembershipApi,
  type PaginatedShopMemberships,
  type ShopMembershipCardAdjustment,
  type ShopMembershipCardAdjustmentStatus
} from "./api";
import { formatAdjustmentDeadline } from "./cardAdjustmentModel";

const panel = "rounded-[26px] border border-[color:color-mix(in_srgb,var(--client-line)_76%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_90%,var(--client-bg)_10%)] p-4 text-[color:var(--client-text)]";
const inset = "rounded-[18px] border border-[color:var(--client-line)] bg-[color:var(--client-elevated)]";

type Props = { revision: number; onChanged: () => void };
type State =
  | { status: "loading"; data: null; message: "" }
  | { status: "ready"; data: PaginatedShopMemberships<ShopMembershipCardAdjustment>; message: "" }
  | { status: "error"; data: null; message: string };

const statusLabels: Record<ShopMembershipCardAdjustmentStatus, string> = {
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
  if (error instanceof ApiClientError && error.status === 403) return "当前账号没有查看或撤回调整申请的权限";
  if (error instanceof ApiClientError && error.status === 409) return "申请状态已经变化，请刷新后确认";
  return "调整申请读取失败，请稍后重试";
}

export function CardAdjustmentRequestList({ revision, onChanged }: Props) {
  const [filter, setFilter] = useState<"all" | "pending">("pending");
  const [localRevision, setLocalRevision] = useState(0);
  const [busyId, setBusyId] = useState("");
  const [feedback, setFeedback] = useState("");
  const [state, setState] = useState<State>({ status: "loading", data: null, message: "" });

  useEffect(() => {
    let active = true;
    setState({ status: "loading", data: null, message: "" });
    merchantShopMembershipApi.adjustmentRequests({ page: 1, pageSize: 50, status: filter === "pending" ? "pending" : undefined })
      .then((data) => { if (active) setState({ status: "ready", data, message: "" }); })
      .catch((error) => { if (active) setState({ status: "error", data: null, message: describeError(error) }); });
    return () => { active = false; };
  }, [filter, localRevision, revision]);

  const cancel = async (publicId: string) => {
    setBusyId(publicId);
    setFeedback("");
    try {
      await merchantShopMembershipApi.cancelCardAdjustment(publicId);
      setLocalRevision((value) => value + 1);
      onChanged();
    } catch (error) {
      setFeedback(describeError(error));
    } finally {
      setBusyId("");
    }
  };

  return <div className="space-y-3">
    <section className={cn(panel, "flex flex-wrap items-start justify-between gap-3")}><div><div className="flex items-center gap-2"><p className="text-[11px] font-black uppercase tracking-[0.15em] text-[color:var(--client-primary)]">Adjustment queue</p><TestFeatureBadge /></div><h2 className="mt-1 text-lg font-black">调整申请</h2><p className="mt-1 text-xs font-semibold text-[color:var(--client-muted)]">客户需在 72 小时内判断；72 小时未处理会自动失效。</p></div><div className={cn(inset, "flex p-1")}><button className={cn("min-h-9 rounded-[14px] px-3 text-xs font-black", filter === "pending" ? "bg-[color:var(--client-primary)] text-[color:var(--client-primary-contrast)]" : "text-[color:var(--client-muted)]")} onClick={() => setFilter("pending")} type="button">待客户确认</button><button className={cn("min-h-9 rounded-[14px] px-3 text-xs font-black", filter === "all" ? "bg-[color:var(--client-primary)] text-[color:var(--client-primary-contrast)]" : "text-[color:var(--client-muted)]")} onClick={() => setFilter("all")} type="button">全部记录</button></div></section>
    {feedback ? <p className={cn(inset, "px-4 py-3 text-sm font-bold text-red-500")} role="alert">{feedback}</p> : null}
    {state.status === "loading" ? <section className={cn(panel, "py-10 text-center text-sm font-bold text-[color:var(--client-muted)]")}>正在读取调整申请</section> : null}
    {state.status === "error" ? <section className={cn(panel, "py-8 text-center")}><p className="text-sm font-bold text-red-500" role="alert">{state.message}</p><button className="mt-3 min-h-10 rounded-full border border-[color:var(--client-primary)] px-4 text-xs font-black text-[color:var(--client-primary)]" onClick={() => setLocalRevision((value) => value + 1)} type="button">重新加载</button></section> : null}
    {state.status === "ready" && !state.data.list.length ? <section className={cn(panel, "py-10 text-center")}><strong className="text-sm font-black">{filter === "pending" ? "暂无待确认申请" : "暂无调整记录"}</strong><p className="mt-2 text-xs font-semibold text-[color:var(--client-muted)]">从已发会员卡选择“申请调整”后会出现在这里。</p></section> : null}
    {state.status === "ready" ? state.data.list.map((item) => <article className={panel} key={item.publicId}><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-bold text-[color:var(--client-muted)]">{item.customer.displayName} · {item.customer.needoId}</p><h3 className="mt-1 text-base font-black">{item.card.name}</h3><p className="mt-1 font-mono text-[11px] font-bold text-[color:var(--client-muted)]">{item.card.cardNoMasked}</p></div><span className={cn("rounded-full px-3 py-1 text-[11px] font-black", item.status === "pending" ? "bg-amber-500/15 text-amber-500" : item.status === "approved" ? "bg-[color:var(--client-primary-soft)] text-[color:var(--client-primary)]" : "bg-[color:var(--client-elevated)] text-[color:var(--client-muted)]")}>{statusLabels[item.status]}</span></div><div className="mt-4 grid grid-cols-[1fr_auto_1fr] items-center gap-2"><div className={cn(inset, "p-3")}><p className="text-[10px] font-black text-[color:var(--client-muted)]">变更前</p><strong className="mt-1 block text-base font-black">{formatValue(item, item.beforeValue)}</strong></div><span className="font-black text-[color:var(--client-primary)]">→</span><div className={cn(inset, "border-[color:color-mix(in_srgb,var(--client-primary)_42%,var(--client-line))] p-3")}><p className="text-[10px] font-black text-[color:var(--client-primary)]">目标值</p><strong className="mt-1 block text-base font-black">{formatValue(item, item.targetValue)}</strong></div></div><p className="mt-3 rounded-[16px] bg-[color:var(--client-elevated)] px-3 py-2.5 text-xs font-semibold leading-5"><span className="font-black">调整原因：</span>{item.reason}</p><div className="mt-3 flex items-center justify-between gap-3"><span className="text-[11px] font-bold text-[color:var(--client-muted)]">{item.status === "pending" ? formatAdjustmentDeadline(item.expiresAt) : statusLabels[item.status]}</span>{item.status === "pending" ? <button className="min-h-10 rounded-full border border-red-500/60 px-4 text-xs font-black text-red-500 disabled:opacity-40" disabled={Boolean(busyId)} onClick={() => void cancel(item.publicId)} type="button">{busyId === item.publicId ? "撤回中" : "撤回申请"}</button> : null}</div></article>) : null}
  </div>;
}
