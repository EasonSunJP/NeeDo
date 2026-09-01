import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../../auth/AuthProvider";
import {
  hasAccountComplianceRequirements,
  type AuthSession
} from "../../auth/rbac";

const complianceAllowedPaths = new Set([
  "/account-compliance",
  "/me/settings/account",
  "/me/settings/verification",
  "/me/settings/help",
  "/me/settings/terms"
]);

export function isAccountComplianceAllowedPath(pathname: string): boolean {
  return complianceAllowedPaths.has(pathname);
}

export function getAccountComplianceRedirect(
  session: AuthSession | null,
  pathname: string,
  search = "",
  hash = ""
): string | null {
  if (!hasAccountComplianceRequirements(session) || isAccountComplianceAllowedPath(pathname)) {
    return null;
  }
  const returnTo = `${pathname}${search}${hash}`;
  return `/account-compliance?returnTo=${encodeURIComponent(returnTo)}`;
}

export function AccountComplianceGate({ children }: { children: ReactNode }) {
  const { isRestoring, session } = useAuth();
  const location = useLocation();
  if (isRestoring) return null;
  const redirect = getAccountComplianceRedirect(
    session,
    location.pathname,
    location.search,
    location.hash
  );
  return redirect ? <Navigate replace to={redirect} /> : children;
}
