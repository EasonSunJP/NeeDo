import { useEffect, useState } from "react";
import { merchantSaasBillingApi } from "../../api/merchantSaasBilling";
import { ApiClientError } from "../../api/httpClient";
import {
  isMerchantGroup,
  type MerchantAccountCard,
  type SuspensionReasonCode,
  type SuspensionScope
} from "../../features/merchant-saas-billing/model";
import { useI18n } from "../../i18n/I18nProvider";
import { translateMerchantBillingText } from "../../features/merchant-saas-billing/i18n";
import { Button } from "../ui/Button";

const reasonOptions: Array<{ code: SuspensionReasonCode; label: string }> = [
  { code: "overdue_payment", label: "逾期未付款" },
  { code: "qualification_or_fraud", label: "资质或欺诈问题" },
  { code: "serious_service_violation", label: "严重服务违规" },
  { code: "customer_complaints", label: "客户投诉集中" },
  { code: "safety_risk", label: "安全风险" },
  { code: "account_abuse", label: "账号滥用" },
  { code: "merchant_requested_closure", label: "商户申请停业" },
  { code: "other", label: "其他" }
];

const inputClass = "focus-ring w-full rounded-lg border border-line bg-white px-3 py-2 text-sm font-semibold text-ink outline-none";

function errorMessage(error: unknown) {
  return error instanceof ApiClientError || error instanceof Error ? error.message : "error.api";
}

export function MerchantSuspensionDialog({
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
  const [reasons, setReasons] = useState<SuspensionReasonCode[]>([]);
  const [note, setNote] = useState("");
  const [scope, setScope] = useState<SuspensionScope>("subject_only");
  const [releaseReason, setReleaseReason] = useState("");
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [deleteStrategy, setDeleteStrategy] = useState<"detach_shops" | "delete_eligible_shops">("detach_shops");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open || !card) return;
    setReasons([]);
    setNote("");
    setReleaseReason("");
    setDeleteConfirmation("");
    setDeleteStrategy("detach_shops");
    setScope(isMerchantGroup(card) ? "merchant_and_shops" : "subject_only");
    setError("");
  }, [card, open]);

  if (!open || !card) return null;

  const group = isMerchantGroup(card);
  const run = async (operation: () => Promise<unknown>) => {
    setBusy(true);
    setError("");
    try {
      await operation();
      await onChanged();
      onClose();
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setBusy(false);
    }
  };

  const toggleReason = (code: SuspensionReasonCode) => {
    setReasons((current) => current.includes(code) ? current.filter((item) => item !== code) : [...current, code]);
  };

  const suspend = () => run(() => merchantSaasBillingApi.suspend(
    card.billing.subjectType,
    card.billing.subjectId,
    { note, reasonCodes: reasons, scope: group ? scope : "subject_only" }
  ));

  const release = () => {
    if (!card.suspension) return;
    return run(() => merchantSaasBillingApi.releaseSuspension(
      card.billing.subjectType,
      card.billing.subjectId,
      card.suspension!.id,
      releaseReason
    ));
  };

  const dissolve = () => run(() => group
    ? merchantSaasBillingApi.dissolveMerchant(card.id, deleteStrategy)
    : merchantSaasBillingApi.dissolveShop(card.id));

  return (
    <div aria-modal="true" className="fixed inset-0 z-[130] flex items-center justify-center bg-ink/45 p-4 backdrop-blur-sm" role="dialog">
      <section className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-line bg-paper shadow-[0_30px_90px_rgba(16,26,20,0.28)]">
        <header className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-line bg-white/95 px-5 py-4 backdrop-blur">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.2em] text-coral">Business control</p>
            <h2 className="mt-1 text-xl font-black">{card.name} · {t("营业设置")}</h2>
          </div>
          <Button disabled={busy} size="sm" variant="ghost" onClick={onClose}>{t("关闭")}</Button>
        </header>

        <div className="space-y-4 p-5">
          {error ? <p className="rounded-lg border border-coral/35 bg-coral/10 px-3 py-2 text-sm font-bold text-coral">{t(error)}</p> : null}

          <section className="rounded-xl border border-line bg-white p-4">
            <h3 className="font-black">{card.suspension ? t("解除封号") : t("人工封号")}</h3>
            <div className="mt-3 rounded-lg border border-lemon/40 bg-lemon/10 p-3 text-xs font-semibold leading-5 text-ink/65">
              <strong className="text-ink">{t("封号后的影响")}</strong>
              <p className="mt-1">{t("不禁止登录；已存在的预约和正在进行中的服务不取消。仅禁止新增排班、开放新时段和接受新预约。解除后不会自动恢复被关闭的时段。")}</p>
            </div>

            {card.suspension ? (
              <div className="mt-4">
                <p className="text-sm font-bold text-coral">{t("当前已封号")} · {card.suspension.reasonCodes.map((code) => t(reasonOptions.find((item) => item.code === code)?.label ?? code)).join("、")}</p>
                <label className="mt-3 block text-xs font-bold text-ink/60">{t("解封理由")}
                  <textarea className={`${inputClass} mt-1 min-h-24 resize-y`} maxLength={500} value={releaseReason} onChange={(event) => setReleaseReason(event.target.value)} />
                </label>
                <div className="mt-3 flex justify-end"><Button disabled={busy || !releaseReason.trim()} onClick={release}>{t("确认解封")}</Button></div>
              </div>
            ) : (
              <div className="mt-4">
                <p className="text-xs font-bold text-ink/60">{t("封号理由（可多选）")}</p>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  {reasonOptions.map((item) => (
                    <label className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm font-bold transition ${reasons.includes(item.code) ? "border-coral bg-coral/10 text-coral" : "border-line bg-paper text-ink/65"}`} key={item.code}>
                      <input checked={reasons.includes(item.code)} type="checkbox" onChange={() => toggleReason(item.code)} />
                      {t(item.label)}
                    </label>
                  ))}
                </div>

                {group ? (
                  <fieldset className="mt-4">
                    <legend className="text-xs font-bold text-ink/60">{t("集团封号范围")}</legend>
                    <label className="mt-2 flex cursor-pointer items-start gap-3 rounded-lg border border-line bg-paper p-3 text-sm">
                      <input checked={scope === "merchant_and_shops"} className="mt-1" name="suspension-scope" type="radio" onChange={() => setScope("merchant_and_shops")} />
                      <span><strong>{t("集团及旗下所有店铺封号")}</strong><small className="mt-1 block text-ink/50">{t("集团账号与当前从属店铺一并停止新增排班和预约。")}</small></span>
                    </label>
                    <label className="mt-2 flex cursor-pointer items-start gap-3 rounded-lg border border-line bg-paper p-3 text-sm">
                      <input checked={scope === "merchant_detach_shops"} className="mt-1" name="suspension-scope" type="radio" onChange={() => setScope("merchant_detach_shops")} />
                      <span><strong>{t("仅集团账号封号，店铺解除从属关系")}</strong><small className="mt-1 block text-ink/50">{t("各店铺不封号；店铺当前最高权限账号自动成为店铺管理员。")}</small></span>
                    </label>
                  </fieldset>
                ) : null}

                <label className="mt-4 block text-xs font-bold text-ink/60">{t("详细说明（必填）")}
                  <textarea className={`${inputClass} mt-1 min-h-28 resize-y`} maxLength={1000} value={note} onChange={(event) => setNote(event.target.value)} />
                </label>
                <div className="mt-3 flex justify-end"><Button disabled={busy || reasons.length === 0 || !note.trim()} variant="danger" onClick={suspend}>{t("确认人工封号")}</Button></div>
              </div>
            )}
          </section>

          <section className="rounded-xl border border-coral/30 bg-white p-4">
            <h3 className="font-black text-coral">{group ? t("解散商家") : t("删除店铺")}</h3>
            <p className="mt-1 text-xs leading-5 text-ink/55">
              {group ? t("商家可以在没有店铺时继续存在。解散时可将店铺转为独立店铺，或删除符合条件的店铺；有进行中或未完成订单的店铺不会被删除。") : t("存在进行中或未完成订单时不能删除店铺。删除使用软删除并保留审计记录。")}
            </p>
            {group ? (
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <label className="flex items-center gap-2 rounded-lg border border-line bg-paper p-3 text-sm font-bold"><input checked={deleteStrategy === "detach_shops"} name="delete-strategy" type="radio" onChange={() => setDeleteStrategy("detach_shops")} />{t("保留店铺并解除从属关系")}</label>
                <label className="flex items-center gap-2 rounded-lg border border-line bg-paper p-3 text-sm font-bold"><input checked={deleteStrategy === "delete_eligible_shops"} name="delete-strategy" type="radio" onChange={() => setDeleteStrategy("delete_eligible_shops")} />{t("同时删除符合条件的店铺")}</label>
              </div>
            ) : null}
            <label className="mt-3 block text-xs font-bold text-ink/60">{t("输入完整名称以确认")}
              <input aria-label={`${t("输入完整名称以确认")}：${card.name}`} className={`${inputClass} mt-1`} value={deleteConfirmation} onChange={(event) => setDeleteConfirmation(event.target.value)} />
            </label>
            <div className="mt-3 flex justify-end"><Button disabled={busy || deleteConfirmation !== card.name} variant="danger" onClick={dissolve}>{group ? t("确认解散") : t("确认删除")}</Button></div>
          </section>
        </div>
      </section>
    </div>
  );
}
