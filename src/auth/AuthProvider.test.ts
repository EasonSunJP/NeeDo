// @vitest-environment jsdom
import { act, createElement, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  GoogleCredentialResult,
  RegistrationStartInput,
  VerificationChallengeInput,
  VerificationChallengePayload
} from "../api/auth";
import { AuthProvider, useAuth, type AuthSession, type PortalScope } from "./AuthProvider";
import {
  createAnonymousAuthEnvelope,
  createCommittedAuthEnvelope,
  persistedAuthEnvelopeStorageKey,
  readPersistedAuthEnvelope,
  setAuthEnvelopeLockAdapter,
  type AuthEnvelopeLockAdapter,
  writePersistedAuthEnvelope
} from "./authEnvelope";
import { getAuthEnvelopeStorageKey } from "./authPersistenceScope";
import {
  hasRememberedPortalAuthorization,
  readRememberedPortalRefreshToken,
  readRememberedPortalSession,
  rememberPortalAuthorization
} from "./portalAuthorization";
import type { AuthMePayload } from "./rbac";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const immediateLockAdapter: AuthEnvelopeLockAdapter = {
  request: async (_name, _options, callback) => callback()
};

const mocked = vi.hoisted(() => {
  class MockApiClientError extends Error {
    public constructor(
      message: string,
      public readonly code: number,
      public readonly status: number
    ) {
      super(message);
      this.name = "ApiClientError";
    }
  }

  const tokenState = {
    accessToken: null as string | null,
    epoch: 0,
    expectedUserId: null as number | null,
    refreshToken: null as string | null
  };
  const coordinatorState = {
    activeLatest: null as number | null,
    activeRotation: null as number | null,
    generation: 0,
    operation: 0,
    listeners: new Set<() => void>(),
    revoker: null as
      | null
      | ((credentials: {
          accessToken: string | null;
          refreshToken: string;
        }) => void | Promise<void>),
    tail: Promise.resolve() as Promise<unknown>
  };
  const publishCoordinator = () => {
    coordinatorState.listeners.forEach((listener) => listener());
  };

  return {
    ApiClientError: MockApiClientError,
    coordinatorState,
    publishCoordinator,
    tokenState,
    authApi: {
      login: vi.fn(),
      loginFormal: vi.fn(),
      logout: vi.fn(),
      me: vi.fn(),
      refresh: vi.fn(),
      refreshWithCredentials: vi.fn(),
      sendOtp: vi.fn(),
      startRegistration: vi.fn(),
      submitGoogleCredential: vi.fn(),
      switchIdentity: vi.fn(),
      switchMerchantShop: vi.fn(),
      verifyGoogleRegistrationOrLink: vi.fn(),
      verifyOtp: vi.fn(),
      verifyRegistration: vi.fn()
    },
    imCache: {
      lock: vi.fn((_accountId: string) => undefined),
      unlock: vi.fn(async (_accountId: string) => undefined),
    },
    clearAuthTokens: vi.fn(() => {
      tokenState.epoch += 1;
      tokenState.accessToken = null;
      tokenState.refreshToken = null;
      tokenState.expectedUserId = null;
      return true;
    }),
    setExpectedAuthUserId: vi.fn((userId: number | null) => {
      tokenState.expectedUserId = userId;
    }),
    setAuthExpiredHandler: vi.fn()
  };
});

vi.mock("../api/auth", () => ({ authApi: mocked.authApi }));
vi.mock("../features/im/local-cache/service", () => ({
  getImOpenedMediaCacheService: () => mocked.imCache,
  transitionImOpenedMediaCacheAccount: async (
    previousAccountId: string | null,
    nextAccountId: string | null,
  ) => {
    if (previousAccountId === nextAccountId) return;
    if (previousAccountId) mocked.imCache.lock(previousAccountId);
    if (nextAccountId) await mocked.imCache.unlock(nextAccountId);
  },
}));
vi.mock("./authCredentialCoordinator", () => ({
  abandonAuthOperation: (operation: {
    generation: number;
    id: number;
    mode: string;
    phase: string;
  }) => {
    const current =
      operation.generation === mocked.coordinatorState.generation &&
      (operation.mode === "latest"
        ? operation.id === mocked.coordinatorState.activeLatest
        : operation.id === mocked.coordinatorState.activeRotation);
    if (!current || operation.phase !== "preflight") return false;
    if (operation.mode === "latest") mocked.coordinatorState.activeLatest = null;
    if (operation.mode === "rotation") mocked.coordinatorState.activeRotation = null;
    operation.phase = "client_committed";
    return true;
  },
  beginLatestAuthOperation: (kind: string) => {
    mocked.coordinatorState.generation += 1;
    mocked.coordinatorState.operation += 1;
    mocked.coordinatorState.activeLatest = mocked.coordinatorState.operation;
    mocked.coordinatorState.activeRotation = null;
    mocked.coordinatorState.tail = Promise.resolve();
    return {
      generation: mocked.coordinatorState.generation,
      id: mocked.coordinatorState.operation,
      kind,
      mode: "latest",
      phase: "preflight",
      serverCredentials: null
    };
  },
  commitExistingAuthOperation: async (
    operation: { generation: number; id: number },
    expectedUserId: number,
    persistClient: () => boolean | Promise<boolean>
  ) => {
    if (
      operation.generation !== mocked.coordinatorState.generation ||
      operation.id !== mocked.coordinatorState.activeRotation
    )
      return false;
    if (!(await persistClient())) return false;
    if (
      operation.generation !== mocked.coordinatorState.generation ||
      operation.id !== mocked.coordinatorState.activeRotation
    )
      return false;
    mocked.setExpectedAuthUserId(expectedUserId);
    mocked.coordinatorState.activeRotation = null;
    return true;
  },
  commitRotatedAuthOperation: async (
    operation: {
      generation: number;
      id: number;
      serverCredentials: { accessToken: string | null; refreshToken: string } | null;
    },
    input: { expectedUserId: number; persistClient: () => boolean | Promise<boolean> }
  ) => {
    const isCurrent = () =>
      operation.generation === mocked.coordinatorState.generation &&
      (operation.id === mocked.coordinatorState.activeLatest ||
        operation.id === mocked.coordinatorState.activeRotation);
    if (!isCurrent() || !operation.serverCredentials) return false;
    const credentials = operation.serverCredentials;
    const clientPersisted = await input.persistClient();
    if (!clientPersisted) {
      if (mocked.coordinatorState.revoker) {
        void mocked.coordinatorState.revoker(credentials);
      }
      if (isCurrent()) {
        mocked.coordinatorState.generation += 1;
        mocked.tokenState.epoch += 1;
        mocked.tokenState.accessToken = null;
        mocked.tokenState.refreshToken = null;
        mocked.tokenState.expectedUserId = null;
      }
      return false;
    }
    if (!isCurrent()) return false;
    mocked.tokenState.epoch += 1;
    mocked.tokenState.accessToken = credentials.accessToken;
    mocked.tokenState.refreshToken = credentials.refreshToken;
    mocked.setExpectedAuthUserId(input.expectedUserId);
    mocked.coordinatorState.activeLatest = null;
    mocked.coordinatorState.activeRotation = null;
    return true;
  },
  enqueueAuthRotation: <T>(
    kind: string,
    run: (
      operation: Record<string, unknown>,
      credentials: { accessToken: string | null; refreshToken: string }
    ) => Promise<T>
  ) => {
    if (mocked.coordinatorState.activeLatest !== null) {
      return Promise.reject(new Error("error.auth.operation_superseded"));
    }
    const generation = mocked.coordinatorState.generation;
    const execute = mocked.coordinatorState.tail.then(async () => {
      if (generation !== mocked.coordinatorState.generation || !mocked.tokenState.refreshToken) {
        throw new Error("error.auth.operation_superseded");
      }
      mocked.coordinatorState.operation += 1;
      mocked.coordinatorState.activeRotation = mocked.coordinatorState.operation;
      const operation = {
        generation,
        id: mocked.coordinatorState.operation,
        kind,
        mode: "rotation",
        phase: "preflight",
        serverCredentials: null
      };
      try {
        return await run(operation, {
          accessToken: mocked.tokenState.accessToken,
          refreshToken: mocked.tokenState.refreshToken
        });
      } catch (error) {
        if (generation !== mocked.coordinatorState.generation) {
          throw new Error("error.auth.operation_superseded");
        }
        throw error;
      } finally {
        if (
          operation.generation === mocked.coordinatorState.generation &&
          operation.id === mocked.coordinatorState.activeRotation &&
          operation.phase === "preflight"
        ) {
          mocked.coordinatorState.activeRotation = null;
          operation.phase = "client_committed";
        }
      }
    });
    mocked.coordinatorState.tail = execute.then(
      () => undefined,
      () => undefined
    );
    return execute;
  },
  getAuthCredentialSnapshot: () => ({
    accessToken: mocked.tokenState.accessToken,
    authCredentialEpoch: mocked.tokenState.epoch,
    credentialVersion: mocked.tokenState.epoch,
    expectedAuthUserId: mocked.tokenState.expectedUserId,
    generation: mocked.coordinatorState.generation,
    operationId: mocked.coordinatorState.operation,
    phase: "client_committed",
    refreshToken: mocked.tokenState.refreshToken
  }),
  hydrateAuthCredentialCoordinator: (input: {
    credentialVersion: number;
    expectedUserId: number | null;
    refreshToken: string | null;
  }) => {
    mocked.tokenState.accessToken = null;
    mocked.tokenState.epoch = Math.max(mocked.tokenState.epoch, input.credentialVersion);
    mocked.tokenState.expectedUserId = input.expectedUserId;
    mocked.tokenState.refreshToken = input.refreshToken;
  },
  isAuthOperationCurrent: (operation: { generation: number; id: number; mode: string }) =>
    operation.generation === mocked.coordinatorState.generation &&
    (operation.mode === "latest"
      ? operation.id === mocked.coordinatorState.activeLatest
      : operation.id === mocked.coordinatorState.activeRotation),
  markAuthOperationServerRotated: (
    operation: {
      generation: number;
      id: number;
      mode: string;
      serverCredentials: { accessToken: string | null; refreshToken: string } | null;
      phase: string;
    },
    credentials: { accessToken: string | null; refreshToken: string }
  ) => {
    operation.phase = "server_rotated";
    operation.serverCredentials = credentials;
    const current =
      operation.generation === mocked.coordinatorState.generation &&
      (operation.mode === "latest"
        ? operation.id === mocked.coordinatorState.activeLatest
        : operation.id === mocked.coordinatorState.activeRotation);
    if (!current && mocked.coordinatorState.revoker)
      void mocked.coordinatorState.revoker(credentials);
    return current;
  },
  rejectAuthOperationAfterServerRotation: (operation: {
    generation: number;
    id: number;
    mode: string;
    serverCredentials: { accessToken: string | null; refreshToken: string } | null;
  }) => {
    const current =
      operation.generation === mocked.coordinatorState.generation &&
      (operation.mode === "latest"
        ? operation.id === mocked.coordinatorState.activeLatest
        : operation.id === mocked.coordinatorState.activeRotation);
    if (!current) return false;
    if (operation.serverCredentials && mocked.coordinatorState.revoker) {
      void mocked.coordinatorState.revoker(operation.serverCredentials);
    }
    mocked.coordinatorState.generation += 1;
    mocked.tokenState.epoch += 1;
    mocked.tokenState.accessToken = null;
    mocked.tokenState.refreshToken = null;
    mocked.tokenState.expectedUserId = null;
    mocked.coordinatorState.activeLatest = null;
    mocked.coordinatorState.activeRotation = null;
    mocked.publishCoordinator();
    return true;
  },
  subscribeAuthCredentialSnapshot: (listener: () => void) => {
    mocked.coordinatorState.listeners.add(listener);
    return () => {
      mocked.coordinatorState.listeners.delete(listener);
    };
  },
  setAuthCredentialRevoker: (revoker: typeof mocked.coordinatorState.revoker) => {
    mocked.coordinatorState.revoker = revoker;
  },
  terminateAuthImmediately: () => {
    const credentials = mocked.tokenState.refreshToken
      ? { accessToken: mocked.tokenState.accessToken, refreshToken: mocked.tokenState.refreshToken }
      : null;
    mocked.coordinatorState.generation += 1;
    mocked.coordinatorState.operation += 1;
    mocked.coordinatorState.activeLatest = null;
    mocked.coordinatorState.activeRotation = null;
    mocked.coordinatorState.tail = Promise.resolve();
    mocked.clearAuthTokens();
    mocked.publishCoordinator();
    return credentials;
  }
}));
vi.mock("../api/httpClient", () => ({
  ApiClientError: mocked.ApiClientError,
  clearAuthTokens: mocked.clearAuthTokens,
  getAccessToken: vi.fn(() => mocked.tokenState.accessToken),
  getAuthCredentialEpoch: vi.fn(() => mocked.tokenState.epoch),
  getAuthCredentialSnapshot: vi.fn(() => ({
    accessToken: mocked.tokenState.accessToken,
    authCredentialEpoch: mocked.tokenState.epoch,
    expectedAuthUserId: mocked.tokenState.expectedUserId,
    refreshToken: mocked.tokenState.refreshToken
  })),
  getStoredRefreshToken: vi.fn(() => mocked.tokenState.refreshToken),
  setAccessToken: vi.fn((token: string | null) => {
    mocked.tokenState.epoch += 1;
    mocked.tokenState.accessToken = token;
    return true;
  }),
  setExpectedAuthUserId: mocked.setExpectedAuthUserId,
  setAuthExpiredHandler: mocked.setAuthExpiredHandler,
  setStoredRefreshToken: vi.fn((token: string | null) => {
    mocked.tokenState.epoch += 1;
    mocked.tokenState.refreshToken = token;
    return true;
  }),
  restoreAuthCredentialSnapshot: vi.fn(
    (snapshot: {
      accessToken: string | null;
      expectedAuthUserId: number | null;
      refreshToken: string | null;
    }) => {
      mocked.tokenState.epoch += 1;
      mocked.tokenState.accessToken = snapshot.accessToken;
      mocked.tokenState.expectedUserId = snapshot.expectedAuthUserId;
      mocked.tokenState.refreshToken = snapshot.refreshToken;
      return true;
    }
  )
}));
type ChallengeSuccess = {
  challenge: VerificationChallengePayload;
  ok: true;
  status: "verification_required";
};

type SessionSuccess = {
  needoId?: string;
  ok: true;
  session: AuthSession;
  status: "authenticated";
};

type Task10AuthContext = ReturnType<typeof useAuth> & {
  authenticateWithGoogleCredential: (
    input: { credential: string; nonceChallengeId: string },
    requestedPortal?: PortalScope
  ) => Promise<ChallengeSuccess | SessionSuccess | { message: string; ok: false }>;
  startRegistration: (
    input: RegistrationStartInput
  ) => Promise<ChallengeSuccess | { message: string; ok: false }>;
  verifyGoogleRegistrationOrLink: (
    input: VerificationChallengeInput,
    requestedPortal?: PortalScope
  ) => Promise<SessionSuccess | { message: string; ok: false }>;
  verifyRegistration: (
    input: VerificationChallengeInput
  ) => Promise<(SessionSuccess & { needoId: string }) | { message: string; ok: false }>;
  switchMerchantShop: (
    shopPublicId: string
  ) => Promise<
    { ok: true; session: AuthSession; shopPublicId?: string } | { message: string; ok: false }
  >;
};

const challenge: VerificationChallengePayload = {
  challengeId: "10000000-0000-4000-8000-000000000001",
  cooldownSeconds: 60,
  expiresIn: 600,
  maskedEmail: "u***@example.com"
};

const customerIdentity = {
  id: 12,
  publicId: "u0000000007",
  scopeId: 41,
  scopeType: "customer_profile",
  type: "customer",
  displayName: "用户"
};

const technicianIdentity = {
  id: 13,
  publicId: "s0000000007",
  scopeId: 42,
  scopeType: "technician_profile",
  type: "technician",
  displayName: "技师"
};

const merchantStoreIdentity = {
  id: 14,
  publicId: "b0000000007",
  scopeId: 43,
  scopeType: "shop",
  type: "merchant_owner",
  displayName: "店铺负责人"
};

const merchantOrganizationIdentity = {
  id: 15,
  publicId: "o0000000007",
  scopeId: 9,
  scopeType: "merchant_account",
  type: "merchant_organization",
  displayName: "商户组织"
};

const platformIdentity = {
  id: 99,
  publicId: null,
  scopeId: null,
  scopeType: "global",
  type: "platform",
  displayName: "平台管理员"
};

const customerMe: AuthMePayload = {
  id: 7,
  needoId: "u0000000007",
  primaryPublicId: "u0000000007",
  activeIdentityId: customerIdentity.id,
  activePublicId: customerIdentity.publicId,
  email: "user@example.com",
  emailVerifiedAt: "2026-08-27T00:00:00.000Z",
  hasPassword: true,
  username: "u0000000007",
  avatarUrl: null,
  profileDisplayName: "u0000000007",
  isActive: true,
  isTestAccount: false,
  currentIdentity: customerIdentity,
  identities: [customerIdentity],
  roles: ["customer"],
  permissions: ["page:client-app"],
  menus: ["menu:client-app"],
  identityAvailability: []
};

const multiPortalMe: AuthMePayload = {
  ...customerMe,
  identities: [customerIdentity, technicianIdentity],
  roles: ["customer", "technician"],
  permissions: ["page:client-app", "page:technician-app"],
  menus: ["menu:client-app", "menu:technician-app"]
};

const merchantOrganizationMe: AuthMePayload = {
  ...customerMe,
  activeIdentityId: merchantOrganizationIdentity.id,
  activePublicId: merchantOrganizationIdentity.publicId,
  currentIdentity: merchantOrganizationIdentity,
  identities: [merchantOrganizationIdentity, technicianIdentity],
  roles: ["merchant_owner", "technician"],
  permissions: ["merchant-admin:dashboard:read", "page:technician-app"],
  menus: ["menu:merchant-app", "menu:technician-app"]
};

const inconsistentAdminMe: AuthMePayload = {
  ...customerMe,
  activeIdentityId: platformIdentity.id,
  activePublicId: platformIdentity.publicId,
  currentIdentity: platformIdentity,
  identities: [platformIdentity],
  roles: ["admin", "customer"],
  permissions: ["page:dashboard", "page:client-app"],
  menus: ["menu:dashboard", "menu:client-app"]
};

let container: HTMLDivElement;
let root: Root;
let auth: Task10AuthContext;
const observedAuthenticatedStates: boolean[] = [];

function Consumer() {
  auth = useAuth() as Task10AuthContext;
  observedAuthenticatedStates.push(auth.isAuthenticated);
  return createElement(
    "output",
    { "data-authenticated": String(auth.isAuthenticated) },
    auth.session?.loginMethod ?? "none"
  );
}

async function renderProvider() {
  await act(async () => {
    root.render(createElement(AuthProvider, null, createElement(Consumer)));
  });
}

async function renderProviderInStrictMode() {
  await act(async () => {
    root.render(
      createElement(StrictMode, null, createElement(AuthProvider, null, createElement(Consumer)))
    );
  });
}

async function invoke<TResult>(callback: () => Promise<TResult>) {
  let result: TResult | undefined;

  await act(async () => {
    result = await callback();
  });

  return result as TResult;
}

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });

  return { promise, reject, resolve };
}

async function waitFor(assertion: () => void) {
  let lastError: unknown;

  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      assertion();
      return;
    } catch (error) {
      lastError = error;
      await act(async () => {
        await new Promise((resolve) => window.setTimeout(resolve, 0));
      });
    }
  }

  throw lastError;
}

function persistTokens(accessToken = "access-token", refreshToken = "refresh-token") {
  mocked.tokenState.epoch += 1;
  mocked.tokenState.accessToken = accessToken;
  mocked.tokenState.refreshToken = refreshToken;
}

function formalLoginPayload(
  me: AuthMePayload,
  accessToken = "organization-access",
  refreshToken = "organization-refresh"
) {
  mocked.authApi.me.mockResolvedValueOnce(me);
  return { accessToken, refreshToken, expiresIn: 900 };
}

function authenticatedGoogleResult(): Extract<GoogleCredentialResult, { status: "authenticated" }> {
  return {
    accessToken: "google-access-token",
    expiresIn: 900,
    refreshToken: "google-refresh-token",
    status: "authenticated"
  };
}

function authenticateGoogle(
  result: GoogleCredentialResult = authenticatedGoogleResult(),
  requestedPortal: PortalScope = "user"
) {
  mocked.authApi.submitGoogleCredential.mockResolvedValueOnce(result);
  return auth.authenticateWithGoogleCredential(
    { credential: "google-credential", nonceChallengeId: "nonce-challenge" },
    requestedPortal
  );
}

function withCurrentIdentity(
  me: AuthMePayload,
  currentIdentity: AuthMePayload["currentIdentity"]
): AuthMePayload {
  return {
    ...me,
    currentIdentity,
    activeIdentityId: currentIdentity.id,
    activePublicId: currentIdentity.publicId ?? null
  };
}

function storedCustomerSession(overrides: Partial<AuthSession> = {}): AuthSession {
  return {
    authVersion: 7,
    id: customerMe.id,
    needoId: customerMe.needoId,
    primaryPublicId: customerMe.primaryPublicId ?? customerMe.needoId,
    activeIdentityId: customerIdentity.id,
    activePublicId: customerIdentity.publicId,
    username: customerMe.username,
    email: customerMe.email,
    emailVerifiedAt: customerMe.emailVerifiedAt,
    hasPassword: customerMe.hasPassword,
    avatarUrl: null,
    profileDisplayName: customerMe.profileDisplayName,
    portal: "user",
    allowedPortals: ["user"],
    loginMethod: "google",
    loggedInAt: "2026-08-27T00:00:00.000Z",
    linkedCustomerId: "cus-41",
    linkedTechnicianId: "",
    linkedStoreId: "",
    roles: customerMe.roles,
    permissions: customerMe.permissions,
    menus: customerMe.menus,
    currentIdentity: customerIdentity,
    identities: [customerIdentity],
    identityAvailability: [],
    ...overrides
  };
}

async function persistStartupEnvelope(session: AuthSession, refreshToken: string) {
  const envelope = createCommittedAuthEnvelope({
    authInstanceId: "00000000-0000-4000-8000-000000000008",
    credentialVersion: 8,
    refreshToken,
    session,
    rememberedByPortal: {
      [session.portal]: { refreshToken, session }
    }
  });
  expect(await writePersistedAuthEnvelope(envelope, { expectedRaw: null })).toBe(true);
}

describe("AuthProvider formal registration and Google sessions", () => {
  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    window.localStorage.clear();
    window.sessionStorage.clear();
    setAuthEnvelopeLockAdapter(immediateLockAdapter);
    vi.clearAllMocks();
    observedAuthenticatedStates.length = 0;
    mocked.tokenState.accessToken = null;
    mocked.tokenState.epoch = 0;
    mocked.tokenState.expectedUserId = null;
    mocked.tokenState.refreshToken = null;
    mocked.coordinatorState.activeLatest = null;
    mocked.coordinatorState.activeRotation = null;
    mocked.coordinatorState.generation = 0;
    mocked.coordinatorState.listeners.clear();
    mocked.coordinatorState.operation = 0;
    mocked.coordinatorState.revoker = null;
    mocked.coordinatorState.tail = Promise.resolve();
    mocked.authApi.logout.mockResolvedValue({});
    mocked.authApi.refresh.mockImplementation(async () => {
      mocked.tokenState.accessToken = "restored-access-token";
      return { accessToken: "restored-access-token", expiresIn: 900 };
    });
    mocked.authApi.refreshWithCredentials.mockResolvedValue({
      accessToken: "remembered-access-token",
      expiresIn: 900
    });
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  it("does not expose the retired generic provider fallback", async () => {
    await renderProvider();

    expect("loginWithProvider" in (auth as unknown as Record<string, unknown>)).toBe(false);
  });

  it("purges every legacy plaintext credential record during auth bootstrap without touching unrelated storage", async () => {
    window.localStorage.setItem("needo.auth.remember-credentials.admin.admin", "admin-secret");
    window.localStorage.setItem(
      "needo.auth.remember-credentials.admin.merchant-admin",
      "merchant-secret"
    );
    window.localStorage.setItem("needo.auth.portal", "user");
    window.localStorage.setItem("needo.admin.theme", "classic-white-black");

    await renderProvider();

    expect(
      Object.keys(window.localStorage).filter((key) =>
        key.startsWith("needo.auth.remember-credentials.")
      )
    ).toEqual([]);
    expect(window.localStorage.getItem("needo.auth.portal")).toBe("user");
    expect(window.localStorage.getItem("needo.admin.theme")).toBe("classic-white-black");
  });

  it("completes an authenticated backend Google result through /auth/me", async () => {
    mocked.authApi.me.mockResolvedValue(customerMe);
    await renderProvider();
    persistTokens("google-access-token", "google-refresh-token");

    const result = await invoke(() => authenticateGoogle());

    expect(result).toMatchObject({
      ok: true,
      status: "authenticated",
      session: {
        authVersion: 7,
        needoId: "u0000000007",
        activePublicId: "u0000000007",
        emailVerifiedAt: "2026-08-27T00:00:00.000Z",
        hasPassword: true,
        loginMethod: "google",
        portal: "user"
      }
    });
    expect(mocked.authApi.me).toHaveBeenCalledTimes(1);
    expect(mocked.setExpectedAuthUserId).toHaveBeenCalledWith(customerMe.id);
    expect(auth.session?.loginMethod).toBe("google");
  });

  it("locks the previous account cache before committing replacement credentials", async () => {
    mocked.authApi.me.mockResolvedValueOnce(customerMe);
    await renderProvider();
    persistTokens("google-access-token", "google-refresh-token");
    await invoke(() => authenticateGoogle());
    mocked.imCache.lock.mockClear();
    mocked.imCache.unlock.mockClear();
    mocked.setExpectedAuthUserId.mockClear();

    const replacementMe = {
      ...merchantOrganizationMe,
      id: 8,
      needoId: "u0000000008",
      primaryPublicId: "u0000000008",
    };
    mocked.authApi.loginFormal.mockResolvedValueOnce(
      formalLoginPayload(replacementMe),
    );
    await invoke(() => auth.loginWithFormalPassword(
      "merchant",
      "o5831047296",
      "secret",
    ));

    expect(mocked.imCache.lock).toHaveBeenCalledWith(String(customerMe.id));
    expect(mocked.imCache.lock.mock.invocationCallOrder[0])
      .toBeLessThan(mocked.setExpectedAuthUserId.mock.invocationCallOrder[0]!);
    expect(mocked.imCache.unlock).toHaveBeenCalledWith(String(replacementMe.id));
  });

  it("never uses an inline login me and requires the caller-owned /auth/me response", async () => {
    mocked.authApi.loginFormal.mockResolvedValueOnce({
      accessToken: "login-access",
      refreshToken: "login-refresh",
      expiresIn: 900,
      me: { ...merchantOrganizationMe, permissions: ["platform:superuser"] }
    });
    mocked.authApi.me.mockResolvedValueOnce(customerMe);
    await renderProvider();

    const result = await invoke(() =>
      auth.loginWithFormalPassword("user", "u0000000007", "secret")
    );

    expect(result).toMatchObject({
      ok: true,
      session: { portal: "user", permissions: customerMe.permissions }
    });
    expect(mocked.authApi.me).toHaveBeenCalledWith({
      accessToken: "login-access",
      refreshToken: "login-refresh"
    });
    expect(auth.session?.permissions).not.toContain("platform:superuser");
  });

  it("persists the active portal only inside the V8 envelope", async () => {
    mocked.authApi.me.mockResolvedValue(customerMe);
    await renderProvider();
    persistTokens("google-access-token", "google-refresh-token");

    await invoke(() => authenticateGoogle());

    expect(window.sessionStorage.getItem("needo.auth.portal")).toBeNull();
    expect(window.sessionStorage.getItem("needo.auth.session")).toBeNull();
    expect(window.localStorage.getItem("needo.auth.portal")).toBeNull();
    expect(window.localStorage.getItem("needo.auth.session")).toBeNull();
    expect(window.localStorage.getItem(persistedAuthEnvelopeStorageKey)).toContain(
      '"needoId":"u0000000007"'
    );
  });

  it("keeps an already aligned portal switch idempotent", async () => {
    mocked.authApi.me.mockResolvedValue(customerMe);
    await renderProvider();
    persistTokens("google-access-token", "google-refresh-token");
    await invoke(() => authenticateGoogle());
    const alignedSession = auth.session;

    const switched = await invoke(() => auth.switchPortal("user"));

    expect(switched).toEqual({ ok: true, session: alignedSession });
    expect(switched.ok && switched.session).toBe(alignedSession);
    expect(auth.session).toBe(alignedSession);
    expect(mocked.authApi.switchIdentity).not.toHaveBeenCalled();
  });

  it("does not persist a portal whose backend identity cannot be aligned", async () => {
    mocked.authApi.me.mockResolvedValue(multiPortalMe);
    await renderProvider();
    persistTokens("google-access-token", "google-refresh-token");
    await invoke(() => authenticateGoogle());
    const customerSession = auth.session;
    mocked.tokenState.epoch += 1;
    mocked.tokenState.accessToken = null;
    mocked.tokenState.refreshToken = null;

    const switched = await invoke(() => auth.switchPortal("technician"));

    expect(switched.ok).toBe(false);
    expect(auth.session).toBe(customerSession);
    expect(auth.session?.portal).toBe("user");
    expect(auth.session?.currentIdentity).toEqual(customerIdentity);
    expect(mocked.authApi.switchIdentity).not.toHaveBeenCalled();
  });

  it("fails closed when a role grants portal access without a matching target identity", async () => {
    mocked.authApi.loginFormal.mockResolvedValue(
      formalLoginPayload(inconsistentAdminMe, "admin-access", "admin-refresh")
    );
    await renderProvider();
    persistTokens("admin-access", "admin-refresh");
    await invoke(() => auth.loginWithFormalPassword("admin", "admin@example.com", "secret"));

    const switched = await invoke(() => auth.switchPortal("user"));

    expect(switched).toEqual({ ok: false, message: "error.auth.portal_forbidden" });
    expect(auth.session).toMatchObject({
      currentIdentity: platformIdentity,
      portal: "admin"
    });
    expect(mocked.authApi.switchIdentity).not.toHaveBeenCalled();
  });

  it("rejects invalid remembered portal restoration and tombstones its authorization", async () => {
    await rememberPortalAuthorization(
      storedCustomerSession({
        activeIdentityId: platformIdentity.id,
        activePublicId: platformIdentity.publicId,
        allowedPortals: ["admin", "user"],
        currentIdentity: platformIdentity,
        identities: [platformIdentity],
        menus: inconsistentAdminMe.menus,
        permissions: inconsistentAdminMe.permissions,
        roles: inconsistentAdminMe.roles
      }),
      "remembered-inconsistent-refresh"
    );
    mocked.authApi.me.mockResolvedValue(inconsistentAdminMe);
    await renderProvider();

    const switched = await invoke(() => auth.switchPortal("user"));

    expect(switched).toEqual({ ok: false, message: "error.auth.portal_forbidden" });
    expect(auth.session).toBeNull();
    expect(hasRememberedPortalAuthorization("user")).toBe(false);
  });

  it("serializes a remembered portal identity rotation with the remembered refresh credentials", async () => {
    await rememberPortalAuthorization(
      storedCustomerSession({
        activeIdentityId: technicianIdentity.id,
        activePublicId: technicianIdentity.publicId,
        allowedPortals: ["user", "technician"],
        currentIdentity: technicianIdentity,
        identities: [customerIdentity, technicianIdentity],
        linkedTechnicianId: "tech-42",
        menus: multiPortalMe.menus,
        permissions: multiPortalMe.permissions,
        portal: "technician",
        roles: multiPortalMe.roles
      }),
      "remembered-technician-refresh"
    );
    mocked.authApi.me.mockResolvedValue(multiPortalMe);
    mocked.authApi.switchIdentity.mockResolvedValue({
      accessToken: "technician-access",
      refreshToken: "technician-refresh",
      expiresIn: 900,
      me: withCurrentIdentity(multiPortalMe, technicianIdentity)
    });
    await renderProvider();

    const switched = await invoke(() => auth.switchPortal("technician"));

    expect(mocked.authApi.refreshWithCredentials).toHaveBeenCalledWith(
      "remembered-technician-refresh"
    );
    expect(mocked.authApi.me).toHaveBeenCalledWith({
      accessToken: "remembered-access-token",
      refreshToken: "remembered-technician-refresh"
    });
    expect(mocked.authApi.switchIdentity).toHaveBeenCalledWith(
      technicianIdentity.id,
      {
        accessToken: "remembered-access-token",
        refreshToken: "remembered-technician-refresh"
      },
      { expectedIdentityId: technicianIdentity.id, expectedUserId: customerMe.id }
    );
    expect(switched).toMatchObject({
      ok: true,
      session: { currentIdentity: technicianIdentity, portal: "technician" }
    });
    expect(mocked.tokenState).toMatchObject({
      accessToken: "technician-access",
      refreshToken: "technician-refresh"
    });
  });

  it("fails closed when /auth/me omits a required formal account field", async () => {
    const incompleteMe = { ...customerMe } as Partial<AuthMePayload>;
    delete incompleteMe.hasPassword;
    mocked.authApi.me.mockResolvedValue(incompleteMe);
    await renderProvider();
    persistTokens("google-access-token", "google-refresh-token");

    const result = await invoke(() => authenticateGoogle());

    expect(result).toEqual({ ok: false, message: "error.auth.google_api_unavailable" });
    expect(mocked.tokenState).toMatchObject({ accessToken: null, refreshToken: null });
    expect(auth.session).toBeNull();
  });

  it("keeps a first-use Google verification challenge sessionless and tokenless", async () => {
    await renderProvider();
    persistTokens("stale-access", "stale-refresh");

    const result = await invoke(() =>
      authenticateGoogle({ status: "verification_required", ...challenge })
    );

    expect(result).toEqual({
      ok: true,
      status: "verification_required",
      challenge
    });
    expect(auth.session).toBeNull();
    expect(mocked.tokenState).toMatchObject({
      accessToken: null,
      refreshToken: null
    });
    expect(mocked.authApi.me).not.toHaveBeenCalled();
  });

  it("revokes credentials hidden in a malformed Google verification challenge", async () => {
    const malformed = new Error("error.api");
    malformed.name = "AuthRotatedResponseError";
    Object.assign(malformed, {
      rotatedCredentials: {
        accessToken: "malformed-google-access",
        refreshToken: "malformed-google-refresh"
      }
    });
    mocked.authApi.submitGoogleCredential.mockRejectedValueOnce(malformed);
    await renderProvider();

    const result = await invoke(() =>
      auth.authenticateWithGoogleCredential({
        credential: "google-credential",
        nonceChallengeId: "nonce-challenge"
      })
    );

    expect(result).toEqual({
      ok: false,
      message: "error.api"
    });
    expect(mocked.authApi.logout).toHaveBeenCalledWith({
      accessToken: "malformed-google-access",
      refreshToken: "malformed-google-refresh"
    });
    expect(auth.session).toBeNull();
  });

  it("clears remembered account tokens when Google requires first-use verification", async () => {
    await rememberPortalAuthorization(storedCustomerSession(), "remembered-refresh");
    await renderProvider();

    await invoke(() => authenticateGoogle({ status: "verification_required", ...challenge }));

    expect(hasRememberedPortalAuthorization("user")).toBe(false);
  });

  it("verifies first-use Google registration and returns its generated NeeDo ID", async () => {
    mocked.authApi.verifyGoogleRegistrationOrLink.mockImplementation(async () => {
      persistTokens("verified-google-access", "verified-google-refresh");
      return {
        accessToken: "verified-google-access",
        expiresIn: 900,
        refreshToken: "verified-google-refresh",
        needoId: "u0000000007"
      };
    });
    mocked.authApi.me.mockResolvedValue(customerMe);
    await renderProvider();

    const result = await invoke(() =>
      auth.verifyGoogleRegistrationOrLink(
        { challengeId: challenge.challengeId, otp: "123456" },
        "user"
      )
    );

    expect(result).toMatchObject({
      ok: true,
      status: "authenticated",
      needoId: "u0000000007",
      session: { loginMethod: "google" }
    });
    expect(auth.session?.loginMethod).toBe("google");
  });

  it("starts registration without authenticating, then verifies into only the user portal", async () => {
    mocked.authApi.startRegistration.mockResolvedValue(challenge);
    mocked.authApi.verifyRegistration.mockImplementation(async () => {
      persistTokens("registration-access", "registration-refresh");
      return {
        accessToken: "registration-access",
        expiresIn: 900,
        refreshToken: "registration-refresh",
        needoId: "u0000000007"
      };
    });
    mocked.authApi.me.mockResolvedValue(customerMe);
    await renderProvider();

    const started = await invoke(() =>
      auth.startRegistration({
        email: "USER@example.com",
        password: "Password.2026!"
      })
    );
    expect(started).toEqual({
      ok: true,
      status: "verification_required",
      challenge
    });
    expect(auth.session).toBeNull();
    expect(mocked.tokenState).toMatchObject({
      accessToken: null,
      refreshToken: null
    });

    const verified = await invoke(() =>
      auth.verifyRegistration({
        challengeId: challenge.challengeId,
        otp: "123456"
      })
    );
    expect(verified).toMatchObject({
      ok: true,
      status: "authenticated",
      needoId: "u0000000007",
      session: {
        allowedPortals: ["user"],
        loginMethod: "password",
        portal: "user"
      }
    });
  });

  it("clears remembered account tokens before starting a new registration", async () => {
    await rememberPortalAuthorization(storedCustomerSession(), "remembered-refresh");
    mocked.authApi.startRegistration.mockResolvedValue(challenge);
    await renderProvider();

    await invoke(() =>
      auth.startRegistration({ email: "new@example.com", password: "Password.2026!" })
    );

    expect(hasRememberedPortalAuthorization("user")).toBe(false);
  });

  it("rejects registration when the response has no current customer identity", async () => {
    const platformIdentity = {
      id: 99,
      publicId: null,
      scopeId: null,
      scopeType: "global",
      type: "platform",
      displayName: "平台管理员"
    };
    mocked.authApi.verifyRegistration.mockImplementation(async () => {
      persistTokens("registration-access", "registration-refresh");
      return {
        accessToken: "registration-access",
        expiresIn: 900,
        refreshToken: "registration-refresh",
        needoId: "u0000000007"
      };
    });
    mocked.authApi.me.mockResolvedValue({
      ...withCurrentIdentity(customerMe, platformIdentity),
      identities: [platformIdentity],
      roles: ["customer"]
    });
    await renderProvider();

    const result = await invoke(() =>
      auth.verifyRegistration({ challengeId: challenge.challengeId, otp: "123456" })
    );

    expect(result).toEqual({ ok: false, message: "error.auth.portal_forbidden" });
    expect(mocked.tokenState).toMatchObject({ accessToken: null, refreshToken: null });
    expect(auth.session).toBeNull();
    expect(mocked.authApi.logout).toHaveBeenCalledWith({
      accessToken: "registration-access",
      refreshToken: "registration-refresh"
    });
  });

  it("closes a malformed Google verification operation instead of leaving a latest-operation lock", async () => {
    await renderProvider();
    const malformed = {
      status: "verification_required" as const,
      challengeId: "",
      cooldownSeconds: 60,
      expiresIn: 600,
      maskedEmail: "u***@example.com"
    };

    const result = await invoke(() => authenticateGoogle(malformed));

    expect(result).toEqual({ ok: false, message: "error.auth.google_api_unavailable" });
    expect(auth.session).toBeNull();
    expect(mocked.coordinatorState.activeLatest).toBeNull();
  });

  it("normalizes provider errors and clears tokens when post-token session completion fails", async () => {
    mocked.authApi.me.mockRejectedValue({
      provider: "google",
      credential: "secret"
    });
    await renderProvider();
    persistTokens("google-access-token", "google-refresh-token");

    const result = await invoke(() => authenticateGoogle());

    expect(result).toEqual({
      ok: false,
      message: "error.auth.google_api_unavailable"
    });
    expect(mocked.tokenState).toMatchObject({
      accessToken: null,
      refreshToken: null
    });
    expect(auth.session).toBeNull();
    expect(mocked.authApi.logout).toHaveBeenCalledWith({
      accessToken: "google-access-token",
      refreshToken: "google-refresh-token"
    });
  });

  it("rejects an otherwise complete stored session from the previous auth version", async () => {
    window.sessionStorage.setItem(
      "needo.auth.session",
      JSON.stringify(storedCustomerSession({ authVersion: 5 }))
    );

    await renderProvider();

    expect(auth.session).toBeNull();
    expect(auth.isAuthenticated).toBe(false);
  });

  it("rejects a current-version stored session missing a required formal account field", async () => {
    const incompleteSession = storedCustomerSession() as Partial<AuthSession>;
    delete incompleteSession.emailVerifiedAt;
    window.sessionStorage.setItem("needo.auth.session", JSON.stringify(incompleteSession));

    await renderProvider();

    expect(auth.session).toBeNull();
  });

  it("rejects a current-version stored session with the retired gmail login method", async () => {
    window.sessionStorage.setItem(
      "needo.auth.session",
      JSON.stringify({ ...storedCustomerSession(), loginMethod: "gmail" })
    );

    await renderProvider();

    expect(auth.session).toBeNull();
  });

  it("never exposes a stored browser session as authenticated before server restoration", async () => {
    window.sessionStorage.setItem("needo.auth.session", JSON.stringify(storedCustomerSession()));

    await renderProvider();

    expect(observedAuthenticatedStates[0]).toBe(false);
    expect(auth.session).toBeNull();
  });

  it("keeps a refresh-backed session private and retryable during a transient restore outage", async () => {
    await persistStartupEnvelope(storedCustomerSession(), "stored-retry-refresh");
    mocked.authApi.refreshWithCredentials.mockRejectedValueOnce(new TypeError("Failed to fetch"));

    await renderProvider();
    await waitFor(() => expect(auth.isRestoring).toBe(false));

    expect(auth.session).toBeNull();
    expect(auth.restoreError).toBe("error.auth.service_unavailable");
    expect(mocked.tokenState.refreshToken).toBe("stored-retry-refresh");
    expect(mocked.clearAuthTokens).not.toHaveBeenCalled();

    mocked.authApi.refreshWithCredentials.mockImplementationOnce(async () => {
      return { accessToken: "restored-after-retry-access", expiresIn: 900 };
    });
    mocked.authApi.me.mockResolvedValue(customerMe);

    await act(async () => auth.retrySessionRestore());
    await waitFor(() => expect(auth.session?.id).toBe(customerMe.id));

    expect(auth.restoreError).toBeNull();
    expect(auth.isAuthenticated).toBe(true);
  });

  it("treats a missing refresh route during deployment recovery as retryable instead of expiring the session", async () => {
    await persistStartupEnvelope(storedCustomerSession(), "stored-deployment-refresh");
    mocked.authApi.refreshWithCredentials.mockRejectedValueOnce(
      new mocked.ApiClientError("error.resource_not_found", 404, 404)
    );

    await renderProvider();
    await waitFor(() => expect(auth.isRestoring).toBe(false));

    expect(auth.restoreError).toBe("error.auth.service_unavailable");
    expect(mocked.tokenState.refreshToken).toBe("stored-deployment-refresh");
    expect(mocked.clearAuthTokens).not.toHaveBeenCalled();
  });

  it("fails closed with retry for an unclassified restore error", async () => {
    await persistStartupEnvelope(storedCustomerSession(), "stored-unknown-error-refresh");
    mocked.authApi.refreshWithCredentials.mockRejectedValueOnce(
      new Error("proxy response unavailable")
    );

    await renderProvider();
    await waitFor(() => expect(auth.isRestoring).toBe(false));

    expect(auth.session).toBeNull();
    expect(auth.restoreError).toBe("error.auth.service_unavailable");
    expect(mocked.tokenState.refreshToken).toBe("stored-unknown-error-refresh");
    expect(mocked.clearAuthTokens).not.toHaveBeenCalled();
  });

  it("preserves Google as the login method while restoring a refresh-backed session", async () => {
    const storedSession = storedCustomerSession();
    await persistStartupEnvelope(storedSession, "stored-google-refresh");
    mocked.authApi.me.mockResolvedValue(customerMe);

    await renderProvider();
    await waitFor(() => expect(auth.isRestoring).toBe(false));

    expect(mocked.authApi.refreshWithCredentials).toHaveBeenCalledTimes(1);
    expect(auth.session?.loginMethod).toBe("google");
  });

  it("fails closed when the V8 envelope user differs from /auth/me", async () => {
    await persistStartupEnvelope(
      storedCustomerSession({ id: 999 }),
      "stored-other-user-refresh"
    );
    mocked.authApi.me.mockResolvedValue(customerMe);

    await renderProvider();
    await waitFor(() => expect(auth.isRestoring).toBe(false));

    expect(auth.session).toBeNull();
    expect(mocked.tokenState.refreshToken).toBeNull();
  });

  it("publishes anonymous state when the coordinator terminates credentials externally", async () => {
    mocked.authApi.loginFormal.mockResolvedValue(formalLoginPayload(customerMe));
    await renderProvider();
    await invoke(() => auth.loginWithFormalPassword("user", "u0000000007", "secret"));
    expect(auth.session?.id).toBe(customerMe.id);

    await act(async () => {
      mocked.tokenState.accessToken = null;
      mocked.tokenState.refreshToken = null;
      mocked.tokenState.expectedUserId = null;
      mocked.tokenState.epoch += 1;
      mocked.publishCoordinator();
    });

    expect(auth.session).toBeNull();
    expect(auth.isAuthenticated).toBe(false);
  });

  it("deduplicates refresh-backed restoration during StrictMode effect replay", async () => {
    await persistStartupEnvelope(storedCustomerSession(), "stored-strict-mode-refresh");
    mocked.authApi.me.mockResolvedValue(customerMe);

    await renderProviderInStrictMode();
    await waitFor(() => expect(auth.isRestoring).toBe(false));

    expect(mocked.authApi.refreshWithCredentials).toHaveBeenCalledTimes(1);
    expect(mocked.authApi.me).toHaveBeenCalledTimes(1);
    expect(auth.isAuthenticated).toBe(true);
  });

  it("keeps portal and identity switching behavior for Google sessions", async () => {
    mocked.authApi.me.mockResolvedValue(multiPortalMe);
    mocked.authApi.switchIdentity.mockResolvedValue({
      accessToken: "switched-access",
      expiresIn: 900,
      refreshToken: "switched-refresh",
      me: withCurrentIdentity(multiPortalMe, technicianIdentity)
    });
    await renderProvider();
    persistTokens("google-access", "google-refresh");
    await invoke(() => authenticateGoogle());

    const switched = await invoke(() => auth.switchPortal("technician"));

    expect(mocked.authApi.switchIdentity).toHaveBeenCalledWith(
      technicianIdentity.id,
      { accessToken: "google-access-token", refreshToken: "google-refresh-token" },
      { expectedIdentityId: technicianIdentity.id, expectedUserId: customerMe.id }
    );
    expect(switched).toMatchObject({
      ok: true,
      session: {
        currentIdentity: technicianIdentity,
        loginMethod: "google",
        portal: "technician"
      }
    });
  });

  it("keeps the O identity selected by prefixed login instead of replacing it with B", async () => {
    const organizationMe: AuthMePayload = {
      ...withCurrentIdentity(customerMe, merchantOrganizationIdentity),
      identities: [customerIdentity, merchantStoreIdentity, merchantOrganizationIdentity],
      roles: ["customer", "merchant_owner"],
      permissions: ["page:client-app", "page:merchant-app"],
      menus: ["menu:client-app", "menu:merchant-app"]
    };
    mocked.authApi.loginFormal.mockResolvedValue(formalLoginPayload(organizationMe));
    await renderProvider();
    persistTokens("organization-access", "organization-refresh");

    const loggedIn = await invoke(() =>
      auth.loginWithFormalPassword("merchant", "o5831047296", "secret")
    );

    expect(mocked.authApi.switchIdentity).not.toHaveBeenCalled();
    expect(loggedIn).toMatchObject({
      ok: true,
      session: {
        currentIdentity: merchantOrganizationIdentity,
        portal: "merchant"
      }
    });
  });

  it("does not persist an incomplete /auth/me response while refreshing a session", async () => {
    mocked.authApi.me.mockResolvedValueOnce(customerMe);
    await renderProvider();
    persistTokens("google-access", "google-refresh");
    await invoke(() => authenticateGoogle());
    const incompleteMe = { ...customerMe } as Partial<AuthMePayload>;
    delete incompleteMe.needoId;
    mocked.authApi.me.mockResolvedValueOnce(incompleteMe);

    const refreshed = await invoke(() => auth.refreshSession());

    expect(refreshed).toEqual({ ok: false, message: "error.api" });
    expect(auth.session).toMatchObject({ needoId: "u0000000007", hasPassword: true });
  });

  it("does not persist an incomplete switched-identity response", async () => {
    mocked.authApi.me.mockResolvedValue(multiPortalMe);
    await renderProvider();
    persistTokens("google-access", "google-refresh");
    await invoke(() => authenticateGoogle());
    const incompleteMe = {
      ...withCurrentIdentity(multiPortalMe, technicianIdentity)
    } as Partial<AuthMePayload>;
    delete incompleteMe.emailVerifiedAt;
    mocked.authApi.switchIdentity.mockImplementation(async () => ({
      accessToken: "switched-access",
      expiresIn: 900,
      refreshToken: "switched-refresh",
      me: incompleteMe
    }));
    const switched = await invoke(() => auth.switchPortal("technician"));

    expect(switched).toEqual({ ok: false, message: "error.api" });
    expect(mocked.tokenState).toMatchObject({
      accessToken: null,
      refreshToken: null
    });
    expect(auth.session).toBeNull();
    expect(mocked.authApi.logout).toHaveBeenCalledWith({
      accessToken: "switched-access",
      refreshToken: "switched-refresh"
    });
  });

  it("clears switched tokens when refreshSession receives an incomplete switched identity", async () => {
    mocked.authApi.me.mockResolvedValue(multiPortalMe);
    await renderProvider();
    persistTokens("google-access", "google-refresh");
    await invoke(() => authenticateGoogle());
    const incompleteMe = {
      ...withCurrentIdentity(multiPortalMe, technicianIdentity)
    } as Partial<AuthMePayload>;
    delete incompleteMe.needoId;
    mocked.authApi.switchIdentity.mockImplementation(async () => ({
      accessToken: "switched-access",
      expiresIn: 900,
      refreshToken: "switched-refresh",
      me: incompleteMe
    }));
    const refreshed = await invoke(() => auth.refreshSession("technician"));

    expect(refreshed).toEqual({ ok: false, message: "error.api" });
    expect(mocked.tokenState).toMatchObject({
      accessToken: null,
      refreshToken: null
    });
    expect(auth.session).toBeNull();
    expect(mocked.authApi.logout).toHaveBeenCalledWith({
      accessToken: "switched-access",
      refreshToken: "switched-refresh"
    });
  });

  it("atomically persists a server-confirmed merchant shop selection and remembered authorization", async () => {
    mocked.authApi.loginFormal.mockResolvedValue(formalLoginPayload(merchantOrganizationMe));
    mocked.authApi.switchMerchantShop.mockImplementation(async (shopPublicId: string) => {
      return {
        accessToken: "shop-b-access",
        refreshToken: "shop-b-refresh",
        expiresIn: 900,
        me: merchantOrganizationMe,
        shopPublicId
      };
    });
    await renderProvider();
    persistTokens("organization-access", "organization-refresh");
    await invoke(() => auth.loginWithFormalPassword("merchant", "o5831047296", "secret"));

    const switched = await invoke(() => auth.switchMerchantShop("shop0000000012"));

    expect(switched).toMatchObject({
      ok: true,
      shopPublicId: "shop0000000012",
      session: { merchantShopPublicId: "shop0000000012", portal: "merchant" }
    });
    expect(auth.session?.merchantShopPublicId).toBe("shop0000000012");
    expect(mocked.tokenState).toMatchObject({
      accessToken: "shop-b-access",
      refreshToken: "shop-b-refresh"
    });
    expect(readRememberedPortalRefreshToken("merchant")).toBe("shop-b-refresh");
    expect(readRememberedPortalSession("merchant")?.merchantShopPublicId).toBe("shop0000000012");
  });

  it("does not trust a remembered merchant shop public ID without a switch response", async () => {
    await rememberPortalAuthorization(
      storedCustomerSession({
        activeIdentityId: merchantOrganizationIdentity.id,
        activePublicId: merchantOrganizationIdentity.publicId,
        allowedPortals: ["merchant", "technician"],
        currentIdentity: merchantOrganizationIdentity,
        identities: [merchantOrganizationIdentity, technicianIdentity],
        linkedStoreId: "",
        merchantShopPublicId: "shop9999999999",
        menus: merchantOrganizationMe.menus,
        permissions: merchantOrganizationMe.permissions,
        portal: "merchant",
        roles: merchantOrganizationMe.roles
      }),
      "remembered-merchant-refresh"
    );
    mocked.authApi.me.mockResolvedValue(merchantOrganizationMe);
    await renderProvider();

    const restored = await invoke(() => auth.switchPortal("merchant"));

    expect(restored).toMatchObject({
      ok: true,
      session: { portal: "merchant" }
    });
    expect(auth.session?.merchantShopPublicId).toBeUndefined();
    expect(readRememberedPortalSession("merchant")?.merchantShopPublicId).toBeUndefined();
  });

  it("leaves the current session unchanged on a preflight shop failure and allows a later switch", async () => {
    mocked.authApi.loginFormal.mockResolvedValue(formalLoginPayload(merchantOrganizationMe));
    mocked.authApi.switchMerchantShop.mockRejectedValue(
      new Error("error.auth.merchant_shop_forbidden")
    );
    await renderProvider();
    persistTokens("organization-access", "organization-refresh");
    await invoke(() => auth.loginWithFormalPassword("merchant", "o5831047296", "secret"));
    const previousSession = auth.session;

    const switched = await invoke(() => auth.switchMerchantShop("shop0000000012"));

    expect(switched).toEqual({
      ok: false,
      message: "error.auth.merchant_shop_forbidden"
    });
    expect(auth.session).toBe(previousSession);
    expect(mocked.tokenState).toMatchObject({
      accessToken: "organization-access",
      refreshToken: "organization-refresh"
    });
    expect(readRememberedPortalRefreshToken("merchant")).toBe("organization-refresh");
    expect(readRememberedPortalSession("merchant")?.merchantShopPublicId).toBeUndefined();

    mocked.authApi.switchMerchantShop.mockResolvedValueOnce({
      accessToken: "shop-access",
      refreshToken: "shop-refresh",
      expiresIn: 900,
      me: merchantOrganizationMe,
      shopPublicId: "shop0000000012"
    });
    const retried = await invoke(() => auth.switchMerchantShop("shop0000000012"));
    expect(retried).toMatchObject({ ok: true, shopPublicId: "shop0000000012" });
  });

  it("fails closed and revokes rotated tokens when a merchant shop switch response is invalid", async () => {
    mocked.authApi.loginFormal.mockResolvedValue(formalLoginPayload(merchantOrganizationMe));
    mocked.authApi.switchMerchantShop.mockImplementation(async () => {
      return {
        accessToken: "invalid-access",
        refreshToken: "invalid-refresh",
        expiresIn: 900,
        me: merchantOrganizationMe,
        shopPublicId: "12"
      };
    });
    await renderProvider();
    persistTokens("organization-access", "organization-refresh");
    await invoke(() => auth.loginWithFormalPassword("merchant", "o5831047296", "secret"));
    const switched = await invoke(() => auth.switchMerchantShop("shop0000000012"));

    expect(switched).toEqual({ ok: false, message: "error.api" });
    expect(auth.session).toBeNull();
    expect(mocked.tokenState).toMatchObject({
      accessToken: null,
      refreshToken: null
    });
    expect(mocked.authApi.logout).toHaveBeenCalledWith({
      accessToken: "invalid-access",
      refreshToken: "invalid-refresh"
    });
    expect(readRememberedPortalRefreshToken("merchant")).toBe("organization-refresh");
  });

  it("fails closed and revokes an invalid identity-switch 200 response", async () => {
    mocked.authApi.loginFormal.mockResolvedValue(formalLoginPayload(multiPortalMe));
    mocked.authApi.switchIdentity.mockResolvedValue({
      accessToken: "invalid-identity-access",
      refreshToken: "invalid-identity-refresh",
      expiresIn: 900,
      me: multiPortalMe
    });
    await renderProvider();
    await invoke(() => auth.loginWithFormalPassword("user", "u0000000007", "secret"));

    const switched = await invoke(() => auth.switchPortal("technician"));

    expect(switched).toEqual({ ok: false, message: "error.api" });
    expect(auth.session).toBeNull();
    expect(mocked.tokenState).toMatchObject({ accessToken: null, refreshToken: null });
    await waitFor(() => expect(mocked.authApi.logout).toHaveBeenCalledTimes(1));
    expect(mocked.authApi.logout).toHaveBeenCalledWith({
      accessToken: "invalid-identity-access",
      refreshToken: "invalid-identity-refresh"
    });
  });

  it("revokes the newest malformed pair when login completion itself switches identity", async () => {
    mocked.authApi.loginFormal.mockResolvedValue(formalLoginPayload(multiPortalMe));
    const malformed = new Error("error.api");
    malformed.name = "AuthRotatedResponseError";
    Object.assign(malformed, {
      rotatedCredentials: {
        accessToken: "invalid-login-switch-access",
        refreshToken: "invalid-login-switch-refresh"
      }
    });
    mocked.authApi.switchIdentity.mockRejectedValue(malformed);
    await renderProvider();

    const result = await invoke(() =>
      auth.loginWithFormalPassword("technician", "u0000000007", "secret")
    );

    expect(result).toEqual({ ok: false, message: "error.api" });
    expect(auth.session).toBeNull();
    expect(mocked.tokenState).toMatchObject({ accessToken: null, refreshToken: null });
    expect(mocked.authApi.logout).toHaveBeenCalledWith({
      accessToken: "invalid-login-switch-access",
      refreshToken: "invalid-login-switch-refresh"
    });
  });

  it("fails closed when refreshSession receives an invalid rotated identity response", async () => {
    mocked.authApi.loginFormal.mockResolvedValue(formalLoginPayload(multiPortalMe));
    mocked.authApi.me.mockResolvedValue(multiPortalMe);
    mocked.authApi.switchIdentity.mockResolvedValue({
      accessToken: "invalid-refresh-access",
      refreshToken: "invalid-refresh-refresh",
      expiresIn: 900,
      me: multiPortalMe
    });
    await renderProvider();
    await invoke(() => auth.loginWithFormalPassword("user", "u0000000007", "secret"));

    const refreshed = await invoke(() => auth.refreshSession("technician"));

    expect(refreshed).toEqual({ ok: false, message: "error.api" });
    expect(auth.session).toBeNull();
    expect(mocked.tokenState).toMatchObject({ accessToken: null, refreshToken: null });
    expect(mocked.authApi.logout).toHaveBeenCalledWith({
      accessToken: "invalid-refresh-access",
      refreshToken: "invalid-refresh-refresh"
    });
  });

  it("serializes concurrent shop switches and gives the second request the first response refresh token", async () => {
    mocked.authApi.loginFormal.mockResolvedValue(formalLoginPayload(merchantOrganizationMe));
    const shopA = createDeferred<{
      accessToken: string;
      refreshToken: string;
      expiresIn: number;
      me: AuthMePayload;
      shopPublicId: string;
    }>();
    const shopB = createDeferred<{
      accessToken: string;
      refreshToken: string;
      expiresIn: number;
      me: AuthMePayload;
      shopPublicId: string;
    }>();
    mocked.authApi.switchMerchantShop.mockImplementation((shopPublicId: string) => {
      const deferred = shopPublicId === "shop0000000011" ? shopA : shopB;
      return deferred.promise;
    });
    await renderProvider();
    persistTokens("organization-access", "organization-refresh");
    await invoke(() => auth.loginWithFormalPassword("merchant", "o5831047296", "secret"));

    let first!: ReturnType<Task10AuthContext["switchMerchantShop"]>;
    let second!: ReturnType<Task10AuthContext["switchMerchantShop"]>;
    act(() => {
      first = auth.switchMerchantShop("shop0000000011");
      second = auth.switchMerchantShop("shop0000000012");
    });

    await waitFor(() => expect(mocked.authApi.switchMerchantShop).toHaveBeenCalledTimes(1));
    expect(mocked.authApi.switchMerchantShop).toHaveBeenNthCalledWith(
      1,
      "shop0000000011",
      { accessToken: "organization-access", refreshToken: "organization-refresh" },
      { expectedIdentityId: merchantOrganizationIdentity.id, expectedUserId: customerMe.id }
    );
    await act(async () => {
      shopA.resolve({
        accessToken: "shop-a-access",
        refreshToken: "shop-a-refresh",
        expiresIn: 900,
        me: merchantOrganizationMe,
        shopPublicId: "shop0000000011"
      });
      await Promise.resolve();
    });
    await waitFor(() => expect(mocked.authApi.switchMerchantShop).toHaveBeenCalledTimes(2));
    expect(mocked.authApi.switchMerchantShop).toHaveBeenNthCalledWith(
      2,
      "shop0000000012",
      { accessToken: "shop-a-access", refreshToken: "shop-a-refresh" },
      { expectedIdentityId: merchantOrganizationIdentity.id, expectedUserId: customerMe.id }
    );
    await act(async () => {
      shopB.resolve({
        accessToken: "shop-b-access",
        refreshToken: "shop-b-refresh",
        expiresIn: 900,
        me: merchantOrganizationMe,
        shopPublicId: "shop0000000012"
      });
      await Promise.all([first, second]);
    });

    expect(auth.session?.merchantShopPublicId).toBe("shop0000000012");
    expect(mocked.tokenState).toMatchObject({
      accessToken: "shop-b-access",
      refreshToken: "shop-b-refresh"
    });
    expect(readRememberedPortalRefreshToken("merchant")).toBe("shop-b-refresh");
  });

  it("logs out locally immediately even while a rotation request is hung", async () => {
    mocked.authApi.loginFormal.mockResolvedValue(formalLoginPayload(merchantOrganizationMe));
    const pendingSwitch = createDeferred<{
      accessToken: string;
      refreshToken: string;
      expiresIn: number;
      me: AuthMePayload;
      shopPublicId: string;
    }>();
    mocked.authApi.switchMerchantShop.mockImplementation(() => pendingSwitch.promise);
    await renderProvider();
    persistTokens("organization-access", "organization-refresh");
    await invoke(() => auth.loginWithFormalPassword("merchant", "o5831047296", "secret"));
    mocked.authApi.me.mockClear();

    let switching!: ReturnType<Task10AuthContext["switchMerchantShop"]>;
    act(() => {
      switching = auth.switchMerchantShop("shop0000000012");
    });
    await waitFor(() => expect(mocked.authApi.switchMerchantShop).toHaveBeenCalledTimes(1));

    let loggingOut!: ReturnType<Task10AuthContext["logout"]>;
    act(() => {
      loggingOut = auth.logout();
    });

    expect(auth.session).toBeNull();
    expect(mocked.tokenState).toMatchObject({ accessToken: null, refreshToken: null });
    await waitFor(() => expect(mocked.authApi.logout).toHaveBeenCalledTimes(1));
    expect(mocked.authApi.logout).toHaveBeenCalledWith({
      accessToken: "organization-access",
      refreshToken: "organization-refresh"
    });

    await act(async () => {
      pendingSwitch.resolve({
        accessToken: "late-access",
        refreshToken: "late-refresh",
        expiresIn: 900,
        me: merchantOrganizationMe,
        shopPublicId: "shop0000000012"
      });
      await Promise.all([switching, loggingOut]);
    });
    expect(auth.session).toBeNull();
  });

  it("keeps the latest of two out-of-order login responses", async () => {
    const firstLogin = createDeferred<{
      accessToken: string;
      refreshToken: string;
      expiresIn: number;
    }>();
    const secondLogin = createDeferred<{
      accessToken: string;
      refreshToken: string;
      expiresIn: number;
    }>();
    const secondIdentity = {
      ...merchantOrganizationIdentity,
      id: 61,
      publicId: "o0000000061",
      scopeId: 51
    };
    const secondMe: AuthMePayload = {
      ...merchantOrganizationMe,
      id: 8,
      needoId: "u0000000008",
      primaryPublicId: "u0000000008",
      activeIdentityId: secondIdentity.id,
      activePublicId: secondIdentity.publicId,
      email: "merchant-b@example.com",
      currentIdentity: secondIdentity,
      identities: [secondIdentity],
      identityAvailability: [
        {
          kind: "merchant",
          state: "active",
          identityId: secondIdentity.id,
          applicationId: null,
          rejectionReason: null
        }
      ]
    };
    mocked.authApi.loginFormal
      .mockImplementationOnce(() => firstLogin.promise)
      .mockImplementationOnce(() => secondLogin.promise);
    mocked.authApi.me.mockImplementation(async (credentials: { refreshToken: string }) =>
      credentials.refreshToken === "session-b-refresh" ? secondMe : merchantOrganizationMe
    );
    await renderProvider();

    let first!: ReturnType<Task10AuthContext["loginWithFormalPassword"]>;
    let second!: ReturnType<Task10AuthContext["loginWithFormalPassword"]>;
    act(() => {
      first = auth.loginWithFormalPassword("merchant", "merchant-a", "secret");
      second = auth.loginWithFormalPassword("merchant", "merchant-b", "secret");
    });
    await act(async () => {
      secondLogin.resolve({
        accessToken: "session-b-access",
        refreshToken: "session-b-refresh",
        expiresIn: 900
      });
      await second;
    });
    await act(async () => {
      firstLogin.resolve({
        accessToken: "session-a-access",
        refreshToken: "session-a-refresh",
        expiresIn: 900
      });
      await first;
    });

    expect(auth.session).toMatchObject({ id: 8, email: "merchant-b@example.com" });
  });

  it("does not let a late login response revive a terminal logout", async () => {
    const pendingLogin = createDeferred<{
      accessToken: string;
      refreshToken: string;
      expiresIn: number;
      me: AuthMePayload;
    }>();
    mocked.authApi.loginFormal.mockImplementationOnce(() => pendingLogin.promise);
    await renderProvider();

    let loggingIn!: ReturnType<Task10AuthContext["loginWithFormalPassword"]>;
    act(() => {
      loggingIn = auth.loginWithFormalPassword("merchant", "merchant-a", "secret");
    });
    act(() => {
      void auth.logout();
    });
    expect(auth.session).toBeNull();

    await act(async () => {
      pendingLogin.resolve({
        accessToken: "late-access",
        refreshToken: "late-refresh",
        expiresIn: 900,
        me: merchantOrganizationMe
      });
      await loggingIn;
    });

    expect(auth.session).toBeNull();
    expect(mocked.tokenState).toMatchObject({ accessToken: null, refreshToken: null });
  });

  it("does not write a queued stale login after a newer login owns the operation", async () => {
    const pending: Array<() => Promise<void>> = [];
    setAuthEnvelopeLockAdapter({
      request: (_name, _options, callback) =>
        new Promise((resolve, reject) => {
          pending.push(async () => {
            try {
              resolve(await callback());
            } catch (error) {
              reject(error);
            }
          });
        })
    });
    mocked.authApi.loginFormal
      .mockResolvedValueOnce({
        accessToken: "login-a-access",
        refreshToken: "login-a-refresh",
        expiresIn: 900
      })
      .mockResolvedValueOnce({
        accessToken: "login-b-access",
        refreshToken: "login-b-refresh",
        expiresIn: 900
      });
    mocked.authApi.me.mockResolvedValue(customerMe);
    await renderProvider();
    const setItem = vi.spyOn(Storage.prototype, "setItem");

    let first!: ReturnType<Task10AuthContext["loginWithFormalPassword"]>;
    let second!: ReturnType<Task10AuthContext["loginWithFormalPassword"]>;
    act(() => {
      first = auth.loginWithFormalPassword("user", "login-a@example.com", "secret");
    });
    await waitFor(() => expect(pending).toHaveLength(1));
    act(() => {
      second = auth.loginWithFormalPassword("user", "login-b@example.com", "secret");
    });
    await waitFor(() => expect(pending).toHaveLength(2));

    await act(async () => {
      await pending[0]?.();
    });
    expect(setItem).not.toHaveBeenCalled();

    await act(async () => {
      await pending[1]?.();
      await Promise.all([first, second]);
    });
    setItem.mockRestore();

    expect(window.localStorage.getItem(persistedAuthEnvelopeStorageKey)).toContain(
      "login-b-refresh"
    );
    expect(window.localStorage.getItem(persistedAuthEnvelopeStorageKey)).not.toContain(
      "login-a-refresh"
    );
  });

  it("serializes logout after a shop switch and logs out with the rotated refresh token", async () => {
    mocked.authApi.loginFormal.mockResolvedValue(formalLoginPayload(merchantOrganizationMe));
    const pendingSwitch = createDeferred<{
      accessToken: string;
      refreshToken: string;
      expiresIn: number;
      me: AuthMePayload;
      shopPublicId: string;
    }>();
    mocked.authApi.switchMerchantShop.mockImplementation(() => pendingSwitch.promise);
    await renderProvider();
    persistTokens("organization-access", "organization-refresh");
    await invoke(() => auth.loginWithFormalPassword("merchant", "o5831047296", "secret"));
    mocked.authApi.me.mockClear();

    let switching!: ReturnType<Task10AuthContext["switchMerchantShop"]>;
    act(() => {
      switching = auth.switchMerchantShop("shop0000000012");
    });
    let loggingOut!: ReturnType<Task10AuthContext["logout"]>;
    act(() => {
      loggingOut = auth.logout();
    });
    await act(async () => {
      pendingSwitch.resolve({
        accessToken: "stale-access",
        refreshToken: "stale-refresh",
        expiresIn: 900,
        me: merchantOrganizationMe,
        shopPublicId: "shop0000000012"
      });
      await Promise.all([switching, loggingOut]);
    });

    expect(auth.session).toBeNull();
    expect(mocked.tokenState).toMatchObject({ accessToken: null, refreshToken: null });
    expect(hasRememberedPortalAuthorization("merchant")).toBe(false);
    expect(mocked.authApi.logout).toHaveBeenCalledWith({
      accessToken: "organization-access",
      refreshToken: "organization-refresh"
    });
  });

  it("serializes identity switch after shop switch and uses the rotated refresh token", async () => {
    mocked.authApi.loginFormal.mockResolvedValue(formalLoginPayload(merchantOrganizationMe));
    const pendingSwitch = createDeferred<{
      accessToken: string;
      refreshToken: string;
      expiresIn: number;
      me: AuthMePayload;
      shopPublicId: string;
    }>();
    mocked.authApi.switchMerchantShop.mockImplementation(() => pendingSwitch.promise);
    mocked.authApi.switchIdentity.mockImplementation(async () => ({
      accessToken: "technician-access",
      refreshToken: "technician-refresh",
      expiresIn: 900,
      me: withCurrentIdentity(merchantOrganizationMe, technicianIdentity)
    }));
    await renderProvider();
    persistTokens("organization-access", "organization-refresh");
    await invoke(() => auth.loginWithFormalPassword("merchant", "o5831047296", "secret"));

    let switching!: ReturnType<Task10AuthContext["switchMerchantShop"]>;
    act(() => {
      switching = auth.switchMerchantShop("shop0000000012");
    });
    let switchingIdentity!: ReturnType<Task10AuthContext["switchPortal"]>;
    act(() => {
      switchingIdentity = auth.switchPortal("technician");
    });
    await act(async () => {
      pendingSwitch.resolve({
        accessToken: "stale-access",
        refreshToken: "stale-refresh",
        expiresIn: 900,
        me: merchantOrganizationMe,
        shopPublicId: "shop0000000012"
      });
      await Promise.all([switching, switchingIdentity]);
    });

    expect(auth.session).toMatchObject({
      portal: "technician",
      currentIdentity: technicianIdentity
    });
    expect(auth.session?.merchantShopPublicId).toBeUndefined();
    expect(mocked.tokenState).toMatchObject({
      accessToken: "technician-access",
      refreshToken: "technician-refresh"
    });
    expect(mocked.authApi.switchIdentity).toHaveBeenCalledWith(
      technicianIdentity.id,
      { accessToken: "stale-access", refreshToken: "stale-refresh" },
      { expectedIdentityId: technicianIdentity.id, expectedUserId: customerMe.id }
    );
  });

  it("treats a late transition 401 as superseded after a newer login without clearing the new session", async () => {
    mocked.authApi.loginFormal.mockResolvedValue(formalLoginPayload(merchantOrganizationMe));
    const pendingSwitch = createDeferred<never>();
    mocked.authApi.switchMerchantShop.mockImplementationOnce(() => pendingSwitch.promise);
    await renderProvider();
    persistTokens("organization-access", "organization-refresh");
    await invoke(() => auth.loginWithFormalPassword("merchant", "o5831047296", "secret"));

    let switching!: ReturnType<Task10AuthContext["switchMerchantShop"]>;
    act(() => {
      switching = auth.switchMerchantShop("shop0000000012");
    });
    await waitFor(() => expect(mocked.authApi.switchMerchantShop).toHaveBeenCalledTimes(1));

    mocked.authApi.loginFormal.mockImplementationOnce(async () => {
      persistTokens("new-user-access", "new-user-refresh");
      return formalLoginPayload(customerMe, "new-user-access", "new-user-refresh");
    });
    const relogged = await invoke(() =>
      auth.loginWithFormalPassword("user", "u0000000007", "secret")
    );
    await act(async () => {
      pendingSwitch.reject(new mocked.ApiClientError("error.auth.unauthorized", 401, 401));
      await switching;
    });

    await expect(switching).resolves.toEqual({
      ok: false,
      message: "error.auth.operation_superseded"
    });
    expect(relogged).toMatchObject({ ok: true, session: { portal: "user" } });
    expect(auth.session).toMatchObject({ id: customerMe.id, portal: "user" });
    expect(mocked.tokenState).toMatchObject({
      accessToken: "new-user-access",
      refreshToken: "new-user-refresh"
    });
  });

  it("revokes malformed rotated credentials that arrive after logout supersedes the switch", async () => {
    mocked.authApi.loginFormal.mockResolvedValue(formalLoginPayload(merchantOrganizationMe));
    const pendingSwitch = createDeferred<never>();
    mocked.authApi.switchMerchantShop.mockImplementationOnce(() => pendingSwitch.promise);
    await renderProvider();
    await invoke(() => auth.loginWithFormalPassword("merchant", "o5831047296", "secret"));

    let switching!: ReturnType<Task10AuthContext["switchMerchantShop"]>;
    act(() => {
      switching = auth.switchMerchantShop("shop0000000012");
    });
    await waitFor(() => expect(mocked.authApi.switchMerchantShop).toHaveBeenCalledTimes(1));
    await invoke(() => auth.logout());

    const malformed = new Error("error.api");
    malformed.name = "AuthRotatedResponseError";
    Object.assign(malformed, {
      rotatedCredentials: {
        accessToken: "late-invalid-access",
        refreshToken: "late-invalid-refresh"
      }
    });
    await act(async () => {
      pendingSwitch.reject(malformed);
      await switching;
    });

    await expect(switching).resolves.toEqual({
      ok: false,
      message: "error.auth.operation_superseded"
    });
    expect(mocked.authApi.logout).toHaveBeenCalledWith({
      accessToken: "late-invalid-access",
      refreshToken: "late-invalid-refresh"
    });
    expect(auth.session).toBeNull();
    expect(mocked.tokenState).toMatchObject({ accessToken: null, refreshToken: null });
  });

  it("serializes refreshSession after a shop switch and preserves only the same confirmed merchant scope", async () => {
    mocked.authApi.loginFormal.mockResolvedValue(formalLoginPayload(merchantOrganizationMe));
    const pendingSwitch = createDeferred<{
      accessToken: string;
      refreshToken: string;
      expiresIn: number;
      me: AuthMePayload;
      shopPublicId: string;
    }>();
    mocked.authApi.switchMerchantShop.mockImplementationOnce(() => pendingSwitch.promise);
    mocked.authApi.me.mockResolvedValue(merchantOrganizationMe);
    await renderProvider();
    persistTokens("organization-access", "organization-refresh");
    await invoke(() => auth.loginWithFormalPassword("merchant", "o5831047296", "secret"));
    mocked.authApi.me.mockClear();

    let switching!: ReturnType<Task10AuthContext["switchMerchantShop"]>;
    let refreshing!: ReturnType<Task10AuthContext["refreshSession"]>;
    act(() => {
      switching = auth.switchMerchantShop("shop0000000012");
      refreshing = auth.refreshSession();
    });
    expect(mocked.authApi.me).not.toHaveBeenCalled();
    await act(async () => {
      pendingSwitch.resolve({
        accessToken: "shop-access",
        refreshToken: "shop-refresh",
        expiresIn: 900,
        me: merchantOrganizationMe,
        shopPublicId: "shop0000000012"
      });
      await Promise.all([switching, refreshing]);
    });

    expect(auth.session).toMatchObject({
      merchantShopPublicId: "shop0000000012",
      portal: "merchant"
    });
    expect(mocked.tokenState).toMatchObject({
      accessToken: "shop-access",
      refreshToken: "shop-refresh"
    });
  });

  it("leaves the prior envelope byte-identical and fails closed after a rotated write fails", async () => {
    mocked.authApi.loginFormal.mockResolvedValue(formalLoginPayload(merchantOrganizationMe));
    mocked.authApi.switchMerchantShop.mockResolvedValue({
      accessToken: "shop-access",
      refreshToken: "shop-refresh",
      expiresIn: 900,
      me: merchantOrganizationMe,
      shopPublicId: "shop0000000012"
    });
    await renderProvider();
    await invoke(() => auth.loginWithFormalPassword("merchant", "o5831047296", "secret"));
    const previousRaw = window.localStorage.getItem(persistedAuthEnvelopeStorageKey);
    const originalSetItem = Storage.prototype.setItem;
    const storageSpy = vi.spyOn(Storage.prototype, "setItem").mockImplementationOnce(function (
      this: Storage,
      key,
      value
    ) {
      if (this === window.localStorage && key === persistedAuthEnvelopeStorageKey) {
        throw new DOMException("storage rejected", "QuotaExceededError");
      }
      return originalSetItem.call(this, key, value);
    });

    const switched = await invoke(() => auth.switchMerchantShop("shop0000000012"));
    storageSpy.mockRestore();

    expect(switched).toEqual({ ok: false, message: "error.auth.reauth_required" });
    expect(auth.session).toBeNull();
    expect(mocked.tokenState).toMatchObject({ accessToken: null, refreshToken: null });
    expect(window.localStorage.getItem(persistedAuthEnvelopeStorageKey)).toBe(previousRaw);
    expect(mocked.authApi.logout).toHaveBeenCalledWith({
      accessToken: "shop-access",
      refreshToken: "shop-refresh"
    });
  });

  it("keeps the current committed session when a non-rotating envelope update fails", async () => {
    mocked.authApi.loginFormal.mockResolvedValue(formalLoginPayload(customerMe));
    mocked.authApi.me.mockResolvedValue(customerMe);
    await renderProvider();
    await invoke(() => auth.loginWithFormalPassword("user", "u0000000007", "secret"));
    const currentSession = auth.session;
    const previousRaw = window.localStorage.getItem(persistedAuthEnvelopeStorageKey);
    const originalSetItem = Storage.prototype.setItem;
    const storageSpy = vi.spyOn(Storage.prototype, "setItem").mockImplementationOnce(function (
      this: Storage,
      key,
      value
    ) {
      if (this === window.localStorage && key === persistedAuthEnvelopeStorageKey) {
        throw new DOMException("storage rejected", "QuotaExceededError");
      }
      return originalSetItem.call(this, key, value);
    });

    const refreshed = await invoke(() => auth.refreshSession());
    storageSpy.mockRestore();

    expect(refreshed).toEqual({ ok: false, message: "error.auth.storage_unavailable" });
    expect(auth.session).toBe(currentSession);
    expect(window.localStorage.getItem(persistedAuthEnvelopeStorageKey)).toBe(previousRaw);
  });

  it("confirms durable logout through server revocation when the tombstone write fails", async () => {
    mocked.authApi.loginFormal.mockResolvedValue(formalLoginPayload(customerMe));
    await renderProvider();
    await invoke(() => auth.loginWithFormalPassword("user", "u0000000007", "secret"));
    const previousRaw = window.localStorage.getItem(persistedAuthEnvelopeStorageKey);
    const storageSpy = vi.spyOn(Storage.prototype, "setItem").mockImplementationOnce(() => {
      throw new DOMException("storage rejected", "QuotaExceededError");
    });

    const result = await invoke(() => auth.logout());
    storageSpy.mockRestore();

    expect(result).toEqual({ ok: true });
    expect(auth.session).toBeNull();
    expect(window.localStorage.getItem(persistedAuthEnvelopeStorageKey)).toBe(previousRaw);
    expect(mocked.authApi.logout).toHaveBeenCalledTimes(1);
  });

  it("reports the durable logout boundary when both tombstone and server revocation fail", async () => {
    mocked.authApi.loginFormal.mockResolvedValue(formalLoginPayload(customerMe));
    await renderProvider();
    await invoke(() => auth.loginWithFormalPassword("user", "u0000000007", "secret"));
    const previousRaw = window.localStorage.getItem(persistedAuthEnvelopeStorageKey);
    mocked.authApi.logout.mockRejectedValueOnce(new TypeError("offline"));
    const storageSpy = vi.spyOn(Storage.prototype, "setItem").mockImplementationOnce(() => {
      throw new DOMException("storage rejected", "QuotaExceededError");
    });

    const result = await invoke(() => auth.logout());
    storageSpy.mockRestore();

    expect(result).toEqual({
      ok: false,
      message: "error.auth.durable_logout_unconfirmed"
    });
    expect(auth.session).toBeNull();
    expect(mocked.tokenState).toMatchObject({ accessToken: null, refreshToken: null });
    expect(auth.restoreError).toBe("error.auth.durable_logout_unconfirmed");
    expect(window.localStorage.getItem(persistedAuthEnvelopeStorageKey)).toBe(previousRaw);
  });

  it("ignores a storage event from another portal envelope", async () => {
    mocked.authApi.loginFormal.mockResolvedValue(
      formalLoginPayload(customerMe, "access-user", "refresh-user")
    );
    await renderProvider();
    await invoke(() => auth.loginWithFormalPassword("user", "u0000000007", "secret"));

    await act(async () => {
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: getAuthEnvelopeStorageKey("merchant-admin"),
          newValue: JSON.stringify(
            createAnonymousAuthEnvelope({
              authInstanceId: "00000000-0000-4000-8000-000000000099",
              credentialVersion: 1
            })
          ),
          storageArea: window.localStorage
        })
      );
    });

    expect(auth.session?.portal).toBe("user");
    expect(mocked.tokenState.refreshToken).toBe("refresh-user");
    expect(mocked.authApi.logout).not.toHaveBeenCalled();
  });

  it("keeps the current session when another tab commits the same portal authorization", async () => {
    mocked.authApi.loginFormal.mockResolvedValue(
      formalLoginPayload(customerMe, "access-user", "refresh-user")
    );
    await renderProvider();
    await invoke(() => auth.loginWithFormalPassword("user", "u0000000007", "secret"));
    const committed = readPersistedAuthEnvelope();
    expect(committed?.state).toBe("committed");
    if (!committed || committed.state !== "committed") {
      throw new Error("expected committed envelope");
    }
    const siblingTabCommit = createCommittedAuthEnvelope({
      authInstanceId: committed.authInstanceId,
      credentialVersion: committed.credentialVersion + 1,
      refreshToken: committed.refreshToken,
      session: committed.session,
      rememberedByPortal: committed.rememberedByPortal
    });

    await act(async () => {
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: persistedAuthEnvelopeStorageKey,
          newValue: JSON.stringify(siblingTabCommit),
          storageArea: window.localStorage
        })
      );
    });

    expect(auth.session).toEqual(committed.session);
    expect(mocked.tokenState).toMatchObject({
      accessToken: "access-user",
      refreshToken: "refresh-user"
    });
    expect(mocked.authApi.logout).not.toHaveBeenCalled();
  });

  it("uses a remote tombstone event as authority, revokes R2, and does not reread storage", async () => {
    mocked.authApi.loginFormal.mockResolvedValue(
      formalLoginPayload(customerMe, "access-r2", "refresh-r2")
    );
    await renderProvider();
    await invoke(() => auth.loginWithFormalPassword("user", "u0000000007", "secret"));
    const committed = readPersistedAuthEnvelope();
    expect(committed?.state).toBe("committed");
    if (!committed) throw new Error("expected committed envelope");
    const tombstone = createAnonymousAuthEnvelope({
      authInstanceId: committed.authInstanceId,
      credentialVersion: committed.credentialVersion + 1
    });

    await act(async () => {
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: persistedAuthEnvelopeStorageKey,
          newValue: JSON.stringify(tombstone),
          storageArea: window.localStorage
        })
      );
    });

    expect(auth.session).toBeNull();
    expect(mocked.tokenState).toMatchObject({ accessToken: null, refreshToken: null });
    await waitFor(() =>
      expect(mocked.authApi.logout).toHaveBeenCalledWith({
        accessToken: "access-r2",
        refreshToken: "refresh-r2"
      })
    );
    expect(readPersistedAuthEnvelope()).toEqual(committed);
  });

  it("fails safe on reload when only the revoked pre-rotation envelope remains", async () => {
    mocked.authApi.loginFormal.mockResolvedValue(formalLoginPayload(merchantOrganizationMe));
    mocked.authApi.switchMerchantShop.mockResolvedValue({
      accessToken: "shop-access",
      refreshToken: "shop-refresh",
      expiresIn: 900,
      me: merchantOrganizationMe,
      shopPublicId: "shop0000000012"
    });
    await renderProvider();
    await invoke(() => auth.loginWithFormalPassword("merchant", "o5831047296", "secret"));
    const storageSpy = vi.spyOn(Storage.prototype, "setItem").mockImplementationOnce(() => {
      throw new DOMException("storage rejected", "QuotaExceededError");
    });
    await invoke(() => auth.switchMerchantShop("shop0000000012"));
    storageSpy.mockRestore();

    await act(async () => root.unmount());
    root = createRoot(container);
    mocked.authApi.refreshWithCredentials.mockRejectedValueOnce(
      new mocked.ApiClientError("error.auth.unauthorized", 401, 401)
    );
    await renderProvider();
    await waitFor(() => expect(auth.isRestoring).toBe(false));

    expect(auth.session).toBeNull();
    expect(
      JSON.parse(window.localStorage.getItem(persistedAuthEnvelopeStorageKey) ?? "null")
    ).toMatchObject({ schemaVersion: 8, state: "anonymous" });
  });
});
