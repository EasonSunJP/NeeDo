import { MerchantAdminLayout } from "../../components/merchant-admin/MerchantAdminLayout";
import { ModuleShell } from "../../components/admin/ModuleShell";
import { DineFloorWorkspace, DineMenuWorkspace, DineOrderWorkspace } from "./merchant-workspaces";

type AdminDineOrderRouteView = "orders" | "kds" | "serve" | "cashier";

export function MerchantAdminDineOrderRoutePage({ view = "orders" }: { view?: AdminDineOrderRouteView }) {
  return (
    <MerchantAdminLayout>
      <ModuleShell
        title="点单 / オーダー"
        description="店内扫码产生的 DINE_IN 订单履约中心，与原预约订单中心同级但账本独立。"
      >
        <DineOrderWorkspace activeView={view} admin />
      </ModuleShell>
    </MerchantAdminLayout>
  );
}

export function MerchantAdminDineMenuRoutePage() {
  return (
    <MerchantAdminLayout>
      <ModuleShell
        title="菜单 / メニュー"
        description="配置扫码菜单、商品、库存、制作区、设施限定和售罄状态。"
      >
        <DineMenuWorkspace admin />
      </ModuleShell>
    </MerchantAdminLayout>
  );
}

export function MerchantAdminDineFloorRoutePage() {
  return (
    <MerchantAdminLayout>
      <ModuleShell
        title="场控 / 店内"
        description="查看桌台、包厢、床位、服务呼叫、担当人员和二维码绑定状态。"
      >
        <DineFloorWorkspace admin />
      </ModuleShell>
    </MerchantAdminLayout>
  );
}
