import { useLocation } from "react-router-dom";
import { MerchantAdminLayout } from "../../components/merchant-admin/MerchantAdminLayout";
import { AdminDocsWorkspace } from "../../features/admin-docs/AdminDocsWorkspace";
import type { AdminDocsMode } from "../../features/admin-docs/model";

function getMode(pathname: string): AdminDocsMode {
  return pathname.startsWith("/merchant-admin/docs/api") ? "api" : "operation";
}

export function MerchantAdminDocsPage() {
  const location = useLocation();

  return (
    <MerchantAdminLayout>
      <AdminDocsWorkspace mode={getMode(location.pathname)} surface="merchant" />
    </MerchantAdminLayout>
  );
}
