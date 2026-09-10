import { useState } from "react";
import { ApiClientError } from "../../api/httpClient";
import { TestFeatureBadge } from "../../components/ui/TestFeatureBadge";
import { cn } from "../../lib/utils";
import {
  merchantShopMembershipApi,
  type MerchantShopMembershipCard,
  type ShopMembershipCardTopUp
} from "./api";
import {
  buildCardTopUpAttempt,
  createCardTopUpEditor,
  type CardTopUpAttempt
} from "./cardTopUpModel";

const inset = "rounded-[20px] border border-[color:color-mix(in_srgb,var(--client-line)_68%,transparent)] bg-[color:color-mix(in_srgb,var(--client-elevated)_76%,transparent)]";
const field = "min-h-12 w-full rounded-[17px] border border-[color:var(--client-line)] bg-[color:var(--client-bg)] px-4 text-sm font-bold text-[color:var(--client-text)] outline-none focus:border-[color:var(--client-primary)]";

type Props = {
  card: MerchantShopMembershipCard;
  onClose: () => void;
  onCompleted: (topUp: ShopMembershipCardTopUp) => void;
};

function formatJpy(value: number) {
  return new Intl.NumberFormat("ja-JP", { currency: "JPY", maximumFractionDigits: 0, style: "currency" }).format(value);
}

function describeError(error: unknown) {
  if (error instanceof ApiClientError) {
    if (error.status === 403) return "当前账号没有会员卡充值权限";
    if (error.status === 404) return "会员卡不存在或不属于当前店铺";
    if (error.status === 409) return "会员卡状态、待确认调整或余额已变化，请刷新后重试";
  }
  if (error instanceof Error) {
    if (error.message === "amount") return "请输入 1–10,000,000 的整数金额";
    if (error.message === "evidence") return "请填写收款凭证或备注，作为线下收款依据";
    if (error.message === "pending") return "这张卡有待客户确认的调整，暂时不能充值";
    if (error.message === "state" || error.message === "type") return "当前会员卡不支持充值";
  }
  return "充值未提交，请检查内容或网络后重试";
}

export function CardTopUpDialog({ card, onClose, onCompleted }: Props) {
  const [editor, setEditor] = useState(createCardTopUpEditor);
  const [attempt, setAttempt] = useState<CardTopUpAttempt | null>(null);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState("");
  const amount = /^\d+$/.test(editor.amountJpy.trim()) ? Number(editor.amountJpy.trim()) : 0;
  const before = card.principalBalanceJpy ?? 0;

  const submit = async () => {
    setSaving(true);
    setFeedback("");
    try {
      const nextAttempt = buildCardTopUpAttempt(attempt, card, editor, () => globalThis.crypto.randomUUID());
      setAttempt(nextAttempt);
      onCompleted(await merchantShopMembershipApi.topUpCard(card.publicId, nextAttempt.request));
    } catch (error) {
      setFeedback(describeError(error));
    } finally {
      setSaving(false);
    }
  };

  return <div aria-modal="true" className="fixed inset-0 z-[145] grid place-items-end bg-black/64 p-2 backdrop-blur-sm sm:place-items-center sm:p-4" role="dialog">
    <section className="max-h-[94dvh] w-full max-w-[620px] overflow-y-auto rounded-[32px] border border-[color:var(--client-line)] bg-[color:var(--client-bg)] p-4 text-[color:var(--client-text)] shadow-[0_30px_100px_rgba(0,0,0,0.58)] sm:p-5">
      <header className="flex items-start justify-between gap-3">
        <div><div className="flex items-center gap-2"><p className="text-[11px] font-black uppercase tracking-[0.16em] text-[color:var(--client-primary)]">Offline top-up</p><TestFeatureBadge /></div><h2 className="mt-1 text-xl font-black">会员卡充值</h2><p className="mt-1 text-xs font-semibold leading-5 text-[color:var(--client-muted)]">确认已在线下收款后，按实际收款金额增加会员卡本金。</p></div>
        <button aria-label="关闭会员卡充值" className={cn(inset, "grid h-10 w-10 shrink-0 place-items-center text-lg font-black")} onClick={onClose} type="button">×</button>
      </header>

      <section className={cn(inset, "mt-4 p-4")}>
        <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-bold text-[color:var(--client-muted)]">{card.customerDisplayName} · {card.customerNeedoId}</p><h3 className="mt-1 text-base font-black">{card.name}</h3><p className="mt-1 font-mono text-[11px] font-bold text-[color:var(--client-muted)]">{card.cardNoMasked}</p></div><span className="rounded-full bg-[color:var(--client-primary-soft)] px-3 py-1 text-[11px] font-black text-[color:var(--client-primary)]">立即到账</span></div>
        <div className="mt-4 grid grid-cols-[1fr_auto_1fr] items-center gap-2"><div className="rounded-[17px] border border-[color:var(--client-line)] bg-[color:var(--client-bg)] p-3"><p className="text-[10px] font-black text-[color:var(--client-muted)]">充值前本金</p><strong className="mt-1 block text-lg font-black">{formatJpy(before)}</strong></div><span aria-hidden="true" className="text-xl font-black text-[color:var(--client-primary)]">＋</span><div className="rounded-[17px] border border-[color:color-mix(in_srgb,var(--client-primary)_48%,var(--client-line))] bg-[color:var(--client-primary-soft)] p-3"><p className="text-[10px] font-black text-[color:var(--client-primary)]">充值后本金</p><strong className="mt-1 block text-lg font-black">{formatJpy(before + amount)}</strong></div></div>
      </section>

      {feedback ? <p className={cn(inset, "mt-3 px-4 py-3 text-sm font-bold text-red-500")} role="alert">{feedback}</p> : null}
      <div className="mt-4 grid gap-3 sm:grid-cols-2"><label className="block"><span className="mb-1.5 block text-xs font-black text-[color:var(--client-muted)]">实际收款金额（JPY）</span><input aria-label="实际收款金额" className={field} inputMode="numeric" onChange={(event) => setEditor((current) => ({ ...current, amountJpy: event.target.value }))} placeholder="例如 5000" value={editor.amountJpy} /></label><label className="block"><span className="mb-1.5 block text-xs font-black text-[color:var(--client-muted)]">收款方式</span><select aria-label="收款方式" className={field} onChange={(event) => setEditor((current) => ({ ...current, paymentMethod: event.target.value as typeof current.paymentMethod }))} value={editor.paymentMethod}><option value="cash">现金</option><option value="card">银行卡</option><option value="paypay">PayPay</option><option value="bank_transfer">银行转账</option><option value="other">其他</option></select></label></div>
      <div className="mt-3 space-y-3"><label className="block"><span className="mb-1.5 block text-xs font-black text-[color:var(--client-muted)]">收款凭证</span><input aria-label="收款凭证" className={field} maxLength={160} onChange={(event) => setEditor((current) => ({ ...current, paymentReference: event.target.value }))} placeholder="收据号、POS 交易号或转账流水号" value={editor.paymentReference} /></label><label className="block"><span className="mb-1.5 block text-xs font-black text-[color:var(--client-muted)]">备注</span><textarea className={cn(field, "min-h-24 resize-y py-3 leading-6")} maxLength={500} onChange={(event) => setEditor((current) => ({ ...current, note: event.target.value }))} placeholder="未填写凭证时，必须说明可核对的线下收款情况" value={editor.note} /></label></div>

      <aside className="mt-4 rounded-[20px] border border-[color:color-mix(in_srgb,var(--client-primary)_38%,var(--client-line))] bg-[color:var(--client-primary-soft)] p-4"><strong className="text-sm font-black">只增加已收款本金，不会产生 NDP</strong><p className="mt-1 text-xs font-semibold leading-5 text-[color:var(--client-muted)]">提交后立即到账并写入不可修改的充值、审计与客户通知记录；不增加赠送余额，不触发返点或平台费。</p></aside>

      <footer className="sticky bottom-0 -mx-4 mt-4 flex items-center justify-between gap-3 border-t border-[color:var(--client-line)] bg-[color:color-mix(in_srgb,var(--client-bg)_94%,transparent)] px-4 pb-1 pt-4 backdrop-blur-xl sm:-mx-5 sm:px-5"><button className="min-h-11 rounded-full border border-[color:var(--client-line)] px-5 text-sm font-black" onClick={onClose} type="button">取消</button><button className="min-h-12 rounded-full bg-[color:var(--client-primary)] px-6 text-sm font-black text-[color:var(--client-primary-contrast)] disabled:opacity-40" disabled={saving} onClick={() => void submit()} type="button">{saving ? "充值中" : "确认充值"}</button></footer>
    </section>
  </div>;
}
