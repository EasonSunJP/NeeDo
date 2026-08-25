import { useEffect, useMemo, useState } from "react";
import { merchantSaasBillingApi, type FreePeriod, type SaasInvoice } from "../../api/merchantSaasBilling";
import { ApiClientError } from "../../api/httpClient";
import {
  formatFreeDuration,
  formatJpy,
  isMerchantGroup,
  type BillingCadence,
  type MerchantAccountCard,
  type PaymentProviderType,
  type PaymentResponsibility
} from "../../features/merchant-saas-billing/model";
import { useI18n } from "../../i18n/I18nProvider";
import { languageLocales } from "../../i18n/translations";
import { translateMerchantBillingText } from "../../features/merchant-saas-billing/i18n";
import { Button } from "../ui/Button";

const fieldClass = "focus-ring h-10 w-full rounded-lg border border-line bg-white px-3 text-sm font-semibold text-ink outline-none disabled:bg-paper disabled:text-ink/45";

function isoFromDateInput(value: string) {
  return value ? new Date(`${value}T00:00:00+09:00`).toISOString() : undefined;
}

function todayInputValue() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

function errorMessage(error: unknown) {
  return error instanceof ApiClientError || error instanceof Error ? error.message : "error.api";
}

function freePeriodLabel(periodType: string) {
  if (periodType === "admin_extension") return "人工追加";
  if (periodType === "late_month_bonus") return "首月不足 15 天补偿";
  if (periodType === "manual_free") return "人工免费期间";
  return "首次免费试用";
}

function invoiceStatusLabel(status: string) {
  if (status === "paid") return "已付款";
  if (status === "void") return "已作废";
  if (status === "overdue") return "已逾期";
  if (status === "open") return "待付款";
  return status;
}

export function MerchantBillingEditorDialog({
  card,
  open,
  onClose,
  onChanged
}: {
  card: MerchantAccountCard | null;
  open: boolean;
  onClose: () => void;
  onChanged: () => Promise<void> | void;
}) {
  const { language } = useI18n();
  const t = (source: string) => translateMerchantBillingText(source, language);
  const [cadence, setCadence] = useState<BillingCadence>("monthly");
  const [monthlyFeeJpy, setMonthlyFeeJpy] = useState(9_800);
  const [cadenceLocked, setCadenceLocked] = useState(false);
  const [amountLocked, setAmountLocked] = useState(false);
  const [paymentProvider, setPaymentProvider] = useState<PaymentProviderType>("manual");
  const [responsibility, setResponsibility] = useState<PaymentResponsibility>("group_consolidated");
  const [responsibilityDate, setResponsibilityDate] = useState(todayInputValue());
  const [periods, setPeriods] = useState<FreePeriod[]>([]);
  const [invoices, setInvoices] = useState<SaasInvoice[]>([]);
  const [extensionKind, setExtensionKind] = useState<"months" | "days" | "paidFrom">("months");
  const [quickMonths, setQuickMonths] = useState<1 | 2 | 3>(1);
  const [extensionDays, setExtensionDays] = useState(1);
  const [paidFrom, setPaidFrom] = useState("");
  const [trialReason, setTrialReason] = useState("");
  const [interruptReason, setInterruptReason] = useState("");
  const [paymentReference, setPaymentReference] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (!open || !card) return;
    setCadence(card.type === "single_shop" ? "free" : card.billing.cadence);
    setMonthlyFeeJpy(card.billing.monthlyFeeJpy);
    setCadenceLocked(card.billing.cadenceLocked);
    setAmountLocked(card.billing.amountLocked);
    setPaymentProvider(card.billing.paymentProvider);
    setResponsibility(isMerchantGroup(card) ? card.paymentResponsibility : "group_consolidated");
    setError("");
    setNotice("");
    setTrialReason("");
    setInterruptReason("");
    setPaymentReference("");
    setPaidFrom("");

    Promise.all([
      merchantSaasBillingApi.listFreePeriods(card.billing.subjectType, card.billing.subjectId),
      merchantSaasBillingApi.listInvoices(card.billing.subjectType)
    ]).then(([freePeriods, invoicePage]) => {
      setPeriods(freePeriods.list);
      setInvoices(invoicePage.list.filter((invoice) => invoice.payerId === card.billing.subjectId));
    }).catch((requestError) => {
      setError(errorMessage(requestError));
    });
  }, [card, open]);

  const payableInvoice = useMemo(
    () => invoices.find((invoice) => !["paid", "void"].includes(invoice.status)),
    [invoices]
  );

  if (!open || !card) return null;

  const singleShop = card.type === "single_shop";
  const annualFeeJpy = monthlyFeeJpy * 10;
  const locale = languageLocales[language];
  const run = async (operation: () => Promise<unknown>, success: string, closeAfter = false) => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await operation();
      setNotice(success);
      await onChanged();
      if (closeAfter) onClose();
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setBusy(false);
    }
  };

  const saveBilling = () => run(
    () => merchantSaasBillingApi.updateBillingProfile(card.billing.subjectType, card.billing.subjectId, {
      amountLocked: singleShop ? false : amountLocked,
      billingCadence: singleShop ? "free" : cadence,
      cadenceLocked: singleShop ? false : cadenceLocked,
      monthlyFeeJpy,
      paymentProvider,
      version: card.billing.version
    }),
    t("计费设置已保存"),
    true
  );

  const saveResponsibility = () => {
    if (!isMerchantGroup(card)) return;
    return run(
      () => merchantSaasBillingApi.updatePaymentResponsibility(card.id, responsibility, isoFromDateInput(responsibilityDate)),
      t("付费责任已更新"),
      true
    );
  };

  const extendTrial = () => run(
    () => merchantSaasBillingApi.extendTrial(card.billing.subjectType, card.billing.subjectId, {
      ...(extensionKind === "months" ? { quickMonths } : {}),
      ...(extensionKind === "days" ? { days: extensionDays } : {}),
      ...(extensionKind === "paidFrom" ? { paidFrom: isoFromDateInput(paidFrom) } : {}),
      reason: trialReason,
      version: card.billing.version
    }),
    t("试用期限已追加"),
    true
  );

  const interruptTrial = () => run(
    () => merchantSaasBillingApi.interruptTrial(card.billing.subjectType, card.billing.subjectId, interruptReason, card.billing.version),
    t("免费试用已人工解除，之后不会再次开启"),
    true
  );

  const confirmPayment = () => {
    if (!payableInvoice) return;
    return run(
      () => merchantSaasBillingApi.reviewManualPayment(payableInvoice.id, {
        amountJpy: payableInvoice.amountJpy,
        idempotencyKey: `manual-${payableInvoice.id}-${Date.now()}`,
        receivedAt: new Date().toISOString(),
        reference: paymentReference
      }),
      t("人工收款已确认"),
      true
    );
  };

  return (
    <div aria-modal="true" className="fixed inset-0 z-[130] flex items-center justify-center bg-ink/45 p-4 backdrop-blur-sm" role="dialog">
      <section className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-line bg-paper shadow-[0_30px_90px_rgba(16,26,20,0.28)]">
        <header className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-line bg-white/95 px-5 py-4 backdrop-blur">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.2em] text-moss">SaaS Billing</p>
            <h2 className="mt-1 text-xl font-black">{card.name} · {t("计费与试用")}</h2>
          </div>
          <Button disabled={busy} size="sm" variant="ghost" onClick={onClose}>{t("关闭")}</Button>
        </header>

        <div className="space-y-4 p-5">
          {error ? <p className="rounded-lg border border-coral/35 bg-coral/10 px-3 py-2 text-sm font-bold text-coral">{t(error)}</p> : null}
          {notice ? <p className="rounded-lg border border-moss/30 bg-mint/15 px-3 py-2 text-sm font-bold text-[#2f6846]">{notice}</p> : null}

          <section className="rounded-xl border border-line bg-white p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="font-black">{t("账户类型与计费")}</h3>
                <p className="mt-1 text-xs leading-5 text-ink/50">
                  {singleShop ? t("1 名技师店铺永久免费；类型按有效技师数量自动判定。") : t("店铺类型按有效技师数量自动判定，不能人工锁定。")}
                </p>
              </div>
              <span className="rounded-lg bg-paper px-3 py-2 text-xs font-black">
                {t(isMerchantGroup(card) ? "商家" : singleShop ? "单人店铺" : "店铺")}
              </span>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <label className="text-xs font-bold text-ink/60">
                {t("付费类型")}
                <select className={`${fieldClass} mt-1`} disabled={singleShop} value={singleShop ? "free" : cadence} onChange={(event) => setCadence(event.target.value as BillingCadence)}>
                  <option value="monthly">{t("月费")}</option>
                  <option value="annual">{t("年费")}</option>
                  <option value="free">{t("免费")}</option>
                </select>
              </label>
              <label className="text-xs font-bold text-ink/60">
                {t("月费金额（日元）")}
                <input className={`${fieldClass} mt-1`} disabled={singleShop || cadence === "free"} min="0" step="100" type="number" value={monthlyFeeJpy} onChange={(event) => setMonthlyFeeJpy(Number(event.target.value))} />
              </label>
              <label className="text-xs font-bold text-ink/60">
                {t("支付接口")}
                <select className={`${fieldClass} mt-1`} value={paymentProvider} onChange={(event) => setPaymentProvider(event.target.value as PaymentProviderType)}>
                  <option value="manual">{t("人工审核")}</option>
                  <option value="stripe">Stripe</option>
                </select>
              </label>
            </div>
            <div className="mt-3 rounded-lg bg-paper px-3 py-2 text-sm font-semibold text-ink/65">
              {t("年费 = 月费 × 10，服务有效期为连续 12 个自然月")} · <strong className="text-ink">{formatJpy(annualFeeJpy, language)}</strong>
            </div>
            <div className="mt-3 flex flex-wrap gap-4 text-sm font-bold">
              <label className="flex items-center gap-2"><input checked={cadenceLocked} disabled={singleShop} type="checkbox" onChange={(event) => setCadenceLocked(event.target.checked)} />{t("人工锁定付费模式")}</label>
              <label className="flex items-center gap-2"><input checked={amountLocked} disabled={singleShop} type="checkbox" onChange={(event) => setAmountLocked(event.target.checked)} />{t("人工锁定金额")}</label>
            </div>
            <div className="mt-4 flex justify-end"><Button disabled={busy} onClick={saveBilling}>{t("保存计费设置")}</Button></div>
          </section>

          {isMerchantGroup(card) ? (
            <section className="rounded-xl border border-line bg-white p-4">
              <h3 className="font-black">{t("集团付费责任")}</h3>
              <p className="mt-1 text-xs text-ink/50">{t("变更只影响生效日后的账单，不改写历史账单。")}</p>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <label className="text-xs font-bold text-ink/60">{t("付费责任")}
                  <select className={`${fieldClass} mt-1`} value={responsibility} onChange={(event) => setResponsibility(event.target.value as PaymentResponsibility)}>
                    <option value="group_consolidated">{t("集团统一付费（集团 + 所有需付费店铺）")}</option>
                    <option value="shops_individual">{t("集团与各店铺分别付费")}</option>
                  </select>
                </label>
                <label className="text-xs font-bold text-ink/60">{t("生效日")}
                  <input className={`${fieldClass} mt-1`} type="date" value={responsibilityDate} onChange={(event) => setResponsibilityDate(event.target.value)} />
                </label>
              </div>
              <p className="mt-3 text-sm font-black text-ink">{t("当前集团合计月费")}：{formatJpy(card.consolidatedMonthlyTotalJpy, language)}</p>
              <div className="mt-3 flex justify-end"><Button disabled={busy} variant="secondary" onClick={saveResponsibility}>{t("更新付费责任")}</Button></div>
            </section>
          ) : null}

          {!singleShop ? (
            <section className="rounded-xl border border-line bg-white p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="font-black">{t("免费试用记录")}</h3>
                  <p className="mt-1 text-xs text-ink/50">{t("追加最小单位为日，人工追加最多 3 次；系统首月补足 15 天不计入次数。")}</p>
                </div>
                <div className="text-right text-xs font-bold text-ink/55">
                  <p>{t("累计免费时间")} {formatFreeDuration(card.billing.freeDuration, language)}</p>
                  <p className="mt-1">{t("人工追加次数")} {card.billing.extensionCount}/3</p>
                </div>
              </div>
              <div className="mt-3 max-h-28 space-y-2 overflow-y-auto rounded-lg bg-paper p-3">
                {periods.length ? periods.map((period) => (
                  <div className="flex flex-wrap justify-between gap-2 text-xs" key={period.id}>
                    <span className="font-bold">{t(freePeriodLabel(period.periodType))}{period.extensionSequence ? ` #${period.extensionSequence}` : ""}</span>
                    <span className="text-ink/55">{new Date(period.startsAt).toLocaleDateString(locale)} → {period.endsAt ? new Date(period.endsAt).toLocaleDateString(locale) : t("至今")}</span>
                  </div>
                )) : <p className="text-xs text-ink/45">{t("暂无免费期限记录")}</p>}
              </div>

              {card.billing.trialStatus === "active" ? (
                <div className="mt-4 border-t border-line pt-4">
                  <div className="flex flex-wrap gap-2">
                    {([1, 2, 3] as const).map((months) => <Button key={months} size="sm" variant={extensionKind === "months" && quickMonths === months ? "primary" : "secondary"} onClick={() => { setExtensionKind("months"); setQuickMonths(months); }}>+{months}{t("个月")}</Button>)}
                    <Button size="sm" variant={extensionKind === "days" ? "primary" : "secondary"} onClick={() => setExtensionKind("days")}>{t("按日追加")}</Button>
                    <Button size="sm" variant={extensionKind === "paidFrom" ? "primary" : "secondary"} onClick={() => setExtensionKind("paidFrom")}>{t("选择开始付费日")}</Button>
                  </div>
                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    {extensionKind === "days" ? <label className="text-xs font-bold text-ink/60">{t("追加天数")}<input className={`${fieldClass} mt-1`} min="1" type="number" value={extensionDays} onChange={(event) => setExtensionDays(Math.max(1, Number(event.target.value)))} /></label> : null}
                    {extensionKind === "paidFrom" ? <label className="text-xs font-bold text-ink/60">{t("开始付费日")}<input className={`${fieldClass} mt-1`} min={todayInputValue()} type="date" value={paidFrom} onChange={(event) => setPaidFrom(event.target.value)} /></label> : null}
                    <label className={`text-xs font-bold text-ink/60 ${extensionKind === "months" ? "md:col-span-2" : ""}`}>{t("追加理由")}<input className={`${fieldClass} mt-1`} maxLength={500} value={trialReason} onChange={(event) => setTrialReason(event.target.value)} /></label>
                  </div>
                  <div className="mt-3 flex flex-wrap justify-between gap-2">
                    <div className="flex min-w-[260px] flex-1 gap-2">
                      <input aria-label={t("解除试用理由（解除后不可恢复）")} className={fieldClass} maxLength={500} value={interruptReason} onChange={(event) => setInterruptReason(event.target.value)} />
                      <Button className="whitespace-nowrap" disabled={busy || !interruptReason.trim()} size="sm" variant="danger" onClick={interruptTrial}>{t("解除试用")}</Button>
                    </div>
                    <Button disabled={busy || card.billing.extensionCount >= 3 || !trialReason.trim() || (extensionKind === "paidFrom" && !paidFrom)} onClick={extendTrial}>{t("确认追加")}</Button>
                  </div>
                </div>
              ) : <p className="mt-3 rounded-lg bg-paper px-3 py-2 text-xs font-bold text-ink/55">{t("试用不在进行中；中断或使用完毕后不会再次自动开启。")}</p>}
            </section>
          ) : null}

          {paymentProvider === "manual" ? (
            <section className="rounded-xl border border-line bg-white p-4">
              <h3 className="font-black">{t("人工收款审核")}</h3>
              {payableInvoice ? (
                <div className="mt-3 grid gap-3 md:grid-cols-[1fr,1fr,auto] md:items-end">
                  <div className="rounded-lg bg-paper px-3 py-2 text-sm">
                    <p className="text-xs font-bold text-ink/45">{payableInvoice.invoiceNo} · {payableInvoice.status}</p>
                    <strong className="mt-1 block">{formatJpy(payableInvoice.amountJpy, language)}</strong>
                  </div>
                  <label className="text-xs font-bold text-ink/60">{t("收款凭证编号")}<input className={`${fieldClass} mt-1`} value={paymentReference} onChange={(event) => setPaymentReference(event.target.value)} /></label>
                  <Button disabled={busy || !paymentReference.trim()} onClick={confirmPayment}>{t("确认已收款")}</Button>
                </div>
              ) : <p className="mt-2 text-sm text-ink/50">{t("当前没有待审核账单")}</p>}
            </section>
          ) : (
            <section className="rounded-xl border border-sky/30 bg-sky/10 p-4 text-sm font-semibold text-ink/65">
              <strong className="text-ink">Stripe</strong> · {t("已切换为支付接口模式；正式密钥与 Webhook 上线时配置。")}
            </section>
          )}

          <section className="rounded-xl border border-line bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="font-black">{t("历史付费记录")}</h3>
                <p className="mt-1 text-xs text-ink/50">{t("按账单列出应付金额、计费期间与实际收款记录。")}</p>
              </div>
              <span className="rounded-full bg-paper px-3 py-1 text-xs font-black text-ink/55">{invoices.length} {t("条记录")}</span>
            </div>
            {invoices.length ? (
              <div className="mt-3 overflow-x-auto rounded-lg border border-line">
                <table className="w-full min-w-[720px] border-collapse text-left text-xs">
                  <thead className="bg-paper text-ink/50">
                    <tr>
                      <th className="px-3 py-2 font-black">{t("账单编号")}</th>
                      <th className="px-3 py-2 font-black">{t("计费期间")}</th>
                      <th className="px-3 py-2 font-black">{t("应付金额")}</th>
                      <th className="px-3 py-2 font-black">{t("账单状态")}</th>
                      <th className="px-3 py-2 font-black">{t("付款记录")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {invoices.map((invoice) => (
                      <tr className="align-top" key={invoice.id}>
                        <td className="px-3 py-3 font-black text-ink">{invoice.invoiceNo}</td>
                        <td className="whitespace-nowrap px-3 py-3 text-ink/60">
                          {new Date(invoice.periodStartsAt).toLocaleDateString(locale)} → {new Date(invoice.periodEndsAt).toLocaleDateString(locale)}
                        </td>
                        <td className="whitespace-nowrap px-3 py-3 font-black">{formatJpy(invoice.amountJpy, language)}</td>
                        <td className="px-3 py-3">
                          <span className="rounded-full bg-paper px-2 py-1 font-black text-ink/65">{t(invoiceStatusLabel(invoice.status))}</span>
                        </td>
                        <td className="px-3 py-3">
                          {invoice.payments.length ? (
                            <div className="space-y-2">
                              {invoice.payments.map((payment) => (
                                <div key={payment.id}>
                                  <p className="font-black text-ink">{formatJpy(payment.amountJpy, language)} · {payment.provider === "manual" ? t("人工审核") : "Stripe"}</p>
                                  <p className="mt-0.5 text-ink/50">
                                    {new Date(payment.receivedAt).toLocaleString(locale)}
                                    {payment.externalReference ? ` · ${payment.externalReference}` : ""}
                                  </p>
                                </div>
                              ))}
                            </div>
                          ) : <span className="text-ink/40">{t("未收款")}</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <p className="mt-3 rounded-lg bg-paper px-3 py-3 text-sm text-ink/45">{t("暂无历史付费记录")}</p>}
          </section>
        </div>
      </section>
    </div>
  );
}
