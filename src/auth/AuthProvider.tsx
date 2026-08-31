import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from "react";
import {
  authApi,
  type GoogleCredentialInput,
  type GoogleCredentialResult,
  type RegistrationStartInput,
  type TokenPairPayload,
  type VerificationChallengeInput,
  type VerificationChallengePayload
} from "../api/auth";
import { ApiClientError, setAuthExpiredHandler } from "../api/httpClient";
import {
  readBrowserStorage,
  removeBrowserStorage,
  writeBrowserStorage
} from "../lib/browserStorage";
import {
  abandonAuthOperation,
  beginLatestAuthOperation,
  commitExistingAuthOperation,
  commitRotatedAuthOperation,
  enqueueAuthRotation,
  getAuthCredentialSnapshot,
  isAuthOperationCurrent,
  markAuthOperationServerRotated,
  rejectAuthOperationAfterServerRotation,
  setAuthCredentialRevoker,
  subscribeAuthCredentialSnapshot,
  terminateAuthImmediately,
  type AuthOperation,
  type AuthTransitionCredentials
} from "./authCredentialCoordinator";
import {
  isFormalTokenPair,
  requireFormalAuthMePayload,
  requireFormalSwitchIdentityPayload,
  requireFormalSwitchMerchantShopPayload
} from "./authContract";
import type { FeaturePermission } from "./featurePermissions";
import { hasPortalFeaturePermission } from "./featurePermissions";
import type { PortalScope } from "./portal";
import {
  captureRememberedPortalAuthorizations,
  forgetAllRememberedPortalAuthorizations,
  hasRememberedPortalAuthorization,
  readRememberedPortalRefreshToken,
  readRememberedPortalSession,
  rememberPortalAuthorization,
  restoreRememberedPortalAuthorizations
} from "./portalAuthorization";
import {
  authSessionVersion,
  buildAuthSessionFromMe,
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
import { purgeLegacyRememberedCredentials } from "./rememberCredentials";

export type { PortalScope } from "./portal";
export type { AuthSession } from "./rbac";

export type AuthActionResult = { ok: true; session: AuthSession } | { message: string; ok: false };
export type AuthChallengeActionResult =
  | { challenge: VerificationChallengePayload; ok: true; status: "verification_required" }
  | { message: string; ok: false };
export type AuthenticatedAuthActionResult =
  | { needoId?: string; ok: true; session: AuthSession; status: "authenticated" }
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
  login: (
    portal: PortalScope,
    email: string,
    password: string,
    captchaCode?: string
  ) => Promise<AuthActionResult>;
  loginWithFormalPassword: (
    portal: PortalScope,
    username: string,
    password: string
  ) => Promise<AuthActionResult>;
  startRegistration: (input: RegistrationStartInput) => Promise<AuthChallengeActionResult>;
  verifyRegistration: (
    input: VerificationChallengeInput
  ) => Promise<VerifiedRegistrationActionResult>;
  authenticateWithGoogleCredential: (
    input: GoogleCredentialInput,
    requestedPortal?: PortalScope
  ) => Promise<GoogleAuthActionResult>;
  verifyGoogleRegistrationOrLink: (
    input: VerificationChallengeInput,
    requestedPortal?: PortalScope
  ) => Promise<AuthenticatedAuthActionResult>;
  sendVerificationCode: (email: string) => Promise<{ message?: string; ok: boolean }>;
  loginWithVerificationCode: (
    portal: PortalScope,
    email: string,
    code: string
  ) => Promise<AuthActionResult>;
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

type BrowserAuthStorageSnapshot = {
  legacySessionLocal: string | null;
  legacySessionTab: string | null;
  portalLocal: string | null;
  portalTab: string | null;
};

function captureBrowserAuthStorage(): BrowserAuthStorageSnapshot {
  return {
    legacySessionLocal: readBrowserStorage(legacySessionStorageKey, { silent: true }),
    legacySessionTab: readBrowserStorage(legacySessionStorageKey, {
      kind: "session",
      silent: true
    }),
    portalLocal: readBrowserStorage(portalStorageKey, { silent: true }),
    portalTab: readBrowserStorage(portalStorageKey, { kind: "session", silent: true })
  };
}

function restoreBrowserValue(key: string, value: string | null, kind: "local" | "session") {
  return value === null
    ? removeBrowserStorage(key, { kind, silent: true })
    : writeBrowserStorage(key, value, { kind, silent: true });
}

function restoreBrowserAuthStorage(snapshot: BrowserAuthStorageSnapshot) {
  return [
    restoreBrowserValue(portalStorageKey, snapshot.portalLocal, "local"),
    restoreBrowserValue(portalStorageKey, snapshot.portalTab, "session"),
    restoreBrowserValue(legacySessionStorageKey, snapshot.legacySessionLocal, "local"),
    restoreBrowserValue(legacySessionStorageKey, snapshot.legacySessionTab, "session")
  ].every(Boolean);
}

function clearClientAuthStorage() {
  return [
    removeBrowserStorage(portalStorageKey, { silent: true }),
    removeBrowserStorage(portalStorageKey, { kind: "session", silent: true }),
    removeBrowserStorage(legacySessionStorageKey, { silent: true }),
    removeBrowserStorage(legacySessionStorageKey, { kind: "session", silent: true }),
    forgetAllRememberedPortalAuthorizations()
  ].every(Boolean);
}

function persistClientSession(nextSession: AuthSession, refreshToken: string | null) {
  return [
    removeBrowserStorage(portalStorageKey, { silent: true }),
    removeBrowserStorage(legacySessionStorageKey, { silent: true }),
    writeBrowserStorage(portalStorageKey, nextSession.portal, { kind: "session", silent: true }),
    writeBrowserStorage(legacySessionStorageKey, JSON.stringify(nextSession), {
      kind: "session",
      silent: true
    }),
    rememberPortalAuthorization(nextSession, refreshToken)
  ].every(Boolean);
}

function isStoredAuthSession(value: unknown): value is AuthSession {
  if (!value || typeof value !== "object") return false;
  const session = value as Partial<AuthSession>;
  return (
    session.authVersion === authSessionVersion &&
    typeof session.id === "number" &&
    typeof session.needoId === "string" &&
    typeof session.primaryPublicId === "string" &&
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
  const raw = readBrowserStorage(legacySessionStorageKey, { kind: "session", silent: true });
  removeBrowserStorage(legacySessionStorageKey, { silent: true });
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    return isStoredAuthSession(parsed) ? normalizeAuthSessionEntityIds(parsed) : null;
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
  return typeof candidate === "string" && /^error(?:\.[a-z0-9_-]+)+$/i.test(candidate)
    ? candidate
    : fallback;
}

function isTransientAuthRestoreError(error: unknown) {
  if (error instanceof TypeError) return true;
  if (error instanceof ApiClientError) return ![400, 401, 403, 422].includes(error.status);
  return error instanceof Error;
}

function isVerificationChallenge(value: unknown): value is VerificationChallengePayload {
  if (!value || typeof value !== "object") return false;
  const challenge = value as Partial<VerificationChallengePayload>;
  return (
    typeof challenge.challengeId === "string" &&
    challenge.challengeId.length > 0 &&
    typeof challenge.maskedEmail === "string" &&
    challenge.maskedEmail.length > 0 &&
    Number.isInteger(challenge.expiresIn) &&
    (challenge.expiresIn ?? 0) > 0 &&
    Number.isInteger(challenge.cooldownSeconds) &&
    (challenge.cooldownSeconds ?? -1) >= 0
  );
}

function requireAuthenticatedGoogleResult(result: GoogleCredentialResult) {
  if (result.status !== "authenticated" || !isFormalTokenPair(result)) {
    throw new Error("error.auth.google_api_unavailable");
  }
  return result;
}

function readRotatedResponseErrorCredentials(error: unknown) {
  if (
    !error ||
    typeof error !== "object" ||
    !(error instanceof Error) ||
    error.name !== "AuthRotatedResponseError" ||
    !("rotatedCredentials" in error)
  ) {
    return { credentials: null, isRotatedResponse: false } as const;
  }
  const candidate = error.rotatedCredentials;
  const credentials =
    candidate &&
    typeof candidate === "object" &&
    "accessToken" in candidate &&
    typeof candidate.accessToken === "string" &&
    candidate.accessToken.length > 0 &&
    "refreshToken" in candidate &&
    typeof candidate.refreshToken === "string" &&
    candidate.refreshToken.length > 0
      ? { accessToken: candidate.accessToken, refreshToken: candidate.refreshToken }
      : null;
  return { credentials, isRotatedResponse: true } as const;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [storedSessionForInitialRestore] = useState(readStoredAuthSession);
  const initialCredentials = getAuthCredentialSnapshot();
  const [session, setSession] = useState<AuthSession | null>(null);
  const [isRestoring, setIsRestoring] = useState(
    Boolean(initialCredentials.refreshToken) && !initialCredentials.accessToken
  );
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const [restoreRevision, setRestoreRevision] = useState(0);
  const restoreInFlightRef = useRef<Promise<void> | null>(null);
  const sessionRef = useRef<AuthSession | null>(null);

  const publishSession = useCallback((nextSession: AuthSession | null) => {
    sessionRef.current = nextSession;
    setSession(nextSession);
  }, []);

  const publishAnonymous = useCallback(() => {
    publishSession(null);
    setRestoreError(null);
  }, [publishSession]);

  const terminateLocalSession = useCallback(() => {
    const credentials = terminateAuthImmediately();
    clearClientAuthStorage();
    publishAnonymous();
    setIsRestoring(false);
    return credentials;
  }, [publishAnonymous]);

  const rejectInvalidRotatedResponse = useCallback(
    (operation: AuthOperation, error: unknown) => {
      const rotatedError = readRotatedResponseErrorCredentials(error);
      const hasMarkedResponse = operation.phase === "server_rotated";
      if (!hasMarkedResponse && !rotatedError.isRotatedResponse) return false;
      if (
        rotatedError.credentials &&
        !markAuthOperationServerRotated(operation, rotatedError.credentials)
      ) {
        return false;
      }
      if (!rejectAuthOperationAfterServerRotation(operation)) return false;
      clearClientAuthStorage();
      publishAnonymous();
      setIsRestoring(false);
      return true;
    },
    [publishAnonymous]
  );

  const commitRotatedSession = useCallback(
    (
      operation: AuthOperation,
      credentials: AuthTransitionCredentials,
      nextSession: AuthSession
    ) => {
      if (
        operation.phase !== "server_rotated" &&
        !markAuthOperationServerRotated(operation, credentials)
      )
        return "superseded" as const;
      const committed = commitRotatedAuthOperation(operation, {
        expectedUserId: nextSession.id,
        persistClient: () => persistClientSession(nextSession, credentials.refreshToken)
      });
      if (!committed) {
        clearClientAuthStorage();
        publishAnonymous();
        return "storage_failed" as const;
      }
      publishSession(nextSession);
      setRestoreError(null);
      return "committed" as const;
    },
    [publishAnonymous, publishSession]
  );

  const commitExistingSession = useCallback(
    (operation: AuthOperation, nextSession: AuthSession) => {
      const browserSnapshot = captureBrowserAuthStorage();
      const rememberedSnapshot = captureRememberedPortalAuthorizations();
      const committed = commitExistingAuthOperation(operation, nextSession.id, () =>
        persistClientSession(nextSession, getAuthCredentialSnapshot().refreshToken)
      );
      if (!committed) {
        const browserRestored = restoreBrowserAuthStorage(browserSnapshot);
        const rememberedRestored = restoreRememberedPortalAuthorizations(rememberedSnapshot);
        if (!browserRestored || !rememberedRestored) {
          const credentials = terminateLocalSession();
          if (credentials) void authApi.logout(credentials).catch(() => undefined);
          return "rollback_failed" as const;
        }
        return "storage_failed" as const;
      }
      publishSession(nextSession);
      setRestoreError(null);
      return "committed" as const;
    },
    [publishSession, terminateLocalSession]
  );

  const completeLatestAuthentication = useCallback(
    async (
      operation: AuthOperation,
      tokens: TokenPairPayload,
      requestedPortal: PortalScope,
      loginMethod: LoginMethod,
      providedMe?: AuthMePayload,
      fallback = "error.api",
      initialResponseRotated = true
    ): Promise<AuthActionResult> => {
      let credentials: AuthTransitionCredentials = {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken
      };
      try {
        if (initialResponseRotated && !markAuthOperationServerRotated(operation, credentials)) {
          return { ok: false, message: "error.auth.operation_superseded" };
        }
        let me = requireFormalAuthMePayload(
          providedMe ?? (await authApi.me(credentials)),
          fallback
        );
        if (!isAuthOperationCurrent(operation)) {
          markAuthOperationServerRotated(operation, credentials);
          return { ok: false, message: "error.auth.operation_superseded" };
        }
        const portalIdentity = findIdentityForPortal(
          [me.currentIdentity, ...me.identities],
          requestedPortal
        );
        if (!portalIdentity) throw new Error("error.auth.portal_forbidden");
        if (portalIdentity.id !== me.currentIdentity.id) {
          const context = { expectedIdentityId: portalIdentity.id, expectedUserId: me.id };
          const switchedResponse = await authApi.switchIdentity(
            portalIdentity.id,
            credentials,
            context
          );
          const switchedCredentials = {
            accessToken: switchedResponse.accessToken,
            refreshToken: switchedResponse.refreshToken
          };
          if (!markAuthOperationServerRotated(operation, switchedCredentials)) {
            return { ok: false, message: "error.auth.operation_superseded" };
          }
          const switched = requireFormalSwitchIdentityPayload(switchedResponse, context);
          credentials = switchedCredentials;
          me = switched.me;
        }
        const nextSession = buildAuthSessionFromMe(me, requestedPortal, loginMethod);
        if (
          !canAccessPortalFromSession(nextSession, requestedPortal) ||
          !isSessionAlignedWithPortal(nextSession, requestedPortal)
        ) {
          throw new Error("error.auth.portal_forbidden");
        }
        const outcome = commitRotatedSession(operation, credentials, nextSession);
        if (outcome === "committed") return { ok: true, session: nextSession };
        return {
          ok: false,
          message:
            outcome === "storage_failed"
              ? "error.auth.reauth_required"
              : "error.auth.operation_superseded"
        };
      } catch (error) {
        if (!rejectInvalidRotatedResponse(operation, error)) {
          const wasCurrent = isAuthOperationCurrent(operation);
          abandonAuthOperation(operation);
          if (wasCurrent) terminateLocalSession();
        }
        return { ok: false, message: normalizeApiError(error, fallback) };
      }
    },
    [commitRotatedSession, rejectInvalidRotatedResponse, terminateLocalSession]
  );

  const restoreRememberedPortalSession = useCallback(
    async (portal: PortalScope): Promise<AuthActionResult> => {
      const refreshToken = readRememberedPortalRefreshToken(portal);
      const rememberedSession = readRememberedPortalSession(portal);
      if (!refreshToken || !rememberedSession)
        return { ok: false, message: "error.auth.portal_forbidden" };
      const operation = beginLatestAuthOperation("remembered-portal-restore");
      try {
        const refreshed = await authApi.refreshWithCredentials(refreshToken);
        let credentials: AuthTransitionCredentials = {
          accessToken: refreshed.accessToken,
          refreshToken
        };
        let me = requireFormalAuthMePayload(await authApi.me(credentials));
        if (!isAuthOperationCurrent(operation)) {
          markAuthOperationServerRotated(operation, credentials);
          return { ok: false, message: "error.auth.operation_superseded" };
        }
        if (me.id !== rememberedSession.id) {
          markAuthOperationServerRotated(operation, credentials);
          rejectInvalidRotatedResponse(operation, new Error("error.api"));
          return { ok: false, message: "error.auth.reauth_required" };
        }
        const identity = findIdentityForPortal([me.currentIdentity, ...me.identities], portal);
        if (!identity) throw new Error("error.auth.portal_forbidden");
        if (identity.id !== me.currentIdentity.id) {
          const context = { expectedIdentityId: identity.id, expectedUserId: rememberedSession.id };
          const switchedResponse = await authApi.switchIdentity(identity.id, credentials, context);
          const switchedCredentials = {
            accessToken: switchedResponse.accessToken,
            refreshToken: switchedResponse.refreshToken
          };
          if (!markAuthOperationServerRotated(operation, switchedCredentials)) {
            return { ok: false, message: "error.auth.operation_superseded" };
          }
          const switched = requireFormalSwitchIdentityPayload(switchedResponse, context);
          credentials = switchedCredentials;
          me = switched.me;
        }
        const nextSession = buildAuthSessionFromMe(me, portal, rememberedSession.loginMethod);
        const outcome = commitRotatedSession(operation, credentials, nextSession);
        if (outcome === "committed") return { ok: true, session: nextSession };
        return {
          ok: false,
          message:
            outcome === "storage_failed"
              ? "error.auth.reauth_required"
              : "error.auth.operation_superseded"
        };
      } catch (error) {
        if (!rejectInvalidRotatedResponse(operation, error)) abandonAuthOperation(operation);
        return { ok: false, message: normalizeApiError(error) };
      }
    },
    [commitRotatedSession, rejectInvalidRotatedResponse]
  );

  useEffect(() => {
    purgeLegacyRememberedCredentials();
    setAuthCredentialRevoker(async (credentials) => {
      await authApi.logout(credentials);
    });
    setAuthExpiredHandler(() => {
      clearClientAuthStorage();
      publishAnonymous();
    });
    return () => {
      setAuthExpiredHandler(null);
      setAuthCredentialRevoker(null);
    };
  }, [publishAnonymous]);

  useEffect(() => {
    let observedCredentialVersion = getAuthCredentialSnapshot().credentialVersion;
    return subscribeAuthCredentialSnapshot(() => {
      const credentials = getAuthCredentialSnapshot();
      if (credentials.credentialVersion === observedCredentialVersion) return;
      observedCredentialVersion = credentials.credentialVersion;
      if (!credentials.refreshToken && sessionRef.current) {
        clearClientAuthStorage();
        publishAnonymous();
        setIsRestoring(false);
      }
    });
  }, [publishAnonymous]);

  useEffect(() => {
    const credentials = getAuthCredentialSnapshot();
    if (!credentials.refreshToken || credentials.accessToken || sessionRef.current) {
      setIsRestoring(false);
      return;
    }
    if (restoreInFlightRef.current) return;
    const operation = beginLatestAuthOperation("startup-restore");
    setIsRestoring(true);
    const request = (async () => {
      try {
        const refreshed = await authApi.refreshWithCredentials(credentials.refreshToken as string);
        const nextCredentials = {
          accessToken: refreshed.accessToken,
          refreshToken: credentials.refreshToken as string
        };
        const me = requireFormalAuthMePayload(await authApi.me(nextCredentials));
        const trustedStoredSession =
          storedSessionForInitialRestore?.id === me.id ? storedSessionForInitialRestore : null;
        const portal = trustedStoredSession?.portal ?? "user";
        const method = trustedStoredSession?.loginMethod ?? "password";
        const restored = await completeLatestAuthentication(
          operation,
          { ...nextCredentials, expiresIn: refreshed.expiresIn },
          portal,
          method,
          me,
          "error.api",
          false
        );
        if (!restored.ok) setRestoreError(restored.message);
      } catch (error) {
        if (isAuthOperationCurrent(operation) && isTransientAuthRestoreError(error)) {
          abandonAuthOperation(operation);
          setRestoreError("error.auth.service_unavailable");
        } else if (isAuthOperationCurrent(operation)) {
          terminateLocalSession();
        }
      }
    })();
    restoreInFlightRef.current = request;
    void request.finally(() => {
      if (restoreInFlightRef.current === request) {
        restoreInFlightRef.current = null;
        setIsRestoring(false);
      }
    });
  }, [
    completeLatestAuthentication,
    restoreRevision,
    storedSessionForInitialRestore,
    terminateLocalSession
  ]);

  const retrySessionRestore = useCallback(() => {
    if (!getAuthCredentialSnapshot().refreshToken) {
      terminateLocalSession();
      return;
    }
    setRestoreError(null);
    setIsRestoring(true);
    setRestoreRevision((current) => current + 1);
  }, [terminateLocalSession]);

  const login = useCallback(
    async (portal: PortalScope, email: string, password: string, captchaCode?: string) => {
      const operation = beginLatestAuthOperation("password-login");
      try {
        const payload = await authApi.login(email, password, captchaCode);
        return completeLatestAuthentication(operation, payload, portal, "password", payload.me);
      } catch (error) {
        if (!rejectInvalidRotatedResponse(operation, error) && isAuthOperationCurrent(operation))
          terminateLocalSession();
        return { ok: false, message: normalizeApiError(error) } as AuthActionResult;
      }
    },
    [completeLatestAuthentication, rejectInvalidRotatedResponse, terminateLocalSession]
  );

  const loginWithFormalPassword = useCallback(
    async (portal: PortalScope, username: string, password: string) => {
      const operation = beginLatestAuthOperation("formal-password-login");
      try {
        const payload = await authApi.loginFormal(username, password);
        return completeLatestAuthentication(operation, payload, portal, "password", payload.me);
      } catch (error) {
        if (!rejectInvalidRotatedResponse(operation, error) && isAuthOperationCurrent(operation))
          terminateLocalSession();
        return { ok: false, message: normalizeApiError(error) } as AuthActionResult;
      }
    },
    [completeLatestAuthentication, rejectInvalidRotatedResponse, terminateLocalSession]
  );

  const startRegistration = useCallback(
    async (input: RegistrationStartInput): Promise<AuthChallengeActionResult> => {
      terminateLocalSession();
      try {
        const challenge = await authApi.startRegistration(input);
        if (!isVerificationChallenge(challenge)) throw new Error("error.api");
        return { ok: true, status: "verification_required", challenge };
      } catch (error) {
        return { ok: false, message: normalizeApiError(error) };
      }
    },
    [terminateLocalSession]
  );

  const verifyRegistration = useCallback(
    async (input: VerificationChallengeInput): Promise<VerifiedRegistrationActionResult> => {
      const operation = beginLatestAuthOperation("registration-verification");
      try {
        const verified = await authApi.verifyRegistration(input);
        const completed = await completeLatestAuthentication(
          operation,
          verified,
          "user",
          "password"
        );
        if (!completed.ok) return completed;
        if (!findIdentityForPortal([completed.session.currentIdentity], "user")) {
          terminateLocalSession();
          return { ok: false, message: "error.auth.portal_forbidden" };
        }
        return { ...completed, status: "authenticated", needoId: verified.needoId };
      } catch (error) {
        if (!rejectInvalidRotatedResponse(operation, error) && isAuthOperationCurrent(operation))
          terminateLocalSession();
        return { ok: false, message: normalizeApiError(error) };
      }
    },
    [completeLatestAuthentication, rejectInvalidRotatedResponse, terminateLocalSession]
  );

  const finishGoogleResult = useCallback(
    async (
      operation: AuthOperation,
      result: GoogleCredentialResult,
      requestedPortal: PortalScope
    ): Promise<GoogleAuthActionResult> => {
      if (result.status === "verification_required") {
        if (!isVerificationChallenge(result)) {
          if (isAuthOperationCurrent(operation)) terminateLocalSession();
          return { ok: false, message: "error.auth.google_api_unavailable" };
        }
        if (isAuthOperationCurrent(operation)) terminateLocalSession();
        return {
          ok: true,
          status: "verification_required",
          challenge: {
            challengeId: result.challengeId,
            maskedEmail: result.maskedEmail,
            expiresIn: result.expiresIn,
            cooldownSeconds: result.cooldownSeconds
          }
        };
      }
      try {
        const authenticated = requireAuthenticatedGoogleResult(result);
        const completed = await completeLatestAuthentication(
          operation,
          authenticated,
          requestedPortal,
          "google",
          authenticated.me,
          "error.auth.google_api_unavailable"
        );
        return completed.ok ? { ...completed, status: "authenticated" } : completed;
      } catch (error) {
        if (!rejectInvalidRotatedResponse(operation, error) && isAuthOperationCurrent(operation))
          terminateLocalSession();
        return {
          ok: false,
          message: normalizeApiError(error, "error.auth.google_api_unavailable")
        };
      }
    },
    [completeLatestAuthentication, rejectInvalidRotatedResponse, terminateLocalSession]
  );

  const authenticateWithGoogleCredential = useCallback(
    async (input: GoogleCredentialInput, requestedPortal: PortalScope = "user") => {
      const operation = beginLatestAuthOperation("google-login");
      try {
        return finishGoogleResult(
          operation,
          await authApi.submitGoogleCredential(input),
          requestedPortal
        );
      } catch (error) {
        if (!rejectInvalidRotatedResponse(operation, error) && isAuthOperationCurrent(operation))
          terminateLocalSession();
        return {
          ok: false,
          message: normalizeApiError(error, "error.auth.google_api_unavailable")
        } as GoogleAuthActionResult;
      }
    },
    [finishGoogleResult, rejectInvalidRotatedResponse, terminateLocalSession]
  );

  const verifyGoogleRegistrationOrLink = useCallback(
    async (
      input: VerificationChallengeInput,
      requestedPortal: PortalScope = "user"
    ): Promise<AuthenticatedAuthActionResult> => {
      const operation = beginLatestAuthOperation("google-verification");
      try {
        const verified = await authApi.verifyGoogleRegistrationOrLink(input);
        const completed = await completeLatestAuthentication(
          operation,
          verified,
          requestedPortal,
          "google",
          undefined,
          "error.auth.google_api_unavailable"
        );
        return completed.ok
          ? { ...completed, status: "authenticated", needoId: verified.needoId }
          : completed;
      } catch (error) {
        if (!rejectInvalidRotatedResponse(operation, error) && isAuthOperationCurrent(operation))
          terminateLocalSession();
        return {
          ok: false,
          message: normalizeApiError(error, "error.auth.google_api_unavailable")
        };
      }
    },
    [completeLatestAuthentication, rejectInvalidRotatedResponse, terminateLocalSession]
  );

  const logout = useCallback(() => {
    const credentials = terminateLocalSession();
    if (credentials) void authApi.logout(credentials).catch(() => undefined);
    return Promise.resolve();
  }, [terminateLocalSession]);

  const switchPortal = useCallback(
    async (portal: PortalScope): Promise<AuthActionResult> => {
      const requested = sessionRef.current;
      if (!requested || !canAccessPortalFromSession(requested, portal))
        return restoreRememberedPortalSession(portal);
      if (isSessionAlignedWithPortal(requested, portal)) return { ok: true, session: requested };
      const identity = findIdentityForPortal(requested.identities, portal);
      if (!identity) return { ok: false, message: "error.auth.portal_forbidden" };
      try {
        return await enqueueAuthRotation("identity-switch", async (operation, credentials) => {
          try {
            const current = sessionRef.current;
            if (
              !current ||
              current.id !== requested.id ||
              current.currentIdentity.id !== requested.currentIdentity.id
            )
              return { ok: false, message: "error.auth.operation_superseded" };
            if (identity.id === current.currentIdentity.id) {
              const nextSession = { ...current, portal };
              const outcome = commitExistingSession(operation, nextSession);
              return outcome === "committed"
                ? { ok: true, session: nextSession }
                : {
                    ok: false,
                    message:
                      outcome === "rollback_failed"
                        ? "error.auth.reauth_required"
                        : "error.auth.storage_unavailable"
                  };
            }
            const context = { expectedIdentityId: identity.id, expectedUserId: current.id };
            const switchedResponse = await authApi.switchIdentity(
              identity.id,
              credentials,
              context
            );
            const switchedCredentials = {
              accessToken: switchedResponse.accessToken,
              refreshToken: switchedResponse.refreshToken
            };
            if (!markAuthOperationServerRotated(operation, switchedCredentials)) {
              return { ok: false, message: "error.auth.operation_superseded" };
            }
            const switched = requireFormalSwitchIdentityPayload(switchedResponse, context);
            const nextSession = buildAuthSessionFromMe(switched.me, portal, current.loginMethod);
            const outcome = commitRotatedSession(operation, switchedCredentials, nextSession);
            return outcome === "committed"
              ? { ok: true, session: nextSession }
              : {
                  ok: false,
                  message:
                    outcome === "storage_failed"
                      ? "error.auth.reauth_required"
                      : "error.auth.operation_superseded"
                };
          } catch (error) {
            const wasCurrent = isAuthOperationCurrent(operation);
            rejectInvalidRotatedResponse(operation, error);
            if (!wasCurrent) {
              return { ok: false, message: "error.auth.operation_superseded" };
            }
            return { ok: false, message: normalizeApiError(error) };
          }
        });
      } catch (error) {
        return { ok: false, message: normalizeApiError(error) };
      }
    },
    [
      commitExistingSession,
      commitRotatedSession,
      rejectInvalidRotatedResponse,
      restoreRememberedPortalSession
    ]
  );

  const switchMerchantShop = useCallback(
    async (shopPublicId: string): Promise<AuthActionResult & { shopPublicId?: string }> => {
      const requested = sessionRef.current;
      if (!requested || requested.portal !== "merchant")
        return { ok: false, message: "error.auth.portal_forbidden" };
      try {
        return await enqueueAuthRotation("merchant-shop-switch", async (operation, credentials) => {
          try {
            const current = sessionRef.current;
            if (
              !current ||
              current.portal !== "merchant" ||
              current.id !== requested.id ||
              current.currentIdentity.id !== requested.currentIdentity.id
            )
              return { ok: false, message: "error.auth.operation_superseded" };
            const context = {
              expectedIdentityId: current.currentIdentity.id,
              expectedUserId: current.id
            };
            const switchedResponse = await authApi.switchMerchantShop(
              shopPublicId,
              credentials,
              context
            );
            const switchedCredentials = {
              accessToken: switchedResponse.accessToken,
              refreshToken: switchedResponse.refreshToken
            };
            if (!markAuthOperationServerRotated(operation, switchedCredentials)) {
              return { ok: false, message: "error.auth.operation_superseded" };
            }
            const switched = requireFormalSwitchMerchantShopPayload(
              switchedResponse,
              shopPublicId,
              context
            );
            const nextSession = {
              ...buildAuthSessionFromMe(switched.me, "merchant", current.loginMethod),
              merchantShopPublicId: switched.shopPublicId
            };
            const outcome = commitRotatedSession(operation, switchedCredentials, nextSession);
            return outcome === "committed"
              ? { ok: true as const, session: nextSession, shopPublicId: switched.shopPublicId }
              : {
                  ok: false as const,
                  message:
                    outcome === "storage_failed"
                      ? "error.auth.reauth_required"
                      : "error.auth.operation_superseded"
                };
          } catch (error) {
            const wasCurrent = isAuthOperationCurrent(operation);
            rejectInvalidRotatedResponse(operation, error);
            if (!wasCurrent) {
              return { ok: false as const, message: "error.auth.operation_superseded" };
            }
            return { ok: false as const, message: normalizeApiError(error) };
          }
        });
      } catch (error) {
        return { ok: false, message: normalizeApiError(error) };
      }
    },
    [commitRotatedSession, rejectInvalidRotatedResponse]
  );

  const refreshSession = useCallback(
    async (requestedPortal?: PortalScope): Promise<AuthActionResult> => {
      const requested = sessionRef.current;
      if (!requested) return { ok: false, message: "error.auth.unauthorized" };
      try {
        return await enqueueAuthRotation("session-refresh", async (operation, credentials) => {
          try {
            const current = sessionRef.current;
            if (
              !current ||
              current.id !== requested.id ||
              current.currentIdentity.id !== requested.currentIdentity.id
            )
              return { ok: false, message: "error.auth.operation_superseded" };
            let me = requireFormalAuthMePayload(await authApi.me(credentials));
            if (me.id !== current.id)
              return { ok: false, message: "error.auth.operation_superseded" };
            const targetPortal = requestedPortal ?? current.portal;
            const identity = findIdentityForPortal(
              [me.currentIdentity, ...me.identities],
              targetPortal
            );
            if (!identity) throw new Error("error.auth.portal_forbidden");
            if (identity.id !== me.currentIdentity.id) {
              const context = { expectedIdentityId: identity.id, expectedUserId: current.id };
              const switchedResponse = await authApi.switchIdentity(
                identity.id,
                credentials,
                context
              );
              const switchedCredentials = {
                accessToken: switchedResponse.accessToken,
                refreshToken: switchedResponse.refreshToken
              };
              if (!markAuthOperationServerRotated(operation, switchedCredentials)) {
                return { ok: false, message: "error.auth.operation_superseded" };
              }
              const switched = requireFormalSwitchIdentityPayload(switchedResponse, context);
              me = switched.me;
              const nextSession = buildAuthSessionFromMe(me, targetPortal, current.loginMethod);
              const outcome = commitRotatedSession(operation, switchedCredentials, nextSession);
              return outcome === "committed"
                ? { ok: true, session: nextSession }
                : {
                    ok: false,
                    message:
                      outcome === "storage_failed"
                        ? "error.auth.reauth_required"
                        : "error.auth.operation_superseded"
                  };
            }
            const nextSession = {
              ...buildAuthSessionFromMe(me, targetPortal, current.loginMethod),
              ...(targetPortal === "merchant" &&
              current.portal === "merchant" &&
              current.currentIdentity.id === me.currentIdentity.id &&
              current.merchantShopPublicId
                ? { merchantShopPublicId: current.merchantShopPublicId }
                : {})
            };
            const outcome = commitExistingSession(operation, nextSession);
            return outcome === "committed"
              ? { ok: true, session: nextSession }
              : {
                  ok: false,
                  message:
                    outcome === "rollback_failed"
                      ? "error.auth.reauth_required"
                      : "error.auth.storage_unavailable"
                };
          } catch (error) {
            const wasCurrent = isAuthOperationCurrent(operation);
            rejectInvalidRotatedResponse(operation, error);
            if (!wasCurrent) {
              return { ok: false, message: "error.auth.operation_superseded" };
            }
            return { ok: false, message: normalizeApiError(error) };
          }
        });
      } catch (error) {
        return { ok: false, message: normalizeApiError(error) };
      }
    },
    [commitExistingSession, commitRotatedSession, rejectInvalidRotatedResponse]
  );

  const sendVerificationCode = useCallback(
    async () => ({ ok: false, message: "error.auth.legacy_otp_unavailable" }),
    []
  );
  const loginWithVerificationCode = useCallback(
    async (): Promise<AuthActionResult> => ({
      ok: false,
      message: "error.auth.legacy_otp_unavailable"
    }),
    []
  );
  const loginWithQr = useCallback(
    async (): Promise<AuthActionResult> => ({ ok: false, message: "error.auth.qr_unavailable" }),
    []
  );
  const hasPermission = useCallback(
    (permission: string) => hasPermissionInSession(session, permission),
    [session]
  );
  const hasAnyPermission = useCallback(
    (permissions: string[]) => hasAnyPermissionInSession(session, permissions),
    [session]
  );
  const canAccess = useCallback(
    (portal: PortalScope) => canAccessPortalFromSession(session, portal),
    [session]
  );
  const canEnterPortal = useCallback(
    (portal: PortalScope) =>
      canAccessPortalFromSession(session, portal) ||
      canUseUserSessionForClientPortal(session, portal),
    [session]
  );
  const hasRememberedPortal = useCallback(
    (portal: PortalScope) => hasRememberedPortalAuthorization(portal),
    []
  );
  const canAccessMenu = useCallback(
    (permission: string) => canAccessMenuFromSession(session, permission),
    [session]
  );
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
      authenticateWithGoogleCredential,
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
      authenticateWithGoogleCredential,
      canAccess,
      canAccessFeature,
      canAccessMenu,
      canEnterPortal,
      hasAnyPermission,
      hasPermission,
      hasRememberedPortal,
      isRestoring,
      login,
      loginWithFormalPassword,
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
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}
