import { Navigate, useSearchParams } from "react-router-dom";
import { MerchantAdminLayout } from "../../../components/merchant-admin/MerchantAdminLayout";
import { MerchantStoreOperationsWorkspace } from "../../../components/merchant-admin/MerchantStoreOperationsWorkspace";
import { ModuleShell } from "../../../components/admin/ModuleShell";
import { Badge } from "../../../components/ui/Badge";
import { Button } from "../../../components/ui/Button";

type LegacyStoreModule = "floorplan" | "inventory" | "finance";

function normalizeLegacyStoreModule(value: string | null): LegacyStoreModule {
  if (value === "inventory" || value === "finance") {
    return value;
  }

  return "floorplan";
}

export function MerchantAdminStoreOpsLegacyRedirectPage() {
  const [searchParams] = useSearchParams();
  const module = normalizeLegacyStoreModule(searchParams.get("module"));
  const target = {
    floorplan: "/merchant-admin/stage-layout",
    inventory: "/merchant-admin/inventory",
    finance: "/merchant-admin/finance"
  }[module];

  return <Navigate replace to={target} />;
}

export function MerchantAdminStageLayoutPage() {
  return (
    <MerchantAdminLayout>
      <ModuleShell
        title="场控布局"
        description="店铺后台只管理本店场地和工位布局，不再挂在运营后台。"
      >
        <MerchantStoreOperationsWorkspace module="stage-layout" />
      </ModuleShell>
    </MerchantAdminLayout>
  );
}

export function MerchantAdminInventoryPage() {
  const requirements = [
    "InventoryItem、InventoryLocation 与 StockMovement 表",
    "采购、调拨、盘点与出入库状态机 API",
    "幂等键、库存锁与审计日志",
    "预警、聚合统计与导出合同"
  ];

  return (
    <MerchantAdminLayout>
      <ModuleShell
        title="库存管理"
        description="正式库存需要可追溯的物料、库位、移动记录和单据状态机。"
        actions={<Badge tone="yellow">未启用</Badge>}
      >
        <section className="rounded-lg border border-line bg-white p-6 shadow-panel">
          <div className="max-w-3xl">
            <h2 className="text-xl font-black text-ink">正式库存功能尚未启用</h2>
            <p className="mt-3 text-sm font-bold leading-7 text-ink/60">
              当前不会展示模拟库存、预警或补货建议，也不会开放没有数据库事务和审计证据的采购、调拨、盘点、入库或出库操作。
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
            <Button to="/merchant-admin/orders" variant="secondary">查看正式订单</Button>
            <Button to="/merchant-admin/finance" variant="secondary">查看正式财务</Button>
          </div>
        </section>
      </ModuleShell>
    </MerchantAdminLayout>
  );
}

export function MerchantAdminFinancePage() {
  return (
    <MerchantAdminLayout>
      <ModuleShell
        title="财务结算"
        description="店铺后台只看本店结算、退款影响和收款信息。"
      >
        <MerchantStoreOperationsWorkspace module="finance" />
      </ModuleShell>
    </MerchantAdminLayout>
  );
}
