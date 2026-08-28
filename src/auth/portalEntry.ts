import type { PortalScope } from "./portal";

const portalEntryFile: Record<PortalScope, string> = {
  admin: "/pf-admin.html",
  business: "/afirieito.html",
  merchant: "/merchant.html",
  technician: "/technician.html",
  user: "/user.html",
};

export function getPortalEntryUrl(
  portal: PortalScope,
  route: string,
  baseUrl = window.location.href,
) {
  const target = new URL(portalEntryFile[portal], baseUrl);
  target.hash = route;
  return target.href;
}

export function openPortalEntry(portal: PortalScope, route: string) {
  window.location.assign(getPortalEntryUrl(portal, route));
}
