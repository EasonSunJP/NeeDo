export type PortalScope = "user" | "merchant" | "technician" | "business" | "admin";

const portalScopes = new Set<PortalScope>(["user", "merchant", "technician", "business", "admin"]);

export function isPortalScope(value: unknown): value is PortalScope {
  return typeof value === "string" && portalScopes.has(value as PortalScope);
}
