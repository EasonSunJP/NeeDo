import { useEffect, useMemo, useState } from "react";
import { ApiClientError } from "../../api/httpClient";
import {
  backofficeRealDataApi,
  mapBackofficeOrder,
  type BackofficeDashboardPayload,
  type BackofficeTechnicianPayload
} from "../../api/backofficeRealData";
import { ModuleShell } from "../../components/admin/ModuleShell";
import { MerchantAdminLayout } from "../../components/merchant-admin/MerchantAdminLayout";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { DataTable } from "../../components/ui/DataTable";
import { MetricCard } from "../../components/ui/MetricCard";
import { statusLabel, yen } from "../../lib/utils";
import type { Metric, Order } from "../../types/domain";

function describeMerchantAnalyticsError(error: unknown) {
  if (error instanceof ApiClientError) {
    if (error.status === 401) return "登录状态已失效，请重新登录";
    if (error.status === 403) return "当前身份没有查看本店分析数据的权限";
    if (error.status >= 500) return "本店分析数据服务暂时不可用，请稍后重试";
  }
  return "本店分析数据加载失败，请检查网络后重试";
}

export function MerchantAdminAnalyticsPage() {
  const [dashboard, setDashboard] = useState<BackofficeDashboardPayload | null>(null);
  const [loadStatus, setLoadStatus] = useState<"loading" | "success" | "error">("loading");
  const [loadError, setLoadError] = useState("");
  const [revision, setRevision] = useState(0);
  const orders = useMemo<Order[]>(
    () => dashboard ? dashboard.orders.map(mapBackofficeOrder) : [],
    [dashboard]
  );

  useEffect(() => {
    let current = true;
    setLoadStatus("loading");
    setLoadError("");
    backofficeRealDataApi.dashboard("merchant-admin")
      .then((payload) => {
        if (!current) return;
        setDashboard(payload);
        setLoadStatus("success");
      })
      .catch((error: unknown) => {
        if (!current) return;
        setDashboard(null);
        setLoadError(describeMerchantAnalyticsError(error));
        setLoadStatus("error");
      });
    return () => {
      current = false;
    };
  }, [revision]);

  const snapshotMetrics: Metric[] = dashboard
    ? [
        ...dashboard.metrics,
        { label: "本店服务 GMV", value: yen(dashboard.finance.estimatedServiceGmvJpy), change: "当前真实快照", tone: "good" },
        { label: "排班占用", value: `${dashboard.schedule.booked}/${dashboard.schedule.total}`, change: "正式排班", tone: "neutral" }
      ]
    : [];
  const shop = dashboard?.shops[0] ?? null;

  return (
    <MerchantAdminLayout>
      <ModuleShell
        title="数据 / 经营驾驶舱"
        description="当前页只展示登录店铺范围内的数据库快照；历史趋势将在正式时间序列聚合上线后启用。"
      >
        {loadStatus === "loading" ? (
          <section className="rounded-lg border border-line bg-white px-5 py-10 text-center shadow-panel" aria-live="polite">
            <p className="text-sm font-black text-ink">正在加载本店真实分析快照</p>
          </section>
        ) : null}

        {loadStatus === "error" ? (
          <section className="rounded-lg border border-coral/30 bg-coral/5 px-5 py-8 text-center shadow-panel" role="alert">
            <h2 className="text-lg font-black text-ink">本店分析快照加载失败</h2>
            <p className="mt-2 text-sm font-bold text-ink/55">{loadError}</p>
            <Button className="mt-4" onClick={() => setRevision((value) => value + 1)}>重新加载本店分析</Button>
          </section>
        ) : null}

        {loadStatus === "success" && dashboard ? (
          <>
            <section className="rounded-lg border border-line bg-[linear-gradient(135deg,#162521,#23473e)] p-5 text-white shadow-panel">
              <p className="text-xs font-black uppercase tracking-[0.14em] text-white/55">当前分析主体</p>
              <h2 className="mt-2 text-2xl font-black">{shop?.name ?? "当前店铺"}</h2>
              <p className="mt-2 text-sm font-bold text-white/60">{shop ? `${shop.city} · ${shop.address}` : "当前身份尚未关联有效店铺资料"}</p>
            </section>

            <section className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {snapshotMetrics.map((metric) => <MetricCard dense key={metric.label} metric={metric} />)}
            </section>

            <section className="mt-5 rounded-lg border border-line bg-paper px-5 py-4">
              <h2 className="font-black text-ink">店铺历史趋势尚未启用</h2>
              <p className="mt-2 text-sm font-bold leading-6 text-ink/55">
                复购、留存、渠道、评价和员工排行需要正式时间序列聚合接口。当前不生成虚构折线、同比、环比或排行；接口完成店铺隔离、权限、口径和时区验收后再开放日期筛选。
              </p>
            </section>

            <div className="mt-5 grid gap-5 xl:grid-cols-2">
              <section className="rounded-lg border border-line bg-white p-4 shadow-panel">
                <h2 className="text-lg font-bold text-ink">本店当前财务结构</h2>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  {[
                    ["服务 GMV", yen(dashboard.finance.estimatedServiceGmvJpy)],
                    ["平台 NDP 收入", `${dashboard.finance.platformNdpRevenue.toLocaleString("ja-JP")} NDP`],
                    ["请求费收入", `${dashboard.finance.requestFeeNdpRevenue.toLocaleString("ja-JP")} NDP`],
                    ["奖励成本", `${dashboard.finance.userRewardNdpCost.toLocaleString("ja-JP")} NDP`],
                    ["待处理冻结", `${dashboard.finance.pendingHoldNdp.toLocaleString("ja-JP")} NDP`],
                    ["未上报收入", yen(dashboard.finance.unknownOrUnreportedServiceAmountJpy)]
                  ].map(([label, value]) => (
                    <div className="rounded-lg bg-paper px-3 py-3" key={label}>
                      <p className="text-[11px] font-bold text-ink/45">{label}</p>
                      <strong className="mt-1 block text-base text-ink">{value}</strong>
                    </div>
                  ))}
                </div>
              </section>

              <section className="rounded-lg border border-line bg-white p-4 shadow-panel">
                <h2 className="text-lg font-bold text-ink">本店当前供给结构</h2>
                <div className="mt-4 grid grid-cols-3 gap-3">
                  {[
                    ["技师", dashboard.technicians.length],
                    ["总时段", dashboard.schedule.total],
                    ["可预约", dashboard.schedule.available]
                  ].map(([label, value]) => (
                    <div className="rounded-lg bg-paper px-3 py-4" key={label}>
                      <p className="text-xs font-bold text-ink/45">{label}</p>
                      <strong className="mt-1 block text-xl text-ink">{value}</strong>
                    </div>
                  ))}
                </div>
              </section>
            </div>

            <section className="mt-5">
              <h2 className="mb-3 text-lg font-bold">本店当前真实订单</h2>
              {orders.length === 0 ? (
                <div className="rounded-lg border border-dashed border-line bg-white px-5 py-8 text-center text-sm font-black text-ink/55">当前店铺没有可分析的真实订单</div>
              ) : (
                <DataTable<Order>
                  columns={[
                    { key: "order", title: "订单", render: (row) => row.orderNo },
                    { key: "customer", title: "顾客", render: (row) => row.customerName },
                    { key: "service", title: "服务", render: (row) => row.itemName },
                    { key: "status", title: "状态", render: (row) => <Badge tone="yellow">{statusLabel(row.status)}</Badge> },
                    { key: "amount", title: "金额", render: (row) => yen(row.amount) }
                  ]}
                  footerPlacement="inline"
                  pageSize={10}
                  rows={orders}
                />
              )}
            </section>

            <section className="mt-5">
              <h2 className="mb-3 text-lg font-bold">本店技师快照</h2>
              {dashboard.technicians.length === 0 ? (
                <div className="rounded-lg border border-dashed border-line bg-white px-5 py-8 text-center text-sm font-black text-ink/55">本店尚未关联技师档案</div>
              ) : (
                <DataTable<BackofficeTechnicianPayload>
                  columns={[
                    { key: "name", title: "技师", render: (row) => row.displayName },
                    { key: "email", title: "邮箱", render: (row) => row.email },
                    { key: "city", title: "城市 / 范围", render: (row) => `${row.city} · ${row.serviceArea ?? "未设置"}` },
                    { key: "status", title: "状态", render: (row) => <Badge tone={row.status === "published" ? "green" : "yellow"}>{row.status}</Badge> }
                  ]}
                  rows={dashboard.technicians}
                />
              )}
            </section>
          </>
        ) : null}
      </ModuleShell>
    </MerchantAdminLayout>
  );
}
