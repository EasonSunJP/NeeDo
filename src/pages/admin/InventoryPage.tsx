import { AdminLayout } from "../../components/admin/AdminLayout";
import { ModuleShell } from "../../components/admin/ModuleShell";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";

const requirements = [
  "InventoryItem、InventoryLocation 与 StockMovement 表",
  "采购、调拨、盘点与出入库状态机 API",
  "幂等键、库存锁与审计日志",
  "预警、聚合统计与导出合同"
];

export function InventoryPage() {
  return (
    <AdminLayout>
      <ModuleShell
        title="库存管理"
        description="运营库存视图需要跨店铺权限、真实单据、库位和库存移动合同。"
        actions={<Badge tone="yellow">未启用</Badge>}
      >
        <section className="rounded-lg border border-line bg-white p-6 shadow-panel">
          <div className="max-w-3xl">
            <h2 className="text-xl font-black text-ink">正式库存功能尚未启用</h2>
            <p className="mt-3 text-sm font-bold leading-7 text-ink/60">
              当前不会展示模拟库存、预警或补货建议，也不会开放没有数据库事务、RBAC 和审计证据的采购、调拨、盘点、入库或出库操作。
            </p>
          </div>
          <div className="mt-6 grid gap-3 md:grid-cols-2">
            {requirements.map((requirement, index) => (
              <article className="rounded-lg border border-line bg-paper p-4" key={requirement}>
                <span className="text-xs font-black text-moss">上线条件 {index + 1}</span>
                <p className="mt-2 text-sm font-black text-ink">{requirement}</p>
              </article>
            ))}
          </div>
          <div className="mt-6 flex flex-wrap gap-2">
            <Button to="/admin/orders" variant="secondary">查看正式订单</Button>
            <Button to="/admin/finance" variant="secondary">查看正式财务数据</Button>
          </div>
        </section>
      </ModuleShell>
    </AdminLayout>
  );
}
