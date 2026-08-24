import { Navigate } from "react-router-dom";

export function CRMPage() {
  return <Navigate replace to="/admin/users?view=customers" />;
}
