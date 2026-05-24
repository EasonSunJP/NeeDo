import type { ReactNode } from "react";
import { useAuth } from "./AuthProvider";

export function PermissionGate({
  anyOf,
  children,
  fallback = null,
  permission
}: {
  anyOf?: string[];
  children: ReactNode;
  fallback?: ReactNode;
  permission?: string;
}) {
  const { hasAnyPermission, hasPermission } = useAuth();
  const allowed = permission ? hasPermission(permission) : anyOf ? hasAnyPermission(anyOf) : true;

  return allowed ? <>{children}</> : <>{fallback}</>;
}
