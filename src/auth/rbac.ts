import type { PortalScope } from "./demoAccount";

export type LoginMethod = "gmail" | "password" | "qr" | "verification-code";

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

  return identity.scopeId ? String(identity.scopeId) : `${type}:${me.id}`;
}

export function buildAuthSessionFromMe(me: AuthMePayload, requestedPortal: PortalScope, loginMethod: LoginMethod): AuthSession {
  const allowedPortals = resolveAllowedPortals(me);
  const portal = allowedPortals.includes(requestedPortal) ? requestedPortal : allowedPortals[0] ?? requestedPortal;

  return {
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
  };
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

export function canAccessMenuFromSession(session: AuthSession | null, menuPermission: string) {
  return Boolean(session && (session.menus.includes(menuPermission) || hasPermissionInSession(session, menuPermission)));
}
