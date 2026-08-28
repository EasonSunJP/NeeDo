// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GoogleCredentialResult, RegistrationStartInput, VerificationChallengeInput, VerificationChallengePayload } from "../api/auth";
import { AuthProvider, useAuth, type AuthSession, type PortalScope } from "./AuthProvider";
import { hasRememberedPortalAuthorization, rememberPortalAuthorization } from "./portalAuthorization";
import type { AuthMePayload } from "./rbac";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

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
    refreshToken: null as string | null
  };

  return {
    ApiClientError: MockApiClientError,
    tokenState,
    authApi: {
      login: vi.fn(),
      loginFormal: vi.fn(),
      logout: vi.fn(),
      me: vi.fn(),
      refresh: vi.fn(),
      sendOtp: vi.fn(),
      startRegistration: vi.fn(),
      submitGoogleCredential: vi.fn(),
      switchIdentity: vi.fn(),
      verifyGoogleRegistrationOrLink: vi.fn(),
      verifyOtp: vi.fn(),
      verifyRegistration: vi.fn()
    },
    clearAuthTokens: vi.fn(() => {
      tokenState.accessToken = null;
      tokenState.refreshToken = null;
    }),
    setAuthExpiredHandler: vi.fn()
  };
});

vi.mock("../api/auth", () => ({ authApi: mocked.authApi }));
vi.mock("../api/httpClient", () => ({
  ApiClientError: mocked.ApiClientError,
  clearAuthTokens: mocked.clearAuthTokens,
  getAccessToken: vi.fn(() => mocked.tokenState.accessToken),
  getStoredRefreshToken: vi.fn(() => mocked.tokenState.refreshToken),
  setAccessToken: vi.fn((token: string | null) => {
    mocked.tokenState.accessToken = token;
  }),
  setAuthExpiredHandler: mocked.setAuthExpiredHandler,
  setStoredRefreshToken: vi.fn((token: string | null) => {
    mocked.tokenState.refreshToken = token;
  })
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
  loginWithGoogle: (
    result: GoogleCredentialResult,
    requestedPortal?: PortalScope
  ) => Promise<ChallengeSuccess | SessionSuccess | { message: string; ok: false }>;
  startRegistration: (input: RegistrationStartInput) => Promise<ChallengeSuccess | { message: string; ok: false }>;
  verifyGoogleRegistrationOrLink: (
    input: VerificationChallengeInput,
    requestedPortal?: PortalScope
  ) => Promise<SessionSuccess | { message: string; ok: false }>;
  verifyRegistration: (
    input: VerificationChallengeInput
  ) => Promise<(SessionSuccess & { needoId: string }) | { message: string; ok: false }>;
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
  type: "customer"
};

const technicianIdentity = {
  id: 13,
  publicId: "s0000000007",
  scopeId: 42,
  scopeType: "technician_profile",
  type: "technician"
};

const merchantStoreIdentity = {
  id: 14,
  publicId: "b0000000007",
  scopeId: 43,
  scopeType: "shop",
  type: "merchant_owner"
};

const merchantOrganizationIdentity = {
  id: 15,
  publicId: "o0000000007",
  scopeId: 9,
  scopeType: "merchant_account",
  type: "merchant_organization"
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
  isActive: true,
  currentIdentity: customerIdentity,
  identities: [customerIdentity],
  roles: ["customer"],
  permissions: ["page:client-app"],
  menus: ["menu:client-app"]
};

const multiPortalMe: AuthMePayload = {
  ...customerMe,
  identities: [customerIdentity, technicianIdentity],
  roles: ["customer", "technician"],
  permissions: ["page:client-app", "page:technician-app"],
  menus: ["menu:client-app", "menu:technician-app"]
};

let container: HTMLDivElement;
let root: Root;
let auth: Task10AuthContext;
const observedAuthenticatedStates: boolean[] = [];

function Consumer() {
  auth = useAuth() as Task10AuthContext;
  observedAuthenticatedStates.push(auth.isAuthenticated);
  return createElement("output", { "data-authenticated": String(auth.isAuthenticated) }, auth.session?.loginMethod ?? "none");
}

async function renderProvider() {
  await act(async () => {
    root.render(createElement(AuthProvider, null, createElement(Consumer)));
  });
}

async function invoke<TResult>(callback: () => Promise<TResult>) {
  let result: TResult | undefined;

  await act(async () => {
    result = await callback();
  });

  return result as TResult;
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
  mocked.tokenState.accessToken = accessToken;
  mocked.tokenState.refreshToken = refreshToken;
}

function authenticatedGoogleResult(): Extract<GoogleCredentialResult, { status: "authenticated" }> {
  return {
    accessToken: "google-access-token",
    expiresIn: 900,
    refreshToken: "google-refresh-token",
    status: "authenticated"
  };
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

describe("AuthProvider formal registration and Google sessions", () => {
  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    window.localStorage.clear();
    window.sessionStorage.clear();
    vi.clearAllMocks();
    observedAuthenticatedStates.length = 0;
    mocked.tokenState.accessToken = null;
    mocked.tokenState.refreshToken = null;
    mocked.authApi.logout.mockResolvedValue({});
    mocked.authApi.refresh.mockImplementation(async () => {
      mocked.tokenState.accessToken = "restored-access-token";
      return { accessToken: "restored-access-token", expiresIn: 900 };
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
    window.localStorage.setItem("needo.auth.remember-credentials.admin.merchant-admin", "merchant-secret");
    window.localStorage.setItem("needo.auth.portal", "user");
    window.localStorage.setItem("needo.admin.theme", "classic-white-black");

    await renderProvider();

    expect(Object.keys(window.localStorage).filter((key) => key.startsWith("needo.auth.remember-credentials."))).toEqual([]);
    expect(window.localStorage.getItem("needo.auth.portal")).toBe("user");
    expect(window.localStorage.getItem("needo.admin.theme")).toBe("classic-white-black");
  });

  it("completes an authenticated backend Google result through /auth/me", async () => {
    mocked.authApi.me.mockResolvedValue(customerMe);
    await renderProvider();
    persistTokens("google-access-token", "google-refresh-token");

    const result = await invoke(() => auth.loginWithGoogle(authenticatedGoogleResult(), "user"));

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
    expect(auth.session?.loginMethod).toBe("google");
  });

  it("keeps an already aligned portal switch idempotent", async () => {
    mocked.authApi.me.mockResolvedValue(customerMe);
    await renderProvider();
    persistTokens("google-access-token", "google-refresh-token");
    await invoke(() => auth.loginWithGoogle(authenticatedGoogleResult(), "user"));
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
    await invoke(() => auth.loginWithGoogle(authenticatedGoogleResult(), "user"));
    const customerSession = auth.session;
    mocked.tokenState.accessToken = null;
    mocked.tokenState.refreshToken = null;

    const switched = await invoke(() => auth.switchPortal("technician"));

    expect(switched.ok).toBe(false);
    expect(auth.session).toBe(customerSession);
    expect(auth.session?.portal).toBe("user");
    expect(auth.session?.currentIdentity).toEqual(customerIdentity);
    expect(mocked.authApi.switchIdentity).not.toHaveBeenCalled();
  });

  it("fails closed when /auth/me omits a required formal account field", async () => {
    const incompleteMe = { ...customerMe } as Partial<AuthMePayload>;
    delete incompleteMe.hasPassword;
    mocked.authApi.me.mockResolvedValue(incompleteMe);
    await renderProvider();
    persistTokens("google-access-token", "google-refresh-token");

    const result = await invoke(() => auth.loginWithGoogle(authenticatedGoogleResult(), "user"));

    expect(result).toEqual({ ok: false, message: "error.auth.google_api_unavailable" });
    expect(mocked.tokenState).toEqual({ accessToken: null, refreshToken: null });
    expect(auth.session).toBeNull();
  });

  it("keeps a first-use Google verification challenge sessionless and tokenless", async () => {
    await renderProvider();
    persistTokens("stale-access", "stale-refresh");

    const result = await invoke(() => auth.loginWithGoogle({ status: "verification_required", ...challenge }, "user"));

    expect(result).toEqual({
      ok: true,
      status: "verification_required",
      challenge
    });
    expect(auth.session).toBeNull();
    expect(mocked.tokenState).toEqual({
      accessToken: null,
      refreshToken: null
    });
    expect(mocked.authApi.me).not.toHaveBeenCalled();
  });

  it("clears remembered account tokens when Google requires first-use verification", async () => {
    rememberPortalAuthorization(storedCustomerSession(), "remembered-refresh");
    await renderProvider();

    await invoke(() => auth.loginWithGoogle({ status: "verification_required", ...challenge }, "user"));

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

    const result = await invoke(() => auth.verifyGoogleRegistrationOrLink({ challengeId: challenge.challengeId, otp: "123456" }, "user"));

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
    expect(mocked.tokenState).toEqual({
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
    rememberPortalAuthorization(storedCustomerSession(), "remembered-refresh");
    mocked.authApi.startRegistration.mockResolvedValue(challenge);
    await renderProvider();

    await invoke(() => auth.startRegistration({ email: "new@example.com", password: "Password.2026!" }));

    expect(hasRememberedPortalAuthorization("user")).toBe(false);
  });

  it("rejects registration when the response has no current customer identity", async () => {
    const platformIdentity = {
      id: 99,
      publicId: null,
      scopeId: null,
      scopeType: "global",
      type: "platform"
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

    const result = await invoke(() => auth.verifyRegistration({ challengeId: challenge.challengeId, otp: "123456" }));

    expect(result).toEqual({ ok: false, message: "error.auth.portal_forbidden" });
    expect(mocked.tokenState).toEqual({ accessToken: null, refreshToken: null });
    expect(auth.session).toBeNull();
  });

  it("normalizes provider errors and clears tokens when post-token session completion fails", async () => {
    mocked.authApi.me.mockRejectedValue({
      provider: "google",
      credential: "secret"
    });
    await renderProvider();
    persistTokens("google-access-token", "google-refresh-token");

    const result = await invoke(() => auth.loginWithGoogle(authenticatedGoogleResult()));

    expect(result).toEqual({
      ok: false,
      message: "error.auth.google_api_unavailable"
    });
    expect(mocked.clearAuthTokens).toHaveBeenCalled();
    expect(mocked.tokenState).toEqual({
      accessToken: null,
      refreshToken: null
    });
    expect(auth.session).toBeNull();
  });

  it("rejects an otherwise complete stored session from the previous auth version", async () => {
    window.localStorage.setItem("needo.auth.session", JSON.stringify(storedCustomerSession({ authVersion: 5 })));

    await renderProvider();

    expect(auth.session).toBeNull();
    expect(auth.isAuthenticated).toBe(false);
  });

  it("rejects a current-version stored session missing a required formal account field", async () => {
    const incompleteSession = storedCustomerSession() as Partial<AuthSession>;
    delete incompleteSession.emailVerifiedAt;
    window.localStorage.setItem("needo.auth.session", JSON.stringify(incompleteSession));

    await renderProvider();

    expect(auth.session).toBeNull();
  });

  it("rejects a current-version stored session with the retired gmail login method", async () => {
    window.localStorage.setItem("needo.auth.session", JSON.stringify({ ...storedCustomerSession(), loginMethod: "gmail" }));

    await renderProvider();

    expect(auth.session).toBeNull();
  });

  it("never exposes a stored browser session as authenticated before server restoration", async () => {
    window.localStorage.setItem("needo.auth.session", JSON.stringify(storedCustomerSession()));

    await renderProvider();

    expect(observedAuthenticatedStates[0]).toBe(false);
    expect(auth.session).toBeNull();
  });

  it("keeps a refresh-backed session private and retryable during a transient restore outage", async () => {
    window.localStorage.setItem("needo.auth.session", JSON.stringify(storedCustomerSession()));
    mocked.tokenState.refreshToken = "stored-retry-refresh";
    mocked.authApi.refresh.mockRejectedValueOnce(new TypeError("Failed to fetch"));

    await renderProvider();
    await waitFor(() => expect(auth.isRestoring).toBe(false));

    expect(auth.session).toBeNull();
    expect(auth.restoreError).toBe("error.auth.service_unavailable");
    expect(mocked.tokenState.refreshToken).toBe("stored-retry-refresh");
    expect(mocked.clearAuthTokens).not.toHaveBeenCalled();

    mocked.authApi.refresh.mockImplementationOnce(async () => {
      mocked.tokenState.accessToken = "restored-after-retry-access";
      return { accessToken: "restored-after-retry-access", expiresIn: 900 };
    });
    mocked.authApi.me.mockResolvedValue(customerMe);

    await act(async () => auth.retrySessionRestore());
    await waitFor(() => expect(auth.session?.id).toBe(customerMe.id));

    expect(auth.restoreError).toBeNull();
    expect(auth.isAuthenticated).toBe(true);
  });

  it("treats a missing refresh route during deployment recovery as retryable instead of expiring the session", async () => {
    window.localStorage.setItem("needo.auth.session", JSON.stringify(storedCustomerSession()));
    mocked.tokenState.refreshToken = "stored-deployment-refresh";
    mocked.authApi.refresh.mockRejectedValueOnce(
      new mocked.ApiClientError("error.resource_not_found", 404, 404)
    );

    await renderProvider();
    await waitFor(() => expect(auth.isRestoring).toBe(false));

    expect(auth.restoreError).toBe("error.auth.service_unavailable");
    expect(mocked.tokenState.refreshToken).toBe("stored-deployment-refresh");
    expect(mocked.clearAuthTokens).not.toHaveBeenCalled();
  });

  it("fails closed with retry for an unclassified restore error", async () => {
    window.localStorage.setItem("needo.auth.session", JSON.stringify(storedCustomerSession()));
    mocked.tokenState.refreshToken = "stored-unknown-error-refresh";
    mocked.authApi.refresh.mockRejectedValueOnce(new Error("proxy response unavailable"));

    await renderProvider();
    await waitFor(() => expect(auth.isRestoring).toBe(false));

    expect(auth.session).toBeNull();
    expect(auth.restoreError).toBe("error.auth.service_unavailable");
    expect(mocked.tokenState.refreshToken).toBe("stored-unknown-error-refresh");
    expect(mocked.clearAuthTokens).not.toHaveBeenCalled();
  });

  it("preserves Google as the login method while restoring a refresh-backed session", async () => {
    const storedSession = storedCustomerSession();
    window.localStorage.setItem("needo.auth.session", JSON.stringify(storedSession));
    mocked.tokenState.refreshToken = "stored-google-refresh";
    mocked.authApi.me.mockResolvedValue(customerMe);

    await renderProvider();
    await waitFor(() => expect(auth.isRestoring).toBe(false));

    expect(mocked.authApi.refresh).toHaveBeenCalledTimes(1);
    expect(auth.session?.loginMethod).toBe("google");
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
    await invoke(() => auth.loginWithGoogle(authenticatedGoogleResult(), "user"));

    const switched = await invoke(() => auth.switchPortal("technician"));

    expect(mocked.authApi.switchIdentity).toHaveBeenCalledWith(technicianIdentity.id);
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
      identities: [
        customerIdentity,
        merchantStoreIdentity,
        merchantOrganizationIdentity
      ],
      roles: ["customer", "merchant_owner"],
      permissions: ["page:client-app", "page:merchant-app"],
      menus: ["menu:client-app", "menu:merchant-app"]
    };
    mocked.authApi.loginFormal.mockResolvedValue({ me: organizationMe });
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
    await invoke(() => auth.loginWithGoogle(authenticatedGoogleResult(), "user"));
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
    await invoke(() => auth.loginWithGoogle(authenticatedGoogleResult(), "user"));
    const incompleteMe = {
      ...withCurrentIdentity(multiPortalMe, technicianIdentity)
    } as Partial<AuthMePayload>;
    delete incompleteMe.emailVerifiedAt;
    mocked.authApi.switchIdentity.mockImplementation(async () => {
      persistTokens("switched-access", "switched-refresh");
      return {
        accessToken: "switched-access",
        expiresIn: 900,
        refreshToken: "switched-refresh",
        me: incompleteMe
      };
    });

    const switched = await invoke(() => auth.switchPortal("technician"));

    expect(switched).toEqual({ ok: false, message: "error.api" });
    expect(mocked.tokenState).toEqual({ accessToken: null, refreshToken: null });
    expect(auth.session).toBeNull();
  });

  it("clears switched tokens when refreshSession receives an incomplete switched identity", async () => {
    mocked.authApi.me.mockResolvedValue(multiPortalMe);
    await renderProvider();
    persistTokens("google-access", "google-refresh");
    await invoke(() => auth.loginWithGoogle(authenticatedGoogleResult(), "user"));
    const incompleteMe = {
      ...withCurrentIdentity(multiPortalMe, technicianIdentity)
    } as Partial<AuthMePayload>;
    delete incompleteMe.needoId;
    mocked.authApi.switchIdentity.mockImplementation(async () => {
      persistTokens("switched-access", "switched-refresh");
      return {
        accessToken: "switched-access",
        expiresIn: 900,
        refreshToken: "switched-refresh",
        me: incompleteMe
      };
    });

    const refreshed = await invoke(() => auth.refreshSession("technician"));

    expect(refreshed).toEqual({ ok: false, message: "error.api" });
    expect(mocked.tokenState).toEqual({ accessToken: null, refreshToken: null });
    expect(auth.session).toBeNull();
  });
});
