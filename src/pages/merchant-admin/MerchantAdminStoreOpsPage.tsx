import { Navigate, useSearchParams } from "react-router-dom";

export function MerchantAdminStoreOpsPage() {
  const [searchParams] = useSearchParams();
  const module = searchParams.get("module");

  return <Navigate replace to={module === "inventory" ? "/merchant-admin/inventory" : module === "finance" ? "/merchant-admin/finance" : "/merchant-admin/stage-layout"} />;
}
