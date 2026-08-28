import type { PortalScope } from "./portal";

export type AdminLoginPortal = "admin" | "merchant-admin" | "afirieito-admin";

export function getAdminLoginPortalScope(portal: AdminLoginPortal): PortalScope {
  if (portal === "merchant-admin") {
    return "merchant";
  }

  if (portal === "afirieito-admin") {
    return "business";
  }

  return "admin";
}

export function buildAdminLoginScanRedirect(_input: string, _redirect?: string | null) {
  // QR login stays closed until a server-issued, single-use nonce flow exists.
  return null;
}
