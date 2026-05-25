import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  backofficeRealDataApi,
  mapBackofficeOrder,
  mapBackofficeStore,
  mapBackofficeTechnician,
  type BackofficeDashboardPayload
} from "../../api/backofficeRealData";
import { MerchantAdminLayout } from "../../components/merchant-admin/MerchantAdminLayout";
import { ModuleShell } from "../../components/admin/ModuleShell";
import { Badge } from "../../components/ui/Badge";
import { DataTable } from "../../components/ui/DataTable";
import { MetricCard } from "../../components/ui/MetricCard";
import { TitleWithInfo } from "../../components/ui/TitleWithInfo";
import { statusLabel, yen } from "../../lib/utils";
import { useEntityStore } from "../../state/entityStore";
import type { Metric, Order } from "../../types/domain";

export function MerchantAdminDashboardPage() {
  const { customers } = useEntityStore();
  const [dashboard, setDashboard] = useState<BackofficeDashboardPayload | null>(null);
  const todayOrders = useMemo(() => dashboard?.orders.map(mapBackofficeOrder).slice(0, 8) ?? [], [dashboard]);
  const realTechnicians = useMemo(() => dashboard?.technicians.map(mapBackofficeTechnician) ?? [], [dashboard]);
  const currentStore = useMemo(() => dashboard?.shops[0] ? mapBackofficeStore(dashboard.shops[0]) : null, [dashboard]);
  const getCustomerDisplayName = (order: Order) => {
    const customer = customers.find((item) => item.id === order.customerId);
    return customer?.nickname ? `${customer.nickname} / ${customer.name}` : customer?.name ?? order.customerName;
  };
  const dashboardMetrics: Metric[] = [
    ...(dashboard?.metrics ?? []),
    { label: "门店流水", value: yen(dashboard?.finance.grossAmount ?? 0), change: "真实订单", tone: "good" }
  ];
  const technicianStatusSummary = [
    {
      label: "可派单",
      value: realTechnicians.filter((technician) => technician.status === "available").length
    },
    {
      label: "服务中",
      value: realTechnicians.filter((technician) => technician.status === "busy").length
    },
    {
      label: "离线",
      value: realTechnicians.filter((technician) => technician.status === "off").length
    }
  ];
  const financeSummary = [
    ["平台分账", yen(0)],
    ["待结算", yen(dashboard?.finance.pendingSettlementAmount ?? 0)],
    ["退款影响", yen(dashboard?.finance.refundAmount ?? 0)],
    ["导出状态", "可导出"]
  ] as const;

  useEffect(() => {
    let activeRequest = true;

    backofficeRealDataApi.dashboard("merchant-admin").then((payload) => {
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
    <MerchantAdminLayout>
      <ModuleShell
        title="门店总览"
        description="汇总今日预约、员工状态、财务和顾客变化，只保留本店经营视角，不混入平台产运模块。"
        actions={
          <div className="flex flex-wrap gap-2">
            <Link className="rounded-full border border-line bg-white px-4 py-2 text-sm font-black text-ink" to="/merchant-admin/orders">
              去处理订单
            </Link>
            <Link className="rounded-full bg-moss px-4 py-2 text-sm font-black text-white" to="/merchant-admin/design">
              装修店铺展示页
            </Link>
          </div>
        }
      >
        <section className="overflow-hidden rounded-lg border border-line bg-white shadow-panel">
          <div className="relative min-h-[248px]">
            <img alt={currentStore?.name ?? "当前门店"} className="absolute inset-0 h-full w-full object-cover" src={currentStore?.cover ?? "/images/generated/home-merchant-feature.jpg"} />
            <div className="absolute inset-0 bg-gradient-to-r from-black/78 via-black/50 to-black/12" />
            <div className="relative grid min-h-[248px] gap-6 p-5 text-white lg:grid-cols-[1.15fr_0.85fr]">
              <div className="flex min-h-full flex-col justify-between">
                <div>
                  <TitleWithInfo
                    as="h2"
                    info="汇总门店今日预约、可派员工、流水、顾客变化和需要你处理的事项。"
                    label="商户经营看板说明"
                    title="商户经营看板"
                    titleClassName="text-3xl font-black tracking-[-0.04em] text-white"
                    variant="dark"
                  />
                  <p className="mt-3 max-w-xl text-sm leading-6 text-white/72">
                    {currentStore?.name ?? "当前门店"} · {currentStore?.area ?? ""} · {currentStore?.businessHours ?? ""}
                  </p>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Badge tone="yellow">{currentStore?.openStatus ?? "resting"}</Badge>
                  <Badge tone="green">排班 {dashboard?.schedule.total ?? 0}</Badge>
                  <Badge tone="neutral">技师 {realTechnicians.length}</Badge>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                {[
                  ["店铺资料", "营业时间、地址、电话、照片、菜单", "/merchant-admin/settings"],
                  ["调度中心", "排班当前周期确认、手动/自动/智能排班", "/merchant-admin/dispatch-center/current"],
                  ["信息卡装修", "店铺展示页、列表卡和菜单卡统一维护", "/merchant-admin/design?module=cards"],
                  ["经营驾驶舱", "KPI、订单漏斗、技师排行、NDP 与异常预警", "/merchant-admin/analytics"]
                ].map(([title, caption, to]) => (
                  <Link className="rounded-lg border border-white/12 bg-white/10 p-4 backdrop-blur" key={title} to={to}>
                    <p className="text-sm font-black text-white">{title}</p>
                    <p className="mt-2 text-xs leading-5 text-white/70">{caption}</p>
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {dashboardMetrics.map((metric) => (
            <MetricCard dense key={metric.label} metric={metric} />
          ))}
        </section>

        <div className="mt-5 grid gap-5 xl:grid-cols-[1.08fr,0.92fr]">
          <section className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <TitleWithInfo
                as="h2"
                info="展示今日待处理和最近更新的订单，保留原来的订单处理能力。"
                label="今日预约说明"
                title="今日预约"
                titleClassName="text-lg font-bold text-ink"
                variant="paper"
              />
              <Link className="rounded-full border border-line bg-white px-3 py-2 text-xs font-black text-moss" to="/merchant-admin/orders">
                查看全部
              </Link>
            </div>
            <DataTable<Order>
              columns={[
                { key: "orderNo", title: "订单号", render: (row) => row.orderNo },
                { key: "customer", title: "顾客", render: (row) => getCustomerDisplayName(row) },
                { key: "item", title: "项目", render: (row) => row.itemName },
                { key: "time", title: "预约时间", render: (row) => row.bookedAt },
                { key: "status", title: "状态", render: (row) => <Badge tone="yellow">{statusLabel(row.status)}</Badge> },
                { key: "amount", title: "金额", render: (row) => yen(row.amount) }
              ]}
              pageSize={8}
              rows={todayOrders}
            />
          </section>

          <div className="space-y-5">
            <section className="rounded-lg border border-line bg-white p-4 shadow-panel">
              <div className="flex items-center justify-between gap-3">
                <TitleWithInfo
                  as="h2"
                  info="汇总可派单、服务中和离线员工，便于从 Dashboard 直接判断排班压力。"
                  label="员工状态说明"
                  title="员工状态"
                  titleClassName="text-lg font-bold text-ink"
                  variant="paper"
                />
                <Link className="rounded-full border border-line bg-paper px-3 py-2 text-xs font-black text-moss" to="/merchant-admin/people?module=staff">
                  去员工列表
                </Link>
              </div>
              <div className="mt-4 grid grid-cols-3 gap-2">
                {technicianStatusSummary.map((item) => (
                  <div className="rounded-lg bg-paper px-3 py-3" key={item.label}>
                    <p className="text-[11px] text-ink/45">{item.label}</p>
                    <strong className="mt-1 block text-lg text-ink">{item.value}</strong>
                  </div>
                ))}
              </div>
              <div className="mt-4 space-y-3">
                {realTechnicians.slice(0, 4).map((technician) => (
                  <div className="flex items-center justify-between gap-3 rounded-lg bg-paper px-3 py-3" key={technician.id}>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-black text-ink">{technician.nickname ? `${technician.nickname} / ${technician.name}` : technician.name}</p>
                      <p className="mt-1 truncate text-xs text-ink/55">{technician.skills.slice(0, 2).join(" / ")} · {technician.serviceAreas.slice(0, 2).join(" / ")}</p>
                    </div>
                    <Badge tone={technician.status === "available" ? "green" : technician.status === "busy" ? "yellow" : "neutral"}>
                      {technician.status === "available" ? "可派单" : technician.status === "busy" ? "服务中" : "离线"}
                    </Badge>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-lg border border-line bg-white p-4 shadow-panel">
              <div className="flex items-center justify-between gap-3">
                <TitleWithInfo
                  as="h2"
                  info="把流水、分账、退款影响和导出能力集中展示在一块，减少来回切页。"
                  label="财务概览说明"
                  title="财务概览"
                  titleClassName="text-lg font-bold text-ink"
                  variant="paper"
                />
                <Link className="rounded-full border border-line bg-paper px-3 py-2 text-xs font-black text-moss" to="/merchant-admin/finance">
                  去财务中心
                </Link>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {financeSummary.map(([label, value]) => (
                  <div className="rounded-lg bg-paper px-3 py-3" key={label}>
                    <p className="text-[11px] text-ink/45">{label}</p>
                    <strong className="mt-1 block text-base text-ink">{value}</strong>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </div>
      </ModuleShell>
    </MerchantAdminLayout>
  );
}
