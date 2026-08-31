import { useState } from "react";
import { ApiClientError } from "../../api/httpClient";
import { TestFeatureBadge } from "../../components/ui/TestFeatureBadge";
import { cn } from "../../lib/utils";
import {
  merchantShopMembershipApi,
  type MerchantShopMembershipCard,
  type ShopMembershipCardAdjustment
} from "./api";
import {
  buildCardAdjustmentAttempt,
  createCardAdjustmentEditor,
  type CardAdjustmentAttempt
} from "./cardAdjustmentModel";

const inset = "rounded-[20px] border border-[color:color-mix(in_srgb,var(--client-line)_68%,transparent)] bg-[color:color-mix(in_srgb,var(--client-elevated)_76%,transparent)]";
const field = "min-h-12 w-full rounded-[17px] border border-[color:var(--client-line)] bg-[color:var(--client-bg)] px-4 text-sm font-bold text-[color:var(--client-text)] outline-none focus:border-[color:var(--client-primary)]";

type Props = {
  card: MerchantShopMembershipCard;
  onClose: () => void;
  onSubmitted: (request: ShopMembershipCardAdjustment) => void;
};

function formatValue(card: MerchantShopMembershipCard, value: number) {
  return card.type === "stored_value"
    ? new Intl.NumberFormat("ja-JP", { style: "currency", currency: "JPY", maximumFractionDigits: 0 }).format(value)
    : `${value.toLocaleString()} 次`;
}

function describeError(error: unknown) {
  if (error instanceof ApiClientError) {
    if (error.status === 403) return "当前账号没有申请调整的权限";
    if (error.status === 404) return "会员卡不存在或不属于当前店铺";
    if (error.status === 409) return "已有待确认申请，或会员卡状态已经变化";
  }
  if (error instanceof Error) {
    if (error.message === "unchanged") return "调整后数值必须与当前值不同";
    if (error.message === "reason") return "请填写 1–500 字的调整原因";
    if (error.message === "value") return "请输入不小于 0 的整数";
    if (error.message === "state" || error.message === "type") return "当前会员卡不支持这次调整";
  }
  return "调整申请未提交，请检查内容或网络后重试";
}

export function CardAdjustmentRequestDialog({ card, onClose, onSubmitted }: Props) {
  const [editor, setEditor] = useState(createCardAdjustmentEditor);
  const [attempt, setAttempt] = useState<CardAdjustmentAttempt | null>(null);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState("");
  const currentValue = card.type === "stored_value" ? card.principalBalanceJpy : card.remainingUses;
  const parsedTarget = /^\d+$/.test(editor.targetValue.trim()) ? Number(editor.targetValue.trim()) : null;

  const submit = async () => {
    setSaving(true);
    setFeedback("");
    try {
      const nextAttempt = buildCardAdjustmentAttempt(
        attempt,
        card,
        editor,
        () => globalThis.crypto.randomUUID()
      );
      setAttempt(nextAttempt);
      onSubmitted(await merchantShopMembershipApi.requestCardAdjustment(card.publicId, nextAttempt.request));
    } catch (error) {
      setFeedback(describeError(error));
    } finally {
      setSaving(false);
    }
  };

  return <div aria-modal="true" className="fixed inset-0 z-[140] grid place-items-end bg-black/64 p-2 backdrop-blur-sm sm:place-items-center sm:p-4" role="dialog">
    <section className="max-h-[94dvh] w-full max-w-[620px] overflow-y-auto rounded-[32px] border border-[color:var(--client-line)] bg-[color:var(--client-bg)] p-4 text-[color:var(--client-text)] shadow-[0_30px_100px_rgba(0,0,0,0.58)] sm:p-5">
      <header className="flex items-start justify-between gap-3">
        <div><div className="flex items-center gap-2"><p className="text-[11px] font-black uppercase tracking-[0.16em] text-[color:var(--client-primary)]">Card correction request</p><TestFeatureBadge /></div><h2 className="mt-1 text-xl font-black">申请调整会员卡</h2><p className="mt-1 text-xs font-semibold leading-5 text-[color:var(--client-muted)]">提交最终目标值；客户明确同意后才会生效。</p></div>
        <button aria-label="关闭调整申请" className={cn(inset, "grid h-10 w-10 shrink-0 place-items-center text-lg font-black")} onClick={onClose} type="button">×</button>
      </header>

      <section className={cn(inset, "mt-4 p-4")}>
        <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-bold text-[color:var(--client-muted)]">{card.customerDisplayName} · {card.customerNeedoId}</p><h3 className="mt-1 text-base font-black">{card.name}</h3><p className="mt-1 font-mono text-[11px] font-bold text-[color:var(--client-muted)]">{card.cardNoMasked}</p></div><span className="rounded-full bg-[color:var(--client-primary-soft)] px-3 py-1 text-[11px] font-black text-[color:var(--client-primary)]">{card.type === "stored_value" ? "储值本金" : "剩余次数"}</span></div>
        <div className="mt-4 grid grid-cols-[1fr_auto_1fr] items-center gap-2"><div className="rounded-[17px] border border-[color:var(--client-line)] bg-[color:var(--client-bg)] p-3"><p className="text-[10px] font-black text-[color:var(--client-muted)]">当前值</p><strong className="mt-1 block text-lg font-black">{currentValue === null ? "—" : formatValue(card, currentValue)}</strong></div><span aria-hidden="true" className="text-xl font-black text-[color:var(--client-primary)]">→</span><div className="rounded-[17px] border border-[color:color-mix(in_srgb,var(--client-primary)_48%,var(--client-line))] bg-[color:var(--client-primary-soft)] p-3"><p className="text-[10px] font-black text-[color:var(--client-primary)]">调整后</p><strong className="mt-1 block text-lg font-black">{parsedTarget === null ? "待填写" : formatValue(card, parsedTarget)}</strong></div></div>
        {card.type === "stored_value" && (card.bonusBalanceJpy ?? 0) > 0 ? <p className="mt-3 text-[11px] font-semibold text-[color:var(--client-muted)]">本次只调整本金，现有赠送余额 {formatValue(card, card.bonusBalanceJpy ?? 0)} 不变。</p> : null}
      </section>

      {feedback ? <p className={cn(inset, "mt-3 px-4 py-3 text-sm font-bold text-red-500")} role="alert">{feedback}</p> : null}
      <div className="mt-4 space-y-3"><label className="block"><span className="mb-1.5 block text-xs font-black text-[color:var(--client-muted)]">调整后最终{card.type === "stored_value" ? "金额（JPY）" : "次数"}</span><input aria-label="调整后" className={field} inputMode="numeric" onChange={(event) => setEditor((current) => ({ ...current, targetValue: event.target.value }))} placeholder="请输入最终值" value={editor.targetValue} /></label><label className="block"><span className="mb-1.5 block text-xs font-black text-[color:var(--client-muted)]">调整原因</span><textarea className={cn(field, "min-h-24 resize-y py-3 leading-6")} maxLength={500} onChange={(event) => setEditor((current) => ({ ...current, reason: event.target.value }))} placeholder="说明线下付款、历史漏记或其他可核对原因" value={editor.reason} /></label></div>

      <aside className="mt-4 rounded-[20px] border border-[color:color-mix(in_srgb,var(--client-primary)_38%,var(--client-line))] bg-[color:var(--client-primary-soft)] p-4"><div className="flex gap-3"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[color:var(--client-primary)] text-sm font-black text-[color:var(--client-primary-contrast)]">72</span><div><strong className="text-sm font-black">客户需在 72 小时内决定</strong><p className="mt-1 text-xs font-semibold leading-5 text-[color:var(--client-muted)]">未处理会自动失效，不会自动同意。本次调整不产生 NDP，也不触发返点平台费。</p></div></div></aside>

      <footer className="sticky bottom-0 -mx-4 mt-4 flex items-center justify-between gap-3 border-t border-[color:var(--client-line)] bg-[color:color-mix(in_srgb,var(--client-bg)_94%,transparent)] px-4 pb-1 pt-4 backdrop-blur-xl sm:-mx-5 sm:px-5"><button className="min-h-11 rounded-full border border-[color:var(--client-line)] px-5 text-sm font-black" onClick={onClose} type="button">取消</button><button className="min-h-12 rounded-full bg-[color:var(--client-primary)] px-6 text-sm font-black text-[color:var(--client-primary-contrast)] disabled:opacity-40" disabled={saving} onClick={() => void submit()} type="button">{saving ? "提交中" : "提交给客户确认"}</button></footer>
    </section>
  </div>;
}
