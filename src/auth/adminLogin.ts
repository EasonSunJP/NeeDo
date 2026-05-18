import type { PortalScope } from "./demoAccount";

export type AdminLoginPortal = "admin" | "merchant-admin";

export const adminLoginQrTokens: Record<AdminLoginPortal, string> = {
  admin: "needo-admin-login:admin:demo",
  "merchant-admin": "needo-admin-login:merchant-admin:demo"
};

export function getAdminLoginPortalScope(portal: AdminLoginPortal): PortalScope {
  return portal === "merchant-admin" ? "merchant" : "admin";
}

function safelyDecode(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function parseAdminLoginQrToken(input: string | null | undefined): AdminLoginPortal | null {
  const normalized = safelyDecode(input ?? "").trim().toLowerCase();

  if (!normalized) {
    return null;
  }

  if (normalized === adminLoginQrTokens.admin || normalized.includes("needo://admin-login/admin")) {
    return "admin";
  }

  if (normalized === adminLoginQrTokens["merchant-admin"] || normalized.includes("needo://admin-login/merchant-admin")) {
    return "merchant-admin";
  }

  if (normalized.includes("/login/admin") && normalized.includes("scan=approved")) {
    return "admin";
  }

  if (normalized.includes("/login/merchant-admin") && normalized.includes("scan=approved")) {
    return "merchant-admin";
  }

  return null;
}

export function buildAdminLoginScanRedirect(input: string, redirect?: string | null) {
  const portal = parseAdminLoginQrToken(input);

  if (!portal) {
    return null;
  }

  const params = new URLSearchParams({
    scan: "approved",
    qr: adminLoginQrTokens[portal]
  });

  if (redirect) {
    params.set("redirect", redirect);
  }

  return `/login/${portal}?${params.toString()}`;
}
