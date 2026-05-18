import { AdminLayout } from "../../components/admin/AdminLayout";
import { ModuleShell } from "../../components/admin/ModuleShell";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { DataTable } from "../../components/ui/DataTable";
import { FilterBar } from "../../components/ui/FilterBar";
import { Tabs } from "../../components/ui/Tabs";
import { reviews } from "../../data/mock";
import { useEntityStore } from "../../state/entityStore";
import type { Review } from "../../types/domain";

const tabs = ["全部评价", "好评", "中评", "差评", "未回复评价", "敏感评价"];

export function ReviewsPage() {
  const { customers, technicians, stores } = useEntityStore();
  const getCustomerDisplayName = (name: string) => {
    const customer = customers.find((item) => item.name === name || item.nickname === name);
    return customer?.nickname ? `${customer.nickname} / ${customer.name}` : customer?.name ?? name;
  };
  const getTargetDisplayName = (name: string) => {
    const technician = technicians.find((item) => item.name === name || item.nickname === name);
    if (technician) {
      return technician.nickname ? `${technician.nickname} / ${technician.name}` : technician.name;
    }

    const store = stores.find((item) => item.name === name);
    return store?.name ?? name;
  };

  return (
    <AdminLayout>
      <ModuleShell
        title="评价中心"
        description="评价回复、标记处理、风控识别、敏感评价监控和差评预警。"
        actions={<Button>评价规则</Button>}
      >
        <Tabs active="全部评价" items={tabs} onChange={() => undefined} />
        <section className="mt-4 grid gap-3 md:grid-cols-4">
          {[
            ["平均评分", "4.72"],
            ["未回复", "128"],
            ["差评预警", "17"],
            ["敏感评价", "6"]
          ].map(([label, value]) => (
            <article className="rounded-lg border border-line bg-white p-4 shadow-panel" key={label}>
              <p className="text-sm text-ink/55">{label}</p>
              <strong className="mt-2 block text-2xl">{value}</strong>
            </article>
          ))}
        </section>
        <div className="mt-5">
          <FilterBar
            searchPlaceholder="搜索评价内容、客户、门店、技师"
            filters={[
              { label: "评分", options: [{ label: "5 星", value: "5" }, { label: "1-2 星", value: "low" }] },
              { label: "回复状态", options: [{ label: "未回复", value: "unreplied" }, { label: "已回复", value: "replied" }] },
              { label: "风控状态", options: [{ label: "敏感", value: "sensitive" }, { label: "正常", value: "normal" }] }
            ]}
          />
        </div>
        <div className="mt-4">
          <DataTable<Review>
            columns={[
              { key: "customer", title: "客户", render: (row) => getCustomerDisplayName(row.customerName) },
              { key: "target", title: "评价对象", render: (row) => getTargetDisplayName(row.targetName) },
              { key: "rating", title: "评分", render: (row) => `★ ${row.rating}` },
              { key: "tone", title: "类型", render: (row) => <Badge tone={row.tone === "negative" ? "red" : row.tone === "neutral" ? "yellow" : "green"}>{row.tone}</Badge> },
              { key: "content", title: "内容", render: (row) => row.content },
              { key: "reply", title: "回复", render: (row) => (row.replied ? "已回复" : "未回复") }
            ]}
            rows={reviews}
          />
        </div>
      </ModuleShell>
    </AdminLayout>
  );
}
