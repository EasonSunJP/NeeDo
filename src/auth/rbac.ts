import type { PortalScope } from "./demoAccount";

export type LoginMethod = "frontend-bypass" | "gmail" | "password" | "qr" | "verification-code";

export type AuthIdentityPayload = {
  id: number;
  scopeId: number | null;
  scopeType: string | null;
  type: string;
};

export type AuthMePayload = {
  id: number;
  email: string;
  username: string;
  avatarUrl: string | null;
  isActive: boolean;
  currentIdentity: AuthIdentityPayload;
  identities: AuthIdentityPayload[];
  roles: string[];
  permissions: string[];
  menus: string[];
};

export type AuthSession = {
  authVersion: number;
  id: number;
  username: string;
  email: string;
  avatarUrl: string | null;
  portal: PortalScope;
  allowedPortals: PortalScope[];
  loginMethod: LoginMethod;
  loggedInAt: string;
  linkedCustomerId: string;
  linkedTechnicianId: string;
  linkedStoreId: string;
  roles: string[];
  permissions: string[];
  menus: string[];
  currentIdentity: AuthIdentityPayload;
  identities: AuthIdentityPayload[];
};

const adminRoles = new Set(["admin", "operator", "finance", "support", "viewer"]);
const merchantRoles = new Set(["merchant_owner", "merchant_staff"]);
const businessRoles = new Set(["broker", "scout"]);
const userSessionClientPortals = new Set<PortalScope>(["merchant", "technician", "business"]);
const scopedIdentityLocalIdPrefix: Record<string, string> = {
  customer: "cus",
  merchant: "store",
  merchant_owner: "store",
  merchant_staff: "store",
  technician: "tech"
};

const identityPortalMap: Record<string, PortalScope> = {
  admin: "admin",
  broker: "business",
  business: "business",
  customer: "user",
  merchant: "merchant",
  merchant_owner: "merchant",
  merchant_staff: "merchant",
  platform: "admin",
  platform_admin: "admin",
  scout: "business",
  technician: "technician",
  user: "user"
};

function uniquePortals(portals: PortalScope[]) {
  return Array.from(new Set(portals));
}

function resolvePortalFromIdentity(identity: AuthIdentityPayload): PortalScope | null {
  return identityPortalMap[identity.type] ?? null;
}

export function findIdentityForPortal(identities: AuthIdentityPayload[], portal: PortalScope) {
  return identities.find((identity) => resolvePortalFromIdentity(identity) === portal) ?? null;
}

function resolvePortalsFromRoles(roles: string[]) {
  const portals: PortalScope[] = [];

  roles.forEach((role) => {
    if (adminRoles.has(role)) {
      portals.push("admin");
    }

    if (merchantRoles.has(role)) {
      portals.push("merchant");
    }

    if (businessRoles.has(role)) {
      portals.push("business");
    }

    if (role === "technician") {
      portals.push("technician");
    }

    if (role === "customer") {
      portals.push("user");
    }
  });

  return portals;
}

function normalizeScopedLocalEntityId(value: string, prefix: string) {
  if (!value) {
    return value;
  }

  if (value.startsWith(`${prefix}-`)) {
    return value;
  }

  return /^\d+$/.test(value) ? `${prefix}-${value}` : value;
}

export function resolveAllowedPortals(me: AuthMePayload): PortalScope[] {
  const identityPortals = me.identities.map(resolvePortalFromIdentity).filter((portal): portal is PortalScope => Boolean(portal));
  const rolePortals = resolvePortalsFromRoles(me.roles);

  return uniquePortals([...identityPortals, ...rolePortals]);
}

function getScopedIdentityId(me: AuthMePayload, type: string | string[]) {
  const types = Array.isArray(type) ? type : [type];
  const identity = me.identities.find((item) => types.includes(item.type));

  if (!identity) {
    return "";
  }

  const rawId = identity.scopeId ? String(identity.scopeId) : `${types[0]}:${me.id}`;
  const localPrefix = scopedIdentityLocalIdPrefix[identity.type];

  return localPrefix ? normalizeScopedLocalEntityId(rawId, localPrefix) : rawId;
}

export function normalizeAuthSessionEntityIds(session: AuthSession): AuthSession {
  return {
    ...session,
    linkedCustomerId: normalizeScopedLocalEntityId(session.linkedCustomerId, "cus"),
    linkedStoreId: normalizeScopedLocalEntityId(session.linkedStoreId, "store"),
    linkedTechnicianId: normalizeScopedLocalEntityId(session.linkedTechnicianId, "tech")
  };
}

export function buildAuthSessionFromMe(me: AuthMePayload, requestedPortal: PortalScope, loginMethod: LoginMethod): AuthSession {
  const allowedPortals = resolveAllowedPortals(me);
  const portal = allowedPortals.includes(requestedPortal) ? requestedPortal : allowedPortals[0] ?? requestedPortal;

  return normalizeAuthSessionEntityIds({
    authVersion: 4,
    id: me.id,
    username: me.username,
    email: me.email,
    avatarUrl: me.avatarUrl,
    portal,
    allowedPortals,
    loginMethod,
    loggedInAt: new Date().toISOString(),
    linkedCustomerId: getScopedIdentityId(me, "customer"),
    linkedTechnicianId: getScopedIdentityId(me, "technician"),
    linkedStoreId: getScopedIdentityId(me, ["merchant", "merchant_owner", "merchant_staff"]),
    roles: me.roles,
    permissions: me.permissions,
    menus: me.menus,
    currentIdentity: me.currentIdentity,
    identities: me.identities
  });
}

export function hasPermissionInSession(session: AuthSession | null, permission: string) {
  return Boolean(session?.permissions.includes(permission));
}

export function hasAnyPermissionInSession(session: AuthSession | null, permissions: string[]) {
  return permissions.some((permission) => hasPermissionInSession(session, permission));
}

export function canAccessPortalFromSession(session: AuthSession | null, portal: PortalScope) {
  return Boolean(session?.allowedPortals.includes(portal));
}

export function canUseUserSessionForClientPortal(session: AuthSession | null, portal: PortalScope) {
  return Boolean(session?.allowedPortals.includes("user") && userSessionClientPortals.has(portal));
}

export function canAccessFeatureFromSession(
  session: AuthSession | null,
  portal: PortalScope,
  permission: string,
  isPortalFeaturePermission: boolean
) {
  const canEnterFeaturePortal =
    canAccessPortalFromSession(session, portal) || canUseUserSessionForClientPortal(session, portal);

  return Boolean(
    canEnterFeaturePortal &&
      (hasPermissionInSession(session, permission) || isPortalFeaturePermission)
  );
}

export function canAccessMenuFromSession(session: AuthSession | null, menuPermission: string) {
  return Boolean(session && (session.menus.includes(menuPermission) || hasPermissionInSession(session, menuPermission)));
}

export function isFrontendBypassSession(session: AuthSession | null) {
  return session?.loginMethod === "frontend-bypass";
}
