import { readBrowserStorage, removeBrowserStorage, writeBrowserStorage } from "../lib/browserStorage";
import type { PortalScope } from "./demoAccount";
import { normalizeAuthSessionEntityIds, type AuthSession } from "./rbac";

const rememberedPortalSessionStoragePrefix = "needo.auth.portal-session";
const rememberedPortalRefreshTokenStoragePrefix = "needo.auth.portal-refresh-token";
const rememberedPortalStorageVersion = "v1";
const frontendPortals: PortalScope[] = ["user", "merchant", "technician", "business"];

function getRememberedPortalSessionStorageKey(portal: PortalScope) {
  return `${rememberedPortalSessionStoragePrefix}.${portal}.${rememberedPortalStorageVersion}`;
}

function getRememberedPortalRefreshTokenStorageKey(portal: PortalScope) {
  return `${rememberedPortalRefreshTokenStoragePrefix}.${portal}.${rememberedPortalStorageVersion}`;
}

function isStoredPortalSession(value: unknown, portal: PortalScope): value is AuthSession {
  if (!value || typeof value !== "object") {
    return false;
  }

  const session = value as Partial<AuthSession>;

  return (
    session.authVersion === 4 &&
    session.portal === portal &&
    typeof session.id === "number" &&
    typeof session.username === "string" &&
    Array.isArray(session.allowedPortals) &&
    Array.isArray(session.roles) &&
    Array.isArray(session.permissions) &&
    Array.isArray(session.menus)
  );
}

export function readRememberedPortalSession(portal: PortalScope) {
  const rawSession = readBrowserStorage(getRememberedPortalSessionStorageKey(portal), { silent: true });

  if (!rawSession) {
    return null;
  }

  try {
    const parsedSession: unknown = JSON.parse(rawSession);

    return isStoredPortalSession(parsedSession, portal) ? normalizeAuthSessionEntityIds(parsedSession) : null;
  } catch {
    return null;
  }
}

export function readRememberedPortalRefreshToken(portal: PortalScope) {
  return readBrowserStorage(getRememberedPortalRefreshTokenStorageKey(portal), { silent: true });
}

export function hasRememberedPortalAuthorization(portal: PortalScope) {
  return Boolean(readRememberedPortalSession(portal) && readRememberedPortalRefreshToken(portal));
}

export function rememberPortalAuthorization(session: AuthSession, refreshToken: string | null | undefined) {
  if (!frontendPortals.includes(session.portal)) {
    return;
  }

  writeBrowserStorage(getRememberedPortalSessionStorageKey(session.portal), JSON.stringify(session), { silent: true });

  if (refreshToken) {
    writeBrowserStorage(getRememberedPortalRefreshTokenStorageKey(session.portal), refreshToken, { silent: true });
    return;
  }

  removeBrowserStorage(getRememberedPortalRefreshTokenStorageKey(session.portal), { silent: true });
}

export function forgetRememberedPortalAuthorization(portal: PortalScope) {
  removeBrowserStorage(getRememberedPortalSessionStorageKey(portal), { silent: true });
  removeBrowserStorage(getRememberedPortalRefreshTokenStorageKey(portal), { silent: true });
}

export function forgetAllRememberedPortalAuthorizations() {
  frontendPortals.forEach((portal) => forgetRememberedPortalAuthorization(portal));
}
