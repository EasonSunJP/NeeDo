import { useEffect, useMemo, useState, type FormEvent } from "react";
import type {
  EmployeePayrollSchedulePolicyInput,
  PayrollCadence,
  PayrollHolidayAdjustment,
  PayrollSchedulePolicyResult,
  ShopPayrollSchedulePolicyInput,
} from "../../api/payrollSchedulePolicy";
import { useOptionalI18n } from "../../i18n/I18nProvider";
import { translateText } from "../../i18n/translations";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";

type SharedProps = {
  description?: string;
  error: string;
  loading: boolean;
  policy: PayrollSchedulePolicyResult | null;
  saving: boolean;
  title?: string;
  onRetry: () => void;
};

type PayrollSchedulePolicyEditorProps =
  | (SharedProps & {
      mode: "shop";
      onSave: (input: ShopPayrollSchedulePolicyInput) => Promise<void>;
    })
  | (SharedProps & {
      mode: "employee";
      onSave: (input: EmployeePayrollSchedulePolicyInput) => Promise<void>;
    });

type PolicyDraft = {
  cadence: PayrollCadence;
  holidayAdjustment: PayrollHolidayAdjustment;
  inheritShopPolicy: boolean;
  monthlySettlementDay: number | null;
  weeklySettlementWeekday: number | null;
};

const fieldClassName =
  "h-11 w-full rounded-xl border border-white/15 bg-white/[0.08] px-3 text-sm font-black text-white outline-none transition focus:border-sky focus:ring-2 focus:ring-sky/20 disabled:cursor-not-allowed disabled:opacity-45";

const weekdays = [
  [1, "周一"],
  [2, "周二"],
  [3, "周三"],
  [4, "周四"],
  [5, "周五"],
  [6, "周六"],
  [7, "周日"],
] as const;

function tokyoToday() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Asia/Tokyo",
    year: "numeric",
  }).formatToParts(new Date());
  const read = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${read("year")}-${read("month")}-${read("day")}`;
}

function formatDateKey(value: string | null | undefined) {
  if (!value) return "—";
  const [year, month, day] = value.split("-");
  return year && month && day ? `${year}/${month}/${day}` : value;
}

function createDraft(
  mode: "shop" | "employee",
  policy: PayrollSchedulePolicyResult | null,
): PolicyDraft {
  const effective = policy?.effectivePolicy ?? policy?.shopPolicy ?? null;
  return {
    cadence: effective?.cadence ?? "monthly",
    holidayAdjustment:
      effective?.holidayAdjustment ?? "next_business_day",
    inheritShopPolicy:
      mode === "employee" ? (policy?.inheritShopPolicy ?? true) : false,
    monthlySettlementDay:
      effective?.cadence === "monthly"
        ? (effective.monthlySettlementDay ?? 25)
        : null,
    weeklySettlementWeekday:
      effective?.cadence === "weekly"
        ? (effective.weeklySettlementWeekday ?? 5)
        : null,
  };
}

function cadenceLabel(cadence: PayrollCadence) {
  if (cadence === "daily") return "每日结算";
  if (cadence === "weekly") return "每周结算";
  return "每月结算";
}

function holidayLabel(adjustment: PayrollHolidayAdjustment) {
  return adjustment === "previous_business_day"
    ? "提前至前一个营业日"
    : "顺延至下一个营业日";
}

export function PayrollSchedulePolicyEditor(
  props: PayrollSchedulePolicyEditorProps,
) {
  const { language } = useOptionalI18n();
  const t = (source: string) => translateText(source, language);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(() =>
    createDraft(props.mode, props.policy),
  );

  useEffect(() => {
    if (!editing) setDraft(createDraft(props.mode, props.policy));
  }, [editing, props.mode, props.policy]);

  const effective = props.policy?.effectivePolicy ?? null;
  const preview = props.policy?.preview ?? null;
  const sourceLabel =
    props.mode === "employee"
      ? props.policy?.source === "employee_override"
        ? "员工单独规则"
        : "继承店铺规则"
      : props.policy?.configured
        ? "店铺默认规则"
        : "尚未设置";
  const settlementDetail = useMemo(() => {
    if (!effective) return t("尚未设置");
    if (effective.cadence === "weekly") {
      return t(
        weekdays.find(
          ([weekday]) => weekday === effective.weeklySettlementWeekday,
        )?.[1] ?? "周五",
      );
    }
    if (effective.cadence === "monthly") {
      return `${t("每月")} ${effective.monthlySettlementDay} ${t("日")}`;
    }
    return t("每天");
  }, [effective, language]);

  const reset = () => {
    setDraft(createDraft(props.mode, props.policy));
    setEditing(false);
  };

  const changeCadence = (cadence: PayrollCadence) => {
    setDraft((current) => ({
      ...current,
      cadence,
      monthlySettlementDay: cadence === "monthly" ? 25 : null,
      weeklySettlementWeekday: cadence === "weekly" ? 5 : null,
    }));
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const effectiveFrom = tokyoToday();
    const monthlySettlementDay =
      draft.cadence === "monthly"
        ? Number(draft.monthlySettlementDay ?? 25)
        : null;
    const weeklySettlementWeekday =
      draft.cadence === "weekly"
        ? Number(draft.weeklySettlementWeekday ?? 5)
        : null;
    try {
      if (props.mode === "employee") {
        await props.onSave(
          draft.inheritShopPolicy
            ? {
                cadence: null,
                effectiveFrom,
                effectiveTo: null,
                holidayAdjustment: null,
                inheritShopPolicy: true,
                monthlySettlementDay: null,
                timezone: null,
                weeklySettlementWeekday: null,
              }
            : {
                cadence: draft.cadence,
                effectiveFrom,
                effectiveTo: null,
                holidayAdjustment: draft.holidayAdjustment,
                inheritShopPolicy: false,
                monthlySettlementDay,
                timezone: "Asia/Tokyo",
                weeklySettlementWeekday,
              },
        );
      } else {
        await props.onSave({
          cadence: draft.cadence,
          effectiveFrom,
          effectiveTo: null,
          holidayAdjustment: draft.holidayAdjustment,
          monthlySettlementDay,
          timezone: "Asia/Tokyo",
          weeklySettlementWeekday,
        });
      }
      setEditing(false);
    } catch {
      // Preserve the rejected draft so the user can correct and retry it.
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
                {t(props.title ?? "工资结算周期")}
              </h4>
              <Badge className="border border-white/10" tone="blue">
                {t(sourceLabel)}
              </Badge>
            </div>
            <p className="mt-2 max-w-3xl text-sm font-bold leading-6 text-white/55">
              {t(
                props.description ??
                  "由店铺规则或员工个人规则计算本期计划支付日。",
              )}
            </p>
          </div>
          {!editing && !props.loading ? (
            <Button
              disabled={props.saving}
              onClick={() => setEditing(true)}
              size="sm"
              variant="secondary"
            >
              {t("编辑结算周期")}
            </Button>
          ) : null}
        </div>

        {props.error ? (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-coral/35 bg-coral/10 px-4 py-3 text-sm font-bold text-[#ffb6ac]">
            <span>{props.error}</span>
            <button
              className="rounded-full border border-white/20 px-3 py-1.5 text-xs font-black text-white"
              onClick={props.onRetry}
              type="button"
            >
              {t("重试")}
            </button>
          </div>
        ) : null}

        {props.loading ? (
          <p className="mt-5 rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-5 text-sm font-bold text-white/55">
            {t("正在读取结算周期...")}
          </p>
        ) : editing ? (
          <form className="mt-5 space-y-5" onSubmit={(event) => void submit(event)}>
            {props.mode === "employee" ? (
              <label className="flex cursor-pointer items-center justify-between gap-4 rounded-2xl border border-sky/25 bg-sky/10 px-4 py-3">
                <span>
                  <span className="block text-sm font-black">
                    {t("继承店铺规则")}
                  </span>
                  <span className="mt-1 block text-xs font-bold text-white/50">
                    {t("关闭后可为该员工设置独立结算周期")}
                  </span>
                </span>
                <input
                  checked={draft.inheritShopPolicy}
                  className="h-5 w-5 accent-[#4f7fff]"
                  data-testid="employee-payroll-inherit"
                  disabled={props.saving}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      inheritShopPolicy: event.target.checked,
                    }))
                  }
                  type="checkbox"
                />
              </label>
            ) : null}

            <fieldset
              className="grid gap-4 sm:grid-cols-2"
              disabled={
                props.saving ||
                (props.mode === "employee" && draft.inheritShopPolicy)
              }
            >
              <label className="block text-sm font-black">
                <span className="mb-2 block text-white/70">{t("结算频率")}</span>
                <select
                  className={fieldClassName}
                  data-testid="payroll-cadence"
                  onChange={(event) =>
                    changeCadence(event.target.value as PayrollCadence)
                  }
                  value={draft.cadence}
                >
                  <option className="text-ink" value="daily">
                    {t("每日结算")}
                  </option>
                  <option className="text-ink" value="weekly">
                    {t("每周结算")}
                  </option>
                  <option className="text-ink" value="monthly">
                    {t("每月结算")}
                  </option>
                </select>
              </label>

              {draft.cadence === "weekly" ? (
                <label className="block text-sm font-black">
                  <span className="mb-2 block text-white/70">{t("每周结算日")}</span>
                  <select
                    className={fieldClassName}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        weeklySettlementWeekday: Number(event.target.value),
                      }))
                    }
                    value={draft.weeklySettlementWeekday ?? 5}
                  >
                    {weekdays.map(([value, label]) => (
                      <option className="text-ink" key={value} value={value}>
                        {t(label)}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}

              {draft.cadence === "monthly" ? (
                <label className="block text-sm font-black">
                  <span className="mb-2 block text-white/70">{t("每月结算日")}</span>
                  <input
                    className={fieldClassName}
                    max={31}
                    min={1}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        monthlySettlementDay: Number(event.target.value),
                      }))
                    }
                    required
                    type="number"
                    value={draft.monthlySettlementDay ?? 25}
                  />
                </label>
              ) : null}

              <label className="block text-sm font-black">
                <span className="mb-2 block text-white/70">
                  {t("遇休息日的支付规则")}
                </span>
                <select
                  className={fieldClassName}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      holidayAdjustment: event.target
                        .value as PayrollHolidayAdjustment,
                    }))
                  }
                  value={draft.holidayAdjustment}
                >
                  <option className="text-ink" value="previous_business_day">
                    {t("提前至前一个营业日")}
                  </option>
                  <option className="text-ink" value="next_business_day">
                    {t("顺延至下一个营业日")}
                  </option>
                </select>
              </label>

              <label className="block text-sm font-black">
                <span className="mb-2 block text-white/70">{t("时区")}</span>
                <input
                  className={fieldClassName}
                  disabled
                  value="Asia/Tokyo"
                />
              </label>
            </fieldset>

            <div className="flex justify-end gap-2 border-t border-white/10 pt-4">
              <Button
                disabled={props.saving}
                onClick={reset}
                size="sm"
                variant="ghost"
              >
                {t("取消")}
              </Button>
              <Button disabled={props.saving} size="sm" type="submit">
                {props.saving ? t("正在保存") : t("保存结算周期")}
              </Button>
            </div>
          </form>
        ) : props.policy?.configured && effective && preview ? (
          <>
            <dl className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {[
                ["结算频率", t(cadenceLabel(effective.cadence))],
                ["结算日", settlementDetail],
                ["休息日规则", t(holidayLabel(effective.holidayAdjustment))],
                ["时区", effective.timezone],
              ].map(([label, value]) => (
                <div
                  className="rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-3"
                  key={label}
                >
                  <dt className="text-[11px] font-black uppercase tracking-[0.1em] text-white/40">
                    {t(label)}
                  </dt>
                  <dd className="mt-1.5 text-sm font-black text-white/90">
                    {value}
                  </dd>
                </div>
              ))}
            </dl>
            <div className="mt-4 grid gap-3 rounded-[22px] border border-sky/25 bg-gradient-to-br from-sky/15 to-white/[0.04] p-4 sm:grid-cols-2 xl:grid-cols-4">
              <div>
                <p className="text-[11px] font-black uppercase tracking-[0.1em] text-white/40">
                  {t("本期范围")}
                </p>
                <p className="mt-1.5 text-sm font-black">
                  {formatDateKey(preview.periodStart)} — {formatDateKey(preview.periodEnd)}
                </p>
              </div>
              <div>
                <p className="text-[11px] font-black uppercase tracking-[0.1em] text-white/40">
                  {t("自然结算日")}
                </p>
                <p className="mt-1.5 text-sm font-black">
                  {formatDateKey(preview.naturalSettlementDate)}
                </p>
              </div>
              <div>
                <p className="text-[11px] font-black uppercase tracking-[0.1em] text-sky/80">
                  {t("计划支付日")}
                </p>
                <p className="mt-1 text-xl font-black text-[#8bb2ff]">
                  {formatDateKey(preview.plannedPaymentDate)}
                </p>
              </div>
              <div>
                <p className="text-[11px] font-black uppercase tracking-[0.1em] text-white/40">
                  {t("规则版本")}
                </p>
                <p className="mt-1.5 text-sm font-black">v{effective.version}</p>
              </div>
            </div>
          </>
        ) : (
          <div className="mt-5 rounded-2xl border border-dashed border-white/20 bg-white/[0.04] px-4 py-5">
            <p className="text-sm font-black">{t("店铺尚未设置结算周期")}</p>
            <p className="mt-1 text-xs font-bold leading-5 text-white/45">
              {t("请先设置店铺默认规则，再由员工选择继承或单独覆盖。")}
            </p>
          </div>
        )}

        <p className="mt-4 border-t border-white/10 pt-4 text-xs font-bold leading-5 text-white/45">
          {t(
            "NeeDo 只计算并记录计划支付日，财务人员仍需在财务结算页手动登记实际支付结果。",
          )}
        </p>
      </div>
    </section>
  );
}
