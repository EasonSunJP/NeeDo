import { useEffect, useMemo, useState } from "react";
import {
  backofficeRealDataApi,
  type BackofficeFinanceSettlementPayload
} from "../../api/backofficeRealData";
import {
  merchantFinanceCenterApi,
  type OrderFinanceDetailPayload
} from "../../api/merchantFinanceCenter";
import {
  merchantPayrollCenterApi,
  type PayRunPayload
} from "../../api/merchantPayrollCenter";
import { AdminLayout } from "../../components/admin/AdminLayout";
import { DetailGrid } from "../../components/admin/DetailGrid";
import { ModuleShell } from "../../components/admin/ModuleShell";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { DataTable } from "../../components/ui/DataTable";
import { Drawer } from "../../components/ui/Drawer";
import { FilterBar } from "../../components/ui/FilterBar";
import { yen } from "../../lib/utils";

export function FinancePage() {
  const [selected, setSelected] = useState<BackofficeFinanceSettlementPayload | null>(null);
  const [selectedOrderFinance, setSelectedOrderFinance] = useState<OrderFinanceDetailPayload | null>(null);
  const [settlementRows, setSettlementRows] = useState<BackofficeFinanceSettlementPayload[]>([]);
  const [payRunRows, setPayRunRows] = useState<PayRunPayload[]>([]);
  const financeSummary = useMemo(() => {
    const estimatedServiceGmv = settlementRows.reduce((sum, row) => sum + row.estimatedServiceGmvJpy, 0);
    const platformNdpRevenue = settlementRows.reduce((sum, row) => sum + row.platformNdpRevenue, 0);
    const userRewardCost = settlementRows.reduce((sum, row) => sum + row.userRewardNdpCost, 0);
    const pendingHold = settlementRows.reduce((sum, row) => sum + row.pendingHoldNdp, 0);
    const campaignDiscount = settlementRows.reduce((sum, row) => sum + row.campaignDiscountNdp, 0);
    const unknownIncome = settlementRows.reduce((sum, row) => sum + row.unknownOrUnreportedServiceAmountJpy, 0);

    return [
      ["估算服务 GMV", estimatedServiceGmv, "jpy"],
      ["平台 NDP 净收入", platformNdpRevenue, "ndp"],
      ["用户返点成本", userRewardCost, "ndp"],
      ["待处理冻结", pendingHold, "ndp"],
      ["活动减免", campaignDiscount, "ndp"],
      ["未上报服务收入", unknownIncome, "jpy"]
    ] as const;
  }, [settlementRows]);
  const payrollSummary = useMemo(() => {
    const totalNetPay = payRunRows.reduce((sum, row) => sum + row.totalNetPayJpy, 0);
    const unpaid = payRunRows.reduce((sum, row) => sum + row.unpaidAmountJpy, 0);
    const disputed = payRunRows.reduce(
      (sum, row) => sum + row.payslips.filter((payslip) => payslip.disputeStatus === "disputed").length,
      0
    );

    return { totalNetPay, unpaid, disputed };
  }, [payRunRows]);

  useEffect(() => {
    let activeRequest = true;

    backofficeRealDataApi.financeSettlements("backoffice").then((response) => {
      if (activeRequest) {
        setSettlementRows(response.list);
      }
    }).catch(() => {
      if (activeRequest) {
        setSettlementRows([]);
      }
    });
    merchantPayrollCenterApi.listBackofficePayRuns().then((response) => {
      if (activeRequest) {
        setPayRunRows(response.list);
      }
    }).catch(() => {
      if (activeRequest) {
        setPayRunRows([]);
      }
    });

    return () => {
      activeRequest = false;
    };
  }, []);

  const openSettlement = (row: BackofficeFinanceSettlementPayload) => {
    setSelected(row);
    setSelectedOrderFinance(null);
    void merchantFinanceCenterApi.getBackofficeOrderFinance(row.bookingOrderId).then((detail) => {
      setSelectedOrderFinance(detail);
    }).catch(() => {
      setSelectedOrderFinance(null);
    });
  };

  return (
    <AdminLayout>
      <ModuleShell
        title="财务结算中心"
        description="今日营收、待结算、退款、渠道手续费、商家分账、技师分账、退款审核、结算单导出和发票记录。"
        actions={
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => backofficeRealDataApi.exportFinanceSettlements("backoffice").catch(() => undefined)}>
              导出结算 CSV
            </Button>
            <Button onClick={() => merchantPayrollCenterApi.exportBackofficePayRuns().catch(() => undefined)} variant="secondary">
              导出工资 CSV
            </Button>
          </div>
        }
      >
        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
          {financeSummary.map(([label, value, unit]) => (
            <article className="rounded-lg border border-line bg-white p-4 shadow-panel" key={label}>
              <p className="text-sm text-ink/55">{label}</p>
              <strong className="mt-2 block text-xl">{formatFinanceAmount(Number(value), unit)}</strong>
            </article>
          ))}
        </section>

        <section className="mt-5 rounded-lg border border-line bg-white p-4 shadow-panel">
          <h2 className="font-bold">结算规则配置</h2>
          <div className="mt-3 grid gap-3 md:grid-cols-4">
            {["结算周期 T+7", "平台佣金 8%-18%", "退款自动扣回", "发票月度归档"].map((rule) => (
              <button className="rounded-lg bg-paper p-3 text-left text-sm font-bold" key={rule} type="button">
                {rule}
              </button>
            ))}
          </div>
        </section>

        <section className="mt-5 rounded-lg border border-line bg-white p-4 shadow-panel">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="font-bold">工资单 / Pay Run 只读汇总</h2>
              <p className="mt-1 text-xs font-bold text-ink/45">
                按店铺和周期查看技师工资总额、未支付和申诉状态。
              </p>
            </div>
            <div className="grid gap-2 text-right text-xs font-black text-ink/55 sm:grid-cols-3">
              <span>净应付 {yen(payrollSummary.totalNetPay)}</span>
              <span>未支付 {yen(payrollSummary.unpaid)}</span>
              <span>申诉 {payrollSummary.disputed}</span>
            </div>
          </div>
          <div className="mt-3">
            <DataTable<PayRunPayload>
              columns={[
                { key: "shop", title: "店铺/周期", render: (row) => `${row.shopName} · ${row.periodStart.slice(0, 10)}` },
                { key: "status", title: "状态", render: (row) => <Badge tone={row.status === "paid" || row.status === "locked" ? "green" : row.status === "disputed" ? "red" : "yellow"}>{row.status}</Badge> },
                { key: "net", title: "净应付", render: (row) => yen(row.totalNetPayJpy) },
                { key: "unpaid", title: "未支付", render: (row) => yen(row.unpaidAmountJpy) },
                { key: "disputes", title: "申诉", render: (row) => `${row.payslips.filter((payslip) => payslip.disputeStatus === "disputed").length}` }
              ]}
              pageSize={4}
              rows={payRunRows}
            />
          </div>
        </section>

        <div className="mt-5">
          <FilterBar
            searchPlaceholder="搜索商家、结算单、周期"
            filters={[
              { label: "状态", options: [{ label: "待审核", value: "pending" }, { label: "审核中", value: "reviewing" }, { label: "已打款", value: "paid" }] },
              { label: "周期", options: [{ label: "周结", value: "week" }, { label: "月结", value: "month" }] },
              { label: "城市", options: [{ label: "东京", value: "tokyo" }, { label: "大阪", value: "osaka" }] }
            ]}
          />
        </div>
        <div className="mt-4">
          <DataTable<BackofficeFinanceSettlementPayload>
            columns={[
              { key: "merchant", title: "商家 / 订单", render: (row) => `${row.shopName} / ${row.orderNo}` },
              { key: "gross", title: "估算服务 GMV", render: (row) => yen(row.estimatedServiceGmvJpy) },
              { key: "platform", title: "平台 NDP 收入", render: (row) => formatNdp(row.platformNdpRevenue) },
              { key: "reward", title: "返点成本", render: (row) => formatNdp(row.userRewardNdpCost) },
              { key: "hold", title: "冻结 / 释放", render: (row) => `${formatNdp(row.pendingHoldNdp)} / ${formatNdp(row.releasedNdp)}` },
              { key: "technician", title: "技师收入", render: (row) => `${row.technicianName ?? "-"} / ${yen(row.technicianEstimatedIncomeJpy)}` },
              { key: "income", title: "服务收入", render: (row) => <Badge tone={row.serviceIncomeStatus === "confirmed" ? "green" : row.serviceIncomeStatus === "reported" ? "yellow" : "red"}>{row.serviceIncomeStatus}</Badge> },
              { key: "rules", title: "命中规则", render: (row) => row.appliedFeeRuleIds.slice(0, 2).join(" / ") || "-" },
              { key: "status", title: "钱路状态", render: (row) => <Badge tone={row.moneyTimelineStatus === "complete" ? "green" : "yellow"}>{row.moneyTimelineStatus}</Badge> }
            ]}
            rows={settlementRows}
            onView={openSettlement}
          />
        </div>
      </ModuleShell>

      <Drawer open={Boolean(selected)} title="结算单详情" onClose={() => setSelected(null)}>
        {selected && (
          <div className="space-y-5">
            <DetailGrid
              items={[
                { label: "商家", value: selected.shopName },
                { label: "订单", value: selected.orderNo },
                { label: "估算服务 GMV", value: yen(selected.estimatedServiceGmvJpy) },
                { label: "平台支付收入", value: yen(selected.platformCollectedServiceAmountJpy) },
                { label: "线下上报收入", value: yen(selected.offlineReportedServiceAmountJpy) },
                { label: "未上报服务收入", value: yen(selected.unknownOrUnreportedServiceAmountJpy) },
                { label: "服务收入状态", value: selected.serviceIncomeStatus },
                { label: "支付渠道", value: selected.paymentChannel },
                { label: "平台 NDP 净收入", value: formatNdp(selected.platformNdpRevenue) },
                { label: "用户返点成本", value: formatNdp(selected.userRewardNdpCost) },
                { label: "技师", value: selected.technicianName ?? "-" },
                { label: "技师收入预估", value: yen(selected.technicianEstimatedIncomeJpy) },
                { label: "店铺预估毛利", value: yen(selected.shopEstimatedGrossProfitJpy) },
                { label: "冻结中", value: formatNdp(selected.pendingHoldNdp) },
                { label: "已释放", value: formatNdp(selected.releasedNdp) },
                { label: "结算状态", value: selected.status },
                { label: "钱路状态", value: selected.moneyTimelineStatus }
              ]}
            />
            <section className="rounded-lg border border-line bg-paper p-4">
              <h3 className="font-black">Money Timeline</h3>
              <div className="mt-3 grid gap-2">
                {(selectedOrderFinance?.moneyTimeline ?? selected.moneyTimeline).slice(0, 8).map((event, index) => {
                  const item = event as {
                    type?: string;
                    label?: string;
                    status?: string;
                    amountJpy?: number;
                    amountNdp?: number;
                    occurredAt?: string;
                  };

                  return (
                    <div className="flex items-center justify-between gap-3 rounded-lg bg-white px-3 py-2" key={`${item.type ?? "event"}-${item.occurredAt ?? index}`}>
                      <div>
                        <p className="text-sm font-bold">{item.label ?? item.type ?? "finance event"}</p>
                        <p className="text-xs text-ink/45">{item.type ?? "-"} · {item.status ?? "-"}</p>
                      </div>
                      <strong className="text-sm">
                        {typeof item.amountJpy === "number" ? yen(item.amountJpy) : typeof item.amountNdp === "number" ? formatNdp(item.amountNdp) : "-"}
                      </strong>
                    </div>
                  );
                })}
              </div>
            </section>
            <div className="flex flex-wrap gap-2">
              {["结算审核", "商家分账", "技师分账", "退款审核", "结算单导出", "发票记录"].map((action) => (
                <Button key={action} size="sm" variant="secondary">
                  {action}
                </Button>
              ))}
            </div>
          </div>
        )}
      </Drawer>
    </AdminLayout>
  );
}

function formatNdp(value: number) {
  return `${value.toLocaleString("ja-JP")} NDP`;
}

function formatFinanceAmount(value: number, unit: "jpy" | "ndp") {
  return unit === "ndp" ? formatNdp(value) : yen(value);
}
