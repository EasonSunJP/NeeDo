import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  backofficeRealDataApi,
  mapBackofficeMerchant,
  mapBackofficeOrder,
  mapBackofficeTechnician,
  type BackofficeDashboardPayload
} from "../../api/backofficeRealData";
import { AdminLayout } from "../../components/admin/AdminLayout";
import { ChartPanel } from "../../components/admin/ChartPanel";
import { DataTable } from "../../components/ui/DataTable";
import { MetricCard } from "../../components/ui/MetricCard";
import { Badge } from "../../components/ui/Badge";
import { TitleWithInfo } from "../../components/ui/TitleWithInfo";
import {
  cityOperatingStats,
  fieldJobs,
  merchantHealthScores,
  riskTickets
} from "../../data/mock";
import { statusLabel, yen } from "../../lib/utils";
import { useEntityStore } from "../../state/entityStore";
import type { FieldJob, Merchant, Metric, Order } from "../../types/domain";

type CityOperatingStat = (typeof cityOperatingStats)[number];
type RiskTicket = (typeof riskTickets)[number];
type MerchantHealthScore = (typeof merchantHealthScores)[number];

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

export function DashboardPage() {
  const { customers, technicians } = useEntityStore();
  const [dashboard, setDashboard] = useState<BackofficeDashboardPayload | null>(null);
  const realOrders = useMemo<Order[]>(
    () => dashboard?.orders.map(mapBackofficeOrder) ?? [],
    [dashboard]
  );
  const realMerchants = useMemo<Merchant[]>(
    () => dashboard?.shops.map(mapBackofficeMerchant) ?? [],
    [dashboard]
  );
  const realMetrics = useMemo<Metric[]>(
    () => dashboard?.metrics ?? [],
    [dashboard]
  );
  const realTechnicians = useMemo(
    () => dashboard?.technicians.map(mapBackofficeTechnician) ?? [],
    [dashboard]
  );
  const getCustomerDisplayName = (order: Order) => {
    const customer = customers.find((item) => item.id === order.customerId);
    return customer?.nickname ? `${customer.nickname} / ${customer.name}` : customer?.name ?? order.customerName;
  };
  const getTechnicianDisplayName = (name?: string | null) => {
    if (!name) {
      return "待分配";
    }

    const technician = technicians.find((item) => item.name === name || item.nickname === name);
    return technician?.nickname ? `${technician.nickname} / ${technician.name}` : technician?.name ?? name;
  };

  useEffect(() => {
    let activeRequest = true;

    backofficeRealDataApi.dashboard("backoffice").then((payload) => {
      if (activeRequest) {
        setDashboard(payload);
      }
    }).catch(() => {
      if (activeRequest) {
        setDashboard(null);
      }
    });

    return () => {
      activeRequest = false;
    };
  }, []);

  return (
    <AdminLayout>
      <div className="space-y-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-bold text-moss">NeeDo 指挥中心</p>
            <TitleWithInfo
              as="h1"
              className="mt-1"
              info="平台、商家、门店、技师的今日经营状态集中展示。"
              label="数据大盘说明"
              title="数据大盘"
              titleClassName="text-3xl font-black"
              variant="paper"
            />
          </div>
          <div className="flex gap-2">
            <Link className="rounded-lg border border-line bg-white px-4 py-2 text-sm font-bold" to="/admin/orders">
              处理订单
            </Link>
            <Link className="rounded-lg border border-line bg-white px-4 py-2 text-sm font-bold" to="/admin/operation-timeline">
              运营时间线
            </Link>
            <Link className="rounded-lg bg-moss px-4 py-2 text-sm font-bold text-white" to="/admin/analytics">
              查看分析
            </Link>
          </div>
        </div>

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {realMetrics.map((metric) => (
            <MetricCard key={metric.label} metric={metric} dense />
          ))}
        </section>

        <div className="grid gap-5 xl:grid-cols-[1.35fr,0.65fr]">
          <ChartPanel
            title="今日流水与客流趋势"
            caption="点击任意日期柱或折线点，可查看当天 24 小时明细。"
            defaultSeries={["revenue", "users", "avgOrder"]}
          />
          <section className="rounded-lg border border-line bg-white p-4 shadow-panel">
            <h2 className="font-bold">运营待办</h2>
            <div className="mt-4 space-y-3">
              {[
                ["待审核商家", realMerchants.filter((merchant) => merchant.status === "pending").length, "/admin/merchants"],
                ["待派工工单", fieldJobs.filter((job) => job.status === "pendingDispatch").length, "/admin/field-jobs"],
                ["退款中订单", realOrders.filter((order) => order.status === "refunding").length, "/admin/orders"],
                ["门店待跟进", realMerchants.filter((merchant) => merchant.status === "pending").length, "/admin/merchants"]
              ].map(([label, count, to]) => (
                <Link className="flex items-center justify-between rounded-lg bg-paper p-3" key={label} to={String(to)}>
                  <span className="text-sm font-bold">{label}</span>
                  <span className="rounded-md bg-coral px-2 py-1 text-xs font-bold text-white">{count}</span>
                </Link>
              ))}
            </div>
          </section>
        </div>

        <section className="space-y-3">
          <h2 className="text-lg font-bold">城市运营战报</h2>
          <DataTable<CityOperatingStat>
            columns={[
              { key: "city", title: "城市", render: (row) => row.city },
              { key: "orders", title: "今日订单", render: (row) => row.activeOrders.toLocaleString("ja-JP") },
              { key: "gmv", title: "GMV", render: (row) => yen(row.gmv) },
              { key: "repeat", title: "复购率", render: (row) => row.repeatRate },
              { key: "response", title: "响应", render: (row) => row.avgResponse },
              { key: "hot", title: "热类目", render: (row) => row.hotCategory },
              {
                key: "health",
                title: "供给",
                render: (row) => <Badge tone={row.supplyHealth === "充足" || row.supplyHealth === "稳定" ? "green" : "yellow"}>{row.supplyHealth}</Badge>
              }
            ]}
            footerPlacement="inline"
            rows={cityOperatingStats}
          />
        </section>

        <div className="grid gap-5 xl:grid-cols-2">
          <section className="space-y-3">
            <DashboardTableHeader title="订单数据" to="/admin/orders" />
            <DataTable<Order>
              columns={[
                { key: "no", title: "订单", render: (row) => row.orderNo },
                { key: "customer", title: "客户", render: (row) => getCustomerDisplayName(row) },
                { key: "item", title: "服务", render: (row) => row.itemName },
                { key: "status", title: "状态", render: (row) => <Badge tone="yellow">{statusLabel(row.status)}</Badge> },
                { key: "amount", title: "金额", render: (row) => yen(row.amount) }
              ]}
              footerPlacement="inline"
              rows={realOrders.slice(0, 10)}
              pageSize={10}
            />
          </section>
          <section className="space-y-3">
            <DashboardTableHeader title="上门工单" to="/admin/field-jobs" />
            <DataTable<FieldJob>
              columns={[
                { key: "time", title: "时间", render: (row) => row.serviceTime },
                { key: "content", title: "内容", render: (row) => row.serviceContent },
                { key: "tech", title: "技师", render: (row) => getTechnicianDisplayName(row.technicianName) },
                { key: "status", title: "状态", render: (row) => <Badge tone={row.status === "exception" ? "red" : "green"}>{statusLabel(row.status)}</Badge> }
              ]}
              footerPlacement="inline"
              rows={fieldJobs.slice(0, 10)}
              pageSize={10}
            />
          </section>
        </div>

        <div className="grid gap-5 xl:grid-cols-2">
          <section className="space-y-3">
            <DashboardTableHeader title="风控与客服工单" to="/admin/reviews" />
            <DataTable<RiskTicket>
              columns={[
                { key: "level", title: "级别", render: (row) => <Badge tone={row.level === "P1" ? "red" : row.level === "P2" ? "yellow" : "neutral"}>{row.level}</Badge> },
                { key: "type", title: "类型", render: (row) => row.type },
                { key: "target", title: "对象", render: (row) => row.target },
                { key: "city", title: "城市", render: (row) => row.city },
                { key: "owner", title: "负责人", render: (row) => row.owner },
                { key: "sla", title: "SLA", render: (row) => row.sla },
                { key: "status", title: "状态", render: (row) => <Badge tone="yellow">{row.status}</Badge> }
              ]}
              footerPlacement="inline"
              rows={riskTickets.slice(0, 10)}
              pageSize={10}
            />
          </section>

          <section className="space-y-3">
            <DashboardTableHeader title="商家健康度" to="/admin/merchants" />
            <DataTable<MerchantHealthScore>
              columns={[
                { key: "merchant", title: "商家", render: (row) => row.merchant },
                { key: "score", title: "健康分", render: (row) => <Badge tone={row.score >= 90 ? "green" : row.score >= 80 ? "yellow" : "red"}>{row.score}</Badge> },
                { key: "orders", title: "30日订单", render: (row) => row.orders30d.toLocaleString("ja-JP") },
                { key: "reply", title: "回复率", render: (row) => row.replyRate },
                { key: "complaint", title: "投诉率", render: (row) => row.complaintRate },
                { key: "settlement", title: "结算", render: (row) => row.settlementStatus },
                { key: "action", title: "动作", render: (row) => row.action }
              ]}
              footerPlacement="inline"
              rows={merchantHealthScores.slice(0, 10)}
              pageSize={10}
            />
          </section>
        </div>

        <section className="space-y-3">
          <DashboardTableHeader title="商家入驻审核" to="/admin/merchants" />
          <DataTable<Merchant>
            columns={[
              { key: "name", title: "商家", render: (row) => row.name },
              { key: "city", title: "城市", render: (row) => row.city },
              { key: "category", title: "类目", render: (row) => row.categories.join("、") },
              { key: "commission", title: "佣金", render: (row) => `${row.commissionRate}%` },
              { key: "status", title: "状态", render: (row) => <Badge tone={row.status === "pending" ? "yellow" : "green"}>{row.status}</Badge> }
            ]}
            footerPlacement="inline"
            rows={realMerchants.slice(0, 10)}
            pageSize={10}
          />
        </section>
        <section className="space-y-3">
          <DashboardTableHeader title="真实技师档案" to="/admin/technicians" />
          <DataTable
            columns={[
              { key: "name", title: "技师", render: (row) => row.name },
              { key: "store", title: "门店", render: (row) => row.storeId || "未绑定" },
              { key: "status", title: "状态", render: (row) => <Badge tone={row.status === "available" ? "green" : "neutral"}>{row.status}</Badge> },
              { key: "account", title: "账号", render: (row) => row.accountUsername ?? "未绑定" }
            ]}
            footerPlacement="inline"
            rows={realTechnicians}
            pageSize={6}
          />
        </section>
      </div>
    </AdminLayout>
  );
}
