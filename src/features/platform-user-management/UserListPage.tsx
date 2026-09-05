import { useState } from "react";
import "./registerI18n";
import { AdminLayout } from "../../components/admin/AdminLayout";
import { ModuleShell } from "../../components/admin/ModuleShell";
import { UnifiedUserDirectory } from "./UnifiedUserDirectory";
import { UnifiedUserDetailDrawer } from "./UnifiedUserDetailDrawer";

export function UserListPage() {
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);

  return (
    <AdminLayout>
      <ModuleShell title="用户列表" description="分页查看全部正式用户、身份、会员、经验与绑定状态。">
        <UnifiedUserDirectory onSelect={setSelectedUserId} scope="operations" />
        <UnifiedUserDetailDrawer onClose={() => setSelectedUserId(null)} scope="operations" userId={selectedUserId} />
      </ModuleShell>
    </AdminLayout>
  );
}
