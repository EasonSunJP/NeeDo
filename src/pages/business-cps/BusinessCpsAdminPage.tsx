import { BusinessCpsAdminLayout } from "../../components/business-cps/BusinessCpsAdminLayout";
import { CpsWorkspace } from "../admin/CpsPage";

export function BusinessCpsAdminPage() {
  return (
    <BusinessCpsAdminLayout>
      <CpsWorkspace routeBase="/NDA-admin" scope="business-admin" />
    </BusinessCpsAdminLayout>
  );
}
