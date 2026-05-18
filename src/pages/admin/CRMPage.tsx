import { AdminLayout } from "../../components/admin/AdminLayout";
import { CustomerManagementModule } from "../../components/admin/CustomerManagementModule";
import { ModuleShell } from "../../components/admin/ModuleShell";
import { Button } from "../../components/ui/Button";
import { useEntityStore } from "../../state/entityStore";

export function CRMPage() {
  const { customers } = useEntityStore();

  return (
    <AdminLayout>
      <ModuleShell
        title="用户管理"
        description="用户搜索、会员种类、标签、LTV、订单次数、最近消费、下次预约、活跃评分和流失预警统一管理。"
        actions={<Button>创建预约</Button>}
      >
        <CustomerManagementModule customers={customers} />
      </ModuleShell>
    </AdminLayout>
  );
}
