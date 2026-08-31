import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  authApi,
  type AuthTransitionCredentials,
  type GoogleCredentialResult,
  type RegistrationStartInput,
  type VerificationChallengeInput,
  type VerificationChallengePayload
} from "../api/auth";
import {
  ApiClientError,
  clearAuthTokens,
  getAccessToken,
  getAuthCredentialEpoch,
  getAuthCredentialSnapshot,
  getStoredRefreshToken,
  restoreAuthCredentialSnapshot,
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
  captureRememberedPortalAuthorizations,
  forgetAllRememberedPortalAuthorizations,
  hasRememberedPortalAuthorization,
  readRememberedPortalRefreshToken,
  readRememberedPortalSession,
  rememberPortalAuthorization,
  restoreRememberedPortalAuthorizations
} from "./portalAuthorization";
import {
  requireFormalAuthMePayload,
  isFormalTokenPair,
  requireFormalSwitchIdentityPayload,
  requireFormalSwitchMerchantShopPayload
} from "./authContract";
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
    portalTab: readBrowserStorage(portalStorageKey, {
      kind: "session",
      silent: true
    })
  };
}

function restoreBrowserStorageValue(
  key: string,
  value: string | null,
  kind: "local" | "session"
) {
  return value === null
    ? removeBrowserStorage(key, { kind, silent: true })
    : writeBrowserStorage(key, value, { kind, silent: true });
}

function restoreBrowserAuthStorage(snapshot: BrowserAuthStorageSnapshot) {
  const results = [
    restoreBrowserStorageValue(portalStorageKey, snapshot.portalLocal, "local"),
    restoreBrowserStorageValue(portalStorageKey, snapshot.portalTab, "session"),
    restoreBrowserStorageValue(legacySessionStorageKey, snapshot.legacySessionLocal, "local"),
    restoreBrowserStorageValue(legacySessionStorageKey, snapshot.legacySessionTab, "session")
  ];

  return results.every(Boolean);
}

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

function isAuthenticatedGoogleResult(
  result: GoogleCredentialResult
): result is Extract<GoogleCredentialResult, { status: "authenticated" }> {
  return (
    result.status === "authenticated" &&
    isFormalTokenPair(result)
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
  const restoreErrorRef = useRef<string | null>(null);
  const authOperationRevisionRef = useRef(0);
  const activeAuthOperationRevisionRef = useRef<number | null>(null);
  const authGenerationRef = useRef(0);
  const transitionTailRef = useRef<Promise<void>>(Promise.resolve());
  const [initialCredentialSnapshot] = useState(() => getAuthCredentialSnapshot());
  const queuedCredentialsRef = useRef<{
    credentials: AuthTransitionCredentials | null;
    epoch: number;
  }>({
    credentials: initialCredentialSnapshot.refreshToken
      ? {
          accessToken: initialCredentialSnapshot.accessToken,
          refreshToken: initialCredentialSnapshot.refreshToken
        }
      : null,
    epoch: initialCredentialSnapshot.authCredentialEpoch
  });

  const updateRestoreError = useCallback((value: string | null) => {
    restoreErrorRef.current = value;
    setRestoreError(value);
  }, []);

  const synchronizeQueuedCredentials = useCallback(() => {
    const credentials = getAuthCredentialSnapshot();
    queuedCredentialsRef.current = {
      credentials: credentials.refreshToken
        ? {
            accessToken: credentials.accessToken,
            refreshToken: credentials.refreshToken
          }
        : null,
      epoch: credentials.authCredentialEpoch
    };
  }, []);

  const invalidateAuthTransitions = useCallback(() => {
    authGenerationRef.current += 1;
    authOperationRevisionRef.current += 1;
  }, []);

  const clearSession = useCallback(() => {
    invalidateAuthTransitions();
    clearAuthTokens();
    sessionRef.current = null;
    setSession(null);
    updateRestoreError(null);
    removeBrowserStorage(portalStorageKey, { silent: true });
    removeBrowserStorage(portalStorageKey, { kind: "session", silent: true });
    removeBrowserStorage(legacySessionStorageKey, { silent: true });
    removeBrowserStorage(legacySessionStorageKey, { kind: "session", silent: true });
    synchronizeQueuedCredentials();
  }, [invalidateAuthTransitions, synchronizeQueuedCredentials, updateRestoreError]);

  const persistSession = useCallback((nextSession: AuthSession) => {
    const browserSnapshot = captureBrowserAuthStorage();
    const rememberedSnapshot = captureRememberedPortalAuthorizations();
    const storageResults = [
      removeBrowserStorage(portalStorageKey, { silent: true }),
      removeBrowserStorage(legacySessionStorageKey, { silent: true }),
      writeBrowserStorage(portalStorageKey, nextSession.portal, {
        kind: "session",
        silent: true
      }),
      writeBrowserStorage(legacySessionStorageKey, JSON.stringify(nextSession), {
        kind: "session",
        silent: true
      }),
      rememberPortalAuthorization(nextSession, getStoredRefreshToken())
    ];

    if (!storageResults.every(Boolean)) {
      restoreBrowserAuthStorage(browserSnapshot);
      restoreRememberedPortalAuthorizations(rememberedSnapshot);
      return false;
    }

    setExpectedAuthUserId(nextSession.id);
    sessionRef.current = nextSession;
    setSession(nextSession);
    synchronizeQueuedCredentials();
    return true;
  }, [synchronizeQueuedCredentials]);

  const enqueueAuthTransition = useCallback(<TResult,>(
    run: (context: {
      credentials: AuthTransitionCredentials;
      generation: number;
      operationRevision: number;
    }) => Promise<TResult>,
    providedCredentials?: AuthTransitionCredentials
  ) => {
    const generation = authGenerationRef.current;
    const operationRevision = ++authOperationRevisionRef.current;
    const execute = transitionTailRef.current.then(async () => {
      if (generation !== authGenerationRef.current) {
        throw new Error("error.auth.operation_superseded");
      }

      if (getAuthCredentialEpoch() !== queuedCredentialsRef.current.epoch) {
        invalidateAuthTransitions();
        synchronizeQueuedCredentials();
        throw new Error("error.auth.operation_superseded");
      }

      const credentials = providedCredentials ?? queuedCredentialsRef.current.credentials;
      if (!credentials) {
        throw new Error("error.auth.service_unavailable");
      }

      activeAuthOperationRevisionRef.current = operationRevision;
      try {
        return await run({ credentials, generation, operationRevision });
      } catch (error) {
        if (
          generation !== authGenerationRef.current ||
          getAuthCredentialEpoch() !== queuedCredentialsRef.current.epoch
        ) {
          if (generation === authGenerationRef.current) {
            invalidateAuthTransitions();
            synchronizeQueuedCredentials();
          }
          throw new Error("error.auth.operation_superseded");
        }
        throw error;
      } finally {
        if (activeAuthOperationRevisionRef.current === operationRevision) {
          activeAuthOperationRevisionRef.current = null;
        }
      }
    });

    transitionTailRef.current = execute.then(
      () => undefined,
      () => undefined
    );

    return execute;
  }, [invalidateAuthTransitions, synchronizeQueuedCredentials]);

  const commitAuthTransition = useCallback((input: {
    accessToken: string;
    generation: number;
    nextSession: AuthSession;
    operationRevision: number;
    refreshToken: string;
    snapshot: {
      browser: BrowserAuthStorageSnapshot;
      credentials: ReturnType<typeof getAuthCredentialSnapshot>;
      remembered: ReturnType<typeof captureRememberedPortalAuthorizations>;
      restoreError: string | null;
      session: AuthSession | null;
    };
  }) => {
    if (
      input.generation !== authGenerationRef.current ||
      activeAuthOperationRevisionRef.current !== input.operationRevision ||
      getAuthCredentialEpoch() !== queuedCredentialsRef.current.epoch
    ) {
      return false;
    }

    const persisted = [
      setAccessToken(input.accessToken),
      setStoredRefreshToken(input.refreshToken),
      removeBrowserStorage(portalStorageKey, { silent: true }),
      removeBrowserStorage(legacySessionStorageKey, { silent: true }),
      writeBrowserStorage(portalStorageKey, input.nextSession.portal, {
        kind: "session",
        silent: true
      }),
      writeBrowserStorage(legacySessionStorageKey, JSON.stringify(input.nextSession), {
        kind: "session",
        silent: true
      }),
      rememberPortalAuthorization(input.nextSession, input.refreshToken)
    ].every(Boolean);

    if (!persisted) {
      if (
        input.generation === authGenerationRef.current &&
        activeAuthOperationRevisionRef.current === input.operationRevision
      ) {
        restoreAuthCredentialSnapshot(input.snapshot.credentials);
        restoreBrowserAuthStorage(input.snapshot.browser);
        restoreRememberedPortalAuthorizations(input.snapshot.remembered);
        sessionRef.current = input.snapshot.session;
        setSession(input.snapshot.session);
        updateRestoreError(input.snapshot.restoreError);
        synchronizeQueuedCredentials();
      }
      return false;
    }

    setExpectedAuthUserId(input.nextSession.id);
    sessionRef.current = input.nextSession;
    setSession(input.nextSession);
    updateRestoreError(null);
    synchronizeQueuedCredentials();
    return true;
  }, [synchronizeQueuedCredentials, updateRestoreError]);

  const captureAuthTransitionSnapshot = useCallback(() => ({
    browser: captureBrowserAuthStorage(),
    credentials: getAuthCredentialSnapshot(),
    remembered: captureRememberedPortalAuthorizations(),
    restoreError: restoreErrorRef.current,
    session: sessionRef.current
  }), []);

  const ensureAuthTransitionCurrent = useCallback((
    generation: number,
    operationRevision: number
  ) => {
    if (
      generation === authGenerationRef.current &&
      activeAuthOperationRevisionRef.current === operationRevision &&
      getAuthCredentialEpoch() === queuedCredentialsRef.current.epoch
    ) {
      return true;
    }

    if (generation === authGenerationRef.current) {
      invalidateAuthTransitions();
      synchronizeQueuedCredentials();
    }

    return false;
  }, [invalidateAuthTransitions, synchronizeQueuedCredentials]);

  const commitLogoutTransition = useCallback((
    generation: number,
    operationRevision: number,
    snapshot: ReturnType<typeof captureAuthTransitionSnapshot>
  ) => {
    if (!ensureAuthTransitionCurrent(generation, operationRevision)) {
      return false;
    }

    const cleared = [
      clearAuthTokens(),
      removeBrowserStorage(portalStorageKey, { silent: true }),
      removeBrowserStorage(portalStorageKey, { kind: "session", silent: true }),
      removeBrowserStorage(legacySessionStorageKey, { silent: true }),
      removeBrowserStorage(legacySessionStorageKey, { kind: "session", silent: true }),
      forgetAllRememberedPortalAuthorizations()
    ].every(Boolean);

    if (!cleared) {
      if (
        generation === authGenerationRef.current &&
        activeAuthOperationRevisionRef.current === operationRevision
      ) {
        restoreAuthCredentialSnapshot(snapshot.credentials);
        restoreBrowserAuthStorage(snapshot.browser);
        restoreRememberedPortalAuthorizations(snapshot.remembered);
        sessionRef.current = snapshot.session;
        setSession(snapshot.session);
        updateRestoreError(snapshot.restoreError);
        synchronizeQueuedCredentials();
      }
      return false;
    }

    invalidateAuthTransitions();
    sessionRef.current = null;
    setSession(null);
    updateRestoreError(null);
    synchronizeQueuedCredentials();
    return true;
  }, [ensureAuthTransitionCurrent, invalidateAuthTransitions, synchronizeQueuedCredentials, updateRestoreError]);

  const restoreRememberedPortalSession = useCallback(
    async (portal: PortalScope): Promise<AuthActionResult> => {
      const targetRefreshToken = readRememberedPortalRefreshToken(portal);
      const rememberedSession = readRememberedPortalSession(portal);

      if (!targetRefreshToken || !rememberedSession) {
        return { ok: false, message: "error.auth.portal_forbidden" };
      }

      try {
        return await enqueueAuthTransition(async ({ generation, operationRevision }) => {
          const snapshot = captureAuthTransitionSnapshot();
          const refreshed = await authApi.refreshWithCredentials(targetRefreshToken);
          let nextCredentials: AuthTransitionCredentials = {
            accessToken: refreshed.accessToken,
            refreshToken: targetRefreshToken
          };
          let me = requireFormalAuthMePayload(await authApi.me(nextCredentials));
          if (
            !ensureAuthTransitionCurrent(generation, operationRevision) ||
            me.id !== rememberedSession.id
          ) {
            return { ok: false, message: "error.auth.operation_superseded" };
          }

          const portalIdentity = findIdentityForPortal(
            [me.currentIdentity, ...me.identities],
            portal
          );
          if (!portalIdentity) {
            throw new Error("error.auth.portal_forbidden");
          }

          if (portalIdentity.id !== me.currentIdentity.id) {
            const switchedResponse = await authApi.switchIdentity(
              portalIdentity.id,
              nextCredentials,
              {
                expectedIdentityId: portalIdentity.id,
                expectedUserId: rememberedSession.id
              }
            );
            const switched = requireFormalSwitchIdentityPayload(switchedResponse, {
              expectedIdentityId: portalIdentity.id,
              expectedUserId: rememberedSession.id
            });
            if (!ensureAuthTransitionCurrent(generation, operationRevision)) {
              return { ok: false, message: "error.auth.operation_superseded" };
            }
            me = switched.me;
            nextCredentials = {
              accessToken: switched.accessToken,
              refreshToken: switched.refreshToken
            };
          }

          const nextSession = buildAuthSessionFromMe(
            me,
            portal,
            rememberedSession.loginMethod
          );
          if (
            !canAccessPortalFromSession(nextSession, portal) ||
            !isSessionAlignedWithPortal(nextSession, portal)
          ) {
            throw new Error("error.auth.portal_forbidden");
          }

          if (!commitAuthTransition({
            accessToken: nextCredentials.accessToken ?? "",
            generation,
            nextSession,
            operationRevision,
            refreshToken: nextCredentials.refreshToken,
            snapshot
          })) {
            return { ok: false, message: "error.auth.storage_unavailable" };
          }

          return { ok: true, session: nextSession };
        }, { accessToken: null, refreshToken: targetRefreshToken });
      } catch (error) {
        return { ok: false, message: normalizeApiError(error) };
      }
    },
    [
      captureAuthTransitionSnapshot,
      commitAuthTransition,
      enqueueAuthTransition,
      ensureAuthTransitionCurrent
    ]
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
        const me = requireFormalAuthMePayload(providedMe ?? (await authApi.me()), errorFallback);
        const portalIdentity = findIdentityForPortal(
          [me.currentIdentity, ...me.identities],
          requestedPortal
        );
        if (portalIdentity && portalIdentity.id !== me.currentIdentity.id) {
          return await enqueueAuthTransition(async ({ credentials, generation, operationRevision }) => {
            const snapshot = captureAuthTransitionSnapshot();
            const switchedResponse = await authApi.switchIdentity(
              portalIdentity.id,
              credentials,
              {
                expectedIdentityId: portalIdentity.id,
                expectedUserId: me.id
              }
            );
            const switched = requireFormalSwitchIdentityPayload(switchedResponse, {
              expectedIdentityId: portalIdentity.id,
              expectedUserId: me.id
            });
            if (!ensureAuthTransitionCurrent(generation, operationRevision)) {
              return { ok: false, message: "error.auth.operation_superseded" };
            }

            const nextSession = buildAuthSessionFromMe(
              switched.me,
              requestedPortal,
              loginMethod
            );
            if (!commitAuthTransition({
              accessToken: switched.accessToken,
              generation,
              nextSession,
              operationRevision,
              refreshToken: switched.refreshToken,
              snapshot
            })) {
              return { ok: false, message: "error.auth.storage_unavailable" };
            }

            return { ok: true, session: nextSession };
          });
        }
        const nextSession = buildAuthSessionFromMe(me, requestedPortal, loginMethod);
        if (!persistSession(nextSession)) {
          throw new Error("error.auth.storage_unavailable");
        }

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
    [
      captureAuthTransitionSnapshot,
      clearSession,
      commitAuthTransition,
      enqueueAuthTransition,
      ensureAuthTransitionCurrent,
      persistSession
    ]
  );

  useEffect(() => {
    purgeLegacyRememberedCredentials();
    setAuthExpiredHandler(clearSession);

    return () => setAuthExpiredHandler(null);
  }, [clearSession]);

  useEffect(() => {
    const shouldRefreshAccessToken = Boolean(getStoredRefreshToken()) && !getAccessToken();

    if (session && !shouldRefreshAccessToken) {
      updateRestoreError(null);
      setIsRestoring(false);
      return;
    }

    if (!getStoredRefreshToken()) {
      if (session && !getAccessToken()) {
        clearSession();
      }
      updateRestoreError(null);
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
        synchronizeQueuedCredentials();
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
            updateRestoreError(restored.message);
          }
          return;
        }

        updateRestoreError(null);
      } catch (error) {
        if (isTransientAuthRestoreError(error) && getStoredRefreshToken()) {
          updateRestoreError("error.auth.service_unavailable");
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
  }, [clearSession, completeAuthenticatedSession, restoreRevision, session, storedSessionForInitialRestore, synchronizeQueuedCredentials, updateRestoreError]);

  const retrySessionRestore = useCallback(() => {
    if (!getStoredRefreshToken()) {
      clearSession();
      return;
    }

    updateRestoreError(null);
    setIsRestoring(true);
    setRestoreRevision((current) => current + 1);
  }, [clearSession, updateRestoreError]);

  const login = useCallback(
    async (portal: PortalScope, email: string, password: string, captchaCode?: string): Promise<AuthActionResult> => {
      invalidateAuthTransitions();
      setExpectedAuthUserId(null);
      try {
        const loginPayload = await authApi.login(email, password, captchaCode);
        synchronizeQueuedCredentials();

        return completeAuthenticatedSession(portal, "password", loginPayload.me);
      } catch (error) {
        clearSession();

        return { ok: false, message: normalizeApiError(error) };
      }
    },
    [clearSession, completeAuthenticatedSession, invalidateAuthTransitions, synchronizeQueuedCredentials]
  );

  const loginWithFormalPassword = useCallback(
    async (portal: PortalScope, username: string, password: string): Promise<AuthActionResult> => {
      invalidateAuthTransitions();
      setExpectedAuthUserId(null);
      try {
        const loginPayload = await authApi.loginFormal(username, password);
        synchronizeQueuedCredentials();

        return completeAuthenticatedSession(portal, "password", loginPayload.me);
      } catch (error) {
        clearSession();

        return { ok: false, message: normalizeApiError(error) };
      }
    },
    [clearSession, completeAuthenticatedSession, invalidateAuthTransitions, synchronizeQueuedCredentials]
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
      invalidateAuthTransitions();
      try {
        const verified = await authApi.verifyRegistration(input);
        synchronizeQueuedCredentials();
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
    [clearSession, completeAuthenticatedSession, invalidateAuthTransitions, synchronizeQueuedCredentials]
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

      invalidateAuthTransitions();
      synchronizeQueuedCredentials();
      setExpectedAuthUserId(null);
      const completed = await completeAuthenticatedSession(requestedPortal, "google", undefined, "error.auth.google_api_unavailable");

      return completed.ok ? { ...completed, status: "authenticated" } : completed;
    },
    [clearSession, completeAuthenticatedSession, invalidateAuthTransitions, synchronizeQueuedCredentials]
  );

  const verifyGoogleRegistrationOrLink = useCallback(
    async (input: VerificationChallengeInput, requestedPortal: PortalScope = "user"): Promise<AuthenticatedAuthActionResult> => {
      invalidateAuthTransitions();
      try {
        const verified = await authApi.verifyGoogleRegistrationOrLink(input);
        synchronizeQueuedCredentials();
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
    [clearSession, completeAuthenticatedSession, invalidateAuthTransitions, synchronizeQueuedCredentials]
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
    try {
      await enqueueAuthTransition(async ({ credentials, generation, operationRevision }) => {
        const snapshot = captureAuthTransitionSnapshot();

        await authApi.logout(credentials).catch(() => undefined);
        commitLogoutTransition(generation, operationRevision, snapshot);
      });
    } catch {
      // A newer login/logout generation owns the current session.
    }
  }, [captureAuthTransitionSnapshot, commitLogoutTransition, enqueueAuthTransition]);

  const switchPortal = useCallback(
    async (portal: PortalScope): Promise<AuthActionResult> => {
      const requestedFromSession = sessionRef.current;
      if (!requestedFromSession || !canAccessPortalFromSession(requestedFromSession, portal)) {
        const restored = await restoreRememberedPortalSession(portal);

        if (restored.ok) {
          return restored;
        }

        return { ok: false, message: restored.message };
      }

      if (isSessionAlignedWithPortal(requestedFromSession, portal)) {
        return { ok: true, session: requestedFromSession };
      }

      const portalIdentity = findIdentityForPortal(requestedFromSession.identities, portal);

      if (!portalIdentity) {
        return { ok: false, message: "error.auth.portal_forbidden" };
      }

      if (portalIdentity.id === requestedFromSession.currentIdentity.id) {
        const nextLocalSession = {
          ...requestedFromSession,
          portal
        };
        if (!persistSession(nextLocalSession)) {
          return { ok: false, message: "error.auth.storage_unavailable" };
        }
        return { ok: true, session: nextLocalSession };
      }

      try {
        return await enqueueAuthTransition(async ({ credentials, generation, operationRevision }) => {
          const currentSession = sessionRef.current;
          if (!currentSession || !canAccessPortalFromSession(currentSession, portal)) {
            return { ok: false, message: "error.auth.operation_superseded" };
          }

          const currentPortalIdentity = findIdentityForPortal(currentSession.identities, portal);
          if (!currentPortalIdentity || currentPortalIdentity.id !== portalIdentity.id) {
            return { ok: false, message: "error.auth.operation_superseded" };
          }

          const snapshot = captureAuthTransitionSnapshot();
          const switchedResponse = await authApi.switchIdentity(
            currentPortalIdentity.id,
            credentials,
            {
              expectedIdentityId: currentPortalIdentity.id,
              expectedUserId: currentSession.id
            }
          );
          const switched = requireFormalSwitchIdentityPayload(switchedResponse, {
            expectedIdentityId: currentPortalIdentity.id,
            expectedUserId: currentSession.id
          });

          if (!ensureAuthTransitionCurrent(generation, operationRevision)) {
            return { ok: false, message: "error.auth.operation_superseded" };
          }

          const nextSession = buildAuthSessionFromMe(
            requireFormalAuthMePayload(switched.me),
            portal,
            currentSession.loginMethod
          );
          if (!commitAuthTransition({
            accessToken: switched.accessToken,
            generation,
            nextSession,
            operationRevision,
            refreshToken: switched.refreshToken,
            snapshot
          })) {
            return { ok: false, message: "error.auth.storage_unavailable" };
          }

          return { ok: true, session: nextSession };
        });
      } catch (error) {
        return { ok: false, message: normalizeApiError(error) };
      }
    },
    [
      captureAuthTransitionSnapshot,
      commitAuthTransition,
      enqueueAuthTransition,
      ensureAuthTransitionCurrent,
      persistSession,
      restoreRememberedPortalSession
    ]
  );

  const switchMerchantShop = useCallback(
    async (
      shopPublicId: string
    ): Promise<AuthActionResult & { shopPublicId?: string }> => {
      if (!sessionRef.current || sessionRef.current.portal !== "merchant") {
        return { ok: false, message: "error.auth.portal_forbidden" };
      }

      try {
        return await enqueueAuthTransition(async ({ credentials, generation, operationRevision }) => {
          const currentSession = sessionRef.current;
          if (!currentSession || currentSession.portal !== "merchant") {
            return { ok: false, message: "error.auth.operation_superseded" };
          }

          const snapshot = captureAuthTransitionSnapshot();
          const switchedResponse = await authApi.switchMerchantShop(
            shopPublicId,
            credentials,
            {
              expectedIdentityId: currentSession.currentIdentity.id,
              expectedUserId: currentSession.id
            }
          );
          const switched = requireFormalSwitchMerchantShopPayload(
            switchedResponse,
            shopPublicId,
            {
              expectedIdentityId: currentSession.currentIdentity.id,
              expectedUserId: currentSession.id
            }
          );

          if (!ensureAuthTransitionCurrent(generation, operationRevision)) {
            return { ok: false, message: "error.auth.operation_superseded" };
          }

          const nextSession = {
            ...buildAuthSessionFromMe(
              requireFormalAuthMePayload(switched.me),
              "merchant",
              currentSession.loginMethod
            ),
            merchantShopPublicId: switched.shopPublicId
          };
          if (!commitAuthTransition({
            accessToken: switched.accessToken,
            generation,
            nextSession,
            operationRevision,
            refreshToken: switched.refreshToken,
            snapshot
          })) {
            return { ok: false, message: "error.auth.storage_unavailable" };
          }

          return {
            ok: true,
            session: nextSession,
            shopPublicId: switched.shopPublicId
          };
        });
      } catch (error) {
        return { ok: false, message: normalizeApiError(error) };
      }
    },
    [
      captureAuthTransitionSnapshot,
      commitAuthTransition,
      enqueueAuthTransition,
      ensureAuthTransitionCurrent
    ]
  );

  const refreshSession = useCallback(
    async (requestedPortal?: PortalScope): Promise<AuthActionResult> => {
      if (!sessionRef.current) {
        return { ok: false, message: "error.auth.unauthorized" };
      }

      try {
        return await enqueueAuthTransition(async ({ credentials, generation, operationRevision }) => {
          const currentSession = sessionRef.current;
          if (!currentSession) {
            return { ok: false, message: "error.auth.operation_superseded" };
          }

          const snapshot = captureAuthTransitionSnapshot();
          let me = requireFormalAuthMePayload(await authApi.me(credentials));
          if (!ensureAuthTransitionCurrent(generation, operationRevision) || me.id !== currentSession.id) {
            return { ok: false, message: "error.auth.operation_superseded" };
          }

          const targetPortal = requestedPortal ?? currentSession.portal;
          const portalIdentity = findIdentityForPortal(
            [me.currentIdentity, ...me.identities],
            targetPortal
          );
          let nextCredentials = credentials;
          let identityChanged = false;
          if (portalIdentity && portalIdentity.id !== me.currentIdentity.id) {
            const switchedResponse = await authApi.switchIdentity(
              portalIdentity.id,
              credentials,
              {
                expectedIdentityId: portalIdentity.id,
                expectedUserId: currentSession.id
              }
            );
            const switched = requireFormalSwitchIdentityPayload(switchedResponse, {
              expectedIdentityId: portalIdentity.id,
              expectedUserId: currentSession.id
            });
            if (!ensureAuthTransitionCurrent(generation, operationRevision)) {
              return { ok: false, message: "error.auth.operation_superseded" };
            }
            me = requireFormalAuthMePayload(switched.me);
            nextCredentials = {
              accessToken: switched.accessToken,
              refreshToken: switched.refreshToken
            };
            identityChanged = true;
          }

          const nextSession = {
            ...buildAuthSessionFromMe(me, targetPortal, currentSession.loginMethod),
            ...(!identityChanged &&
            targetPortal === "merchant" &&
            currentSession.portal === "merchant" &&
            currentSession.id === me.id &&
            currentSession.currentIdentity.id === me.currentIdentity.id &&
            currentSession.merchantShopPublicId
              ? { merchantShopPublicId: currentSession.merchantShopPublicId }
              : {})
          };
          if (!commitAuthTransition({
            accessToken: nextCredentials.accessToken ?? credentials.accessToken ?? "",
            generation,
            nextSession,
            operationRevision,
            refreshToken: nextCredentials.refreshToken,
            snapshot
          })) {
            return { ok: false, message: "error.auth.storage_unavailable" };
          }

          return { ok: true, session: nextSession };
        });
      } catch (error) {
        return { ok: false, message: normalizeApiError(error) };
      }
    },
    [
      captureAuthTransitionSnapshot,
      commitAuthTransition,
      enqueueAuthTransition,
      ensureAuthTransitionCurrent
    ]
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
