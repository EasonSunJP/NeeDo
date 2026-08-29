import { useEffect, useState, type FormEvent } from "react";
import type {
  CompensationProfilePreviewInput,
  EmployeeCompensationPreviewResult,
  EmployeeCompensationResult,
  TechnicianCompensationProfileInput,
} from "../../api/employeeCompensation";
import type {
  ShopFinanceNdpBearer,
  ShopFinanceWageMode,
} from "../../api/merchantFinanceRules";
import { useOptionalI18n } from "../../i18n/I18nProvider";
import { translateText } from "../../i18n/translations";
import { yen } from "../../lib/utils";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";

interface EmployeeCompensationPanelProps {
  error: string;
  loading: boolean;
  result: EmployeeCompensationResult | null;
  preview: EmployeeCompensationPreviewResult | null;
  previewing: boolean;
  saving: boolean;
  onRetry: () => void;
  onSave: (input: TechnicianCompensationProfileInput) => Promise<void>;
  onPreview: (input: CompensationProfilePreviewInput) => Promise<void>;
  readOnly?: boolean;
}

const fieldClassName =
  "h-11 w-full rounded-xl border border-white/15 bg-white/[0.08] px-3 text-sm font-black text-white outline-none transition focus:border-sky focus:ring-2 focus:ring-sky/20 disabled:cursor-not-allowed disabled:opacity-45";

const wageModeLabels: Record<ShopFinanceWageMode, string> = {
  fixed_per_order: "单次固定报酬",
  commission: "按比例分成",
  base_plus_commission: "固定工资 + 分成",
  hourly: "按小时计薪",
};

const ndpBearerLabels: Record<ShopFinanceNdpBearer, string> = {
  shop: "店铺承担",
  technician: "员工承担",
  split: "店铺与员工分摊",
};

function toDraft(
  result: EmployeeCompensationResult | null,
): TechnicianCompensationProfileInput {
  const profile = result?.profile;
  return {
    name: profile?.name ?? "员工薪酬规则",
    wageMode: profile?.wageMode ?? "commission",
    baseSalaryJpy: profile?.baseSalaryJpy ?? 0,
    hourlyRateJpy: profile?.hourlyRateJpy ?? 0,
    dailyRateJpy: profile?.dailyRateJpy ?? 0,
    fixedOrderPayJpy: profile?.fixedOrderPayJpy ?? 0,
    commissionRatePercent: profile?.commissionRatePercent ?? 0,
    guaranteedMinimumJpy: profile?.guaranteedMinimumJpy ?? 0,
    ndpFeeBearer: profile?.ndpFeeBearer ?? "shop",
    technicianNdpSharePercent: profile?.technicianNdpSharePercent ?? 0,
    bonusRules: profile?.bonusRules ?? [],
    deductionRules: profile?.deductionRules ?? [],
    effectiveFrom: profile?.effectiveFrom ?? null,
    effectiveTo: profile?.effectiveTo ?? null,
  };
}

function toPreviewInput(
  result: EmployeeCompensationResult | null,
): CompensationProfilePreviewInput {
  const summary = result?.payrollSummary;
  const completed = summary?.completedOrderCount ?? 0;
  return {
    serviceAmountJpy:
      completed > 0
        ? Math.round((summary?.serviceIncomeJpy ?? 0) / completed)
        : 10_000,
    platformFeeNdp: 500,
    workedMinutes:
      completed > 0 ? Math.round((summary?.workedMinutes ?? 0) / completed) : 60,
    monthlyCompletedOrders: completed,
    monthlyServiceGmvJpy: summary?.serviceIncomeJpy ?? 0,
    ratingAverage: 0,
    lateCancellationCount: 0,
  };
}

export function EmployeeCompensationPanel({
  error,
  loading,
  onPreview,
  onRetry,
  onSave,
  preview,
  previewing,
  result,
  saving,
  readOnly = false,
}: EmployeeCompensationPanelProps) {
  const { language } = useOptionalI18n();
  const t = (source: string) => translateText(source, language);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(() => toDraft(result));
  const [previewInput, setPreviewInput] = useState(() =>
    toPreviewInput(result),
  );

  useEffect(() => {
    if (!editing) setDraft(toDraft(result));
    setPreviewInput(toPreviewInput(result));
  }, [editing, result]);

  useEffect(() => {
    if (readOnly) setEditing(false);
  }, [readOnly]);

  const profile = result?.profile ?? null;
  const sourceLabel =
    profile?.sourceType === "technician_override"
      ? "员工单独规则"
      : "继承店铺规则";

  const updateDraft = <TKey extends keyof TechnicianCompensationProfileInput>(
    key: TKey,
    value: TechnicianCompensationProfileInput[TKey],
  ) => setDraft((current) => ({ ...current, [key]: value }));

  const reset = () => {
    setDraft(toDraft(result));
    setEditing(false);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    try {
      await onSave(draft);
      setEditing(false);
    } catch {
      // Keep the rejected server draft visible so it can be corrected and retried.
    }
  };

  return (
    <section className="overflow-hidden rounded-[26px] border border-sky/25 bg-ink text-white shadow-soft">
      <div className="h-1.5 bg-gradient-to-r from-sky via-[#477cff] to-[#79a9ff]" />
      <div className="p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h4 className="text-xl font-black tracking-tight">
                {t("薪酬与结算")}
              </h4>
              {profile ? (
                <Badge className="border border-white/10" tone="blue">
                  {t(sourceLabel)} · v{profile.version}
                </Badge>
              ) : null}
            </div>
            <p className="mt-2 max-w-3xl text-sm font-bold leading-6 text-white/55">
              {t(
                "工资和分成由正式订单与工资单统计；实际支付由财务人员手动登记，系统不会发起自动转账。",
              )}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {!readOnly && !editing && !loading ? (
              <Button
                disabled={saving}
                onClick={() => setEditing(true)}
                size="sm"
                variant="secondary"
              >
                {t("编辑薪酬")}
              </Button>
            ) : null}
          </div>
        </div>

        {error ? (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-coral/35 bg-coral/10 px-4 py-3 text-sm font-bold text-[#ffb6ac]">
            <span>{error}</span>
            <button
              className="rounded-full border border-white/20 px-3 py-1.5 text-xs font-black text-white"
              onClick={onRetry}
              type="button"
            >
              {t("重试")}
            </button>
          </div>
        ) : null}

        {loading ? (
          <p className="mt-5 rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-5 text-sm font-bold text-white/55">
            {t("正在读取员工薪酬与工资统计...")}
          </p>
        ) : editing ? (
          <form className="mt-5 space-y-5" onSubmit={(event) => void submit(event)}>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              <label className="text-sm font-black text-white/80 sm:col-span-2 xl:col-span-3">
                <span className="mb-2 block">{t("方案名称")}</span>
                <input
                  className={fieldClassName}
                  disabled={saving}
                  maxLength={160}
                  onChange={(event) => updateDraft("name", event.target.value)}
                  required
                  value={draft.name}
                />
              </label>
              <label className="text-sm font-black text-white/80">
                <span className="mb-2 block">{t("计薪模式")}</span>
                <select
                  className={fieldClassName}
                  disabled={saving}
                  onChange={(event) =>
                    updateDraft(
                      "wageMode",
                      event.target.value as ShopFinanceWageMode,
                    )
                  }
                  value={draft.wageMode}
                >
                  {Object.entries(wageModeLabels).map(([value, label]) => (
                    <option className="text-ink" key={value} value={value}>
                      {t(label)}
                    </option>
                  ))}
                </select>
              </label>
              {[
                ["基础月薪", "baseSalaryJpy", "employee-compensation-base-salary"],
                ["时薪", "hourlyRateJpy", "employee-compensation-hourly-rate"],
                ["日薪", "dailyRateJpy", "employee-compensation-daily-rate"],
                ["单次报酬", "fixedOrderPayJpy", "employee-compensation-fixed-order"],
                ["保障最低额", "guaranteedMinimumJpy", "employee-compensation-guarantee"],
              ].map(([label, key, testId]) => (
                <label className="text-sm font-black text-white/80" key={key}>
                  <span className="mb-2 block">{t(label)} · JPY</span>
                  <input
                    className={fieldClassName}
                    data-testid={testId}
                    disabled={saving}
                    min={0}
                    onChange={(event) =>
                      updateDraft(
                        key as keyof TechnicianCompensationProfileInput,
                        Number(event.target.value),
                      )
                    }
                    type="number"
                    value={Number(draft[key as keyof TechnicianCompensationProfileInput] ?? 0)}
                  />
                </label>
              ))}
              <label className="text-sm font-black text-white/80">
                <span className="mb-2 block">{t("分成比例")} · %</span>
                <input
                  className={fieldClassName}
                  data-testid="employee-compensation-commission"
                  disabled={saving}
                  max={100}
                  min={0}
                  onChange={(event) =>
                    updateDraft("commissionRatePercent", Number(event.target.value))
                  }
                  step="0.01"
                  type="number"
                  value={draft.commissionRatePercent ?? 0}
                />
              </label>
              <label className="text-sm font-black text-white/80">
                <span className="mb-2 block">{t("NDP 费用承担")}</span>
                <select
                  className={fieldClassName}
                  disabled={saving}
                  onChange={(event) =>
                    updateDraft(
                      "ndpFeeBearer",
                      event.target.value as ShopFinanceNdpBearer,
                    )
                  }
                  value={draft.ndpFeeBearer ?? "shop"}
                >
                  {Object.entries(ndpBearerLabels).map(([value, label]) => (
                    <option className="text-ink" key={value} value={value}>
                      {t(label)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm font-black text-white/80">
                <span className="mb-2 block">{t("员工 NDP 分摊")} · %</span>
                <input
                  className={fieldClassName}
                  disabled={saving || draft.ndpFeeBearer !== "split"}
                  max={100}
                  min={0}
                  onChange={(event) =>
                    updateDraft(
                      "technicianNdpSharePercent",
                      Number(event.target.value),
                    )
                  }
                  step="0.01"
                  type="number"
                  value={draft.technicianNdpSharePercent ?? 0}
                />
              </label>
            </div>
            <div className="flex justify-end gap-2 border-t border-white/10 pt-4">
              <Button disabled={saving} onClick={reset} size="sm" variant="ghost">
                {t("取消")}
              </Button>
              <Button disabled={saving} size="sm" type="submit">
                {saving ? t("正在保存") : t("保存薪酬规则")}
              </Button>
            </div>
          </form>
        ) : result && profile ? (
          <>
            <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {[
                ["计薪模式", t(wageModeLabels[profile.wageMode])],
                ["基础月薪", yen(profile.baseSalaryJpy)],
                ["时薪", yen(profile.hourlyRateJpy)],
                ["日薪", yen(profile.dailyRateJpy)],
                ["单次报酬", yen(profile.fixedOrderPayJpy)],
                ["分成比例", `${profile.commissionRatePercent}%`],
                ["保障最低额", yen(profile.guaranteedMinimumJpy)],
                [
                  "NDP 费用承担",
                  `${t(ndpBearerLabels[profile.ndpFeeBearer])}${
                    profile.ndpFeeBearer === "split"
                      ? ` · ${profile.technicianNdpSharePercent}%`
                      : ""
                  }`,
                ],
              ].map(([label, value]) => (
                <div
                  className="rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-3"
                  key={label}
                >
                  <p className="text-xs font-black text-white/45">{t(label)}</p>
                  <strong className="mt-1.5 block text-sm text-white">{value}</strong>
                </div>
              ))}
            </div>

            {!readOnly ? <div className="mt-5 rounded-3xl border border-sky/20 bg-sky/10 p-4 sm:p-5">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.16em] text-sky">
                    {t("单笔收入估算")}
                  </p>
                  <p className="mt-1 text-xs font-bold text-white/50">
                    {t("估算不会保存工资单或登记支付")}
                  </p>
                </div>
                <Button
                  disabled={previewing}
                  onClick={() => void onPreview(previewInput)}
                  size="sm"
                  variant="secondary"
                >
                  {previewing ? t("正在计算") : t("计算预估")}
                </Button>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <label className="text-xs font-black text-white/60">
                  <span className="mb-2 block">{t("单笔服务金额")} · JPY</span>
                  <input
                    className={fieldClassName}
                    min={0}
                    onChange={(event) =>
                      setPreviewInput((current) => ({
                        ...current,
                        serviceAmountJpy: Number(event.target.value),
                      }))
                    }
                    type="number"
                    value={previewInput.serviceAmountJpy}
                  />
                </label>
                <label className="text-xs font-black text-white/60">
                  <span className="mb-2 block">{t("本次工时")} · min</span>
                  <input
                    className={fieldClassName}
                    min={0}
                    onChange={(event) =>
                      setPreviewInput((current) => ({
                        ...current,
                        workedMinutes: Number(event.target.value),
                      }))
                    }
                    type="number"
                    value={previewInput.workedMinutes ?? 60}
                  />
                </label>
              </div>
              {preview ? (
                <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                  {[
                    ["员工毛收入", yen(preview.preview.technicianGrossIncomeJpy)],
                    ["员工净收入", yen(preview.preview.technicianNetIncomeJpy)],
                    ["店铺预估毛利", yen(preview.preview.shopEstimatedGrossProfitJpy)],
                    [
                      "NDP 分摊",
                      `${preview.preview.shopNdpShareNdp} / ${preview.preview.technicianNdpShareNdp} NDP`,
                    ],
                  ].map(([label, value]) => (
                    <div className="rounded-2xl bg-black/15 px-3 py-3" key={label}>
                      <p className="text-[11px] font-black text-white/45">{t(label)}</p>
                      <strong className="mt-1 block text-sm">{value}</strong>
                    </div>
                  ))}
                </div>
              ) : null}
            </div> : null}
          </>
        ) : (
          <p className="mt-5 rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-5 text-sm font-bold text-white/55">
            {t("尚未读取到员工薪酬资料")}
          </p>
        )}
      </div>
    </section>
  );
}
