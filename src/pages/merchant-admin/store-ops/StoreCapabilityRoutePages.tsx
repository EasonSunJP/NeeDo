import { Navigate, useSearchParams } from "react-router-dom";
import { MerchantAdminLayout } from "../../../components/merchant-admin/MerchantAdminLayout";
import { MerchantStoreOperationsWorkspace } from "../../../components/merchant-admin/MerchantStoreOperationsWorkspace";
import { ModuleShell } from "../../../components/admin/ModuleShell";

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
  return (
    <MerchantAdminLayout>
      <ModuleShell
        title="库存管理"
        description="店铺后台只管理本店库存、耗材预警与补货建议，不再挂在运营后台。"
      >
        <MerchantStoreOperationsWorkspace module="inventory" />
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
