export type ApiRouteOwnership = "shared" | "backoffice" | "merchant-admin";

export const opsApiRouteManifest = [
  "shared",
  "backoffice"
] as const satisfies readonly ApiRouteOwnership[];

export const merchantApiRouteManifest = [
  "shared",
  "merchant-admin"
] as const satisfies readonly ApiRouteOwnership[];

export const compatibilityApiRouteManifest = [
  "shared",
  "backoffice",
  "merchant-admin"
] as const satisfies readonly ApiRouteOwnership[];
