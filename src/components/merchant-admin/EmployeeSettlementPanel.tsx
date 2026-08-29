import { useMemo } from "react";
import type { EmployeeCompensationResult } from "../../api/employeeCompensation";
import { useOptionalI18n } from "../../i18n/I18nProvider";
import { translateText } from "../../i18n/translations";
import { yen } from "../../lib/utils";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";

interface EmployeeSettlementPanelProps {
  error: string;
  loading: boolean;
  result: EmployeeCompensationResult | null;
  onRetry: () => void;
}

function formatPeriod(start: string | null, end: string | null) {
  if (!start || !end) return "尚未生成工资单";
  return `${start.slice(0, 10).replaceAll("-", "/")} – ${end
    .slice(0, 10)
    .replaceAll("-", "/")}`;
}

function payrollStatusLabel(status: string | null) {
  const labels: Record<string, string> = {
    draft: "草稿",
    reviewing: "复核中",
    published: "已发布",
    confirmed: "员工已确认",
    disputed: "有申诉",
    approved: "已审批",
    scheduled: "待支付",
    paid: "已付清",
    locked: "已归档",
  };
  return status ? (labels[status] ?? status) : "暂无工资单";
}

export function EmployeeSettlementPanel({
  error,
  loading,
  onRetry,
  result,
}: EmployeeSettlementPanelProps) {
  const { language } = useOptionalI18n();
  const t = (source: string) => translateText(source, language);
  const summary = result?.payrollSummary ?? null;
  const financeHref = result
    ? `#/merchant-admin/finance?employee=${encodeURIComponent(result.employee.needoId)}`
    : "#/merchant-admin/finance";
  const metrics = useMemo(
    () => [
      ["本期完成订单", `${summary?.completedOrderCount ?? 0} ${t("单")}`],
      ["有效工时", `${((summary?.workedMinutes ?? 0) / 60).toFixed(1)} h`],
      ["服务收入", yen(summary?.serviceIncomeJpy ?? 0)],
      ["基础工资", yen(summary?.basePayJpy ?? 0)],
      ["分成", yen(summary?.commissionJpy ?? 0)],
      ["奖金与补贴", yen((summary?.bonusJpy ?? 0) + (summary?.allowanceJpy ?? 0))],
      [
        "扣款与 NDP 分摊",
        yen(
          (summary?.deductionJpy ?? 0) +
            (summary?.platformFeeShareDeductionJpy ?? 0),
        ),
      ],
      ["净应付", yen(summary?.netPayJpy ?? 0)],
      ["已付", yen(summary?.paidAmountJpy ?? 0)],
      ["未付", yen(summary?.unpaidAmountJpy ?? 0)],
    ],
    [language, summary],
  );

  return (
    <section
      className="overflow-hidden rounded-[26px] border border-sky/25 bg-ink text-white shadow-soft"
      data-testid="employee-settlement-panel"
    >
      <div className="h-1.5 bg-gradient-to-r from-sky via-[#477cff] to-[#79a9ff]" />
      <div className="p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-sky">
              {t("结算记录")}
            </p>
            <h4 className="mt-1 text-xl font-black">
              {t(formatPeriod(summary?.periodStart ?? null, summary?.periodEnd ?? null))}
            </h4>
            <p className="mt-2 text-sm font-bold leading-6 text-white/55">
              {t("实际支付由财务人员手动登记，系统不会发起自动转账。")}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge
              className="border border-white/10"
              tone={summary?.unpaidAmountJpy === 0 && summary?.payslipId ? "green" : "yellow"}
            >
              {t(payrollStatusLabel(summary?.status ?? null))}
            </Badge>
            <a
              className="focus-ring inline-flex h-8 items-center justify-center rounded-full border border-white/20 px-3 text-xs font-black text-white transition hover:bg-white/10"
              href={financeHref}
            >
              {t("前往财务结算")}
            </a>
          </div>
        </div>

        {error ? (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-coral/35 bg-coral/10 px-4 py-3 text-sm font-bold text-[#ffb6ac]">
            <span>{error}</span>
            <Button onClick={onRetry} size="sm" variant="secondary">
              {t("重试")}
            </Button>
          </div>
        ) : loading ? (
          <p className="mt-5 rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-5 text-sm font-bold text-white/55">
            {t("正在读取员工薪酬与工资统计...")}
          </p>
        ) : (
          <dl className="mt-5 grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
            {metrics.map(([label, value]) => (
              <div className="rounded-2xl bg-black/15 px-3 py-3" key={label}>
                <dt className="text-[11px] font-black text-white/45">{t(label)}</dt>
                <dd className="mt-1 text-sm font-black text-white">{value}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>
    </section>
  );
}
