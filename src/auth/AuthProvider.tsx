import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { parseBrowserStorageJson, removeBrowserStorage, writeBrowserStorage } from "../lib/browserStorage";
import { getAdminLoginPortalScope, parseAdminLoginQrToken } from "./adminLogin";
import { demoAuthAccount, type PortalScope } from "./demoAccount";
import type { FeaturePermission } from "./featurePermissions";
import { hasPortalFeaturePermission } from "./featurePermissions";

export type { PortalScope } from "./demoAccount";
export { demoAuthAccount } from "./demoAccount";

type AuthSession = {
  authVersion: number;
  username: string;
  email: string;
  portal: PortalScope;
  allowedPortals: PortalScope[];
  loginMethod: "password" | "verification-code" | "gmail" | "qr";
  loggedInAt: string;
  linkedCustomerId: string;
  linkedTechnicianId: string;
  linkedStoreId: string;
};

type AuthContextValue = {
  session: AuthSession | null;
  isAuthenticated: boolean;
  login: (portal: PortalScope, username: string, password: string) => boolean;
  loginWithVerificationCode: (portal: PortalScope, email: string, code: string) => boolean;
  loginWithProvider: (portal: PortalScope, provider: "gmail", email?: string) => boolean;
  loginWithQr: (portal: PortalScope, token: string) => boolean;
  logout: () => void;
  switchPortal: (portal: PortalScope) => void;
  canAccess: (portal: PortalScope) => boolean;
  canAccessFeature: (portal: PortalScope, permission: FeaturePermission) => boolean;
};

const storageKey = "needo.auth.session";
const currentAuthVersion = 2;
const allPortals: PortalScope[] = ["user", "merchant", "technician", "business", "admin"];

const AuthContext = createContext<AuthContextValue | null>(null);

function getDefaultEmailForPortal(portal: PortalScope) {
  if (portal === "merchant") {
    return demoAuthAccount.merchantAdminEmail;
  }

  if (portal === "business") {
    return demoAuthAccount.businessCpsEmail;
  }

  return demoAuthAccount.adminEmail;
}

function normalizeIdentifier(value: string) {
  return value.trim().toLowerCase();
}

function isAllowedDemoIdentifier(portal: PortalScope, value: string) {
  const normalized = normalizeIdentifier(value);
  const allowedIdentifiers = new Set<string>([
    demoAuthAccount.username,
    demoAuthAccount.adminEmail,
    demoAuthAccount.merchantAdminEmail,
    demoAuthAccount.businessCpsEmail,
    getDefaultEmailForPortal(portal)
  ]);

  return allowedIdentifiers.has(normalized);
}

function createDemoSession(
  portal: PortalScope = "user",
  options?: {
    email?: string;
    loginMethod?: AuthSession["loginMethod"];
    username?: string;
  }
): AuthSession {
  const email = normalizeIdentifier(options?.email ?? getDefaultEmailForPortal(portal));

  return {
    authVersion: currentAuthVersion,
    username: normalizeIdentifier(options?.username ?? (email || demoAuthAccount.username)),
    email,
    portal,
    allowedPortals: allPortals,
    loginMethod: options?.loginMethod ?? "password",
    loggedInAt: new Date().toISOString(),
    linkedCustomerId: demoAuthAccount.linkedCustomerId,
    linkedTechnicianId: demoAuthAccount.linkedTechnicianId,
    linkedStoreId: demoAuthAccount.linkedStoreId
  };
}

function getStoredSession(): AuthSession | null {
  if (typeof window === "undefined") {
    return null;
  }

  const parsed = parseBrowserStorageJson<AuthSession | null>(storageKey, null, {
    removeOnError: true,
    silent: true
  });

  if (!parsed?.username || !parsed?.portal || !Array.isArray(parsed?.allowedPortals)) {
    return null;
  }

  if (parsed.authVersion !== currentAuthVersion) {
    return null;
  }

  return {
    ...parsed,
    allowedPortals: Array.from(new Set([...parsed.allowedPortals, ...allPortals])),
    email: parsed.email || getDefaultEmailForPortal(parsed.portal),
    loginMethod: parsed.loginMethod || "password"
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(getStoredSession);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    if (session) {
      writeBrowserStorage(storageKey, JSON.stringify(session), {
        silent: true
      });
      return;
    }

    removeBrowserStorage(storageKey, {
      silent: true
    });
  }, [session]);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      isAuthenticated: Boolean(session),
      login: (portal, username, password) => {
        if (!isAllowedDemoIdentifier(portal, username) || password !== demoAuthAccount.password) {
          return false;
        }

        const normalizedUsername = normalizeIdentifier(username);
        const isEmail = normalizedUsername.includes("@");
        setSession(createDemoSession(portal, {
          email: isEmail ? normalizedUsername : getDefaultEmailForPortal(portal),
          loginMethod: "password",
          username: normalizedUsername
        }));

        return true;
      },
      loginWithVerificationCode: (portal, email, code) => {
        const normalizedEmail = normalizeIdentifier(email);
        const normalizedCode = code.trim();

        if (!isAllowedDemoIdentifier(portal, normalizedEmail) || normalizedCode !== demoAuthAccount.verificationCode) {
          return false;
        }

        setSession(createDemoSession(portal, {
          email: normalizedEmail,
          loginMethod: "verification-code",
          username: normalizedEmail
        }));

        return true;
      },
      loginWithProvider: (portal, provider, email) => {
        if (provider !== "gmail") {
          return false;
        }

        const normalizedEmail = normalizeIdentifier(email ?? getDefaultEmailForPortal(portal));
        setSession(createDemoSession(portal, {
          email: normalizedEmail,
          loginMethod: "gmail",
          username: normalizedEmail
        }));

        return true;
      },
      loginWithQr: (portal, token) => {
        const adminLoginPortal = parseAdminLoginQrToken(token);

        if (!adminLoginPortal || getAdminLoginPortalScope(adminLoginPortal) !== portal) {
          return false;
        }

        setSession(createDemoSession(portal, {
          email: getDefaultEmailForPortal(portal),
          loginMethod: "qr"
        }));

        return true;
      },
      logout: () => {
        setSession(null);
      },
      switchPortal: (portal) => {
        setSession((current) => {
          if (!current) {
            return createDemoSession(portal);
          }

          if (!current.allowedPortals.includes(portal)) {
            return current;
          }

          return {
            ...current,
            portal,
            loggedInAt: current.loggedInAt || new Date().toISOString()
          };
        });
      },
      canAccess: (portal) => Boolean(session?.allowedPortals.includes(portal)),
      canAccessFeature: (portal, permission) => Boolean(session?.allowedPortals.includes(portal) && hasPortalFeaturePermission(portal, permission))
    }),
    [session]
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
