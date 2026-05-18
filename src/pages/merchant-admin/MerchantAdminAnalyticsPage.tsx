import { MerchantAdminLayout } from "../../components/merchant-admin/MerchantAdminLayout";
import { ModuleShell } from "../../components/admin/ModuleShell";
import { orders, settlements } from "../../data/mock";
import { ShopAnalyticsDashboard } from "../../features/shop-analytics/ShopAnalyticsDashboard";
import { useEntityStore } from "../../state/entityStore";
import { getMerchantAdminDemo } from "../../data/merchantAdmin";

export function MerchantAdminAnalyticsPage() {
  const { customers, stores, technicians, revision } = useEntityStore();
  const merchantAdminDemo = getMerchantAdminDemo();

  return (
    <MerchantAdminLayout>
      <ModuleShell
        title="数据 / 经营驾驶舱"
        description="手机端和商户后台共用同一套经营口径，支持时间筛选、日周月视图、订单漏斗、员工排行、NDP、财务拆解和异常处理。"
      >
        <ShopAnalyticsDashboard
          customers={customers}
          key={revision}
          orders={orders}
          settlements={settlements}
          store={merchantAdminDemo.store}
          stores={stores}
          surface="admin"
          technicians={technicians}
        />
      </ModuleShell>
    </MerchantAdminLayout>
  );
}
