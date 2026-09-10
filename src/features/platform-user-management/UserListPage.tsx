import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import "./registerI18n";
import { AdminLayout } from "../../components/admin/AdminLayout";
import { ModuleShell } from "../../components/admin/ModuleShell";
import { readPositiveIntegerSearchParam } from "../../pages/admin/adminSearchParams";
import { UnifiedUserDirectory } from "./UnifiedUserDirectory";
import { UnifiedUserDetailDrawer } from "./UnifiedUserDetailDrawer";

export function UserListPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const detailUserId = readPositiveIntegerSearchParam(searchParams, "detailUserId");

  useEffect(() => {
    setSelectedUserId(detailUserId);
  }, [detailUserId]);

  const openUserDetail = (userId: number) => {
    const params = new URLSearchParams(searchParams);
    params.set("detailUserId", String(userId));
    setSearchParams(params, { replace: true });
    setSelectedUserId(userId);
  };

  const closeUserDetail = () => {
    const params = new URLSearchParams(searchParams);
    params.delete("detailUserId");
    setSearchParams(params, { replace: true });
    setSelectedUserId(null);
  };

  return (
    <AdminLayout>
      <ModuleShell title="用户列表" description="分页查看全部正式用户、身份、会员、经验与绑定状态。">
        <UnifiedUserDirectory onSelect={openUserDetail} scope="operations" />
        <UnifiedUserDetailDrawer onClose={closeUserDetail} scope="operations" userId={selectedUserId} />
      </ModuleShell>
    </AdminLayout>
  );
}
