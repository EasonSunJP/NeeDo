import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  authApi,
  type GoogleCredentialResult,
  type RegistrationStartInput,
  type VerificationChallengeInput,
  type VerificationChallengePayload
} from "../api/auth";
import {
  ApiClientError,
  clearAuthTokens,
  getAccessToken,
  getStoredRefreshToken,
  setAccessToken,
  setAuthExpiredHandler,
  setExpectedAuthUserId,
  setStoredRefreshToken
} from "../api/httpClient";
import { readBrowserStorage, removeBrowserStorage, writeBrowserStorage } from "../lib/browserStorage";
import type { PortalScope } from "./portal";
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
import { purgeLegacyRememberedCredentials } from "./rememberCredentials";
import {
  buildAuthSessionFromMe,
  authSessionVersion,
  canAccessFeatureFromSession,
  canAccessMenuFromSession,
  canAccessPortalFromSession,
  canUseUserSessionForClientPortal,
  findIdentityForPortal,
  hasAnyPermissionInSession,
  hasPermissionInSession,
  isLoginMethod,
  isSessionAlignedWithPortal,
  normalizeAuthSessionEntityIds,
  type AuthMePayload,
  type AuthSession,
  type LoginMethod
} from "./rbac";

export type { PortalScope } from "./portal";
export type { AuthSession } from "./rbac";

export type AuthActionResult = { ok: true; session: AuthSession } | { message: string; ok: false };

export type AuthChallengeActionResult =
  | {
      challenge: VerificationChallengePayload;
      ok: true;
      status: "verification_required";
    }
  | { message: string; ok: false };

export type AuthenticatedAuthActionResult =
  | {
      needoId?: string;
      ok: true;
      session: AuthSession;
      status: "authenticated";
    }
  | { message: string; ok: false };

export type VerifiedRegistrationActionResult =
  | { needoId: string; ok: true; session: AuthSession; status: "authenticated" }
  | { message: string; ok: false };

export type GoogleAuthActionResult = AuthChallengeActionResult | AuthenticatedAuthActionResult;

type AuthContextValue = {
  session: AuthSession | null;
  isAuthenticated: boolean;
  isRestoring: boolean;
  restoreError: string | null;
  retrySessionRestore: () => void;
  login: (portal: PortalScope, email: string, password: string, captchaCode?: string) => Promise<AuthActionResult>;
  loginWithFormalPassword: (portal: PortalScope, username: string, password: string) => Promise<AuthActionResult>;
  startRegistration: (input: RegistrationStartInput) => Promise<AuthChallengeActionResult>;
  verifyRegistration: (input: VerificationChallengeInput) => Promise<VerifiedRegistrationActionResult>;
  loginWithGoogle: (result: GoogleCredentialResult, requestedPortal?: PortalScope) => Promise<GoogleAuthActionResult>;
  verifyGoogleRegistrationOrLink: (
    input: VerificationChallengeInput,
    requestedPortal?: PortalScope
  ) => Promise<AuthenticatedAuthActionResult>;
  /** @deprecated Task 11 removes the obsolete generic verification-code page. */
  sendVerificationCode: (email: string) => Promise<{ message?: string; ok: boolean }>;
  /** @deprecated Task 11 removes the obsolete generic verification-code page. */
  loginWithVerificationCode: (portal: PortalScope, email: string, code: string) => Promise<AuthActionResult>;
  loginWithQr: (portal: PortalScope, token: string) => Promise<AuthActionResult>;
  logout: () => Promise<void>;
  switchPortal: (portal: PortalScope) => Promise<AuthActionResult>;
  switchMerchantShop: (
    shopPublicId: string
  ) => Promise<AuthActionResult & { shopPublicId?: string }>;
  refreshSession: (requestedPortal?: PortalScope) => Promise<AuthActionResult>;
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

const AuthContext = createContext<AuthContextValue | null>(null);

function normalizeStoredPortal(value: string | null | undefined): PortalScope {
  return allPortals.includes(value as PortalScope) ? (value as PortalScope) : "user";
}

function readStoredPortal() {
  const portal = readBrowserStorage(portalStorageKey, {
    kind: "session",
    silent: true
  });
  removeBrowserStorage(portalStorageKey, { silent: true });
  return normalizeStoredPortal(portal);
}

function isStoredAuthSession(value: unknown): value is AuthSession {
  if (!value || typeof value !== "object") {
    return false;
  }

  const session = value as Partial<AuthSession>;

  return (
    session.authVersion === authSessionVersion &&
    typeof session.id === "number" &&
    typeof session.needoId === "string" &&
    session.needoId.length > 0 &&
    typeof session.primaryPublicId === "string" &&
    session.primaryPublicId.length > 0 &&
    typeof session.activeIdentityId === "number" &&
    (session.activePublicId === null || typeof session.activePublicId === "string") &&
    typeof session.username === "string" &&
    typeof session.email === "string" &&
    (session.emailVerifiedAt === null || typeof session.emailVerifiedAt === "string") &&
    typeof session.hasPassword === "boolean" &&
    isLoginMethod(session.loginMethod) &&
    allPortals.includes(session.portal as PortalScope) &&
    Array.isArray(session.allowedPortals) &&
    Array.isArray(session.roles) &&
    Array.isArray(session.permissions) &&
    Array.isArray(session.menus) &&
    Array.isArray(session.identityAvailability)
  );
}

function readStoredAuthSession() {
  const rawSession = readBrowserStorage(legacySessionStorageKey, {
    kind: "session",
    silent: true
  });
  removeBrowserStorage(legacySessionStorageKey, { silent: true });

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

function normalizeApiError(error: unknown, fallback = "error.api") {
  const candidate =
    error instanceof Error
      ? error.message
      : typeof error === "object" && error !== null && "message" in error
        ? (error as { message?: unknown }).message
        : null;

  return typeof candidate === "string" && /^error(?:\.[a-z0-9_-]+)+$/i.test(candidate) ? candidate : fallback;
}

function isTransientAuthRestoreError(error: unknown) {
  if (error instanceof TypeError) {
    return true;
  }

  if (error instanceof ApiClientError) {
    return ![400, 401, 403, 422].includes(error.status);
  }

  return error instanceof Error;
}

function isVerificationChallenge(value: unknown): value is VerificationChallengePayload {
  if (!value || typeof value !== "object") {
    return false;
  }

  const challenge = value as Partial<VerificationChallengePayload>;

  return (
    typeof challenge.challengeId === "string" &&
    challenge.challengeId.length > 0 &&
    typeof challenge.maskedEmail === "string" &&
    challenge.maskedEmail.length > 0 &&
    typeof challenge.expiresIn === "number" &&
    challenge.expiresIn > 0 &&
    typeof challenge.cooldownSeconds === "number" &&
    challenge.cooldownSeconds >= 0
  );
}

function isAuthIdentityPayload(value: unknown): value is AuthMePayload["currentIdentity"] {
  if (!value || typeof value !== "object") {
    return false;
  }

  const identity = value as Partial<AuthMePayload["currentIdentity"]>;

  return (
    typeof identity.id === "number" &&
    Number.isInteger(identity.id) &&
    (identity.publicId === null || typeof identity.publicId === "string") &&
    typeof identity.type === "string" &&
    identity.type.length > 0 &&
    (identity.scopeId === null || (typeof identity.scopeId === "number" && Number.isInteger(identity.scopeId))) &&
    (identity.scopeType === null || typeof identity.scopeType === "string")
  );
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isFormalAuthMePayload(value: unknown): value is AuthMePayload {
  if (!value || typeof value !== "object") {
    return false;
  }

  const me = value as Partial<AuthMePayload>;

  return (
    typeof me.id === "number" &&
    typeof me.needoId === "string" &&
    me.needoId.length > 0 &&
    typeof me.primaryPublicId === "string" &&
    me.primaryPublicId.length > 0 &&
    typeof me.activeIdentityId === "number" &&
    (me.activePublicId === null || typeof me.activePublicId === "string") &&
    typeof me.email === "string" &&
    (me.emailVerifiedAt === null || typeof me.emailVerifiedAt === "string") &&
    typeof me.hasPassword === "boolean" &&
    typeof me.username === "string" &&
    (me.avatarUrl === null || typeof me.avatarUrl === "string") &&
    typeof me.isActive === "boolean" &&
    isAuthIdentityPayload(me.currentIdentity) &&
    Array.isArray(me.identities) &&
    me.identities.length > 0 &&
    me.identities.every(isAuthIdentityPayload) &&
    me.identities.some((identity) => identity.id === me.currentIdentity?.id) &&
    me.activeIdentityId === me.currentIdentity?.id &&
    me.activePublicId === me.currentIdentity?.publicId &&
    isStringArray(me.roles) &&
    isStringArray(me.permissions) &&
    isStringArray(me.menus) &&
    (me.identityAvailability === undefined || Array.isArray(me.identityAvailability))
  );
}

function requireFormalAuthMePayload(value: unknown, errorKey = "error.api"): AuthMePayload {
  if (!isFormalAuthMePayload(value)) {
    throw new Error(errorKey);
  }

  return value;
}

function isAuthenticatedGoogleResult(
  result: GoogleCredentialResult
): result is Extract<GoogleCredentialResult, { status: "authenticated" }> {
  return (
    result.status === "authenticated" &&
    typeof result.accessToken === "string" &&
    result.accessToken.length > 0 &&
    typeof result.refreshToken === "string" &&
    result.refreshToken.length > 0 &&
    typeof result.expiresIn === "number" &&
    result.expiresIn > 0
  );
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [storedSessionForInitialRestore] = useState(() => readStoredAuthSession());
  const [session, setSession] = useState<AuthSession | null>(null);
  const [isRestoring, setIsRestoring] = useState(() => Boolean(getStoredRefreshToken()) && !getAccessToken());
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const [restoreRevision, setRestoreRevision] = useState(0);
  const sessionRestoreInFlightRef = useRef<Promise<void> | null>(null);
  const sessionRef = useRef<AuthSession | null>(null);
  const authOperationRevisionRef = useRef(0);
  const committedAuthStateRef = useRef<{
    accessToken: string | null;
    refreshToken: string | null;
    session: AuthSession | null;
  }>({
    accessToken: getAccessToken(),
    refreshToken: getStoredRefreshToken(),
    session: null
  });

  const clearSession = useCallback(() => {
    authOperationRevisionRef.current += 1;
    clearAuthTokens();
    sessionRef.current = null;
    committedAuthStateRef.current = {
      accessToken: null,
      refreshToken: null,
      session: null
    };
    setSession(null);
    setRestoreError(null);
    removeBrowserStorage(portalStorageKey, { silent: true });
    removeBrowserStorage(portalStorageKey, { kind: "session", silent: true });
    removeBrowserStorage(legacySessionStorageKey, { silent: true });
    removeBrowserStorage(legacySessionStorageKey, { kind: "session", silent: true });
  }, []);

  const persistSession = useCallback((nextSession: AuthSession) => {
    setExpectedAuthUserId(nextSession.id);
    sessionRef.current = nextSession;
    setSession(nextSession);
    removeBrowserStorage(portalStorageKey, { silent: true });
    removeBrowserStorage(legacySessionStorageKey, { silent: true });
    writeBrowserStorage(portalStorageKey, nextSession.portal, {
      kind: "session",
      silent: true
    });
    writeBrowserStorage(legacySessionStorageKey, JSON.stringify(nextSession), {
      kind: "session",
      silent: true
    });
    rememberPortalAuthorization(nextSession, getStoredRefreshToken());
    committedAuthStateRef.current = {
      accessToken: getAccessToken(),
      refreshToken: getStoredRefreshToken(),
      session: nextSession
    };
  }, []);

  const restoreCommittedAuthState = useCallback(() => {
    const committed = committedAuthStateRef.current;

    setAccessToken(committed.accessToken);
    setStoredRefreshToken(committed.refreshToken);

    if (committed.session) {
      persistSession(committed.session);
      return;
    }

    clearAuthTokens();
    sessionRef.current = null;
    setSession(null);
    removeBrowserStorage(portalStorageKey, { silent: true });
    removeBrowserStorage(portalStorageKey, { kind: "session", silent: true });
    removeBrowserStorage(legacySessionStorageKey, { silent: true });
    removeBrowserStorage(legacySessionStorageKey, { kind: "session", silent: true });
  }, [persistSession]);

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
        let me = requireFormalAuthMePayload(await authApi.me());
        const rememberedSession = readRememberedPortalSession(portal);
        const portalIdentity = findIdentityForPortal(
          [me.currentIdentity, ...me.identities],
          portal
        );
        if (portalIdentity && portalIdentity.id !== me.currentIdentity.id && getStoredRefreshToken()) {
          me = requireFormalAuthMePayload((await authApi.switchIdentity(portalIdentity.id)).me);
        }
        const nextSession = buildAuthSessionFromMe(
          me,
          portal,
          rememberedSession?.loginMethod ?? previousSession?.loginMethod ?? "password"
        );

        if (
          !canAccessPortalFromSession(nextSession, portal) ||
          !isSessionAlignedWithPortal(nextSession, portal)
        ) {
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
          removeBrowserStorage(portalStorageKey, { kind: "session", silent: true });
          removeBrowserStorage(legacySessionStorageKey, { silent: true });
          removeBrowserStorage(legacySessionStorageKey, { kind: "session", silent: true });
        }

        return { ok: false, message: normalizeApiError(error) };
      }
    },
    [persistSession, session]
  );

  const completeAuthenticatedSession = useCallback(
    async (
      requestedPortal: PortalScope,
      loginMethod: LoginMethod,
      providedMe?: AuthMePayload,
      errorFallback = "error.api",
      preserveTransientFailure = false
    ): Promise<AuthActionResult> => {
      try {
        let me = requireFormalAuthMePayload(providedMe ?? (await authApi.me()), errorFallback);
        const portalIdentity = findIdentityForPortal(
          [me.currentIdentity, ...me.identities],
          requestedPortal
        );
        if (portalIdentity && portalIdentity.id !== me.currentIdentity.id && getStoredRefreshToken()) {
          me = requireFormalAuthMePayload((await authApi.switchIdentity(portalIdentity.id)).me, errorFallback);
        }
        const nextSession = buildAuthSessionFromMe(me, requestedPortal, loginMethod);
        persistSession(nextSession);

        return { ok: true, session: nextSession };
      } catch (error) {
        const transientRestoreFailure =
          preserveTransientFailure && isTransientAuthRestoreError(error);

        if (!transientRestoreFailure) {
          clearSession();
        }

        return {
          ok: false,
          message: transientRestoreFailure
            ? "error.auth.service_unavailable"
            : normalizeApiError(error, errorFallback)
        };
      }
    },
    [clearSession, persistSession]
  );

  useEffect(() => {
    purgeLegacyRememberedCredentials();
    setAuthExpiredHandler(clearSession);

    return () => setAuthExpiredHandler(null);
  }, [clearSession]);

  useEffect(() => {
    const shouldRefreshAccessToken = Boolean(getStoredRefreshToken()) && !getAccessToken();

    if (session && !shouldRefreshAccessToken) {
      setRestoreError(null);
      setIsRestoring(false);
      return;
    }

    if (!getStoredRefreshToken()) {
      if (session && !getAccessToken()) {
        clearSession();
      }
      setRestoreError(null);
      setIsRestoring(false);
      return;
    }

    if (sessionRestoreInFlightRef.current) {
      return;
    }

    setIsRestoring(true);
    const restoreRequest = (async () => {
      try {
        await authApi.refresh();
        const restorePortal = session?.portal ?? storedSessionForInitialRestore?.portal ?? readStoredPortal();
        const restoreLoginMethod = session?.loginMethod ?? storedSessionForInitialRestore?.loginMethod ?? "password";
        const restored = await completeAuthenticatedSession(
          restorePortal,
          restoreLoginMethod,
          undefined,
          "error.api",
          true
        );

        if (!restored.ok) {
          if (getStoredRefreshToken()) {
            setRestoreError(restored.message);
          }
          return;
        }

        setRestoreError(null);
      } catch (error) {
        if (isTransientAuthRestoreError(error) && getStoredRefreshToken()) {
          setRestoreError("error.auth.service_unavailable");
        } else {
          clearSession();
        }
      }
    })();

    sessionRestoreInFlightRef.current = restoreRequest;
    void restoreRequest.finally(() => {
      if (sessionRestoreInFlightRef.current === restoreRequest) {
        sessionRestoreInFlightRef.current = null;
        setIsRestoring(false);
      }
    });
  }, [clearSession, completeAuthenticatedSession, restoreRevision, session, storedSessionForInitialRestore]);

  const retrySessionRestore = useCallback(() => {
    if (!getStoredRefreshToken()) {
      clearSession();
      return;
    }

    setRestoreError(null);
    setIsRestoring(true);
    setRestoreRevision((current) => current + 1);
  }, [clearSession]);

  const login = useCallback(
    async (portal: PortalScope, email: string, password: string, captchaCode?: string): Promise<AuthActionResult> => {
      setExpectedAuthUserId(null);
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
      setExpectedAuthUserId(null);
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

  const startRegistration = useCallback(
    async (input: RegistrationStartInput): Promise<AuthChallengeActionResult> => {
      forgetAllRememberedPortalAuthorizations();
      clearSession();

      try {
        const registrationChallenge = await authApi.startRegistration(input);

        if (!isVerificationChallenge(registrationChallenge)) {
          throw new Error("error.api");
        }

        return {
          ok: true,
          status: "verification_required",
          challenge: registrationChallenge
        };
      } catch (error) {
        return { ok: false, message: normalizeApiError(error) };
      }
    },
    [clearSession]
  );

  const verifyRegistration = useCallback(
    async (input: VerificationChallengeInput): Promise<VerifiedRegistrationActionResult> => {
      try {
        const verified = await authApi.verifyRegistration(input);
        if (typeof verified.needoId !== "string" || !verified.needoId) {
          throw new Error("error.api");
        }
        const completed = await completeAuthenticatedSession("user", "password");

        if (completed.ok && (completed.session.portal !== "user" || !findIdentityForPortal([completed.session.currentIdentity], "user"))) {
          clearSession();
          return { ok: false, message: "error.auth.portal_forbidden" };
        }

        return completed.ok ? { ...completed, status: "authenticated", needoId: verified.needoId } : completed;
      } catch (error) {
        clearSession();
        return { ok: false, message: normalizeApiError(error) };
      }
    },
    [clearSession, completeAuthenticatedSession]
  );

  const loginWithGoogle = useCallback(
    async (result: GoogleCredentialResult, requestedPortal: PortalScope = "user"): Promise<GoogleAuthActionResult> => {
      if (result.status === "verification_required") {
        forgetAllRememberedPortalAuthorizations();
        clearSession();

        if (!isVerificationChallenge(result)) {
          return { ok: false, message: "error.auth.google_api_unavailable" };
        }

        const googleChallenge: VerificationChallengePayload = {
          challengeId: result.challengeId,
          maskedEmail: result.maskedEmail,
          expiresIn: result.expiresIn,
          cooldownSeconds: result.cooldownSeconds
        };

        return {
          ok: true,
          status: "verification_required",
          challenge: googleChallenge
        };
      }

      if (!isAuthenticatedGoogleResult(result)) {
        clearSession();
        return { ok: false, message: "error.auth.google_api_unavailable" };
      }

      setExpectedAuthUserId(null);
      const completed = await completeAuthenticatedSession(requestedPortal, "google", undefined, "error.auth.google_api_unavailable");

      return completed.ok ? { ...completed, status: "authenticated" } : completed;
    },
    [clearSession, completeAuthenticatedSession]
  );

  const verifyGoogleRegistrationOrLink = useCallback(
    async (input: VerificationChallengeInput, requestedPortal: PortalScope = "user"): Promise<AuthenticatedAuthActionResult> => {
      try {
        const verified = await authApi.verifyGoogleRegistrationOrLink(input);
        const completed = await completeAuthenticatedSession(requestedPortal, "google", undefined, "error.auth.google_api_unavailable");

        if (completed.ok && verified.needoId && !findIdentityForPortal([completed.session.currentIdentity], "user")) {
          clearSession();
          return { ok: false, message: "error.auth.portal_forbidden" };
        }

        return completed.ok ? { ...completed, status: "authenticated", needoId: verified.needoId } : completed;
      } catch (error) {
        clearSession();
        return {
          ok: false,
          message: normalizeApiError(error, "error.auth.google_api_unavailable")
        };
      }
    },
    [clearSession, completeAuthenticatedSession]
  );

  const sendVerificationCode = useCallback(async () => {
    return { ok: false, message: "error.auth.legacy_otp_unavailable" };
  }, []);

  const loginWithVerificationCode = useCallback(async (): Promise<AuthActionResult> => {
    return { ok: false, message: "error.auth.legacy_otp_unavailable" };
  }, []);

  const loginWithQr = useCallback(
    async (): Promise<AuthActionResult> => ({
      ok: false,
      message: "error.auth.qr_unavailable"
    }),
    []
  );

  const logout = useCallback(async () => {
    const logoutRequest = authApi.logout().catch(() => undefined);
    forgetAllRememberedPortalAuthorizations();
    clearSession();
    await logoutRequest;
  }, [clearSession]);

  const switchPortal = useCallback(
    async (portal: PortalScope): Promise<AuthActionResult> => {
      if (!session || !canAccessPortalFromSession(session, portal)) {
        const restored = await restoreRememberedPortalSession(portal);

        if (restored.ok) {
          return restored;
        }

        return { ok: false, message: restored.message };
      }

      if (isSessionAlignedWithPortal(session, portal)) {
        return { ok: true, session };
      }

      const portalIdentity = findIdentityForPortal(session.identities, portal);

      if (!portalIdentity) {
        return { ok: false, message: "error.auth.portal_forbidden" };
      }

      if (portalIdentity.id === session.currentIdentity.id) {
        const nextLocalSession = {
          ...session,
          portal
        };
        persistSession(nextLocalSession);
        return { ok: true, session: nextLocalSession };
      }

      if (!getAccessToken() || !getStoredRefreshToken()) {
        return { ok: false, message: "error.auth.service_unavailable" };
      }

      const operationRevision = ++authOperationRevisionRef.current;
      let identitySwitchCompleted = false;

      try {
        const switched = await authApi.switchIdentity(portalIdentity.id);
        identitySwitchCompleted = true;

        if (operationRevision !== authOperationRevisionRef.current) {
          restoreCommittedAuthState();
          return { ok: false, message: "error.auth.operation_superseded" };
        }

        const nextSession = buildAuthSessionFromMe(requireFormalAuthMePayload(switched.me), portal, session.loginMethod);
        persistSession(nextSession);

        return { ok: true, session: nextSession };
      } catch (error) {
        if (operationRevision !== authOperationRevisionRef.current) {
          restoreCommittedAuthState();
          return { ok: false, message: "error.auth.operation_superseded" };
        }

        if (identitySwitchCompleted) {
          clearSession();
        }

        return { ok: false, message: normalizeApiError(error) };
      }
    },
    [clearSession, persistSession, restoreCommittedAuthState, restoreRememberedPortalSession, session]
  );

  const switchMerchantShop = useCallback(
    async (
      shopPublicId: string
    ): Promise<AuthActionResult & { shopPublicId?: string }> => {
      const currentSession = sessionRef.current;

      if (!currentSession || currentSession.portal !== "merchant") {
        return { ok: false, message: "error.auth.portal_forbidden" };
      }

      if (!getAccessToken() || !getStoredRefreshToken()) {
        return { ok: false, message: "error.auth.service_unavailable" };
      }

      const operationRevision = ++authOperationRevisionRef.current;

      try {
        const switched = await authApi.switchMerchantShop(shopPublicId);

        if (operationRevision !== authOperationRevisionRef.current) {
          restoreCommittedAuthState();
          return { ok: false, message: "error.auth.operation_superseded" };
        }

        if (
          typeof switched.shopPublicId !== "string" ||
          !/^shop\d{10}$/.test(switched.shopPublicId) ||
          switched.shopPublicId !== shopPublicId
        ) {
          throw new Error("error.api");
        }

        const nextSession = {
          ...buildAuthSessionFromMe(
            requireFormalAuthMePayload(switched.me),
            "merchant",
            currentSession.loginMethod
          ),
          merchantShopPublicId: switched.shopPublicId
        };
        persistSession(nextSession);

        return {
          ok: true,
          session: nextSession,
          shopPublicId: switched.shopPublicId
        };
      } catch (error) {
        restoreCommittedAuthState();

        if (operationRevision !== authOperationRevisionRef.current) {
          return { ok: false, message: "error.auth.operation_superseded" };
        }

        return { ok: false, message: normalizeApiError(error) };
      }
    },
    [persistSession, restoreCommittedAuthState]
  );

  const refreshSession = useCallback(
    async (requestedPortal?: PortalScope): Promise<AuthActionResult> => {
      if (!session) {
        return { ok: false, message: "error.auth.unauthorized" };
      }

      let identitySwitchCompleted = false;
      const operationRevision = ++authOperationRevisionRef.current;

      try {
        let me = requireFormalAuthMePayload(await authApi.me());
        const targetPortal = requestedPortal ?? session.portal;
        const portalIdentity = findIdentityForPortal(
          [me.currentIdentity, ...me.identities],
          targetPortal
        );
        if (portalIdentity && portalIdentity.id !== me.currentIdentity.id && getStoredRefreshToken()) {
          const switched = await authApi.switchIdentity(portalIdentity.id);
          identitySwitchCompleted = true;
          me = requireFormalAuthMePayload(switched.me);
        }

        if (operationRevision !== authOperationRevisionRef.current) {
          restoreCommittedAuthState();
          return { ok: false, message: "error.auth.operation_superseded" };
        }

        const nextSession = buildAuthSessionFromMe(me, targetPortal, session.loginMethod);
        persistSession(nextSession);
        return { ok: true, session: nextSession };
      } catch (error) {
        if (operationRevision !== authOperationRevisionRef.current) {
          restoreCommittedAuthState();
          return { ok: false, message: "error.auth.operation_superseded" };
        }

        if (identitySwitchCompleted) {
          clearSession();
        }

        return { ok: false, message: normalizeApiError(error) };
      }
    },
    [clearSession, persistSession, restoreCommittedAuthState, session]
  );

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
      restoreError,
      retrySessionRestore,
      login,
      loginWithFormalPassword,
      startRegistration,
      verifyRegistration,
      loginWithGoogle,
      verifyGoogleRegistrationOrLink,
      sendVerificationCode,
      loginWithVerificationCode,
      loginWithQr,
      logout,
      switchPortal,
      switchMerchantShop,
      refreshSession,
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
      loginWithGoogle,
      loginWithQr,
      loginWithVerificationCode,
      logout,
      refreshSession,
      restoreError,
      retrySessionRestore,
      sendVerificationCode,
      session,
      startRegistration,
      switchMerchantShop,
      switchPortal,
      verifyGoogleRegistrationOrLink,
      verifyRegistration
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
