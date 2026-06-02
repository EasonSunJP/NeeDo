import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { authApi } from "../api/auth";
import { clearAuthTokens, getAccessToken, getStoredRefreshToken, setAccessToken, setAuthExpiredHandler, setStoredRefreshToken } from "../api/httpClient";
import { readBrowserStorage, removeBrowserStorage, writeBrowserStorage } from "../lib/browserStorage";
import { demoAuthAccount, type PortalScope } from "./demoAccount";
import type { FeaturePermission } from "./featurePermissions";
import { hasPortalFeaturePermission } from "./featurePermissions";
import {
  forgetAllRememberedPortalAuthorizations,
  forgetRememberedPortalAuthorization,
  hasRememberedPortalAuthorization,
  readRememberedPortalRefreshToken,
  readRememberedPortalSession,
  rememberPortalAuthorization
} from "./portalAuthorization";
import {
  buildAuthSessionFromMe,
  canAccessFeatureFromSession,
  canAccessMenuFromSession,
  canAccessPortalFromSession,
  canUseUserSessionForClientPortal,
  findIdentityForPortal,
  hasAnyPermissionInSession,
  hasPermissionInSession,
  isFrontendBypassSession,
  normalizeAuthSessionEntityIds,
  type AuthMePayload,
  type AuthSession,
  type LoginMethod
} from "./rbac";

export type { PortalScope } from "./demoAccount";
export { demoAuthAccount } from "./demoAccount";
export type { AuthSession } from "./rbac";

export type AuthActionResult =
  | { ok: true; session: AuthSession }
  | { message: string; ok: false };

type AuthContextValue = {
  session: AuthSession | null;
  isAuthenticated: boolean;
  isRestoring: boolean;
  login: (portal: PortalScope, email: string, password: string, captchaCode?: string) => Promise<AuthActionResult>;
  loginWithFormalPassword: (portal: PortalScope, username: string, password: string) => Promise<AuthActionResult>;
  sendVerificationCode: (email: string) => Promise<{ message?: string; ok: boolean }>;
  loginWithVerificationCode: (portal: PortalScope, email: string, code: string) => Promise<AuthActionResult>;
  loginWithProvider: (portal: PortalScope, provider: "gmail", email?: string) => Promise<AuthActionResult>;
  loginWithQr: (portal: PortalScope, token: string) => Promise<AuthActionResult>;
  enterFrontendWithoutAuthentication: (portal: PortalScope) => Promise<AuthActionResult>;
  logout: () => Promise<void>;
  switchPortal: (portal: PortalScope) => Promise<AuthActionResult>;
  canAccess: (portal: PortalScope) => boolean;
  canEnterPortal: (portal: PortalScope) => boolean;
  hasRememberedPortalAuthorization: (portal: PortalScope) => boolean;
  canAccessFeature: (portal: PortalScope, permission: FeaturePermission | string) => boolean;
  hasPermission: (permission: string) => boolean;
  hasAnyPermission: (permissions: string[]) => boolean;
  canAccessMenu: (permission: string) => boolean;
};

const portalStorageKey = "needo.auth.portal";
const legacySessionStorageKey = "needo.auth.session";
const allPortals: PortalScope[] = ["user", "merchant", "technician", "business", "admin"];
const frontendBypassPortals: PortalScope[] = ["user", "merchant", "technician", "business"];

const frontendBypassIdentityConfig = {
  user: {
    identityType: "customer",
    menu: "menu:client-app",
    permission: "page:client-app",
    role: "customer",
    scopeId: 1,
    scopeType: "customer_profile"
  },
  merchant: {
    identityType: "merchant_owner",
    menu: "menu:merchant-app",
    permission: "page:merchant-app",
    role: "merchant_owner",
    scopeId: 1,
    scopeType: "store"
  },
  technician: {
    identityType: "technician",
    menu: "menu:technician-app",
    permission: "page:technician-app",
    role: "technician",
    scopeId: 1,
    scopeType: "technician_profile"
  },
  business: {
    identityType: "scout",
    menu: "menu:business-app",
    permission: "page:business-app",
    role: "scout",
    scopeId: null,
    scopeType: "global"
  }
} satisfies Record<Exclude<PortalScope, "admin">, {
  identityType: string;
  menu: string;
  permission: string;
  role: string;
  scopeId: number | null;
  scopeType: string;
}>;

const AuthContext = createContext<AuthContextValue | null>(null);

function normalizeStoredPortal(value: string | null | undefined): PortalScope {
  return allPortals.includes(value as PortalScope) ? (value as PortalScope) : "user";
}

function readStoredPortal() {
  return normalizeStoredPortal(readBrowserStorage(portalStorageKey, { silent: true }));
}

function isStoredAuthSession(value: unknown): value is AuthSession {
  if (!value || typeof value !== "object") {
    return false;
  }

  const session = value as Partial<AuthSession>;

  return (
    session.authVersion === 4 &&
    typeof session.id === "number" &&
    typeof session.username === "string" &&
    allPortals.includes(session.portal as PortalScope) &&
    Array.isArray(session.allowedPortals) &&
    Array.isArray(session.roles) &&
    Array.isArray(session.permissions) &&
    Array.isArray(session.menus)
  );
}

function readStoredAuthSession() {
  const rawSession = readBrowserStorage(legacySessionStorageKey, { silent: true });

  if (!rawSession) {
    return null;
  }

  try {
    const parsedSession: unknown = JSON.parse(rawSession);

    return isStoredAuthSession(parsedSession) ? normalizeAuthSessionEntityIds(parsedSession) : null;
  } catch {
    return null;
  }
}

function normalizeApiError(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function createFrontendBypassMe(portal: Exclude<PortalScope, "admin">): AuthMePayload {
  const config = frontendBypassIdentityConfig[portal];
  const identity = {
    id: 260417,
    scopeId: config.scopeId,
    scopeType: config.scopeType,
    type: config.identityType
  };

  return {
    id: 260417,
    email: `${portal}.preview@needo.local`,
    username: `${portal}-preview`,
    avatarUrl: null,
    isActive: true,
    currentIdentity: identity,
    identities: [identity],
    roles: [config.role],
    permissions: [config.permission],
    menus: [config.menu]
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(() => readStoredAuthSession());
  const [isRestoring, setIsRestoring] = useState(() => Boolean(getStoredRefreshToken()) && !getAccessToken());

  const clearSession = useCallback(() => {
    clearAuthTokens();
    setSession(null);
    removeBrowserStorage(portalStorageKey, { silent: true });
    removeBrowserStorage(legacySessionStorageKey, { silent: true });
  }, []);

  const persistSession = useCallback((nextSession: AuthSession) => {
    setSession(nextSession);
    writeBrowserStorage(portalStorageKey, nextSession.portal, { silent: true });
    writeBrowserStorage(legacySessionStorageKey, JSON.stringify(nextSession), { silent: true });
    rememberPortalAuthorization(nextSession, getStoredRefreshToken());
  }, []);

  const restoreRememberedPortalSession = useCallback(
    async (portal: PortalScope): Promise<AuthActionResult> => {
      const targetRefreshToken = readRememberedPortalRefreshToken(portal);

      if (!targetRefreshToken) {
        return { ok: false, message: "error.auth.portal_forbidden" };
      }

      const previousSession = session;
      const previousRefreshToken = getStoredRefreshToken();

      setStoredRefreshToken(targetRefreshToken);
      setAccessToken(null);

      try {
        await authApi.refresh();
        const me = await authApi.me();
        const rememberedSession = readRememberedPortalSession(portal);
        const nextSession = buildAuthSessionFromMe(
          me,
          portal,
          rememberedSession?.loginMethod ?? previousSession?.loginMethod ?? "password"
        );

        if (!canAccessPortalFromSession(nextSession, portal)) {
          throw new Error("error.auth.portal_forbidden");
        }

        persistSession(nextSession);

        return { ok: true, session: nextSession };
      } catch (error) {
        forgetRememberedPortalAuthorization(portal);

        if (previousRefreshToken) {
          setStoredRefreshToken(previousRefreshToken);
          setAccessToken(null);
        } else {
          clearAuthTokens();
        }

        if (previousSession) {
          persistSession(previousSession);
        } else {
          setSession(null);
          removeBrowserStorage(portalStorageKey, { silent: true });
          removeBrowserStorage(legacySessionStorageKey, { silent: true });
        }

        return { ok: false, message: normalizeApiError(error) };
      }
    },
    [persistSession, session]
  );

  const completeAuthenticatedSession = useCallback(
    async (requestedPortal: PortalScope, loginMethod: LoginMethod, providedMe?: AuthMePayload): Promise<AuthActionResult> => {
      try {
        const me = providedMe ?? (await authApi.me());
        const nextSession = buildAuthSessionFromMe(me, requestedPortal, loginMethod);
        persistSession(nextSession);

        return { ok: true, session: nextSession };
      } catch (error) {
        clearSession();

        return { ok: false, message: normalizeApiError(error) };
      }
    },
    [clearSession, persistSession]
  );

  useEffect(() => {
    setAuthExpiredHandler(clearSession);

    return () => setAuthExpiredHandler(null);
  }, [clearSession]);

  useEffect(() => {
    let active = true;

    const restoreSession = async () => {
      if (isFrontendBypassSession(session)) {
        setIsRestoring(false);
        return;
      }

      const shouldRefreshAccessToken = Boolean(getStoredRefreshToken()) && !getAccessToken();

      if (session && !shouldRefreshAccessToken) {
        setIsRestoring(false);
        return;
      }

      if (!getStoredRefreshToken()) {
        if (session && !getAccessToken()) {
          clearSession();
        }
        setIsRestoring(false);
        return;
      }

      try {
        setIsRestoring(true);
        await authApi.refresh();
        const restorePortal = session?.portal ?? readStoredPortal();
        const restored = await completeAuthenticatedSession(restorePortal, "password");
        if (!active || !restored.ok) {
          return;
        }
      } catch {
        if (active) {
          clearSession();
        }
      } finally {
        if (active) {
          setIsRestoring(false);
        }
      }
    };

    restoreSession();

    return () => {
      active = false;
    };
  }, [clearSession, completeAuthenticatedSession, session]);

  const login = useCallback(
    async (portal: PortalScope, email: string, password: string, captchaCode?: string): Promise<AuthActionResult> => {
      try {
        const loginPayload = await authApi.login(email, password, captchaCode);

        return completeAuthenticatedSession(portal, "password", loginPayload.me);
      } catch (error) {
        clearSession();

        return { ok: false, message: normalizeApiError(error) };
      }
    },
    [clearSession, completeAuthenticatedSession]
  );

  const loginWithFormalPassword = useCallback(
    async (portal: PortalScope, username: string, password: string): Promise<AuthActionResult> => {
      try {
        const loginPayload = await authApi.loginFormal(username, password);

        return completeAuthenticatedSession(portal, "password", loginPayload.me);
      } catch (error) {
        clearSession();

        return { ok: false, message: normalizeApiError(error) };
      }
    },
    [clearSession, completeAuthenticatedSession]
  );

  const sendVerificationCode = useCallback(async (email: string) => {
    try {
      await authApi.sendOtp(email);

      return { ok: true };
    } catch (error) {
      return { ok: false, message: normalizeApiError(error) };
    }
  }, []);

  const loginWithVerificationCode = useCallback(
    async (portal: PortalScope, email: string, code: string): Promise<AuthActionResult> => {
      try {
        await authApi.verifyOtp(email, code);

        return completeAuthenticatedSession(portal, "verification-code");
      } catch (error) {
        clearSession();

        return { ok: false, message: normalizeApiError(error) };
      }
    },
    [clearSession, completeAuthenticatedSession]
  );

  const loginWithProvider = useCallback(async (): Promise<AuthActionResult> => ({
    ok: false,
    message: "error.auth.provider_unavailable"
  }), []);

  const loginWithQr = useCallback(async (): Promise<AuthActionResult> => ({
    ok: false,
    message: "error.auth.qr_unavailable"
  }), []);

  const enterFrontendWithoutAuthentication = useCallback(
    async (portal: PortalScope): Promise<AuthActionResult> => {
      if (!frontendBypassPortals.includes(portal)) {
        return { ok: false, message: "error.auth.portal_forbidden" };
      }

      clearAuthTokens();
      const nextSession = buildAuthSessionFromMe(createFrontendBypassMe(portal as Exclude<PortalScope, "admin">), portal, "frontend-bypass");
      persistSession(nextSession);

      return { ok: true, session: nextSession };
    },
    [persistSession]
  );

  const logout = useCallback(async () => {
    await authApi.logout().catch(() => undefined);
    forgetAllRememberedPortalAuthorizations();
    clearSession();
  }, [clearSession]);

  const switchPortal = useCallback(async (portal: PortalScope): Promise<AuthActionResult> => {
    if (!session || !canAccessPortalFromSession(session, portal)) {
      const restored = await restoreRememberedPortalSession(portal);

      if (restored.ok) {
        return restored;
      }

      return { ok: false, message: restored.message };
    }

    const portalIdentity = findIdentityForPortal(session.identities, portal);
    const nextLocalSession = {
      ...session,
      portal
    };
    const needsBackendIdentitySwitch =
      Boolean(portalIdentity) &&
      portalIdentity?.id !== session.currentIdentity.id &&
      Boolean(getAccessToken()) &&
      Boolean(getStoredRefreshToken());

    if (!needsBackendIdentitySwitch || !portalIdentity) {
      persistSession(nextLocalSession);
      return { ok: true, session: nextLocalSession };
    }

    try {
      const switched = await authApi.switchIdentity(portalIdentity.id);
      const nextSession = buildAuthSessionFromMe(switched.me, portal, session.loginMethod);
      persistSession(nextSession);

      return { ok: true, session: nextSession };
    } catch (error) {
      return { ok: false, message: normalizeApiError(error) };
    }
  }, [persistSession, restoreRememberedPortalSession, session]);

  const hasPermission = useCallback((permission: string) => hasPermissionInSession(session, permission), [session]);
  const hasAnyPermission = useCallback((permissions: string[]) => hasAnyPermissionInSession(session, permissions), [session]);
  const canAccess = useCallback((portal: PortalScope) => canAccessPortalFromSession(session, portal), [session]);
  const canEnterPortal = useCallback(
    (portal: PortalScope) => canAccessPortalFromSession(session, portal) || canUseUserSessionForClientPortal(session, portal),
    [session]
  );
  const hasRememberedPortal = useCallback((portal: PortalScope) => hasRememberedPortalAuthorization(portal), []);
  const canAccessMenu = useCallback((permission: string) => canAccessMenuFromSession(session, permission), [session]);
  const canAccessFeature = useCallback(
    (portal: PortalScope, permission: FeaturePermission | string) =>
      canAccessFeatureFromSession(
        session,
        portal,
        permission,
        portal === "merchant" && hasPortalFeaturePermission(portal, permission as FeaturePermission)
      ),
    [session]
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      isAuthenticated: Boolean(session),
      isRestoring,
      login,
      loginWithFormalPassword,
      sendVerificationCode,
      loginWithVerificationCode,
      loginWithProvider,
      loginWithQr,
      enterFrontendWithoutAuthentication,
      logout,
      switchPortal,
      canAccess,
      canEnterPortal,
      hasRememberedPortalAuthorization: hasRememberedPortal,
      canAccessFeature,
      hasPermission,
      hasAnyPermission,
      canAccessMenu
    }),
    [
      canAccess,
      canEnterPortal,
      canAccessFeature,
      canAccessMenu,
      hasRememberedPortal,
      hasAnyPermission,
      hasPermission,
      isRestoring,
      login,
      loginWithFormalPassword,
      enterFrontendWithoutAuthentication,
      loginWithProvider,
      loginWithQr,
      loginWithVerificationCode,
      logout,
      sendVerificationCode,
      session,
      switchPortal,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useOptionalAuth() {
  return useContext(AuthContext);
}

export function useAuth() {
  const context = useOptionalAuth();

  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }

  return context;
}
