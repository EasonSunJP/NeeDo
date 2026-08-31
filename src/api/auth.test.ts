import { afterEach, beforeEach, describe, expect, expectTypeOf, it, vi } from "vitest";
import {
  AuthRotatedResponseError,
  authApi,
  authEndpointPaths,
  type SwitchMerchantShopPayload,
  type VerifiedGoogleRegistrationPayload
} from "./auth";
import { clearAuthTokens, getStoredRefreshToken, httpClient, setAuthTokens } from "./httpClient";

vi.mock("./httpClient", () => ({
  clearAuthTokens: vi.fn(),
  getStoredRefreshToken: vi.fn(),
  httpClient: {
    request: vi.fn(),
    requestDataUrl: vi.fn()
  },
  setAccessToken: vi.fn(),
  setAuthTokens: vi.fn()
}));

vi.mock("../lib/deviceFingerprint", () => ({
  getDeviceFingerprint: vi.fn().mockResolvedValue("visitor-token")
}));

const tokenPair = {
  accessToken: "access-token",
  refreshToken: "refresh-token",
  expiresIn: 900
};

const challenge = {
  challengeId: "b2e9503e-d271-40cb-bc42-70edb551126f",
  maskedEmail: "u***@example.com",
  expiresIn: 600,
  cooldownSeconds: 60
};

const googleInitialization = {
  clientId: "client.apps.googleusercontent.com",
  nonce: "opaque-backend-nonce",
  nonceChallengeId: "8b097684-4705-4d8e-bdbc-8c6e2970b4b1",
  expiresIn: 600
};

const merchantIdentity = {
  id: 51,
  publicId: "o0000000051",
  scopeId: 41,
  scopeType: "merchant_account",
  type: "merchant_organization"
};

const merchantMe = {
  id: 7,
  needoId: "u0000000007",
  primaryPublicId: "u0000000007",
  activeIdentityId: merchantIdentity.id,
  activePublicId: merchantIdentity.publicId,
  email: "merchant@example.com",
  emailVerifiedAt: "2026-08-27T00:00:00.000Z",
  hasPassword: true,
  username: "Merchant",
  avatarUrl: null,
  isActive: true,
  isTestAccount: false,
  currentIdentity: merchantIdentity,
  identities: [merchantIdentity],
  identityAvailability: [
    {
      kind: "merchant" as const,
      state: "active" as const,
      identityId: merchantIdentity.id,
      applicationId: null,
      rejectionReason: null
    }
  ],
  roles: ["merchant_owner"],
  permissions: ["merchant-admin:dashboard:read"],
  menus: ["menu:merchant-app"]
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

    await authApi.login("u0000000042", "Password.2026!");

    expect(httpClient.request).toHaveBeenCalledWith("/auth/login", {
      auth: false,
      body: {
        loginIdentifier: "u0000000042",
        password: "Password.2026!"
      },
      method: "POST",
      retryOnUnauthorized: false
    });
    expect(setAuthTokens).not.toHaveBeenCalled();
  });

  it.each([0, 600, 900.5, 901])(
    "rejects an invalid authenticated login TTL before persisting (%s)",
    async (expiresIn) => {
      vi.mocked(httpClient.request).mockResolvedValueOnce({ ...tokenPair, expiresIn });

      await expect(authApi.login("u0000000042", "Password.2026!")).rejects.toThrow("error.api");
      expect(setAuthTokens).not.toHaveBeenCalled();
    }
  );

  it("rejects a login payload that tries to inject an inline privileged me", async () => {
    vi.mocked(httpClient.request).mockResolvedValueOnce({ ...tokenPair, me: merchantMe });

    await expect(authApi.login("u0000000042", "Password.2026!")).rejects.toThrow("error.api");
  });

  it("starts registration with only email and password without persisting tokens", async () => {
    vi.mocked(httpClient.request).mockResolvedValueOnce(challenge);

    await expect(
      authApi.startRegistration({
        email: "new.customer@example.com",
        password: "Customer.2026!"
      })
    ).resolves.toEqual(challenge);

    expect(httpClient.request).toHaveBeenCalledWith("/auth/register", {
      auth: false,
      body: {
        email: "new.customer@example.com",
        password: "Customer.2026!"
      },
      method: "POST",
      retryOnUnauthorized: false
    });
    expect(setAuthTokens).not.toHaveBeenCalled();
  });

  it("verifies registration without persisting the authenticated token pair", async () => {
    const registered = { ...tokenPair, needoId: "u0000000042" };
    vi.mocked(httpClient.request).mockResolvedValueOnce(registered);

    await expect(
      authApi.verifyRegistration({
        challengeId: challenge.challengeId,
        otp: "123456"
      })
    ).resolves.toEqual(registered);

    expect(httpClient.request).toHaveBeenCalledWith("/auth/register/verify", {
      auth: false,
      body: { challengeId: challenge.challengeId, otp: "123456" },
      method: "POST",
      retryOnUnauthorized: false
    });
    expect(setAuthTokens).not.toHaveBeenCalled();
  });

  it("rejects a malformed verified registration ID before persisting tokens", async () => {
    vi.mocked(httpClient.request).mockResolvedValueOnce({ ...tokenPair, needoId: "42" });

    await expect(
      authApi.verifyRegistration({
        challengeId: challenge.challengeId,
        otp: "123456"
      })
    ).rejects.toThrow("error.api");
    expect(setAuthTokens).not.toHaveBeenCalled();
  });

  it("initializes and submits a public Google credential with exact nonce bodies", async () => {
    vi.mocked(httpClient.request)
      .mockResolvedValueOnce(googleInitialization)
      .mockResolvedValueOnce({ status: "authenticated", ...tokenPair });

    await authApi.initializeGoogleLogin();
    await authApi.submitGoogleCredential({
      credential: "opaque-google-credential",
      nonceChallengeId: googleInitialization.nonceChallengeId
    });

    expect(httpClient.request).toHaveBeenNthCalledWith(1, "/auth/google/init", {
      auth: false,
      body: {},
      method: "POST",
      retryOnUnauthorized: false
    });
    expect(httpClient.request).toHaveBeenNthCalledWith(2, "/auth/google", {
      auth: false,
      body: {
        credential: "opaque-google-credential",
        nonceChallengeId: googleInitialization.nonceChallengeId
      },
      method: "POST",
      retryOnUnauthorized: false
    });
    expect(setAuthTokens).not.toHaveBeenCalled();
  });

  it("rejects an authenticated Google payload that includes inline me", async () => {
    vi.mocked(httpClient.request).mockResolvedValueOnce({
      status: "authenticated",
      ...tokenPair,
      me: merchantMe
    });

    await expect(
      authApi.submitGoogleCredential({
        credential: "opaque-google-credential",
        nonceChallengeId: googleInitialization.nonceChallengeId
      })
    ).rejects.toThrow("error.api");
  });

  it("does not persist tokens for a Google verification-required result", async () => {
    vi.mocked(httpClient.request).mockResolvedValueOnce({
      status: "verification_required",
      ...challenge
    });

    await expect(
      authApi.submitGoogleCredential({
        credential: "opaque-google-credential",
        nonceChallengeId: googleInitialization.nonceChallengeId
      })
    ).resolves.toEqual({ status: "verification_required", ...challenge });

    expect(setAuthTokens).not.toHaveBeenCalled();
  });

  it("rejects and exposes tokens hidden in a malformed Google verification challenge", async () => {
    vi.mocked(httpClient.request).mockResolvedValueOnce({
      status: "verification_required",
      ...challenge,
      accessToken: "malformed-access",
      refreshToken: "malformed-refresh"
    });

    const request = authApi.submitGoogleCredential({
      credential: "opaque-google-credential",
      nonceChallengeId: googleInitialization.nonceChallengeId
    });

    await expect(request).rejects.toBeInstanceOf(AuthRotatedResponseError);
    await expect(request).rejects.toMatchObject({
      rotatedCredentials: {
        accessToken: "malformed-access",
        refreshToken: "malformed-refresh"
      }
    });
  });

  it("verifies first-use Google registration without persisting its token pair", async () => {
    const registered = { ...tokenPair, needoId: "u0000000042" };
    vi.mocked(httpClient.request).mockResolvedValueOnce(registered);

    await authApi.verifyGoogleRegistrationOrLink({
      challengeId: challenge.challengeId,
      otp: "123456"
    });

    expect(httpClient.request).toHaveBeenCalledWith("/auth/google/verify", {
      auth: false,
      body: { challengeId: challenge.challengeId, otp: "123456" },
      method: "POST",
      retryOnUnauthorized: false
    });
    expect(setAuthTokens).not.toHaveBeenCalled();
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
      canUnlink: true
    };
    vi.mocked(httpClient.request).mockResolvedValueOnce(status);

    await expect(authApi.getGoogleLinkStatus()).resolves.toEqual(status);

    expect(httpClient.request).toHaveBeenCalledWith("/auth/google/link", {
      auth: true,
      method: "GET",
      retryOnUnauthorized: true
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
      nonceChallengeId: googleInitialization.nonceChallengeId
    });
    await authApi.verifyGoogleLink({
      challengeId: challenge.challengeId,
      otp: "123456"
    });

    expect(httpClient.request).toHaveBeenNthCalledWith(1, "/auth/google/link/init", {
      auth: true,
      body: {},
      method: "POST",
      retryOnUnauthorized: false
    });
    expect(httpClient.request).toHaveBeenNthCalledWith(2, "/auth/google/link", {
      auth: true,
      body: {
        credential: "opaque-google-credential",
        nonceChallengeId: googleInitialization.nonceChallengeId
      },
      method: "POST",
      retryOnUnauthorized: false
    });
    expect(httpClient.request).toHaveBeenNthCalledWith(3, "/auth/google/link/verify", {
      auth: true,
      body: { challengeId: challenge.challengeId, otp: "123456" },
      method: "POST",
      retryOnUnauthorized: false
    });
    expect(setAuthTokens).not.toHaveBeenCalled();
  });

  it("starts and verifies Google unlink without mutating credentials", async () => {
    vi.mocked(httpClient.request)
      .mockResolvedValueOnce(challenge)
      .mockResolvedValueOnce({ signedOut: true });

    await authApi.startGoogleUnlink();
    await expect(
      authApi.verifyGoogleUnlink({
        challengeId: challenge.challengeId,
        otp: "123456"
      })
    ).resolves.toEqual({ signedOut: true });

    expect(httpClient.request).toHaveBeenNthCalledWith(1, "/auth/google/unlink", {
      auth: true,
      body: {},
      method: "POST",
      retryOnUnauthorized: false
    });
    expect(httpClient.request).toHaveBeenNthCalledWith(2, "/auth/google/unlink/verify", {
      auth: true,
      body: { challengeId: challenge.challengeId, otp: "123456" },
      method: "POST",
      retryOnUnauthorized: false
    });
    expect(setAuthTokens).not.toHaveBeenCalled();
  });

  it("does not clear tokens when verified unlink fails", async () => {
    vi.mocked(httpClient.request).mockRejectedValueOnce(
      new Error("error.auth.verification_code_invalid")
    );

    await expect(
      authApi.verifyGoogleUnlink({
        challengeId: challenge.challengeId,
        otp: "000000"
      })
    ).rejects.toThrow("error.auth.verification_code_invalid");
    expect(clearAuthTokens).not.toHaveBeenCalled();
  });

  it("does not clear tokens for a malformed unlink response without signedOut true", async () => {
    vi.mocked(httpClient.request).mockResolvedValueOnce({ signedOut: false });

    await expect(
      authApi.verifyGoogleUnlink({
        challengeId: challenge.challengeId,
        otp: "123456"
      })
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
      otp: "123456"
    });

    expect(httpClient.request).toHaveBeenNthCalledWith(1, "/auth/password/setup", {
      auth: true,
      body: { password: "Password.2026!" },
      method: "POST",
      retryOnUnauthorized: false
    });
    expect(httpClient.request).toHaveBeenNthCalledWith(2, "/auth/password/setup/verify", {
      auth: true,
      body: { challengeId: challenge.challengeId, otp: "123456" },
      method: "POST",
      retryOnUnauthorized: false
    });
    expect(setAuthTokens).not.toHaveBeenCalled();
  });

  it("does not expose or call generic OTP endpoints from the formal API", async () => {
    expect(Object.values(authEndpointPaths)).not.toContain("/auth/otp/send");
    expect(Object.values(authEndpointPaths)).not.toContain("/auth/otp/verify");

    await expect(authApi.sendOtp("user@example.com")).rejects.toThrow(
      "error.auth.legacy_otp_unavailable"
    );
    await expect(authApi.verifyOtp("user@example.com", "123456")).rejects.toThrow(
      "error.auth.legacy_otp_unavailable"
    );
    expect(httpClient.request).not.toHaveBeenCalled();
    expect(setAuthTokens).not.toHaveBeenCalled();
  });

  it("keeps refresh, transition, logout, and me requests caller-owned", async () => {
    vi.mocked(httpClient.request)
      .mockResolvedValueOnce({ ...tokenPair, me: merchantMe })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce(merchantMe);

    await authApi.switchIdentity(
      51,
      {
        accessToken: "stored-access-token",
        refreshToken: "stored-refresh-token"
      },
      { expectedUserId: 7, expectedIdentityId: 51 }
    );
    await authApi.logout({
      accessToken: "stored-access-token",
      refreshToken: "stored-refresh-token"
    });
    await authApi.me({
      accessToken: "stored-access-token",
      refreshToken: "stored-refresh-token"
    });

    expect(httpClient.request).toHaveBeenNthCalledWith(1, "/auth/switch-identity", {
      auth: true,
      body: { refreshToken: "stored-refresh-token", identityId: 51 },
      headers: { Authorization: "Bearer stored-access-token" },
      method: "POST",
      retryOnUnauthorized: false,
      unauthorizedPolicy: "caller"
    });
    expect(httpClient.request).toHaveBeenNthCalledWith(2, "/auth/logout", {
      auth: true,
      body: { refreshToken: "stored-refresh-token" },
      headers: { Authorization: "Bearer stored-access-token" },
      method: "POST",
      retryOnUnauthorized: false,
      unauthorizedPolicy: "caller"
    });
    expect(httpClient.request).toHaveBeenNthCalledWith(3, "/auth/me", {
      auth: true,
      headers: { Authorization: "Bearer stored-access-token" },
      method: "GET",
      retryOnUnauthorized: false,
      unauthorizedPolicy: "caller"
    });
    expect(clearAuthTokens).not.toHaveBeenCalled();
    expect(setAuthTokens).not.toHaveBeenCalled();
  });

  it("validates remembered-session refresh and me without mutating global credentials", async () => {
    vi.mocked(httpClient.request)
      .mockResolvedValueOnce({ accessToken: "remembered-access", expiresIn: 900 })
      .mockResolvedValueOnce(merchantMe);

    await expect(authApi.refreshWithCredentials("remembered-refresh")).resolves.toEqual({
      accessToken: "remembered-access",
      expiresIn: 900
    });
    await expect(
      authApi.me({
        accessToken: "remembered-access",
        refreshToken: "remembered-refresh"
      })
    ).resolves.toEqual(merchantMe);

    expect(httpClient.request).toHaveBeenNthCalledWith(1, "/auth/refresh", {
      auth: false,
      body: { refreshToken: "remembered-refresh" },
      method: "POST",
      retryOnUnauthorized: false,
      unauthorizedPolicy: "caller"
    });
    expect(httpClient.request).toHaveBeenNthCalledWith(2, "/auth/me", {
      auth: true,
      headers: { Authorization: "Bearer remembered-access" },
      method: "GET",
      retryOnUnauthorized: false,
      unauthorizedPolicy: "caller"
    });
    expect(setAuthTokens).not.toHaveBeenCalled();
  });

  it("validates a merchant switch without persisting the rotated pair", async () => {
    const switched: SwitchMerchantShopPayload = {
      ...tokenPair,
      accessToken: "shop-b-access",
      refreshToken: "shop-b-refresh",
      me: merchantMe,
      shopPublicId: "shop0000000012"
    };
    vi.mocked(httpClient.request).mockResolvedValueOnce(switched);

    await expect(
      authApi.switchMerchantShop(
        "shop0000000012",
        {
          accessToken: "stored-access-token",
          refreshToken: "stored-refresh-token"
        },
        { expectedUserId: 7, expectedIdentityId: 51 }
      )
    ).resolves.toEqual(switched);

    expect(httpClient.request).toHaveBeenCalledWith("/auth/merchant-shop/switch", {
      auth: true,
      body: {
        refreshToken: "stored-refresh-token",
        shopPublicId: "shop0000000012"
      },
      headers: { Authorization: "Bearer stored-access-token" },
      method: "POST",
      retryOnUnauthorized: false,
      unauthorizedPolicy: "caller"
    });
    expect(setAuthTokens).not.toHaveBeenCalled();
  });

  it("does not persist tokens for a malformed merchant shop switch response", async () => {
    vi.mocked(httpClient.request).mockResolvedValueOnce({
      ...tokenPair,
      me: merchantMe,
      shopPublicId: "12"
    });

    await expect(
      authApi.switchMerchantShop(
        "shop0000000012",
        { accessToken: "stored-access-token", refreshToken: "stored-refresh-token" },
        { expectedUserId: 7, expectedIdentityId: 51 }
      )
    ).rejects.toMatchObject({
      message: "error.api",
      rotatedCredentials: {
        accessToken: "access-token",
        refreshToken: "refresh-token"
      }
    });
    expect(setAuthTokens).not.toHaveBeenCalled();
  });

  it("captures a refresh-only malformed rotation for revocation without accepting it", async () => {
    vi.mocked(httpClient.request).mockResolvedValueOnce({
      refreshToken: "partial-refresh",
      expiresIn: 900,
      me: merchantMe,
      shopPublicId: "shop0000000012"
    });

    await expect(
      authApi.switchMerchantShop(
        "shop0000000012",
        { accessToken: "stored-access-token", refreshToken: "stored-refresh-token" },
        { expectedUserId: 7, expectedIdentityId: 51 }
      )
    ).rejects.toMatchObject({
      message: "error.api",
      rotatedCredentials: {
        accessToken: null,
        refreshToken: "partial-refresh"
      }
    });
    expect(setAuthTokens).not.toHaveBeenCalled();
  });

  it.each([
    ["missing isTestAccount", { ...merchantMe, isTestAccount: undefined }],
    ["missing identityAvailability", { ...merchantMe, identityAvailability: undefined }],
    ["invalid email", { ...merchantMe, email: "not-an-email" }],
    ["non-RFC3339 verified date", { ...merchantMe, emailVerifiedAt: "2026-08-27 00:00:00" }],
    ["invalid primary public ID", { ...merchantMe, primaryPublicId: "user-7" }],
    [
      "duplicate current identity id",
      {
        ...merchantMe,
        identities: [merchantIdentity, { ...merchantIdentity, publicId: "o0000000052" }]
      }
    ],
    [
      "current identity fields that differ from its list entry",
      {
        ...merchantMe,
        identities: [{ ...merchantIdentity, scopeId: 42 }]
      }
    ],
    [
      "direct-shop identity in merchant-account scope",
      {
        ...merchantMe,
        currentIdentity: { ...merchantMe.currentIdentity, type: "merchant_staff" },
        identities: [
          { ...merchantMe.currentIdentity, type: "merchant_staff" },
          ...merchantMe.identities.filter(
            (identity) => identity.id !== merchantMe.currentIdentity.id
          )
        ]
      }
    ]
  ])("rejects a 200 switch response with %s", async (_label, me) => {
    vi.mocked(httpClient.request).mockResolvedValueOnce({
      ...tokenPair,
      me,
      shopPublicId: "shop0000000012"
    });

    await expect(
      authApi.switchMerchantShop(
        "shop0000000012",
        { accessToken: "stored-access-token", refreshToken: "stored-refresh-token" },
        { expectedUserId: 7, expectedIdentityId: 51 }
      )
    ).rejects.toThrow("error.api");
    expect(setAuthTokens).not.toHaveBeenCalled();
  });

  it.each([600, 900.5, 901, 0])(
    "rejects a 200 switch response with expiresIn %s",
    async (expiresIn) => {
      vi.mocked(httpClient.request).mockResolvedValueOnce({
        ...tokenPair,
        expiresIn,
        me: merchantMe,
        shopPublicId: "shop0000000012"
      });

      await expect(
        authApi.switchMerchantShop(
          "shop0000000012",
          { accessToken: "stored-access-token", refreshToken: "stored-refresh-token" },
          { expectedUserId: 7, expectedIdentityId: 51 }
        )
      ).rejects.toThrow("error.api");
      expect(setAuthTokens).not.toHaveBeenCalled();
    }
  );

  it("rejects switched me for another user or merchant identity", async () => {
    vi.mocked(httpClient.request)
      .mockResolvedValueOnce({
        ...tokenPair,
        me: { ...merchantMe, id: 8 },
        shopPublicId: "shop0000000012"
      })
      .mockResolvedValueOnce({
        ...tokenPair,
        me: {
          ...merchantMe,
          activeIdentityId: 52,
          activePublicId: "o0000000052",
          currentIdentity: {
            ...merchantIdentity,
            id: 52,
            publicId: "o0000000052"
          },
          identities: [
            {
              ...merchantIdentity,
              id: 52,
              publicId: "o0000000052"
            }
          ]
        },
        shopPublicId: "shop0000000012"
      });
    const credentials = {
      accessToken: "stored-access-token",
      refreshToken: "stored-refresh-token"
    };

    await expect(
      authApi.switchMerchantShop("shop0000000012", credentials, {
        expectedUserId: 7,
        expectedIdentityId: 51
      })
    ).rejects.toThrow("error.api");
    await expect(
      authApi.switchMerchantShop("shop0000000012", credentials, {
        expectedUserId: 7,
        expectedIdentityId: 51
      })
    ).rejects.toThrow("error.api");
    expect(setAuthTokens).not.toHaveBeenCalled();
  });

  it("does not request or mutate tokens when merchant shop switching has no refresh token", async () => {
    vi.mocked(getStoredRefreshToken).mockReturnValue(null);

    await expect(
      authApi.switchMerchantShop(
        "shop0000000012",
        { accessToken: null, refreshToken: "" },
        { expectedIdentityId: 51, expectedUserId: 7 }
      )
    ).rejects.toThrow("error.auth.refresh_missing");

    expect(httpClient.request).not.toHaveBeenCalled();
    expect(setAuthTokens).not.toHaveBeenCalled();
  });
});
