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
  abandonAuthOperation,
  beginLatestAuthOperation,
  commitExistingAuthOperation,
  commitRotatedAuthOperation,
  enqueueAuthRotation,
  getAuthCredentialSnapshot,
  hydrateAuthCredentialCoordinator,
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
  createAnonymousAuthEnvelope,
  createAuthInstanceId,
  createCommittedAuthEnvelope,
  parsePersistedAuthEnvelopeRaw,
  persistedAuthEnvelopeStorageKey,
  readPersistedAuthEnvelopeSnapshot,
  writePersistedAuthEnvelope,
  type CommittedAuthEnvelopeV8,
  type PersistedAuthEnvelopeV8
} from "./authEnvelope";
import {
  requireFormalAuthMePayload,
  requireFormalTokenPair,
  requireFormalSwitchIdentityPayload,
  requireFormalSwitchMerchantShopPayload
} from "./authContract";
import type { FeaturePermission } from "./featurePermissions";
import { hasPortalFeaturePermission } from "./featurePermissions";
import type { PortalScope } from "./portal";
import {
  buildRememberedByPortal,
  hasRememberedPortalAuthorization,
  readRememberedPortalAuthorization
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
  isSessionAlignedWithPortal,
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
  logout: () => Promise<{ message?: string; ok: boolean }>;
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

const AuthContext = createContext<AuthContextValue | null>(null);

function readInitialAuthEnvelope() {
  const snapshot = readPersistedAuthEnvelopeSnapshot();
  const envelope = snapshot?.envelope ?? null;
  hydrateAuthCredentialCoordinator({
    credentialVersion: envelope?.credentialVersion ?? 0,
    expectedUserId: envelope?.state === "committed" ? envelope.session.id : null,
    refreshToken: envelope?.state === "committed" ? envelope.refreshToken : null
  });
  return snapshot;
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
  return error instanceof Error && !error.message.startsWith("error.");
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
  if (result.status !== "authenticated") {
    throw new Error("error.auth.google_api_unavailable");
  }
  return requireFormalTokenPair<Extract<GoogleCredentialResult, { status: "authenticated" }>>(
    result,
    ["status", "accessToken", "refreshToken", "expiresIn"]
  );
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
    (candidate.accessToken === null ||
      (typeof candidate.accessToken === "string" && candidate.accessToken.length > 0)) &&
    "refreshToken" in candidate &&
    typeof candidate.refreshToken === "string" &&
    candidate.refreshToken.length > 0
      ? { accessToken: candidate.accessToken, refreshToken: candidate.refreshToken }
      : null;
  return { credentials, isRotatedResponse: true } as const;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [initialEnvelopeSnapshot] = useState(readInitialAuthEnvelope);
  const initialEnvelope = initialEnvelopeSnapshot?.envelope ?? null;
  const storedSessionForInitialRestore =
    initialEnvelope?.state === "committed" ? initialEnvelope.session : null;
  const initialCredentials = getAuthCredentialSnapshot();
  const [session, setSession] = useState<AuthSession | null>(null);
  const [isRestoring, setIsRestoring] = useState(
    Boolean(initialCredentials.refreshToken) && !initialCredentials.accessToken
  );
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const [restoreRevision, setRestoreRevision] = useState(0);
  const restoreInFlightRef = useRef<Promise<void> | null>(null);
  const sessionRef = useRef<AuthSession | null>(null);
  const envelopeRef = useRef<PersistedAuthEnvelopeV8 | null>(initialEnvelope);
  const envelopeRawRef = useRef<string | null>(initialEnvelopeSnapshot?.raw ?? null);

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
    publishAnonymous();
    setIsRestoring(false);
    return credentials;
  }, [publishAnonymous]);

  const persistAnonymousTombstone = useCallback(async () => {
    const currentEnvelope = envelopeRef.current;
    const tombstone = createAnonymousAuthEnvelope({
      authInstanceId: currentEnvelope?.authInstanceId ?? createAuthInstanceId(),
      credentialVersion: getAuthCredentialSnapshot().credentialVersion
    });
    const written = currentEnvelope
      ? await writePersistedAuthEnvelope(tombstone, {
          terminalAuthInstanceId: currentEnvelope.authInstanceId
        })
      : await writePersistedAuthEnvelope(tombstone, {
          expectedRaw: envelopeRawRef.current
        });
    if (written) {
      const snapshot = readPersistedAuthEnvelopeSnapshot();
      envelopeRef.current = snapshot?.envelope ?? null;
      envelopeRawRef.current = snapshot?.raw ?? null;
    }
    return written;
  }, []);

  const terminateAndTombstone = useCallback(async () => {
    const credentials = terminateLocalSession();
    const durable = await persistAnonymousTombstone();
    return { credentials, durable };
  }, [persistAnonymousTombstone, terminateLocalSession]);

  const createCommittedEnvelope = useCallback(
    (
      nextSession: AuthSession,
      refreshToken: string,
      preserveAuthInstance: boolean
    ): {
      envelope: CommittedAuthEnvelopeV8;
      expectedRaw: string | null;
    } => {
      const existing = envelopeRef.current;
      const sameUser =
        preserveAuthInstance &&
        existing?.state === "committed" &&
        existing.session.id === nextSession.id;
      const previousRemembered = sameUser ? existing.rememberedByPortal : {};
      return {
        expectedRaw: envelopeRawRef.current,
        envelope: createCommittedAuthEnvelope({
          authInstanceId: sameUser ? existing.authInstanceId : createAuthInstanceId(),
          credentialVersion: getAuthCredentialSnapshot().credentialVersion + 1,
          refreshToken,
          session: nextSession,
          rememberedByPortal: buildRememberedByPortal(previousRemembered, nextSession, refreshToken)
        })
      };
    },
    []
  );

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
      publishAnonymous();
      setIsRestoring(false);
      return true;
    },
    [publishAnonymous]
  );

  const commitRotatedSession = useCallback(
    async (
      operation: AuthOperation,
      credentials: AuthTransitionCredentials,
      nextSession: AuthSession
    ) => {
      if (
        operation.phase !== "server_rotated" &&
        !markAuthOperationServerRotated(operation, credentials)
      )
        return "superseded" as const;
      const { envelope: nextEnvelope, expectedRaw } = createCommittedEnvelope(
        nextSession,
        credentials.refreshToken,
        operation.mode === "rotation" ||
          operation.kind === "startup-restore" ||
          operation.kind === "remembered-portal-restore"
      );
      const committed = await commitRotatedAuthOperation(operation, {
        expectedUserId: nextSession.id,
        persistClient: async () =>
          await writePersistedAuthEnvelope(nextEnvelope, { expectedRaw })
      });
      if (!committed) {
        publishAnonymous();
        return "storage_failed" as const;
      }
      envelopeRef.current = nextEnvelope;
      envelopeRawRef.current = JSON.stringify(nextEnvelope);
      publishSession(nextSession);
      setRestoreError(null);
      return "committed" as const;
    },
    [createCommittedEnvelope, publishAnonymous, publishSession]
  );

  const commitExistingSession = useCallback(
    async (operation: AuthOperation, nextSession: AuthSession) => {
      const refreshToken = getAuthCredentialSnapshot().refreshToken;
      if (!refreshToken) return "storage_failed" as const;
      const { envelope: nextEnvelope, expectedRaw } = createCommittedEnvelope(
        nextSession,
        refreshToken,
        true
      );
      const committed = await commitExistingAuthOperation(
        operation,
        nextSession.id,
        async () => await writePersistedAuthEnvelope(nextEnvelope, { expectedRaw })
      );
      if (!committed) return "storage_failed" as const;
      envelopeRef.current = nextEnvelope;
      envelopeRawRef.current = JSON.stringify(nextEnvelope);
      publishSession(nextSession);
      setRestoreError(null);
      return "committed" as const;
    },
    [createCommittedEnvelope, publishSession]
  );

  const completeLatestAuthentication = useCallback(
    async (
      operation: AuthOperation,
      tokens: TokenPairPayload,
      requestedPortal: PortalScope,
      loginMethod: LoginMethod,
      fallback = "error.api",
      initialResponseRotated = true,
      expectedUserId?: number
    ): Promise<AuthActionResult> => {
      let credentials: AuthTransitionCredentials = {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken
      };
      try {
        if (initialResponseRotated && !markAuthOperationServerRotated(operation, credentials)) {
          return { ok: false, message: "error.auth.operation_superseded" };
        }
        let me = requireFormalAuthMePayload(await authApi.me(credentials), fallback);
        if (expectedUserId !== undefined && me.id !== expectedUserId) {
          throw new Error("error.auth.reauth_required");
        }
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
        const outcome = await commitRotatedSession(operation, credentials, nextSession);
        if (outcome === "committed") return { ok: true, session: nextSession };
        return {
          ok: false,
          message:
            outcome === "storage_failed"
              ? "error.auth.reauth_required"
              : "error.auth.operation_superseded"
        };
      } catch (error) {
        if (!initialResponseRotated && isTransientAuthRestoreError(error)) throw error;
        if (!rejectInvalidRotatedResponse(operation, error)) {
          const wasCurrent = isAuthOperationCurrent(operation);
          abandonAuthOperation(operation);
          if (wasCurrent) {
            if (initialResponseRotated) terminateLocalSession();
            else await terminateAndTombstone();
          }
        }
        return { ok: false, message: normalizeApiError(error, fallback) };
      }
    },
    [
      commitRotatedSession,
      rejectInvalidRotatedResponse,
      terminateAndTombstone,
      terminateLocalSession
    ]
  );

  const restoreRememberedPortalSession = useCallback(
    async (portal: PortalScope): Promise<AuthActionResult> => {
      const remembered = readRememberedPortalAuthorization(portal);
      if (!remembered) return { ok: false, message: "error.auth.portal_forbidden" };
      const { refreshToken, session: rememberedSession } = remembered;
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
        const outcome = await commitRotatedSession(operation, credentials, nextSession);
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
    setAuthExpiredHandler(async () => {
      publishAnonymous();
      await persistAnonymousTombstone();
    });
    return () => {
      setAuthExpiredHandler(null);
      setAuthCredentialRevoker(null);
    };
  }, [persistAnonymousTombstone, publishAnonymous]);

  useEffect(() => {
    const handleAuthEnvelopeStorage = (event: StorageEvent) => {
      if (
        event.key !== persistedAuthEnvelopeStorageKey ||
        event.storageArea !== window.localStorage
      ) {
        return;
      }
      if (event.newValue === envelopeRawRef.current) return;
      const durableEnvelope = parsePersistedAuthEnvelopeRaw(event.newValue);
      const localEnvelope = envelopeRef.current;
      const credentials = getAuthCredentialSnapshot();
      if (
        durableEnvelope?.state === "anonymous" &&
        localEnvelope?.authInstanceId === durableEnvelope.authInstanceId &&
        credentials.refreshToken
      ) {
        void authApi
          .logout({
            accessToken: credentials.accessToken,
            refreshToken: credentials.refreshToken
          })
          .catch(() => undefined);
      }
      envelopeRef.current = durableEnvelope;
      envelopeRawRef.current = durableEnvelope ? event.newValue : null;
      terminateLocalSession();
    };
    window.addEventListener("storage", handleAuthEnvelopeStorage);
    return () => window.removeEventListener("storage", handleAuthEnvelopeStorage);
  }, [terminateLocalSession]);

  useEffect(() => {
    let observedCredentialVersion = getAuthCredentialSnapshot().credentialVersion;
    return subscribeAuthCredentialSnapshot(() => {
      const credentials = getAuthCredentialSnapshot();
      if (credentials.credentialVersion === observedCredentialVersion) return;
      observedCredentialVersion = credentials.credentialVersion;
      if (!credentials.refreshToken && sessionRef.current) {
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
        const portal = storedSessionForInitialRestore?.portal ?? "user";
        const method = storedSessionForInitialRestore?.loginMethod ?? "password";
        const restored = await completeLatestAuthentication(
          operation,
          { ...nextCredentials, expiresIn: refreshed.expiresIn },
          portal,
          method,
          "error.api",
          false,
          storedSessionForInitialRestore?.id
        );
        if (!restored.ok && operation.generation === getAuthCredentialSnapshot().generation) {
          setRestoreError(restored.message);
        }
      } catch (error) {
        if (isAuthOperationCurrent(operation) && isTransientAuthRestoreError(error)) {
          abandonAuthOperation(operation);
          if (operation.generation === getAuthCredentialSnapshot().generation) {
            setRestoreError("error.auth.service_unavailable");
          }
        } else if (isAuthOperationCurrent(operation)) {
          await terminateAndTombstone();
        }
      }
    })();
    restoreInFlightRef.current = request;
    void request.finally(() => {
      if (
        restoreInFlightRef.current === request &&
        operation.generation === getAuthCredentialSnapshot().generation
      ) {
        restoreInFlightRef.current = null;
        setIsRestoring(false);
      }
    });
  }, [
    completeLatestAuthentication,
    restoreRevision,
    storedSessionForInitialRestore,
    terminateAndTombstone
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
        return completeLatestAuthentication(operation, payload, portal, "password");
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
        return completeLatestAuthentication(operation, payload, portal, "password");
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
      await terminateAndTombstone();
      try {
        const challenge = await authApi.startRegistration(input);
        if (!isVerificationChallenge(challenge)) throw new Error("error.api");
        return { ok: true, status: "verification_required", challenge };
      } catch (error) {
        return { ok: false, message: normalizeApiError(error) };
      }
    },
    [terminateAndTombstone]
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
          if (isAuthOperationCurrent(operation)) await terminateAndTombstone();
          return { ok: false, message: "error.auth.google_api_unavailable" };
        }
        if (isAuthOperationCurrent(operation)) await terminateAndTombstone();
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
    [
      completeLatestAuthentication,
      rejectInvalidRotatedResponse,
      terminateAndTombstone,
      terminateLocalSession
    ]
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

  const logout = useCallback(async () => {
    const credentials = terminateLocalSession();
    const tombstoneWritten = await persistAnonymousTombstone();
    let revoked = false;
    if (credentials) {
      try {
        await authApi.logout(credentials);
        revoked = true;
      } catch {
        revoked = false;
      }
    }
    if (tombstoneWritten || revoked) return { ok: true };
    const message = "error.auth.durable_logout_unconfirmed";
    setRestoreError(message);
    return { ok: false, message };
  }, [persistAnonymousTombstone, terminateLocalSession]);

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
              const outcome = await commitExistingSession(operation, nextSession);
              return outcome === "committed"
                ? { ok: true, session: nextSession }
                : {
                    ok: false,
                    message: "error.auth.storage_unavailable"
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
            const outcome = await commitRotatedSession(
              operation,
              switchedCredentials,
              nextSession
            );
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
            const outcome = await commitRotatedSession(
              operation,
              switchedCredentials,
              nextSession
            );
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
              const outcome = await commitRotatedSession(
                operation,
                switchedCredentials,
                nextSession
              );
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
            const outcome = await commitExistingSession(operation, nextSession);
            return outcome === "committed"
              ? { ok: true, session: nextSession }
              : {
                  ok: false,
                  message: "error.auth.storage_unavailable"
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
