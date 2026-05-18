import { useMemo, useState } from "react";
import { DetailGrid } from "../admin/DetailGrid";
import { Badge } from "../ui/Badge";
import { DataTable } from "../ui/DataTable";
import { Drawer } from "../ui/Drawer";
import { TitleWithInfo } from "../ui/TitleWithInfo";
import { merchantAdminDemo } from "../../data/merchantAdmin";
import { yen } from "../../lib/utils";
import type { InventoryItem, Settlement } from "../../types/domain";

export type MerchantStoreOperationsModule = "stage-layout" | "inventory" | "finance";

const stageLayoutItems = [
  { id: "bed-1", name: "A1 护理床", area: "东区", status: "使用中", utilization: "82%", nextBooking: "19:30 佐藤 美咲" },
  { id: "bed-2", name: "A2 护理床", area: "东区", status: "空闲", utilization: "48%", nextBooking: "20:15 空档" },
  { id: "room-1", name: "静音包间", area: "南区", status: "已预约", utilization: "76%", nextBooking: "21:00 林 小雨" },
  { id: "front-1", name: "前台接待", area: "入口", status: "可用", utilization: "64%", nextBooking: "随时可用" }
];

export function MerchantStoreOperationsWorkspace({
  module
}: {
  module: MerchantStoreOperationsModule;
}) {
  const [selectedInventory, setSelectedInventory] = useState<InventoryItem | null>(null);
  const currentSettlement = merchantAdminDemo.settlements[0];
  const financeRows = useMemo(() => (merchantAdminDemo.settlements.length ? merchantAdminDemo.settlements : []), []);

  const config = {
    "stage-layout": {
      title: "场控布局",
      description: "从店铺角度查看床位、包间和接待区域的占用情况，更适合门店现场调度。",
      content: (
        <div className="grid gap-5 xl:grid-cols-[1fr,0.9fr]">
          <section className="rounded-lg border border-line bg-white p-4 shadow-panel">
            <div className="grid gap-3 sm:grid-cols-2">
              {stageLayoutItems.map((item) => (
                <article className="rounded-lg border border-line bg-paper p-4" key={item.id}>
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-bold text-ink/45">{item.area}</p>
                      <h2 className="mt-1 font-black">{item.name}</h2>
                    </div>
                    <Badge tone={item.status === "空闲" || item.status === "可用" ? "green" : item.status === "已预约" ? "yellow" : "red"}>{item.status}</Badge>
                  </div>
                  <div className="mt-4 rounded-full bg-white p-1">
                    <div className="h-2 rounded-full bg-moss" style={{ width: item.utilization }} />
                  </div>
                  <p className="mt-2 text-xs text-ink/55">利用率 {item.utilization} · 下一段 {item.nextBooking}</p>
                </article>
              ))}
            </div>
          </section>
          <section className="space-y-3">
            <article className="rounded-lg border border-line bg-white p-4 shadow-panel">
              <h2 className="font-black">今日空间摘要</h2>
              <div className="mt-3 grid gap-2 sm:grid-cols-3 xl:grid-cols-1">
                {[
                  ["开放工位", "4 / 6"],
                  ["高峰时段", "19:00 - 22:00"],
                  ["包间预约率", "76%"]
                ].map(([label, value]) => (
                  <div className="rounded-lg bg-paper p-3" key={label}>
                    <p className="text-xs text-ink/45">{label}</p>
                    <strong className="mt-1 block">{value}</strong>
                  </div>
                ))}
              </div>
            </article>
            <article className="rounded-lg border border-line bg-white p-4 shadow-panel">
              <TitleWithInfo
                as="h2"
                info="今晚 20:00 后东区床位利用率会抬高，建议把足底护理移到静音包间，并提前锁定热石护理耗材。"
                label="店长建议说明"
                title="店长建议"
                titleClassName="font-black"
                variant="paper"
              />
            </article>
          </section>
        </div>
      )
    },
    inventory: {
      title: "库存管理",
      description: "只显示本店耗材与工具，不掺平台其他门店的数据。",
      content: (
        <div className="space-y-4">
          <section className="grid gap-3 sm:grid-cols-3">
            {[
              ["库存品项", `${merchantAdminDemo.inventoryItems.length}`],
              ["预警品项", `${merchantAdminDemo.inventoryItems.filter((item) => item.stock <= item.warningLine).length}`],
              ["最近入库", merchantAdminDemo.inventoryItems[0]?.lastChangedAt ?? "-"]
            ].map(([label, value]) => (
              <article className="rounded-lg border border-line bg-white p-4 shadow-panel" key={label}>
                <p className="text-xs font-bold text-ink/50">{label}</p>
                <strong className="mt-2 block text-xl">{value}</strong>
              </article>
            ))}
          </section>
          <DataTable<InventoryItem>
            columns={[
              { key: "name", title: "物品", render: (row) => row.name },
              { key: "category", title: "分类", render: (row) => row.category },
              { key: "stock", title: "库存", render: (row) => `${row.stock}${row.unit}` },
              { key: "warning", title: "预警线", render: (row) => `${row.warningLine}${row.unit}` },
              { key: "changed", title: "最近变动", render: (row) => row.lastChangedAt },
              { key: "status", title: "状态", render: (row) => <Badge tone={row.stock <= row.warningLine ? "red" : "green"}>{row.stock <= row.warningLine ? "需补货" : "充足"}</Badge> }
            ]}
            onView={setSelectedInventory}
            pageSize={8}
            rows={merchantAdminDemo.inventoryItems}
          />
        </div>
      )
    },
    finance: {
      title: "财务结算",
      description: "店铺后台只看本店结算与退款影响，不展示平台级分账规则总表。",
      content: (
        <div className="space-y-4">
          <section className="grid gap-3 sm:grid-cols-4">
            {[
              ["本期流水", yen(currentSettlement?.grossAmount ?? 0)],
              ["平台佣金", yen(currentSettlement?.platformFee ?? 0)],
              ["退款影响", yen(currentSettlement?.refundAmount ?? 0)],
              ["应结算", yen(currentSettlement?.payableAmount ?? 0)]
            ].map(([label, value]) => (
              <article className="rounded-lg border border-line bg-white p-4 shadow-panel" key={label}>
                <p className="text-xs font-bold text-ink/50">{label}</p>
                <strong className="mt-2 block text-xl">{value}</strong>
              </article>
            ))}
          </section>
          <DataTable<Settlement>
            columns={[
              { key: "period", title: "结算周期", render: (row) => row.period },
              { key: "grossAmount", title: "流水", render: (row) => yen(row.grossAmount) },
              { key: "platformFee", title: "平台费", render: (row) => yen(row.platformFee) },
              { key: "refundAmount", title: "退款", render: (row) => yen(row.refundAmount) },
              { key: "payableAmount", title: "应结算", render: (row) => yen(row.payableAmount) },
              { key: "status", title: "状态", render: (row) => <Badge tone={row.status === "paid" ? "green" : row.status === "reviewing" ? "yellow" : "neutral"}>{row.status}</Badge> }
            ]}
            pageSize={6}
            rows={financeRows}
          />
        </div>
      )
    }
  }[module];

  return (
    <>
      {config.content}

      <Drawer onClose={() => setSelectedInventory(null)} open={Boolean(selectedInventory)} title="库存详情">
        {selectedInventory ? (
          <div className="space-y-5">
            <img alt={selectedInventory.name} className="h-56 w-full rounded-lg object-cover" src={selectedInventory.image} />
            <DetailGrid
              items={[
                { label: "物品名称", value: selectedInventory.name },
                { label: "所属门店", value: selectedInventory.storeName },
                { label: "当前库存", value: `${selectedInventory.stock}${selectedInventory.unit}` },
                { label: "预警线", value: `${selectedInventory.warningLine}${selectedInventory.unit}` },
                { label: "分类", value: selectedInventory.category },
                { label: "最近变动", value: selectedInventory.lastChangedAt }
              ]}
            />
          </div>
        ) : null}
      </Drawer>
    </>
  );
}
