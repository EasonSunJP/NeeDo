import { useState } from "react";
import { ApiClientError } from "../../api/httpClient";
import { TestFeatureBadge } from "../../components/ui/TestFeatureBadge";
import { cn } from "../../lib/utils";
import {
  merchantShopMembershipApi,
  type ShopMembershipCardRedemption,
  type ShopMembershipCardRefund
} from "./api";
import { buildCardRefundAttempt, type CardRefundAttempt } from "./cardRefundModel";

const panel = "rounded-[20px] border border-[color:var(--client-line)] bg-[color:var(--client-elevated)]";

type Props = {
  redemption: ShopMembershipCardRedemption;
  onClose: () => void;
  onCompleted: (refund: ShopMembershipCardRefund) => void;
};

function formatJpy(value: number) {
  return new Intl.NumberFormat("ja-JP", {
    currency: "JPY",
    maximumFractionDigits: 0,
    style: "currency"
  }).format(value);
}

function restoration(redemption: ShopMembershipCardRedemption) {
  if (redemption.consumedPrincipalJpy > 0) {
    return `${formatJpy(redemption.consumedPrincipalJpy)} 本金将退回会员卡；赠送余额不变`;
  }
  if (redemption.consumedUses > 0) return `${redemption.consumedUses} 次将退回会员卡`;
  return "本次权益使用将标记为已退款；卡内数值不变";
}

function describeError(error: unknown) {
  if (error instanceof ApiClientError) {
    if (error.status === 403) return "当前账号没有会员卡退款权限";
    if (error.status === 404) return "核销记录不存在或不属于当前店铺";
    if (error.status === 409) return "订单退款、会员卡、返点或待确认调整状态已变化，请刷新后重试";
  }
  return "退款未提交，请检查网络后重试";
}

export function CardRefundDialog({ redemption, onClose, onCompleted }: Props) {
  const [reason, setReason] = useState("关联订单已完成退款");
  const [attempt, setAttempt] = useState<CardRefundAttempt | null>(null);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState("");
  const valid = reason.trim().length >= 2 && reason.trim().length <= 500;

  const submit = async () => {
    if (!valid || saving) return;
    setSaving(true);
    setFeedback("");
    const nextAttempt = buildCardRefundAttempt(
      attempt,
      redemption.publicId,
      reason,
      () => globalThis.crypto.randomUUID()
    );
    setAttempt(nextAttempt);
    try {
      const refund = await merchantShopMembershipApi.refundRedemption(redemption.publicId, {
        reason: nextAttempt.reason,
        idempotencyKey: nextAttempt.idempotencyKey
      });
      onCompleted(refund);
    } catch (error) {
      setFeedback(describeError(error));
      setSaving(false);
    }
  };

  return (
    <div aria-modal="true" className="fixed inset-0 z-[130] grid place-items-end bg-black/62 p-3 backdrop-blur-sm sm:place-items-center" role="dialog">
      <section className="max-h-[92dvh] w-full max-w-[560px] overflow-y-auto rounded-[30px] border border-[color:var(--client-line)] bg-[color:var(--client-bg)] p-4 text-[color:var(--client-text)] shadow-[0_30px_100px_rgba(0,0,0,0.58)]">
        <header className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <p className="text-[11px] font-black uppercase tracking-[0.16em] text-[color:var(--client-primary)]">Card refund & NDP reversal</p>
              <TestFeatureBadge />
            </div>
            <h2 className="mt-1 text-xl font-black">会员卡退款</h2>
            <p className="mt-1 text-xs font-semibold leading-5 text-[color:var(--client-muted)]">订单款项已完成正式退款后，恢复本次卡消费，并处理对应返点与平台费。</p>
          </div>
          <button aria-label="关闭会员卡退款" className={cn(panel, "grid h-10 w-10 shrink-0 place-items-center text-lg font-black")} onClick={onClose} type="button">×</button>
        </header>

        <div className="mt-4 space-y-3">
          <section className={cn(panel, "p-4")}>
            <div className="flex items-start justify-between gap-3">
              <div><strong className="block text-sm">{redemption.order.serviceName}</strong><p className="mt-1 text-xs font-bold text-[color:var(--client-muted)]">{redemption.order.orderNo} · {redemption.customer.displayName}</p></div>
              <span className="rounded-full bg-[color:var(--client-primary-soft)] px-3 py-1 text-[10px] font-black text-[color:var(--client-primary)]">订单已退款</span>
            </div>
          </section>

          <section className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div className={cn(panel, "p-4")}><p className="text-[10px] font-black text-[color:var(--client-muted)]">卡内恢复</p><strong className="mt-1 block text-sm leading-6">{restoration(redemption)}</strong></div>
            <div className={cn(panel, "p-4")}><p className="text-[10px] font-black text-[color:var(--client-muted)]">店铺钱包回补</p><strong className="mt-1 block text-sm">{redemption.rewardStatus === "paid" ? `+${redemption.totalShopDebitNdp.toLocaleString()} NDP` : "无需钱包冲正"}</strong><p className="mt-1 text-[11px] font-semibold text-[color:var(--client-muted)]">客户返点与平台费按原记录处理</p></div>
          </section>

          {redemption.rewardStatus === "paid" ? <div className="rounded-[20px] border border-amber-500/30 bg-amber-500/10 p-4 text-xs font-bold leading-6 text-amber-500"><p>客户将扣回 {redemption.customerRewardNdp.toLocaleString()} NDP，平台将扣回 {redemption.platformFeeNdp.toLocaleString()} NDP，店铺钱包回补 {redemption.totalShopDebitNdp.toLocaleString()} NDP。</p><p className="mt-1">若客户当前余额不足，余额会显示为负数；之后获得的 NDP 会自动抵扣，不冻结账户。</p></div> : null}
          {redemption.rewardStatus === "pending_funds" ? <div className="rounded-[20px] border border-amber-500/30 bg-amber-500/10 p-4 text-xs font-bold leading-6 text-amber-500">待发放返点将直接取消，不会发生客户、平台或店铺钱包扣款。</div> : null}
          {redemption.card.status !== "active" ? <p className="rounded-[18px] border border-[color:var(--client-line)] px-4 py-3 text-xs font-bold leading-5 text-[color:var(--client-muted)]">该卡当前为非有效状态。退款只恢复原消费，不会自动解冻、续期或重新启用会员卡。</p> : null}

          <label className="block">
            <span className="text-xs font-black">退款原因</span>
            <textarea className={cn(panel, "mt-2 min-h-24 w-full resize-y px-4 py-3 text-sm font-semibold outline-none focus:border-[color:var(--client-primary)]")} maxLength={500} onChange={(event) => { setReason(event.target.value); setFeedback(""); }} value={reason} />
            <span className="mt-1 block text-right text-[10px] font-bold text-[color:var(--client-muted)]">{reason.trim().length} / 500</span>
          </label>
          {feedback ? <p className="text-sm font-bold text-red-500" role="alert">{feedback}</p> : null}
        </div>

        <footer className="mt-5 flex gap-2">
          <button className={cn(panel, "min-h-12 flex-1 text-sm font-black")} disabled={saving} onClick={onClose} type="button">取消</button>
          <button className="inline-flex min-h-12 flex-[1.6] items-center justify-center gap-2 rounded-[20px] bg-[color:var(--client-primary)] px-4 text-sm font-black text-[color:var(--client-primary-contrast)] disabled:opacity-40" disabled={!valid || saving} onClick={() => void submit()} type="button">{saving ? "退款处理中" : "确认退卡并冲正"}<TestFeatureBadge className="border-white/35" /></button>
        </footer>
      </section>
    </div>
  );
}
