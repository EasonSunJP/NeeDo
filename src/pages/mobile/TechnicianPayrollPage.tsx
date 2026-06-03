import { useEffect, useMemo, useState } from "react";
import { AppTopBar, PageScaffold } from "../../components/client-ui/AppScaffold";
import { technicianNavItems } from "../../components/mobile/navItems";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { technicianPayrollCenterApi } from "../../api/technicianPayrollCenter";
import type { PayslipPayload } from "../../api/merchantPayrollCenter";
import { cn, yen } from "../../lib/utils";

const payslipStatusLabel: Record<PayslipPayload["status"], string> = {
  draft: "草稿",
  reviewing: "复核中",
  published: "待确认",
  confirmed: "已确认",
  disputed: "申诉中",
  approved: "已批准",
  scheduled: "待支付",
  paid: "已支付",
  locked: "已归档"
};

function statusTone(status: PayslipPayload["status"]) {
  if (status === "paid" || status === "locked" || status === "confirmed") {
    return "green" as const;
  }
  if (status === "disputed") {
    return "red" as const;
  }
  if (status === "published" || status === "reviewing" || status === "scheduled") {
    return "yellow" as const;
  }
  return "blue" as const;
}

function formatDate(value: string) {
  const isoDate = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoDate) {
    return `${isoDate[2]}/${isoDate[3]}`;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    timeZone: "UTC"
  }).format(parsed);
}

function formatPeriod(payslip: PayslipPayload) {
  return `${formatDate(payslip.periodStart)} - ${formatDate(payslip.periodEnd)}`;
}

function resolvePrimaryPayslip(list: PayslipPayload[], current: PayslipPayload | null) {
  if (!list.length) {
    return null;
  }
  if (current) {
    return list.find((item) => item.id === current.id) ?? list[0];
  }
  return list[0];
}

function payrollTimeline(payslip: PayslipPayload) {
  return [
    {
      label: "工资单发布",
      amount: payslip.netPayJpy,
      status: payslip.status === "draft" || payslip.status === "reviewing" ? "等待商户发布" : "已发布"
    },
    {
      label: "技师确认",
      amount: payslip.netPayJpy,
      status: payslip.confirmedAt ? "已确认" : payslip.disputeStatus === "disputed" ? "申诉中" : "待确认"
    },
    {
      label: "支付记录",
      amount: payslip.paidAmountJpy,
      status: payslip.unpaidAmountJpy <= 0 ? "已付清" : `未支付 ${yen(payslip.unpaidAmountJpy)}`
    }
  ];
}

export function TechnicianPayrollPage() {
  const [payslips, setPayslips] = useState<PayslipPayload[]>([]);
  const [activePayslip, setActivePayslip] = useState<PayslipPayload | null>(null);
  const [disputeReason, setDisputeReason] = useState("服务订单收入与实际现金收款不一致，请商户复核。");
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  const loadPayslips = async (current = activePayslip) => {
    const payload = await technicianPayrollCenterApi.listPayslips();
    const nextActive = resolvePrimaryPayslip(payload.list, current);
    setPayslips(payload.list);
    setActivePayslip(nextActive);
  };

  useEffect(() => {
    let mounted = true;

    technicianPayrollCenterApi
      .listPayslips()
      .then((payload) => {
        if (!mounted) {
          return;
        }
        setPayslips(payload.list);
        setActivePayslip(payload.list[0] ?? null);
      })
      .catch((err: unknown) => {
        if (mounted) {
          setError(err instanceof Error ? err.message : "工资单加载失败");
        }
      });

    return () => {
      mounted = false;
    };
  }, []);

  const summary = useMemo(
    () =>
      payslips.reduce(
        (acc, item) => ({
          netPayJpy: acc.netPayJpy + item.netPayJpy,
          paidAmountJpy: acc.paidAmountJpy + item.paidAmountJpy,
          unpaidAmountJpy: acc.unpaidAmountJpy + item.unpaidAmountJpy,
          disputedCount: acc.disputedCount + (item.disputeStatus === "disputed" ? 1 : 0)
        }),
        { netPayJpy: 0, paidAmountJpy: 0, unpaidAmountJpy: 0, disputedCount: 0 }
      ),
    [payslips]
  );

  const runPayslipAction = async (action: "confirm" | "dispute") => {
    if (!activePayslip) {
      return;
    }

    setIsBusy(true);
    setError(null);
    try {
      const nextPayslip =
        action === "confirm"
          ? await technicianPayrollCenterApi.confirmPayslip(activePayslip.id)
          : await technicianPayrollCenterApi.disputePayslip(activePayslip.id, disputeReason);
      await loadPayslips(nextPayslip);
    } catch (err) {
      setError(err instanceof Error ? err.message : "工资单操作失败");
    } finally {
      setIsBusy(false);
    }
  };

  const runPayoutConfirm = async (payoutRecordId: number) => {
    if (!activePayslip) {
      return;
    }

    setIsBusy(true);
    setError(null);
    try {
      const nextPayslip = await technicianPayrollCenterApi.confirmPayoutRecord(
        activePayslip.id,
        payoutRecordId
      );
      await loadPayslips(nextPayslip);
    } catch (err) {
      setError(err instanceof Error ? err.message : "收款确认失败");
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <PageScaffold contentClassName="space-y-5 pb-28 pt-[calc(env(safe-area-inset-top)+5rem)]" navItems={technicianNavItems}>
      <AppTopBar
        backTo="/technician"
        fixed
        hideCloseButton
        subtitle="查看每个周期的服务收入、分成、奖金、扣款、NDP 分摊和支付记录"
        title="工资单"
      />

      <section className="rounded-[28px] border border-[color:var(--client-line)] bg-[color:var(--client-surface)] p-5 shadow-[0_20px_54px_rgba(15,23,42,0.10)]">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--client-muted)]">Payroll</p>
            <h1 className="mt-2 text-2xl font-black text-[color:var(--client-text)]">本期工资单中心</h1>
          </div>
          <Badge tone={summary.disputedCount > 0 ? "red" : "blue"}>{summary.disputedCount > 0 ? `${summary.disputedCount} 个申诉` : "正常"}</Badge>
        </div>
        <div className="mt-5 grid grid-cols-3 gap-2">
          {[
            ["净收入", yen(summary.netPayJpy)],
            ["已支付", yen(summary.paidAmountJpy)],
            ["未支付", yen(summary.unpaidAmountJpy)]
          ].map(([label, value]) => (
            <div key={label} className="rounded-2xl bg-[color:var(--client-bg-soft)] p-3">
              <p className="text-[11px] font-semibold text-[color:var(--client-muted)]">{label}</p>
              <p className="mt-1 text-sm font-black text-[color:var(--client-text)]">{value}</p>
            </div>
          ))}
        </div>
      </section>

      {error ? <div className="rounded-2xl border border-red-300/40 bg-red-500/10 p-3 text-sm font-semibold text-red-500">{error}</div> : null}

      <section className="space-y-3">
        {payslips.map((payslip) => (
          <button
            className={cn(
              "w-full rounded-3xl border p-4 text-left shadow-[0_16px_42px_rgba(15,23,42,0.08)] transition",
              activePayslip?.id === payslip.id
                ? "border-[color:var(--client-primary)] bg-[color:color-mix(in_srgb,var(--client-primary)_10%,var(--client-surface))]"
                : "border-[color:var(--client-line)] bg-[color:var(--client-surface)]"
            )}
            key={payslip.id}
            onClick={() => setActivePayslip(payslip)}
            type="button"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold text-[color:var(--client-muted)]">{formatPeriod(payslip)}</p>
                <h2 className="mt-1 text-base font-black text-[color:var(--client-text)]">{payslip.shopName}</h2>
              </div>
              <Badge tone={statusTone(payslip.status)}>{payslipStatusLabel[payslip.status]}</Badge>
            </div>
            <div className="mt-4 grid grid-cols-3 gap-2 text-sm">
              <div>
                <p className="text-[11px] font-semibold text-[color:var(--client-muted)]">基础/时薪</p>
                <p className="font-black text-[color:var(--client-text)]">{yen(payslip.baseSalaryJpy + payslip.dailyWageJpy + payslip.hourlyWageJpy)}</p>
              </div>
              <div>
                <p className="text-[11px] font-semibold text-[color:var(--client-muted)]">分成/奖金</p>
                <p className="font-black text-[color:var(--client-text)]">{yen(payslip.commissionJpy + payslip.bonusJpy)}</p>
              </div>
              <div>
                <p className="text-[11px] font-semibold text-[color:var(--client-muted)]">实发</p>
                <p className="font-black text-[color:var(--client-primary)]">{yen(payslip.netPayJpy)}</p>
              </div>
            </div>
          </button>
        ))}
      </section>

      {activePayslip ? (
        <section className="rounded-[28px] border border-[color:var(--client-line)] bg-[color:var(--client-surface)] p-5 shadow-[0_20px_54px_rgba(15,23,42,0.10)]">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold text-[color:var(--client-muted)]">{activePayslip.technicianName}</p>
              <h2 className="mt-1 text-xl font-black text-[color:var(--client-text)]">{formatPeriod(activePayslip)} 详情</h2>
            </div>
            <Badge tone={statusTone(activePayslip.status)}>{payslipStatusLabel[activePayslip.status]}</Badge>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-3">
            {[
              ["基础工资", activePayslip.baseSalaryJpy],
              ["订单分成", activePayslip.commissionJpy],
              ["奖金/补贴", activePayslip.bonusJpy + activePayslip.allowanceJpy],
              ["扣款/NDP", activePayslip.deductionJpy + activePayslip.platformFeeShareDeductionJpy],
              ["已支付", activePayslip.paidAmountJpy],
              ["未支付", activePayslip.unpaidAmountJpy]
            ].map(([label, value]) => (
              <div key={label} className="rounded-2xl bg-[color:var(--client-bg-soft)] p-3">
                <p className="text-[11px] font-semibold text-[color:var(--client-muted)]">{label}</p>
                <p className="mt-1 text-base font-black text-[color:var(--client-text)]">{yen(Number(value))}</p>
              </div>
            ))}
          </div>

          <div className="mt-5 space-y-3">
            <h3 className="text-sm font-black text-[color:var(--client-text)]">Money Timeline</h3>
            {payrollTimeline(activePayslip).map((event, index) => (
              <div className="flex gap-3" key={event.label}>
                <div className="flex flex-col items-center">
                  <span className="mt-1 h-2.5 w-2.5 rounded-full bg-[color:var(--client-primary)]" />
                  {index < 2 ? <span className="mt-1 h-full min-h-8 w-px bg-[color:var(--client-line)]" /> : null}
                </div>
                <div className="flex-1 rounded-2xl bg-[color:var(--client-bg-soft)] p-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-black text-[color:var(--client-text)]">{event.label}</p>
                    <p className="text-sm font-black text-[color:var(--client-primary)]">{yen(event.amount)}</p>
                  </div>
                  <p className="mt-1 text-xs font-semibold text-[color:var(--client-muted)]">{event.status}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-5 space-y-2">
            <h3 className="text-sm font-black text-[color:var(--client-text)]">行项目</h3>
            {activePayslip.lines.map((line) => (
              <div className="rounded-2xl border border-[color:var(--client-line)] p-3" key={line.id}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-black text-[color:var(--client-text)]">{line.title}</p>
                    <p className="mt-1 text-xs font-semibold text-[color:var(--client-muted)]">{line.explanation ?? line.formulaText ?? line.sourceType}</p>
                  </div>
                  <p className={cn("text-sm font-black", line.amountJpy < 0 ? "text-red-500" : "text-[color:var(--client-primary)]")}>{yen(line.amountJpy)}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-5 space-y-2">
            <h3 className="text-sm font-black text-[color:var(--client-text)]">支付记录</h3>
            {activePayslip.payoutRecords.length > 0 ? (
              activePayslip.payoutRecords.map((record) => (
                <div className="rounded-2xl border border-[color:var(--client-line)] p-3" key={record.id}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-black text-[color:var(--client-text)]">{yen(record.amountJpy)} · {record.payoutMethod}</p>
                      <p className="mt-1 text-xs font-semibold text-[color:var(--client-muted)]">
                        {formatDate(record.payoutDate)} · {record.referenceNo ?? record.status}
                      </p>
                      <p className="mt-1 text-xs font-semibold text-[color:var(--client-muted)]">
                        {record.technicianConfirmedAt ? `确认于 ${formatDate(record.technicianConfirmedAt)}` : "待确认收款"}
                      </p>
                    </div>
                    <Button
                      className="min-h-10 px-4 text-xs"
                      disabled={isBusy || record.confirmedByTechnician || Boolean(record.technicianConfirmedAt)}
                      onClick={() => void runPayoutConfirm(record.id)}
                      type="button"
                    >
                      确认收款
                    </Button>
                  </div>
                </div>
              ))
            ) : (
              <div className="rounded-2xl border border-[color:var(--client-line)] p-3 text-xs font-semibold text-[color:var(--client-muted)]">
                暂无支付记录
              </div>
            )}
          </div>

          <div className="mt-5 space-y-3">
            <textarea
              className="min-h-[92px] w-full resize-none rounded-2xl border border-[color:var(--client-line)] bg-[color:var(--client-bg-soft)] p-3 text-sm font-semibold text-[color:var(--client-text)] outline-none"
              onChange={(event) => setDisputeReason(event.target.value)}
              value={disputeReason}
            />
            <div className="grid grid-cols-2 gap-3">
              <Button className="min-h-11" disabled={isBusy || activePayslip.status !== "published"} onClick={() => void runPayslipAction("confirm")} type="button">
                确认工资单
              </Button>
              <Button
                className="min-h-11 border border-[color:var(--client-line)] bg-[color:var(--client-bg-soft)] text-[color:var(--client-text)]"
                disabled={isBusy || activePayslip.status !== "published"}
                onClick={() => void runPayslipAction("dispute")}
                type="button"
              >
                发起申诉
              </Button>
            </div>
          </div>
        </section>
      ) : (
        <section className="rounded-[28px] border border-[color:var(--client-line)] bg-[color:var(--client-surface)] p-5 text-sm font-semibold text-[color:var(--client-muted)]">
          暂无工资单
        </section>
      )}
    </PageScaffold>
  );
}
