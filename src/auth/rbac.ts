import type { PortalScope } from "./portal";
import type { IdentityAvailability } from "../features/identity-applications/model";

export const authSessionVersion = 7;

export type LoginMethod = "google" | "password";
export type UserPolicyComplianceRequirement =
  | "phone_binding_required"
  | "email_binding_required"
  | "ekyc_required";

const loginMethods = new Set<LoginMethod>(["google", "password"]);

export function isLoginMethod(value: unknown): value is LoginMethod {
  return typeof value === "string" && loginMethods.has(value as LoginMethod);
}

export type AuthIdentityPayload = {
  id: number;
  publicId: string | null;
  scopeId: number | null;
  scopeType: string | null;
  type: string;
};

export type AuthMePayload = {
  id: number;
  needoId: string;
  primaryPublicId: string;
  activeIdentityId: number;
  activePublicId: string | null;
  email: string;
  emailVerifiedAt: string | null;
  hasPassword: boolean;
  username: string;
  avatarUrl: string | null;
  isActive: boolean;
  isTestAccount: boolean;
  currentIdentity: AuthIdentityPayload;
  identities: AuthIdentityPayload[];
  roles: string[];
  permissions: string[];
  menus: string[];
  identityAvailability: IdentityAvailability[];
  complianceRequirements?: UserPolicyComplianceRequirement[];
  compliancePolicyVersionPublicId?: string;
  complianceEffectiveAt?: string;
  compliancePermittedNextRoutes?: string[];
};

export type AuthSession = {
  authVersion: number;
  id: number;
  needoId: string;
  primaryPublicId: string;
  activeIdentityId: number;
  activePublicId: string | null;
  merchantShopPublicId?: string;
  username: string;
  email: string;
  emailVerifiedAt: string | null;
  hasPassword: boolean;
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
  identityAvailability: IdentityAvailability[];
  complianceRequirements?: UserPolicyComplianceRequirement[];
  compliancePolicyVersionPublicId?: string;
  complianceEffectiveAt?: string;
  compliancePermittedNextRoutes?: string[];
};

const adminRoles = new Set(["admin", "operator", "finance", "support", "viewer"]);
const merchantRoles = new Set(["merchant_owner", "merchant_staff"]);
const businessRoles = new Set(["broker", "scout"]);
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
  merchant_organization: "merchant",
  merchant_owner: "merchant",
  merchant_staff: "merchant",
  o: "merchant",
  owner: "merchant",
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

export function isSessionAlignedWithPortal(session: AuthSession | null, portal: PortalScope) {
  return Boolean(
    session &&
      session.portal === portal &&
      resolvePortalFromIdentity(session.currentIdentity) === portal
  );
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
  const portal = allowedPortals.includes(requestedPortal) ? requestedPortal : (allowedPortals[0] ?? requestedPortal);

  return normalizeAuthSessionEntityIds({
    authVersion: authSessionVersion,
    id: me.id,
    needoId: me.needoId,
    primaryPublicId: me.primaryPublicId,
    activeIdentityId: me.currentIdentity.id,
    activePublicId: me.currentIdentity.publicId,
    username: me.username,
    email: me.email,
    emailVerifiedAt: me.emailVerifiedAt,
    hasPassword: me.hasPassword,
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
    identities: me.identities,
    identityAvailability: me.identityAvailability,
    ...(me.complianceRequirements
      ? {
          complianceRequirements: me.complianceRequirements,
          compliancePolicyVersionPublicId: me.compliancePolicyVersionPublicId,
          complianceEffectiveAt: me.complianceEffectiveAt,
          compliancePermittedNextRoutes: me.compliancePermittedNextRoutes
        }
      : {})
  });
}

export function hasAccountComplianceRequirements(session: AuthSession | null): boolean {
  return Boolean(session?.complianceRequirements?.length);
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
  void session;
  void portal;
  return false;
}

export function canAccessFeatureFromSession(
  session: AuthSession | null,
  portal: PortalScope,
  permission: string,
  isPortalFeaturePermission: boolean
) {
  const canEnterFeaturePortal = canAccessPortalFromSession(session, portal) || canUseUserSessionForClientPortal(session, portal);

  return Boolean(canEnterFeaturePortal && (hasPermissionInSession(session, permission) || isPortalFeaturePermission));
}

export function canAccessMenuFromSession(session: AuthSession | null, menuPermission: string) {
  return Boolean(session && (session.menus.includes(menuPermission) || hasPermissionInSession(session, menuPermission)));
}
