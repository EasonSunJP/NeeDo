import { useEffect, useMemo, useState } from "react";
import { ApiClientError } from "../../api/httpClient";
import {
  backofficeRealDataApi,
  mapBackofficeOrder,
  type BackofficeDashboardPayload,
  type BackofficeShopPayload,
  type BackofficeTechnicianPayload
} from "../../api/backofficeRealData";
import { AdminLayout } from "../../components/admin/AdminLayout";
import { ModuleShell } from "../../components/admin/ModuleShell";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { DataTable } from "../../components/ui/DataTable";
import { MetricCard } from "../../components/ui/MetricCard";
import { statusLabel, yen } from "../../lib/utils";
import type { Metric, Order } from "../../types/domain";

function describeAnalyticsError(error: unknown) {
  if (error instanceof ApiClientError) {
    if (error.status === 401) return "登录状态已失效，请重新登录";
    if (error.status === 403) return "当前身份没有查看分析数据的权限";
    if (error.status >= 500) return "分析数据服务暂时不可用，请稍后重试";
  }
  return "分析数据加载失败，请检查网络后重试";
}

export function AnalyticsPage() {
  const [dashboard, setDashboard] = useState<BackofficeDashboardPayload | null>(null);
  const [loadStatus, setLoadStatus] = useState<"loading" | "success" | "error">("loading");
  const [loadError, setLoadError] = useState("");
  const [revision, setRevision] = useState(0);
  const orders = useMemo<Order[]>(
    () => dashboard ? dashboard.orders.map(mapBackofficeOrder) : [],
    [dashboard]
  );

  useEffect(() => {
    let active = true;
    setLoadStatus("loading");
    setLoadError("");
    backofficeRealDataApi.dashboard("backoffice", { period: "last7days" })
      .then((payload) => {
        if (!active) return;
        setDashboard(payload);
        setLoadStatus("success");
      })
      .catch((error: unknown) => {
        if (!active) return;
        setDashboard(null);
        setLoadError(describeAnalyticsError(error));
        setLoadStatus("error");
      });
    return () => {
      active = false;
    };
  }, [revision]);

  const snapshotMetrics: Metric[] = dashboard
    ? [
        ...dashboard.metrics,
        { label: "服务 GMV", value: yen(dashboard.finance.estimatedServiceGmvJpy), change: "当前真实快照", tone: "good" },
        { label: "排班占用", value: `${dashboard.schedule.booked}/${dashboard.schedule.total}`, change: "正式排班", tone: "neutral" }
      ]
    : [];

  return (
    <AdminLayout>
      <ModuleShell
        description="当前页只展示已接通的数据库快照；历史趋势将在正式时间序列聚合上线后启用。"
        title="分析中心"
      >
        {loadStatus === "loading" ? (
          <section className="rounded-lg border border-line bg-white px-5 py-10 text-center shadow-panel" aria-live="polite">
            <p className="text-sm font-black text-ink">正在加载真实分析快照</p>
          </section>
        ) : null}

        {loadStatus === "error" ? (
          <section className="rounded-lg border border-coral/30 bg-coral/5 px-5 py-8 text-center shadow-panel" role="alert">
            <h2 className="text-lg font-black text-ink">分析快照加载失败</h2>
            <p className="mt-2 text-sm font-bold text-ink/55">{loadError}</p>
            <Button className="mt-4" onClick={() => setRevision((current) => current + 1)}>重新加载分析快照</Button>
          </section>
        ) : null}

        {loadStatus === "success" && dashboard ? (
          <>
            <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {snapshotMetrics.map((metric) => <MetricCard dense key={metric.label} metric={metric} />)}
            </section>

            <section className="mt-5 rounded-lg border border-line bg-paper px-5 py-4">
              <h2 className="font-black text-ink">历史趋势尚未启用</h2>
              <p className="mt-2 text-sm font-bold leading-6 text-ink/55">
                复购、留存、渠道、评价和城市趋势需要正式时间序列聚合接口。当前不生成虚构折线、增长率或排行榜；接口完成口径、权限和时区验收后再开放日期筛选与全屏图表。
              </p>
            </section>

            <div className="mt-5 grid gap-5 xl:grid-cols-2">
              <section className="rounded-lg border border-line bg-white p-4 shadow-panel">
                <h2 className="text-lg font-bold text-ink">当前财务结构</h2>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  {[
                    ["服务 GMV", yen(dashboard.finance.estimatedServiceGmvJpy)],
                    ["平台 NDP 收入", `${dashboard.finance.platformNdpRevenue.toLocaleString("ja-JP")} NDP`],
                    ["请求费收入", `${dashboard.finance.requestFeeNdpRevenue.toLocaleString("ja-JP")} NDP`],
                    ["用户奖励成本", `${dashboard.finance.userRewardNdpCost.toLocaleString("ja-JP")} NDP`],
                    ["待处理冻结", `${dashboard.finance.pendingHoldNdp.toLocaleString("ja-JP")} NDP`],
                    ["活动折扣", `${dashboard.finance.campaignDiscountNdp.toLocaleString("ja-JP")} NDP`]
                  ].map(([label, value]) => (
                    <div className="rounded-lg bg-paper px-3 py-3" key={label}>
                      <p className="text-[11px] font-bold text-ink/45">{label}</p>
                      <strong className="mt-1 block text-base text-ink">{value}</strong>
                    </div>
                  ))}
                </div>
              </section>

              <section className="rounded-lg border border-line bg-white p-4 shadow-panel">
                <h2 className="text-lg font-bold text-ink">当前供给结构</h2>
                <div className="mt-4 grid grid-cols-3 gap-3">
                  {[
                    ["店铺", dashboard.shops.length],
                    ["技师", dashboard.technicians.length],
                    ["排班", dashboard.schedule.total]
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
              <h2 className="mb-3 text-lg font-bold">当前真实订单</h2>
              {orders.length === 0 ? (
                <div className="rounded-lg border border-dashed border-line bg-white px-5 py-8 text-center text-sm font-black text-ink/55">当前没有可分析的真实订单</div>
              ) : (
                <DataTable<Order>
                  columns={[
                    { key: "order", title: "订单", render: (row) => row.orderNo },
                    { key: "store", title: "店铺", render: (row) => row.storeName ?? "--" },
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

            <div className="mt-5 grid gap-5 xl:grid-cols-2">
              <section>
                <h2 className="mb-3 text-lg font-bold">店铺快照</h2>
                <DataTable<BackofficeShopPayload>
                  columns={[
                    { key: "name", title: "店铺", render: (row) => row.name },
                    { key: "city", title: "城市", render: (row) => row.city },
                    { key: "status", title: "状态", render: (row) => <Badge tone={row.status === "published" ? "green" : "yellow"}>{row.status}</Badge> }
                  ]}
                  rows={dashboard.shops}
                />
              </section>
              <section>
                <h2 className="mb-3 text-lg font-bold">技师快照</h2>
                <DataTable<BackofficeTechnicianPayload>
                  columns={[
                    { key: "name", title: "技师", render: (row) => row.displayName },
                    { key: "shop", title: "店铺", render: (row) => row.shopName ?? "未绑定" },
                    { key: "status", title: "状态", render: (row) => <Badge tone={row.status === "published" ? "green" : "yellow"}>{row.status}</Badge> }
                  ]}
                  rows={dashboard.technicians}
                />
              </section>
            </div>
          </>
        ) : null}
      </ModuleShell>
    </AdminLayout>
  );
}
