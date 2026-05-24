import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { authApi } from "../api/auth";
import { clearAuthTokens, getStoredRefreshToken, setAuthExpiredHandler } from "../api/httpClient";
import { readBrowserStorage, removeBrowserStorage, writeBrowserStorage } from "../lib/browserStorage";
import { demoAuthAccount, type PortalScope } from "./demoAccount";
import type { FeaturePermission } from "./featurePermissions";
import { hasPortalFeaturePermission } from "./featurePermissions";
import {
  buildAuthSessionFromMe,
  canAccessMenuFromSession,
  canAccessPortalFromSession,
  hasAnyPermissionInSession,
  hasPermissionInSession,
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
  login: (portal: PortalScope, email: string, password: string) => Promise<AuthActionResult>;
  sendVerificationCode: (email: string) => Promise<{ message?: string; ok: boolean }>;
  loginWithVerificationCode: (portal: PortalScope, email: string, code: string) => Promise<AuthActionResult>;
  loginWithProvider: (portal: PortalScope, provider: "gmail", email?: string) => Promise<AuthActionResult>;
  loginWithQr: (portal: PortalScope, token: string) => Promise<AuthActionResult>;
  logout: () => Promise<void>;
  switchPortal: (portal: PortalScope) => void;
  canAccess: (portal: PortalScope) => boolean;
  canAccessFeature: (portal: PortalScope, permission: FeaturePermission | string) => boolean;
  hasPermission: (permission: string) => boolean;
  hasAnyPermission: (permissions: string[]) => boolean;
  canAccessMenu: (permission: string) => boolean;
};

const portalStorageKey = "needo.auth.portal";
const legacySessionStorageKey = "needo.auth.session";
const allPortals: PortalScope[] = ["user", "merchant", "technician", "business", "admin"];

const AuthContext = createContext<AuthContextValue | null>(null);

function normalizeStoredPortal(value: string | null | undefined): PortalScope {
  return allPortals.includes(value as PortalScope) ? (value as PortalScope) : "user";
}

function readStoredPortal() {
  return normalizeStoredPortal(readBrowserStorage(portalStorageKey, { silent: true }));
}

function normalizeApiError(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [isRestoring, setIsRestoring] = useState(() => Boolean(getStoredRefreshToken()));

  const clearSession = useCallback(() => {
    clearAuthTokens();
    setSession(null);
    removeBrowserStorage(portalStorageKey, { silent: true });
    removeBrowserStorage(legacySessionStorageKey, { silent: true });
  }, []);

  const completeAuthenticatedSession = useCallback(
    async (requestedPortal: PortalScope, loginMethod: LoginMethod): Promise<AuthActionResult> => {
      try {
        const me = await authApi.me();
        const nextSession = buildAuthSessionFromMe(me, requestedPortal, loginMethod);
        setSession(nextSession);
        writeBrowserStorage(portalStorageKey, nextSession.portal, { silent: true });
        removeBrowserStorage(legacySessionStorageKey, { silent: true });

        return { ok: true, session: nextSession };
      } catch (error) {
        clearSession();

        return { ok: false, message: normalizeApiError(error) };
      }
    },
    [clearSession]
  );

  useEffect(() => {
    setAuthExpiredHandler(clearSession);

    return () => setAuthExpiredHandler(null);
  }, [clearSession]);

  useEffect(() => {
    let active = true;

    const restoreSession = async () => {
      if (!getStoredRefreshToken()) {
        setIsRestoring(false);
        removeBrowserStorage(legacySessionStorageKey, { silent: true });
        return;
      }

      try {
        await authApi.refresh();
        const restored = await completeAuthenticatedSession(readStoredPortal(), "password");
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
  }, [clearSession, completeAuthenticatedSession]);

  const login = useCallback(
    async (portal: PortalScope, email: string, password: string): Promise<AuthActionResult> => {
      try {
        await authApi.login(email, password);

        return completeAuthenticatedSession(portal, "password");
      } catch (error) {
        clearAuthTokens();

        return { ok: false, message: normalizeApiError(error) };
      }
    },
    [completeAuthenticatedSession]
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
        clearAuthTokens();

        return { ok: false, message: normalizeApiError(error) };
      }
    },
    [completeAuthenticatedSession]
  );

  const loginWithProvider = useCallback(async (): Promise<AuthActionResult> => ({
    ok: false,
    message: "error.auth.provider_unavailable"
  }), []);

  const loginWithQr = useCallback(async (): Promise<AuthActionResult> => ({
    ok: false,
    message: "error.auth.qr_unavailable"
  }), []);

  const logout = useCallback(async () => {
    await authApi.logout().catch(() => undefined);
    clearSession();
  }, [clearSession]);

  const switchPortal = useCallback((portal: PortalScope) => {
    setSession((current) => {
      if (!current || !canAccessPortalFromSession(current, portal)) {
        return current;
      }

      const nextSession = {
        ...current,
        portal
      };
      writeBrowserStorage(portalStorageKey, portal, { silent: true });

      return nextSession;
    });
  }, []);

  const hasPermission = useCallback((permission: string) => hasPermissionInSession(session, permission), [session]);
  const hasAnyPermission = useCallback((permissions: string[]) => hasAnyPermissionInSession(session, permissions), [session]);
  const canAccess = useCallback((portal: PortalScope) => canAccessPortalFromSession(session, portal), [session]);
  const canAccessMenu = useCallback((permission: string) => canAccessMenuFromSession(session, permission), [session]);
  const canAccessFeature = useCallback(
    (portal: PortalScope, permission: FeaturePermission | string) =>
      Boolean(
        canAccessPortalFromSession(session, portal) &&
          (hasPermissionInSession(session, permission) ||
            (portal === "merchant" && hasPortalFeaturePermission(portal, permission as FeaturePermission)))
      ),
    [session]
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      isAuthenticated: Boolean(session),
      isRestoring,
      login,
      sendVerificationCode,
      loginWithVerificationCode,
      loginWithProvider,
      loginWithQr,
      logout,
      switchPortal,
      canAccess,
      canAccessFeature,
      hasPermission,
      hasAnyPermission,
      canAccessMenu
    }),
    [
      canAccess,
      canAccessFeature,
      canAccessMenu,
      hasAnyPermission,
      hasPermission,
      isRestoring,
      login,
      loginWithProvider,
      loginWithQr,
      loginWithVerificationCode,
      logout,
      sendVerificationCode,
      session,
      switchPortal
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }

  return context;
}
