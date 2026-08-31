import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ApiClientError } from "../../api/httpClient";
import {
  backofficeRealDataApi,
  mapBackofficeOrder,
  type BackofficeDashboardPayload,
  type BackofficeShopPayload,
  type BackofficeTechnicianPayload
} from "../../api/backofficeRealData";
import { AdminLayout } from "../../components/admin/AdminLayout";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { DataTable } from "../../components/ui/DataTable";
import { MetricCard } from "../../components/ui/MetricCard";
import { TitleWithInfo } from "../../components/ui/TitleWithInfo";
import { statusLabel, yen } from "../../lib/utils";
import type { Order } from "../../types/domain";

function DashboardTableHeader({ title, to }: { title: string; to: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <h2 className="text-lg font-bold">{title}</h2>
      <Link className="rounded-lg border border-line bg-white px-3 py-2 text-xs font-black text-moss" to={to}>
        更多
      </Link>
    </div>
  );
}

function describeDashboardError(error: unknown) {
  if (error instanceof ApiClientError) {
    if (error.status === 401) return "登录状态已失效，请重新登录";
    if (error.status === 403) return "当前身份没有查看经营数据的权限";
    if (error.status >= 500) return "经营数据服务暂时不可用，请稍后重试";
  }
  return "经营数据加载失败，请检查网络后重试";
}

export function DashboardPage() {
  const [dashboard, setDashboard] = useState<BackofficeDashboardPayload | null>(null);
  const [loadStatus, setLoadStatus] = useState<"loading" | "success" | "error">("loading");
  const [loadError, setLoadError] = useState("");
  const [revision, setRevision] = useState(0);
  const realOrders = useMemo<Order[]>(
    () => dashboard ? dashboard.orders.map(mapBackofficeOrder) : [],
    [dashboard]
  );

  useEffect(() => {
    let activeRequest = true;
    setLoadStatus("loading");
    setLoadError("");
    backofficeRealDataApi.dashboard("backoffice", { period: "last7days" })
      .then((payload) => {
        if (!activeRequest) return;
        setDashboard(payload);
        setLoadStatus("success");
      })
      .catch((error: unknown) => {
        if (!activeRequest) return;
        setDashboard(null);
        setLoadError(describeDashboardError(error));
        setLoadStatus("error");
      });
    return () => {
      activeRequest = false;
    };
  }, [revision]);

  return (
    <AdminLayout>
      <div className="space-y-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-bold text-moss">NeeDo 指挥中心</p>
            <TitleWithInfo
              as="h1"
              className="mt-1"
              info="平台经营指标、订单、排班、财务、店铺和技师均来自当前数据库聚合。"
              label="数据大盘说明"
              title="数据大盘"
              titleClassName="text-3xl font-black"
              variant="paper"
            />
          </div>
          <div className="flex gap-2">
            <Link className="rounded-lg border border-line bg-white px-4 py-2 text-sm font-bold" to="/admin/orders">处理订单</Link>
            <Link className="rounded-lg bg-moss px-4 py-2 text-sm font-bold text-white" to="/admin/finance">财务对账</Link>
          </div>
        </div>

        {loadStatus === "loading" ? (
          <section className="rounded-lg border border-line bg-white px-5 py-10 text-center shadow-panel" aria-live="polite">
            <p className="text-sm font-black text-ink">正在加载真实经营数据</p>
          </section>
        ) : null}

        {loadStatus === "error" ? (
          <section className="rounded-lg border border-coral/30 bg-coral/5 px-5 py-8 text-center shadow-panel" role="alert">
            <h2 className="text-lg font-black text-ink">经营数据加载失败</h2>
            <p className="mt-2 text-sm font-bold text-ink/55">{loadError}</p>
            <Button className="mt-4" onClick={() => setRevision((current) => current + 1)}>重新加载经营数据</Button>
          </section>
        ) : null}

        {loadStatus === "success" && dashboard ? (
          <>
            <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {dashboard.metrics.map((metric) => <MetricCard dense key={metric.label} metric={metric} />)}
            </section>

            <div className="grid gap-5 xl:grid-cols-2">
              <section className="rounded-lg border border-line bg-white p-4 shadow-panel">
                <h2 className="font-bold">正式排班库存</h2>
                <div className="mt-4 grid grid-cols-3 gap-3">
                  {[
                    ["总时段", dashboard.schedule.total],
                    ["可预约", dashboard.schedule.available],
                    ["已占用", dashboard.schedule.booked]
                  ].map(([label, value]) => (
                    <div className="rounded-lg bg-paper px-3 py-4" key={label}>
                      <p className="text-xs font-bold text-ink/45">{label}</p>
                      <strong className="mt-1 block text-xl text-ink">{value}</strong>
                    </div>
                  ))}
                </div>
              </section>

              <section className="rounded-lg border border-line bg-white p-4 shadow-panel">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="font-bold">真实财务汇总</h2>
                  <Link className="text-xs font-black text-moss" to="/admin/finance">查看对账</Link>
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  {[
                    ["服务 GMV", yen(dashboard.finance.estimatedServiceGmvJpy)],
                    ["平台 NDP 收入", `${dashboard.finance.platformNdpRevenue.toLocaleString("ja-JP")} NDP`],
                    ["用户奖励成本", `${dashboard.finance.userRewardNdpCost.toLocaleString("ja-JP")} NDP`],
                    ["待处理冻结", `${dashboard.finance.pendingHoldNdp.toLocaleString("ja-JP")} NDP`],
                    ["请求费收入", `${dashboard.finance.requestFeeNdpRevenue.toLocaleString("ja-JP")} NDP`],
                    ["未上报服务收入", yen(dashboard.finance.unknownOrUnreportedServiceAmountJpy)]
                  ].map(([label, value]) => (
                    <div className="rounded-lg bg-paper px-3 py-3" key={label}>
                      <p className="text-[11px] font-bold text-ink/45">{label}</p>
                      <strong className="mt-1 block text-base text-ink">{value}</strong>
                    </div>
                  ))}
                </div>
              </section>
            </div>

            <section className="space-y-3">
              <DashboardTableHeader title="真实订单" to="/admin/orders" />
              {realOrders.length === 0 ? (
                <div className="rounded-lg border border-dashed border-line bg-white px-5 py-8 text-center text-sm font-black text-ink/55">当前没有真实订单</div>
              ) : (
                <DataTable<Order>
                  columns={[
                    { key: "no", title: "订单", render: (row) => row.orderNo },
                    { key: "customer", title: "客户", render: (row) => row.customerName },
                    { key: "item", title: "服务", render: (row) => row.itemName },
                    { key: "store", title: "店铺", render: (row) => row.storeName ?? "--" },
                    { key: "time", title: "预约时间", render: (row) => row.bookedAt },
                    { key: "status", title: "状态", render: (row) => <Badge tone="yellow">{statusLabel(row.status)}</Badge> },
                    { key: "amount", title: "金额", render: (row) => yen(row.amount) }
                  ]}
                  footerPlacement="inline"
                  pageSize={10}
                  rows={realOrders.slice(0, 10)}
                />
              )}
            </section>

            <div className="grid gap-5 xl:grid-cols-2">
              <section className="space-y-3">
                <DashboardTableHeader title="店铺审核与经营状态" to="/admin/merchants" />
                <DataTable<BackofficeShopPayload>
                  columns={[
                    { key: "name", title: "店铺", render: (row) => row.name },
                    { key: "city", title: "城市", render: (row) => row.city },
                    { key: "owner", title: "负责人账号", render: (row) => row.ownerEmail ?? "未绑定" },
                    { key: "status", title: "状态", render: (row) => <Badge tone={row.status === "published" ? "green" : "yellow"}>{row.status}</Badge> }
                  ]}
                  footerPlacement="inline"
                  pageSize={8}
                  rows={dashboard.shops}
                />
              </section>

              <section className="space-y-3">
                <DashboardTableHeader title="真实技师档案" to="/admin/technicians" />
                <DataTable<BackofficeTechnicianPayload>
                  columns={[
                    { key: "name", title: "技师", render: (row) => row.displayName },
                    { key: "store", title: "门店", render: (row) => row.shopName ?? "未绑定" },
                    { key: "city", title: "城市", render: (row) => row.city },
                    { key: "status", title: "状态", render: (row) => <Badge tone={row.status === "published" ? "green" : "neutral"}>{row.status}</Badge> }
                  ]}
                  footerPlacement="inline"
                  pageSize={8}
                  rows={dashboard.technicians}
                />
              </section>
            </div>

            <section className="rounded-lg border border-line bg-paper px-5 py-4">
              <h2 className="font-black text-ink">尚未启用的运营模块</h2>
              <p className="mt-2 text-sm font-bold leading-6 text-ink/55">
                城市趋势、现场工单、风控评分和商家健康分尚未具备正式聚合接口，因此本正式看板不展示演示指标。相关接口完成并通过权限与口径验收后再启用。
              </p>
            </section>
          </>
        ) : null}
      </div>
    </AdminLayout>
  );
}
