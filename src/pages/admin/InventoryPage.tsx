import { useMemo, useState } from "react";
import { AdminLayout } from "../../components/admin/AdminLayout";
import { ModuleShell } from "../../components/admin/ModuleShell";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { DataTable } from "../../components/ui/DataTable";
import { Drawer } from "../../components/ui/Drawer";
import { FilterBar } from "../../components/ui/FilterBar";
import { inventoryItems } from "../../data/mock";
import type { InventoryItem } from "../../types/domain";

function getInventoryUsage(item: InventoryItem) {
  return Array.from({ length: 7 }, (_, index) => {
    const out = 6 + ((item.id.charCodeAt(item.id.length - 1) + index * 3) % 18);
    const incoming = index % 3 === 0 ? 28 + index * 4 : 0;

    return {
      date: `4/${7 + index}`,
      out,
      incoming,
      remaining: Math.max(item.warningLine - 16, item.stock - (6 - index) * 4 + incoming)
    };
  });
}

export function InventoryPage() {
  const [selected, setSelected] = useState<InventoryItem | null>(null);
  const selectedUsage = useMemo(() => (selected ? getInventoryUsage(selected) : []), [selected]);
  const maxUsage = Math.max(...selectedUsage.map((item) => Math.max(item.out, item.incoming, item.remaining)), 1);

  return (
    <AdminLayout>
      <ModuleShell
        title="库存管理"
        description="门店库存、预警、采购单、调拨单、入库、出库、耗材规则和库存变动记录。"
        actions={<Button>新建采购单</Button>}
      >
        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            ["库存 SKU", "1,286"],
            ["库存预警", "12"],
            ["今日入库", "48"],
            ["今日出库", "96"]
          ].map(([label, value]) => (
            <article className="rounded-lg border border-line bg-white p-4 shadow-panel" key={label}>
              <p className="text-sm text-ink/55">{label}</p>
              <strong className="mt-2 block text-2xl">{value}</strong>
            </article>
          ))}
        </section>

        <div className="mt-5">
          <FilterBar
            searchPlaceholder="搜索物料、门店、供应商"
            filters={[
              { label: "门店", options: inventoryItems.map((item) => ({ label: item.storeName, value: item.storeName })) },
              { label: "类型", options: [{ label: "耗材", value: "consumable" }, { label: "工具", value: "tool" }] },
              { label: "库存状态", options: [{ label: "预警", value: "warning" }, { label: "正常", value: "normal" }] }
            ]}
          />
        </div>

        <div className="mt-4">
          <DataTable<InventoryItem>
            columns={[
              {
                key: "name",
                title: "库存名称",
                render: (row) => (
                  <div className="flex items-center gap-3">
                    <img alt={row.name} className="h-12 w-12 rounded-lg object-cover" src={row.image} />
                    <div>
                      <p className="font-black">{row.name}</p>
                      <p className="mt-1 text-xs text-ink/45">{row.id}</p>
                    </div>
                  </div>
                )
              },
              { key: "store", title: "门店", render: (row) => row.storeName },
              { key: "category", title: "分类", render: (row) => row.category },
              { key: "stock", title: "库存", render: (row) => `${row.stock}${row.unit}` },
              { key: "warning", title: "预警线", render: (row) => `${row.warningLine}${row.unit}` },
              { key: "changed", title: "最近变动", render: (row) => row.lastChangedAt },
              { key: "status", title: "状态", render: (row) => <Badge tone={row.stock < row.warningLine ? "red" : "green"}>{row.stock < row.warningLine ? "预警" : "正常"}</Badge> },
              {
                key: "detail",
                title: "详细",
                render: (row) => (
                  <Button size="sm" variant="secondary" onClick={() => setSelected(row)}>
                    详细
                  </Button>
                )
              }
            ]}
            rows={inventoryItems}
          />
        </div>

        <section className="mt-5 grid gap-3 md:grid-cols-4">
          {["采购单", "调拨单", "入库", "出库", "耗材规则", "库存变动记录", "供应商", "盘点任务"].map((action) => (
            <button className="rounded-lg border border-line bg-white p-4 text-left font-bold shadow-panel" key={action} type="button">
              {action}
              <p className="mt-2 text-sm font-medium leading-6 text-ink/55">创建、审核、追踪与导出</p>
            </button>
          ))}
        </section>
      </ModuleShell>

      <Drawer open={Boolean(selected)} title="库存使用详情" onClose={() => setSelected(null)}>
        {selected && (
          <div className="space-y-5">
            <section className="overflow-hidden rounded-lg border border-line bg-paper">
              <img alt={selected.name} className="h-52 w-full object-cover" src={selected.image} />
              <div className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-bold text-moss">{selected.storeName}</p>
                    <h3 className="mt-1 text-2xl font-black">{selected.name}</h3>
                    <p className="mt-2 text-sm text-ink/55">{selected.category} · 最近变动 {selected.lastChangedAt}</p>
                  </div>
                  <Badge tone={selected.stock < selected.warningLine ? "red" : "green"}>{selected.stock < selected.warningLine ? "预警" : "正常"}</Badge>
                </div>
                <div className="mt-4 grid grid-cols-3 gap-2">
                  {[
                    ["当前库存", `${selected.stock}${selected.unit}`],
                    ["预警线", `${selected.warningLine}${selected.unit}`],
                    ["建议采购", `${Math.max(0, selected.warningLine * 2 - selected.stock)}${selected.unit}`]
                  ].map(([label, value]) => (
                    <div className="rounded-lg bg-white p-3" key={label}>
                      <p className="text-[11px] font-bold text-ink/45">{label}</p>
                      <strong className="mt-1 block text-sm">{value}</strong>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            <section className="rounded-lg border border-line bg-white p-4 shadow-panel">
              <h3 className="font-black">7 日出入库趋势</h3>
              <div className="mt-4 flex h-52 items-end gap-3 border-b border-line pb-3">
                {selectedUsage.map((item) => (
                  <div className="flex flex-1 flex-col items-center justify-end gap-1" key={item.date}>
                    <div className="flex h-36 w-full items-end justify-center gap-1">
                      <span className="w-3 rounded-t bg-moss" style={{ height: `${Math.max(8, (item.incoming / maxUsage) * 100)}%` }} title={`入库 ${item.incoming}`} />
                      <span className="w-3 rounded-t bg-coral" style={{ height: `${Math.max(8, (item.out / maxUsage) * 100)}%` }} title={`出库 ${item.out}`} />
                      <span className="w-3 rounded-t bg-lemon" style={{ height: `${Math.max(8, (item.remaining / maxUsage) * 100)}%` }} title={`剩余 ${item.remaining}`} />
                    </div>
                    <span className="text-[11px] font-bold text-ink/45">{item.date}</span>
                  </div>
                ))}
              </div>
              <div className="mt-3 flex flex-wrap gap-3 text-xs font-bold text-ink/55">
                <span className="flex items-center gap-1"><i className="h-2.5 w-2.5 rounded-full bg-moss" />入库</span>
                <span className="flex items-center gap-1"><i className="h-2.5 w-2.5 rounded-full bg-coral" />出库</span>
                <span className="flex items-center gap-1"><i className="h-2.5 w-2.5 rounded-full bg-lemon" />剩余</span>
              </div>
            </section>

            <section className="rounded-lg border border-line bg-white p-4 shadow-panel">
              <h3 className="font-black">使用明细</h3>
              <div className="mt-3 space-y-2">
                {selectedUsage.map((item) => (
                  <article className="grid grid-cols-4 items-center gap-2 rounded-lg bg-paper p-3 text-sm" key={item.date}>
                    <strong>{item.date}</strong>
                    <span className="text-ink/55">入库 {item.incoming}</span>
                    <span className="text-ink/55">出库 {item.out}</span>
                    <span className="text-right font-bold">剩余 {item.remaining}</span>
                  </article>
                ))}
              </div>
            </section>
          </div>
        )}
      </Drawer>
    </AdminLayout>
  );
}
