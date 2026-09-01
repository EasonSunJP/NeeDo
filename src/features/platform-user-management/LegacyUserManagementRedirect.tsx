import type { ReactElement } from "react";
import { Navigate, useLocation } from "react-router-dom";

type LegacySource = "users" | "crm" | "data";

function safeKeyword(search: string) {
  const params = new URLSearchParams(search);
  const value = (params.get("keyword") ?? params.get("q") ?? "").trim().slice(0, 100);
  return value ? `?keyword=${encodeURIComponent(value)}` : "";
}

export function LegacyUserManagementRedirect({
  children,
  source
}: {
  children?: ReactElement;
  source: LegacySource;
}) {
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const isLegacyRoute =
    source === "crm" ||
    (source === "users" && params.get("view") === "customers") ||
    (source === "data" && params.get("module") === "users");

  if (!isLegacyRoute) {
    return children ?? <Navigate replace to="/admin/users" />;
  }

  return <Navigate replace to={`/admin/users${safeKeyword(location.search)}`} />;
}
