import { useLocation } from "react-router-dom";
import { AdminLayout } from "../../components/admin/AdminLayout";
import { AdminDocsWorkspace } from "../../features/admin-docs/AdminDocsWorkspace";
import type { AdminDocsMode } from "../../features/admin-docs/model";

function getMode(pathname: string): AdminDocsMode {
  return pathname.startsWith("/admin/docs/api") ? "api" : "operation";
}

export function AdminDocsPage() {
  const location = useLocation();

  return (
    <AdminLayout>
      <AdminDocsWorkspace mode={getMode(location.pathname)} surface="ops" />
    </AdminLayout>
  );
}
