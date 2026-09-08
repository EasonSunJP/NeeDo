import { useEffect } from "react";
import { useLocation } from "react-router-dom";

const drawerParams: Record<string, string[]> = {
  "/admin/users": ["detailUserId"],
  "/admin/technicians": ["detailTechnicianId"],
  "/admin/merchants": ["detailServiceId", "detailServiceType"],
};

export function RouteScrollReset() {
  const location = useLocation();
  const params = new URLSearchParams(location.search);

  for (const key of drawerParams[location.pathname] ?? []) {
    params.delete(key);
  }

  const scrollSearch = params.toString();

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [location.pathname, scrollSearch, location.hash]);

  return null;
}
