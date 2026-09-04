export type AuthPersistenceScope =
  | "user"
  | "merchant"
  | "technician"
  | "affiliate"
  | "operations-admin"
  | "merchant-admin"
  | "affiliate-admin";

const entryScope = new Map<string, AuthPersistenceScope>([
  ["user.html", "user"],
  ["merchant.html", "merchant"],
  ["technician.html", "technician"],
  ["afirieito.html", "affiliate"],
  ["pf-admin.html", "operations-admin"],
  ["store-admin.html", "merchant-admin"],
  ["afirieito-admin.html", "affiliate-admin"]
]);

const routeScopePrefixes: ReadonlyArray<
  readonly [prefix: string, scope: AuthPersistenceScope]
> = [
  ["/login/merchant-admin", "merchant-admin"],
  ["/merchant-admin", "merchant-admin"],
  ["/login/afirieito-admin", "affiliate-admin"],
  ["/login/business-admin", "affiliate-admin"],
  ["/login/cps-admin", "affiliate-admin"],
  ["/login/nda-admin", "affiliate-admin"],
  ["/afirieito-admin", "affiliate-admin"],
  ["/business-admin", "affiliate-admin"],
  ["/cps-admin", "affiliate-admin"],
  ["/nda-admin", "affiliate-admin"],
  ["/login/admin", "operations-admin"],
  ["/admin", "operations-admin"],
  ["/login/afirieito", "affiliate"],
  ["/login/business", "affiliate"],
  ["/login/cps", "affiliate"],
  ["/afirieito", "affiliate"],
  ["/business", "affiliate"],
  ["/cps", "affiliate"],
  ["/login/technician", "technician"],
  ["/technician", "technician"],
  ["/login/merchant", "merchant"],
  ["/merchant", "merchant"],
  ["/shop", "merchant"],
  ["/login/user", "user"],
  ["/user", "user"],
  ["/me", "user"]
];

function entryFileName(pathname: string) {
  return pathname.split("/").filter(Boolean).at(-1)?.toLowerCase() ?? "";
}

function routePath(value: string) {
  const normalized = value.replace(/^#/, "").split(/[?#]/, 1)[0]?.trim() ?? "";
  if (!normalized) return "/";
  return (normalized.startsWith("/") ? normalized : `/${normalized}`)
    .replace(/\/+$/, "")
    .toLowerCase() || "/";
}

function resolveRouteScope(value: string): AuthPersistenceScope | null {
  const pathname = routePath(value);
  const match = routeScopePrefixes.find(
    ([prefix]) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
  return match?.[1] ?? null;
}

export function resolveAuthPersistenceScope(input: {
  hash?: string;
  pathname?: string;
} = {}): AuthPersistenceScope {
  const browserLocation = typeof window === "undefined" ? undefined : window.location;
  const pathname =
    input.pathname ?? browserLocation?.pathname ?? "/";
  const hash = input.hash ?? browserLocation?.hash ?? "";
  const fileScope = entryScope.get(entryFileName(pathname));

  return fileScope ?? resolveRouteScope(pathname) ?? resolveRouteScope(hash) ?? "user";
}

export function getAuthEnvelopeStorageKey(scope: AuthPersistenceScope) {
  return `needo.auth.envelope.v8.${scope}`;
}

export function getAuthEnvelopeLockName(scope: AuthPersistenceScope) {
  return `needo-auth-envelope-v8-${scope}`;
}
