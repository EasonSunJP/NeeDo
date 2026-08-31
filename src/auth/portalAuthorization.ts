import { readBrowserStorage, removeBrowserStorage, writeBrowserStorage } from "../lib/browserStorage";
import type { PortalScope } from "./portal";
import { authSessionVersion, isLoginMethod, normalizeAuthSessionEntityIds, type AuthSession } from "./rbac";

const rememberedPortalSessionStoragePrefix = "needo.auth.portal-session";
const rememberedPortalRefreshTokenStoragePrefix = "needo.auth.portal-refresh-token";
const rememberedPortalStorageVersion = "v1";
const frontendPortals: PortalScope[] = ["user", "merchant", "technician", "business"];

type RememberedStorageValue = {
  local: string | null;
  session: string | null;
};

export type RememberedPortalAuthorizationSnapshot = Record<string, RememberedStorageValue>;

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
    session.authVersion === authSessionVersion &&
    session.portal === portal &&
    typeof session.id === "number" &&
    typeof session.needoId === "string" &&
    typeof session.username === "string" &&
    typeof session.email === "string" &&
    (session.emailVerifiedAt === null || typeof session.emailVerifiedAt === "string") &&
    typeof session.hasPassword === "boolean" &&
    isLoginMethod(session.loginMethod) &&
    Array.isArray(session.allowedPortals) &&
    Array.isArray(session.roles) &&
    Array.isArray(session.permissions) &&
    Array.isArray(session.menus) &&
    Array.isArray(session.identityAvailability)
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
  return readBrowserStorage(getRememberedPortalRefreshTokenStorageKey(portal), {
    silent: true
  });
}

export function hasRememberedPortalAuthorization(portal: PortalScope) {
  return Boolean(readRememberedPortalSession(portal) && readRememberedPortalRefreshToken(portal));
}

export function rememberPortalAuthorization(session: AuthSession, refreshToken: string | null | undefined) {
  if (!frontendPortals.includes(session.portal)) {
    return true;
  }

  const wroteSession = writeBrowserStorage(
    getRememberedPortalSessionStorageKey(session.portal),
    JSON.stringify(session),
    { silent: true }
  );

  if (refreshToken) {
    const wroteRefresh = writeBrowserStorage(
      getRememberedPortalRefreshTokenStorageKey(session.portal),
      refreshToken,
      { silent: true }
    );
    return wroteSession && wroteRefresh;
  }

  return (
    wroteSession &&
    removeBrowserStorage(getRememberedPortalRefreshTokenStorageKey(session.portal), {
      silent: true
    })
  );
}

export function forgetRememberedPortalAuthorization(portal: PortalScope) {
  const removedSession = removeBrowserStorage(getRememberedPortalSessionStorageKey(portal), {
    silent: true
  });
  const removedRefresh = removeBrowserStorage(getRememberedPortalRefreshTokenStorageKey(portal), {
    silent: true
  });

  return removedSession && removedRefresh;
}

export function forgetAllRememberedPortalAuthorizations() {
  return frontendPortals.reduce(
    (removed, portal) => forgetRememberedPortalAuthorization(portal) && removed,
    true
  );
}

export function captureRememberedPortalAuthorizations(): RememberedPortalAuthorizationSnapshot {
  const snapshot: RememberedPortalAuthorizationSnapshot = {};

  frontendPortals.forEach((portal) => {
    [getRememberedPortalSessionStorageKey(portal), getRememberedPortalRefreshTokenStorageKey(portal)].forEach(
      (key) => {
        snapshot[key] = {
          local: readBrowserStorage(key, { silent: true }),
          session: readBrowserStorage(key, { kind: "session", silent: true })
        };
      }
    );
  });

  return snapshot;
}

export function restoreRememberedPortalAuthorizations(
  snapshot: RememberedPortalAuthorizationSnapshot
) {
  return Object.entries(snapshot).reduce((restored, [key, value]) => {
    const restoredLocal = value.local === null
      ? removeBrowserStorage(key, { silent: true })
      : writeBrowserStorage(key, value.local, { silent: true });
    const restoredSession = value.session === null
      ? removeBrowserStorage(key, { kind: "session", silent: true })
      : writeBrowserStorage(key, value.session, { kind: "session", silent: true });

    return restoredLocal && restoredSession && restored;
  }, true);
}
