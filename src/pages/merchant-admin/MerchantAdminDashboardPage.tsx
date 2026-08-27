import { useMemo } from "react";
import { Link } from "react-router-dom";
import { ApiClientError } from "../../api/httpClient";
import { mapBackofficeOrder } from "../../api/backofficeRealData";
import { ModuleShell } from "../../components/admin/ModuleShell";
import {
  MerchantAdminLayout,
  type MerchantAdminDashboardResource
} from "../../components/merchant-admin/MerchantAdminLayout";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { DataTable } from "../../components/ui/DataTable";
import { MetricCard } from "../../components/ui/MetricCard";
import { statusLabel, yen } from "../../lib/utils";
import type { Metric, Order } from "../../types/domain";

function describeMerchantDashboardError(error: unknown) {
  if (error instanceof ApiClientError) {
    if (error.status === 401) return "登录状态已失效，请重新登录";
    if (error.status === 403) return "当前身份没有查看本店经营数据的权限";
    if (error.status >= 500) return "本店经营数据服务暂时不可用，请稍后重试";
  }
  return "本店经营数据加载失败，请检查网络后重试";
}

function MerchantAdminDashboardContent({ resource }: { resource: MerchantAdminDashboardResource }) {
  const { dashboard, error, status: loadStatus } = resource;
  const reload = resource.reload;
  const loadError = error ? describeMerchantDashboardError(error) : "";
  const todayOrders = useMemo<Order[]>(
    () => dashboard ? dashboard.orders.map(mapBackofficeOrder).slice(0, 8) : [],
    [dashboard]
  );

  const currentShop = dashboard?.shops[0] ?? null;
  const dashboardMetrics: Metric[] = dashboard
    ? [
        ...dashboard.metrics,
        { label: "门店服务 GMV", value: yen(dashboard.finance.estimatedServiceGmvJpy), change: "真实订单聚合", tone: "good" }
      ]
    : [];

  return (
    <ModuleShell
        actions={
          <div className="flex flex-wrap gap-2">
            <Link className="rounded-full border border-line bg-white px-4 py-2 text-sm font-black text-ink" to="/merchant-admin/orders">去处理订单</Link>
            <Link className="rounded-full bg-moss px-4 py-2 text-sm font-black text-white" to="/merchant-admin/finance">财务中心</Link>
          </div>
        }
        description="订单、排班、员工档案与财务总额均按当前登录店铺范围读取。"
        title="门店总览"
      >
        {loadStatus === "loading" ? (
          <section className="rounded-lg border border-line bg-white px-5 py-10 text-center shadow-panel" aria-live="polite">
            <p className="text-sm font-black text-ink">正在加载本店真实数据</p>
          </section>
        ) : null}

        {loadStatus === "error" ? (
          <section className="rounded-lg border border-coral/30 bg-coral/5 px-5 py-8 text-center shadow-panel" role="alert">
            <h2 className="text-lg font-black text-ink">本店数据加载失败</h2>
            <p className="mt-2 text-sm font-bold text-ink/55">{loadError}</p>
            <Button className="mt-4" onClick={reload}>重新加载本店数据</Button>
          </section>
        ) : null}

        {loadStatus === "success" && dashboard ? (
          <>
            <section className="overflow-hidden rounded-lg border border-line bg-[linear-gradient(135deg,#162521,#23473e)] p-6 text-white shadow-panel">
              <p className="text-xs font-black uppercase tracking-[0.16em] text-white/55">当前经营主体</p>
              <h2 className="mt-2 text-3xl font-black tracking-[-0.04em]">{currentShop?.name ?? "当前店铺"}</h2>
              <p className="mt-3 text-sm font-bold leading-6 text-white/65">
                {currentShop ? `${currentShop.city} · ${currentShop.address}${currentShop.phone ? ` · ${currentShop.phone}` : ""}` : "当前身份尚未关联有效店铺资料"}
              </p>
              <div className="mt-5 flex flex-wrap gap-2">
                <Badge tone={currentShop?.status === "published" ? "green" : "yellow"}>{currentShop?.status ?? "未关联"}</Badge>
                <Badge tone="green">排班 {dashboard.schedule.total}</Badge>
                <Badge tone="neutral">技师档案 {dashboard.technicians.length}</Badge>
                <Badge tone="neutral">真实订单 {dashboard.orders.length}</Badge>
              </div>
            </section>

            <section className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {dashboardMetrics.map((metric) => <MetricCard dense key={metric.label} metric={metric} />)}
            </section>

            <div className="mt-5 grid gap-5 xl:grid-cols-[1.08fr,0.92fr]">
              <section className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-lg font-bold text-ink">本店真实预约</h2>
                  <Link className="rounded-full border border-line bg-white px-3 py-2 text-xs font-black text-moss" to="/merchant-admin/orders">查看全部</Link>
                </div>
                {todayOrders.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-line bg-white px-5 py-8 text-center text-sm font-black text-ink/55">本店当前没有真实订单</div>
                ) : (
                  <DataTable<Order>
                    columns={[
                      { key: "orderNo", title: "订单号", render: (row) => row.orderNo },
                      { key: "customer", title: "顾客", render: (row) => row.customerName },
                      { key: "item", title: "项目", render: (row) => row.itemName },
                      { key: "time", title: "预约时间", render: (row) => row.bookedAt },
                      { key: "status", title: "状态", render: (row) => <Badge tone="yellow">{statusLabel(row.status)}</Badge> },
                      { key: "amount", title: "金额", render: (row) => yen(row.amount) }
                    ]}
                    pageSize={8}
                    rows={todayOrders}
                  />
                )}
              </section>

              <div className="space-y-5">
                <section className="rounded-lg border border-line bg-white p-4 shadow-panel">
                  <div className="flex items-center justify-between gap-3">
                    <h2 className="text-lg font-bold text-ink">正式排班库存</h2>
                    <Link className="text-xs font-black text-moss" to="/merchant-admin/schedule">管理排班</Link>
                  </div>
                  <div className="mt-4 grid grid-cols-3 gap-2">
                    {[
                      ["总时段", dashboard.schedule.total],
                      ["可预约", dashboard.schedule.available],
                      ["已占用", dashboard.schedule.booked]
                    ].map(([label, value]) => (
                      <div className="rounded-lg bg-paper px-3 py-3" key={label}>
                        <p className="text-[11px] font-bold text-ink/45">{label}</p>
                        <strong className="mt-1 block text-lg text-ink">{value}</strong>
                      </div>
                    ))}
                  </div>
                </section>

                <section className="rounded-lg border border-line bg-white p-4 shadow-panel">
                  <div className="flex items-center justify-between gap-3">
                    <h2 className="text-lg font-bold text-ink">真实财务汇总</h2>
                    <Link className="text-xs font-black text-moss" to="/merchant-admin/finance">查看对账</Link>
                  </div>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    {[
                      ["服务 GMV", yen(dashboard.finance.estimatedServiceGmvJpy)],
                      ["平台 NDP 收入", `${dashboard.finance.platformNdpRevenue.toLocaleString("ja-JP")} NDP`],
                      ["奖励成本", `${dashboard.finance.userRewardNdpCost.toLocaleString("ja-JP")} NDP`],
                      ["冻结中", `${dashboard.finance.pendingHoldNdp.toLocaleString("ja-JP")} NDP`],
                      ["未上报收入", yen(dashboard.finance.unknownOrUnreportedServiceAmountJpy)],
                      ["活动折扣", `${dashboard.finance.campaignDiscountNdp.toLocaleString("ja-JP")} NDP`]
                    ].map(([label, value]) => (
                      <div className="rounded-lg bg-paper px-3 py-3" key={label}>
                        <p className="text-[11px] font-bold text-ink/45">{label}</p>
                        <strong className="mt-1 block text-base text-ink">{value}</strong>
                      </div>
                    ))}
                  </div>
                </section>
              </div>
            </div>

            <section className="mt-5 rounded-lg border border-line bg-white p-4 shadow-panel">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-lg font-bold text-ink">本店技师档案</h2>
                <Link className="text-xs font-black text-moss" to="/merchant-admin/people?module=staff">人员管理</Link>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {dashboard.technicians.map((technician) => (
                  <div className="rounded-lg bg-paper px-4 py-3" key={technician.id}>
                    <div className="flex items-center justify-between gap-3">
                      <p className="truncate text-sm font-black text-ink">{technician.displayName}</p>
                      <Badge tone={technician.status === "published" ? "green" : "yellow"}>{technician.status}</Badge>
                    </div>
                    <p className="mt-2 truncate text-xs font-bold text-ink/55">{technician.city} · {technician.serviceArea ?? "未设置服务范围"}</p>
                  </div>
                ))}
                {dashboard.technicians.length === 0 ? <p className="text-sm font-bold text-ink/55">本店尚未关联技师档案</p> : null}
              </div>
            </section>

            <section className="mt-5 rounded-lg border border-line bg-paper px-5 py-4">
              <h2 className="font-black text-ink">尚未启用的商户模块</h2>
              <p className="mt-2 text-sm font-bold leading-6 text-ink/55">
                店铺装修、智能调度和高级经营分析尚未完成正式数据契约，因此总览不提供可点击的演示入口。店铺资料、订单、排班、人员和财务功能继续使用已接通的正式页面。
              </p>
            </section>
          </>
        ) : null}
    </ModuleShell>
  );
}

export function MerchantAdminDashboardPage() {
  return (
    <MerchantAdminLayout>
      {(resource) => <MerchantAdminDashboardContent resource={resource} />}
    </MerchantAdminLayout>
  );
}
