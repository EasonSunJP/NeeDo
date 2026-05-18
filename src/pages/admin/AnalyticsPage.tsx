import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { AdminLayout } from "../../components/admin/AdminLayout";
import { ChartPanel } from "../../components/admin/ChartPanel";
import { ModuleShell } from "../../components/admin/ModuleShell";
import { DataTable } from "../../components/ui/DataTable";
import { FilterBar } from "../../components/ui/FilterBar";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { cities, services } from "../../data/mock";
import { yen } from "../../lib/utils";
import { useEntityStore } from "../../state/entityStore";
import type { City, ServiceItem, Store, Technician } from "../../types/domain";
import { DataBigScreenPage } from "./DataBigScreenPage";

const ranges = ["近7天", "近30天", "近90天", "自定义"];
const analysisCards = [
  ["复购趋势", "41.8%", "+3.4%"],
  ["留存分析", "D30 28.6%", "+1.9%"],
  ["高峰时段", "19:00-22:00", "晚高峰"],
  ["订单来源", "App 62%", "+7.1%"],
  ["渠道转化", "LINE 18.4%", "+4.2%"],
  ["退款原因", "改期失败 34%", "-2.6%"],
  ["评价趋势", "4.72/5", "+0.08"],
  ["城市增长", "大阪 +21%", "供给增加"]
];

export function AnalyticsPage() {
  const { stores, technicians, revision: entityRevision } = useEntityStore();
  const [searchParams] = useSearchParams();
  const rankedTechnicians = useMemo(
    () => [...technicians].sort((left, right) => right.orderCount - left.orderCount),
    [entityRevision, technicians]
  );
  const rankedStores = useMemo(
    () => [...stores].sort((left, right) => right.reviewCount - left.reviewCount),
    [entityRevision, stores]
  );

  if (searchParams.get("module") === "big-screen") {
    return <DataBigScreenPage />;
  }

  return (
    <AdminLayout>
      <ModuleShell
        title="分析中心"
        description="覆盖营收、订单、用户、复购、留存、来源、城市区域、商家技师排名和退款评价趋势。"
        actions={<Button>保存视图</Button>}
      >
        <FilterBar
          searchPlaceholder="搜索城市、类目、门店"
          filters={[
            { label: "城市", options: cities.map((city) => ({ label: city.name, value: city.id })) },
            { label: "类目", options: services.map((service) => ({ label: service.name, value: service.id })) },
            { label: "门店", options: stores.map((store) => ({ label: store.name, value: store.id })) }
          ]}
          actions
        />

        <div className="mt-4 flex flex-wrap gap-2">
          {ranges.map((range, index) => (
            <button className={`rounded-lg px-3 py-2 text-sm font-bold ${index === 1 ? "bg-ink text-white" : "bg-white text-ink/65"}`} key={range}>
              {range}
            </button>
          ))}
        </div>

        <section className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {analysisCards.map(([title, value, change]) => (
            <article className="rounded-lg border border-line bg-white p-4 shadow-panel" key={title}>
              <p className="text-sm text-ink/55">{title}</p>
              <strong className="mt-2 block text-2xl">{value}</strong>
              <Badge className="mt-3" tone="green">{change}</Badge>
            </article>
          ))}
        </section>

        <div className="mt-5 grid gap-5 xl:grid-cols-3">
          <ChartPanel title="流水趋势" series="revenue" />
          <ChartPanel title="客流量趋势" series="users" />
          <ChartPanel title="客单价趋势" series="avgOrder" />
        </div>

        <div className="mt-5 grid gap-5 xl:grid-cols-3">
          <section className="xl:col-span-1">
            <h2 className="mb-3 text-lg font-bold">城市 / 区域分析</h2>
            <DataTable<City>
              columns={[
                { key: "name", title: "城市", render: (row) => `${row.name} ${row.prefecture}` },
                { key: "stores", title: "门店", render: (row) => row.activeStores },
                { key: "tech", title: "技师", render: (row) => row.activeTechnicians }
              ]}
              footerPlacement="inline"
              rows={cities}
            />
          </section>
          <section className="xl:col-span-1">
            <h2 className="mb-3 text-lg font-bold">服务类目排名</h2>
            <DataTable<ServiceItem>
              columns={[
                { key: "name", title: "服务", render: (row) => row.name },
                { key: "sales", title: "销量", render: (row) => row.sales },
                { key: "price", title: "起价", render: (row) => yen(row.priceFrom) }
              ]}
              footerPlacement="inline"
              rows={services}
              pageSize={10}
            />
          </section>
          <section className="xl:col-span-1">
            <h2 className="mb-3 text-lg font-bold">技师排名</h2>
            <DataTable<Technician>
              columns={[
                { key: "name", title: "技师", render: (row) => row.nickname ? `${row.nickname} / ${row.name}` : row.name },
                { key: "rating", title: "评分", render: (row) => row.rating },
                { key: "orders", title: "订单", render: (row) => row.orderCount }
              ]}
              footerPlacement="inline"
              rows={rankedTechnicians}
            />
          </section>
        </div>

        <section className="mt-5">
          <h2 className="mb-3 text-lg font-bold">商家排名</h2>
          <DataTable<Store>
            columns={[
              { key: "rank", title: "排名", render: (row) => row.rankLabel },
              { key: "name", title: "店铺", render: (row) => row.name },
              { key: "area", title: "区域", render: (row) => row.area },
              { key: "rating", title: "评分", render: (row) => row.rating },
              { key: "reviews", title: "评论", render: (row) => row.reviewCount }
            ]}
            footerPlacement="inline"
            rows={rankedStores}
          />
        </section>
      </ModuleShell>
    </AdminLayout>
  );
}
