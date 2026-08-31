import { TestFeatureBadge } from "../../components/ui/TestFeatureBadge";
import { cn } from "../../lib/utils";
import type { MerchantShopMembershipCard } from "./api";
import { formatAdjustmentDeadline } from "./cardAdjustmentModel";

type Props = {
  canAdjust: boolean;
  card: MerchantShopMembershipCard;
  lookupStatus: "loading" | "ready" | "error";
  pendingRequest: MerchantShopMembershipCard["pendingAdjustment"];
  onAdjust: () => void;
  onViewRequests: () => void;
};

function formatValue(card: MerchantShopMembershipCard, value: number) {
  return card.type === "stored_value"
    ? new Intl.NumberFormat("ja-JP", { style: "currency", currency: "JPY", maximumFractionDigits: 0 }).format(value)
    : `${value.toLocaleString()} 次`;
}

export function IssuedCardAdjustmentAction({ canAdjust, card, lookupStatus, onAdjust, onViewRequests, pendingRequest }: Props) {
  if (!canAdjust || card.status !== "active" || card.type === "benefit") return null;

  if (lookupStatus === "loading") {
    return <div className="relative mt-4 border-t border-[color:var(--client-line)] pt-3"><p className="text-right text-xs font-bold text-[color:var(--client-muted)]">正在核对调整状态</p></div>;
  }

  if (lookupStatus === "error") {
    return <div className="relative mt-4 flex items-center justify-between gap-3 border-t border-[color:var(--client-line)] pt-3"><p className="text-xs font-bold text-red-500">调整状态读取失败</p><button className="min-h-10 rounded-full border border-[color:var(--client-line)] px-4 text-xs font-black" onClick={onViewRequests} type="button">查看调整申请</button></div>;
  }

  if (pendingRequest) {
    return <div className="relative mt-4 rounded-[18px] border border-amber-500/35 bg-amber-500/10 p-3"><div className="flex items-start justify-between gap-3"><div><div className="flex items-center gap-2"><strong className="text-xs font-black text-amber-500">已有调整等待客户确认</strong><TestFeatureBadge /></div><p className="mt-1 text-[11px] font-semibold text-[color:var(--client-muted)]">{formatValue(card, pendingRequest.beforeValue)} → {formatValue(card, pendingRequest.targetValue)}</p></div><span className="shrink-0 rounded-full bg-amber-500/15 px-2 py-1 text-[10px] font-black text-amber-500">{formatAdjustmentDeadline(pendingRequest.expiresAt)}</span></div><div className="mt-3 flex justify-end"><button className="min-h-10 rounded-full border border-amber-500/55 px-4 text-xs font-black text-amber-500" onClick={onViewRequests} type="button">查看调整申请</button></div></div>;
  }

  return <div className="relative mt-4 flex justify-end border-t border-[color:var(--client-line)] pt-3"><button className={cn("inline-flex min-h-10 items-center gap-2 rounded-full border border-[color:var(--client-primary)] px-4 text-xs font-black text-[color:var(--client-primary)]")} onClick={onAdjust} type="button">申请调整 <TestFeatureBadge /></button></div>;
}
