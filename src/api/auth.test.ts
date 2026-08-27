import {
  afterEach,
  beforeEach,
  describe,
  expect,
  expectTypeOf,
  it,
  vi,
} from "vitest";
import {
  authApi,
  authEndpointPaths,
  type VerifiedGoogleRegistrationPayload,
} from "./auth";
import {
  clearAuthTokens,
  getStoredRefreshToken,
  httpClient,
  refreshStoredAccessToken,
  setAuthTokens,
} from "./httpClient";

vi.mock("./httpClient", () => ({
  clearAuthTokens: vi.fn(),
  getStoredRefreshToken: vi.fn(),
  httpClient: {
    request: vi.fn(),
    requestDataUrl: vi.fn(),
  },
  refreshStoredAccessToken: vi.fn(),
  setAccessToken: vi.fn(),
  setAuthTokens: vi.fn(),
}));

vi.mock("../lib/deviceFingerprint", () => ({
  getDeviceFingerprint: vi.fn().mockResolvedValue("visitor-token"),
}));

const tokenPair = {
  accessToken: "access-token",
  refreshToken: "refresh-token",
  expiresIn: 900,
};

const challenge = {
  challengeId: "b2e9503e-d271-40cb-bc42-70edb551126f",
  maskedEmail: "u***@example.com",
  expiresIn: 600,
  cooldownSeconds: 60,
};

const googleInitialization = {
  clientId: "client.apps.googleusercontent.com",
  nonce: "opaque-backend-nonce",
  nonceChallengeId: "8b097684-4705-4d8e-bdbc-8c6e2970b4b1",
  expiresIn: 600,
};

describe("formal auth API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("always logs in by email or NeeDo ID through the formal endpoint", async () => {
    vi.stubEnv("PROD", false);
    vi.stubEnv("VITE_LEGACY_AUTH_BASE_URL", "/legacy-auth");
    vi.mocked(httpClient.request).mockResolvedValueOnce(tokenPair);

    await authApi.login("n0000000042", "Password.2026!");

    expect(httpClient.request).toHaveBeenCalledWith("/auth/login", {
      auth: false,
      body: {
        loginIdentifier: "n0000000042",
        password: "Password.2026!",
      },
      method: "POST",
      retryOnUnauthorized: false,
    });
    expect(setAuthTokens).toHaveBeenCalledWith({
      accessToken: "access-token",
      refreshToken: "refresh-token",
    });
  });

  it("starts registration with only email and password without persisting tokens", async () => {
    vi.mocked(httpClient.request).mockResolvedValueOnce(challenge);

    await expect(
      authApi.startRegistration({
        email: "new.customer@example.com",
        password: "Customer.2026!",
      }),
    ).resolves.toEqual(challenge);

    expect(httpClient.request).toHaveBeenCalledWith("/auth/register", {
      auth: false,
      body: {
        email: "new.customer@example.com",
        password: "Customer.2026!",
      },
      method: "POST",
      retryOnUnauthorized: false,
    });
    expect(setAuthTokens).not.toHaveBeenCalled();
  });

  it("verifies registration and persists the authenticated token pair", async () => {
    const registered = { ...tokenPair, needoId: "n0000000042" };
    vi.mocked(httpClient.request).mockResolvedValueOnce(registered);

    await expect(
      authApi.verifyRegistration({
        challengeId: challenge.challengeId,
        otp: "123456",
      }),
    ).resolves.toEqual(registered);

    expect(httpClient.request).toHaveBeenCalledWith("/auth/register/verify", {
      auth: false,
      body: { challengeId: challenge.challengeId, otp: "123456" },
      method: "POST",
      retryOnUnauthorized: false,
    });
    expect(setAuthTokens).toHaveBeenCalledWith({
      accessToken: "access-token",
      refreshToken: "refresh-token",
    });
  });

  it("initializes and submits a public Google credential with exact nonce bodies", async () => {
    vi.mocked(httpClient.request)
      .mockResolvedValueOnce(googleInitialization)
      .mockResolvedValueOnce({ status: "authenticated", ...tokenPair });

    await authApi.initializeGoogleLogin();
    await authApi.submitGoogleCredential({
      credential: "opaque-google-credential",
      nonceChallengeId: googleInitialization.nonceChallengeId,
    });

    expect(httpClient.request).toHaveBeenNthCalledWith(1, "/auth/google/init", {
      auth: false,
      body: {},
      method: "POST",
      retryOnUnauthorized: false,
    });
    expect(httpClient.request).toHaveBeenNthCalledWith(2, "/auth/google", {
      auth: false,
      body: {
        credential: "opaque-google-credential",
        nonceChallengeId: googleInitialization.nonceChallengeId,
      },
      method: "POST",
      retryOnUnauthorized: false,
    });
    expect(setAuthTokens).toHaveBeenCalledWith({
      accessToken: "access-token",
      refreshToken: "refresh-token",
    });
  });

  it("does not persist tokens for a Google verification-required result", async () => {
    vi.mocked(httpClient.request).mockResolvedValueOnce({
      status: "verification_required",
      ...challenge,
    });

    await expect(
      authApi.submitGoogleCredential({
        credential: "opaque-google-credential",
        nonceChallengeId: googleInitialization.nonceChallengeId,
      }),
    ).resolves.toEqual({ status: "verification_required", ...challenge });

    expect(setAuthTokens).not.toHaveBeenCalled();
  });

  it("verifies first-use Google registration and persists its token pair", async () => {
    const registered = { ...tokenPair, needoId: "n0000000042" };
    vi.mocked(httpClient.request).mockResolvedValueOnce(registered);

    await authApi.verifyGoogleRegistrationOrLink({
      challengeId: challenge.challengeId,
      otp: "123456",
    });

    expect(httpClient.request).toHaveBeenCalledWith("/auth/google/verify", {
      auth: false,
      body: { challengeId: challenge.challengeId, otp: "123456" },
      method: "POST",
      retryOnUnauthorized: false,
    });
    expect(setAuthTokens).toHaveBeenCalledWith({
      accessToken: "access-token",
      refreshToken: "refresh-token",
    });
  });

  it("types NeeDo ID as optional when Google verification links an existing email", () => {
    expectTypeOf<VerifiedGoogleRegistrationPayload>().toEqualTypeOf<
      typeof tokenPair & { needoId?: string }
    >();
  });

  it("reads Google link status as an authenticated retryable GET", async () => {
    const status = {
      linked: true,
      maskedEmail: "u***@gmail.com",
      hasPassword: true,
      canUnlink: true,
    };
    vi.mocked(httpClient.request).mockResolvedValueOnce(status);

    await expect(authApi.getGoogleLinkStatus()).resolves.toEqual(status);

    expect(httpClient.request).toHaveBeenCalledWith("/auth/google/link", {
      auth: true,
      method: "GET",
      retryOnUnauthorized: true,
    });
  });

  it("initializes, submits, and verifies an authenticated Google link without changing tokens", async () => {
    vi.mocked(httpClient.request)
      .mockResolvedValueOnce(googleInitialization)
      .mockResolvedValueOnce(challenge)
      .mockResolvedValueOnce({ linked: true });

    await authApi.initializeGoogleLink();
    await authApi.submitGoogleLinkCredential({
      credential: "opaque-google-credential",
      nonceChallengeId: googleInitialization.nonceChallengeId,
    });
    await authApi.verifyGoogleLink({
      challengeId: challenge.challengeId,
      otp: "123456",
    });

    expect(httpClient.request).toHaveBeenNthCalledWith(
      1,
      "/auth/google/link/init",
      {
        auth: true,
        body: {},
        method: "POST",
        retryOnUnauthorized: false,
      },
    );
    expect(httpClient.request).toHaveBeenNthCalledWith(2, "/auth/google/link", {
      auth: true,
      body: {
        credential: "opaque-google-credential",
        nonceChallengeId: googleInitialization.nonceChallengeId,
      },
      method: "POST",
      retryOnUnauthorized: false,
    });
    expect(httpClient.request).toHaveBeenNthCalledWith(
      3,
      "/auth/google/link/verify",
      {
        auth: true,
        body: { challengeId: challenge.challengeId, otp: "123456" },
        method: "POST",
        retryOnUnauthorized: false,
      },
    );
    expect(setAuthTokens).not.toHaveBeenCalled();
  });

  it("starts and verifies Google unlink, clearing tokens only after success", async () => {
    vi.mocked(httpClient.request)
      .mockResolvedValueOnce(challenge)
      .mockResolvedValueOnce({ signedOut: true });

    await authApi.startGoogleUnlink();
    expect(clearAuthTokens).not.toHaveBeenCalled();
    await expect(
      authApi.verifyGoogleUnlink({
        challengeId: challenge.challengeId,
        otp: "123456",
      }),
    ).resolves.toEqual({ signedOut: true });

    expect(httpClient.request).toHaveBeenNthCalledWith(
      1,
      "/auth/google/unlink",
      {
        auth: true,
        body: {},
        method: "POST",
        retryOnUnauthorized: false,
      },
    );
    expect(httpClient.request).toHaveBeenNthCalledWith(
      2,
      "/auth/google/unlink/verify",
      {
        auth: true,
        body: { challengeId: challenge.challengeId, otp: "123456" },
        method: "POST",
        retryOnUnauthorized: false,
      },
    );
    expect(clearAuthTokens).toHaveBeenCalledTimes(1);
  });

  it("does not clear tokens when verified unlink fails", async () => {
    vi.mocked(httpClient.request).mockRejectedValueOnce(
      new Error("error.auth.verification_code_invalid"),
    );

    await expect(
      authApi.verifyGoogleUnlink({
        challengeId: challenge.challengeId,
        otp: "000000",
      }),
    ).rejects.toThrow("error.auth.verification_code_invalid");
    expect(clearAuthTokens).not.toHaveBeenCalled();
  });

  it("does not clear tokens for a malformed unlink response without signedOut true", async () => {
    vi.mocked(httpClient.request).mockResolvedValueOnce({ signedOut: false });

    await expect(
      authApi.verifyGoogleUnlink({
        challengeId: challenge.challengeId,
        otp: "123456",
      }),
    ).rejects.toThrow("error.api");
    expect(clearAuthTokens).not.toHaveBeenCalled();
  });

  it("starts and verifies password setup with authenticated non-retryable actions", async () => {
    vi.mocked(httpClient.request)
      .mockResolvedValueOnce(challenge)
      .mockResolvedValueOnce({ hasPassword: true });

    await authApi.startPasswordSetup({ password: "Password.2026!" });
    await authApi.verifyPasswordSetup({
      challengeId: challenge.challengeId,
      otp: "123456",
    });

    expect(httpClient.request).toHaveBeenNthCalledWith(
      1,
      "/auth/password/setup",
      {
        auth: true,
        body: { password: "Password.2026!" },
        method: "POST",
        retryOnUnauthorized: false,
      },
    );
    expect(httpClient.request).toHaveBeenNthCalledWith(
      2,
      "/auth/password/setup/verify",
      {
        auth: true,
        body: { challengeId: challenge.challengeId, otp: "123456" },
        method: "POST",
        retryOnUnauthorized: false,
      },
    );
    expect(setAuthTokens).not.toHaveBeenCalled();
  });

  it("does not expose or call generic OTP endpoints from the formal API", async () => {
    expect(Object.values(authEndpointPaths)).not.toContain("/auth/otp/send");
    expect(Object.values(authEndpointPaths)).not.toContain("/auth/otp/verify");

    await expect(authApi.sendOtp("user@example.com")).rejects.toThrow(
      "error.auth.legacy_otp_unavailable",
    );
    await expect(
      authApi.verifyOtp("user@example.com", "123456"),
    ).rejects.toThrow("error.auth.legacy_otp_unavailable");
    expect(httpClient.request).not.toHaveBeenCalled();
    expect(setAuthTokens).not.toHaveBeenCalled();
  });

  it("preserves refresh, switch-identity, logout, and me behavior", async () => {
    vi.mocked(refreshStoredAccessToken).mockResolvedValueOnce({
      accessToken: "restored-access-token",
      expiresIn: 900,
    });
    await expect(authApi.refresh()).resolves.toEqual({
      accessToken: "restored-access-token",
      expiresIn: 900,
    });

    vi.mocked(getStoredRefreshToken).mockReturnValue("stored-refresh-token");
    vi.mocked(httpClient.request)
      .mockResolvedValueOnce({ ...tokenPair, me: { id: 7 } })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ id: 7 });

    await authApi.switchIdentity(51);
    await authApi.logout();
    await authApi.me();

    expect(httpClient.request).toHaveBeenNthCalledWith(
      1,
      "/auth/switch-identity",
      {
        auth: true,
        body: { refreshToken: "stored-refresh-token", identityId: 51 },
        method: "POST",
        retryOnUnauthorized: false,
      },
    );
    expect(httpClient.request).toHaveBeenNthCalledWith(2, "/auth/logout", {
      auth: true,
      body: { refreshToken: "stored-refresh-token" },
      method: "POST",
      retryOnUnauthorized: false,
    });
    expect(httpClient.request).toHaveBeenNthCalledWith(3, "/auth/me", {
      auth: true,
      method: "GET",
      retryOnUnauthorized: true,
    });
    expect(clearAuthTokens).toHaveBeenCalledTimes(1);
  });
});
