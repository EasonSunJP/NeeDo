import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { authApi, authEndpointPaths } from "./auth";
import { getStoredRefreshToken, httpClient, refreshStoredAccessToken, setAuthTokens } from "./httpClient";
import { getDeviceFingerprint } from "../lib/deviceFingerprint";

vi.mock("./httpClient", () => ({
  clearAuthTokens: vi.fn(),
  getStoredRefreshToken: vi.fn(),
  httpClient: {
    request: vi.fn(),
    requestDataUrl: vi.fn()
  },
  refreshStoredAccessToken: vi.fn(),
  setAccessToken: vi.fn(),
  setAuthTokens: vi.fn()
}));

vi.mock("../lib/deviceFingerprint", () => ({
  getDeviceFingerprint: vi.fn()
}));

describe("authApi endpoint paths", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("uses the deployed legacy login URI and form fields for password login", async () => {
    vi.mocked(httpClient.request).mockResolvedValueOnce({
      accessToken: "access-token",
      refreshToken: "refresh-token",
      expiresIn: 900
    });

    await authApi.login("admin", "secret");

    expect(httpClient.request).toHaveBeenCalledWith(authEndpointPaths.login, expect.objectContaining({
      auth: false,
      body: expect.any(FormData),
      method: "POST",
      retryOnUnauthorized: false
    }));
    const [, options] = vi.mocked(httpClient.request).mock.calls[0] ?? [];
    expect(options?.body).toBeInstanceOf(FormData);
    expect((options?.body as FormData).get("username")).toBe("admin");
    expect((options?.body as FormData).get("password")).toBe("secret");
    expect((options?.body as FormData).get("type")).toBe("username");
    expect(authEndpointPaths.login).toBe("/login");
    expect(authEndpointPaths.register).toBe("/auth/register");
    expect(setAuthTokens).toHaveBeenCalledWith({
      accessToken: "access-token",
      refreshToken: "refresh-token"
    });
  });

  it("uses the formal auth login URI for backend password login", async () => {
    vi.stubEnv("VITE_LEGACY_AUTH_BASE_URL", "/legacy-auth");
    vi.mocked(httpClient.request).mockResolvedValueOnce({
      accessToken: "access-token",
      refreshToken: "refresh-token",
      expiresIn: 900
    });

    await authApi.loginFormal("admin", "Admin.2026");

    expect(httpClient.request).toHaveBeenCalledWith("/auth/login", expect.objectContaining({
      auth: false,
      body: {
        username: "admin",
        password: "Admin.2026"
      },
      method: "POST",
      retryOnUnauthorized: false
    }));
    const [, options] = vi.mocked(httpClient.request).mock.calls[0] ?? [];
    expect(options?.baseUrl).toBeUndefined();
    expect(setAuthTokens).toHaveBeenCalledWith({
      accessToken: "access-token",
      refreshToken: "refresh-token"
    });
  });

  it("registers through the formal API without creating an authenticated session", async () => {
    const registrationApi = authApi as unknown as {
      register?: (input: {
        accountType: "customer";
        email: string;
        password: string;
        username: string;
      }) => Promise<unknown>;
    };
    expect(authEndpointPaths.register).toBe("/auth/register");
    expect(registrationApi.register).toBeTypeOf("function");
    if (!registrationApi.register) {
      return;
    }

    vi.mocked(httpClient.request).mockResolvedValueOnce({
      id: 101,
      email: "new.customer@example.com",
      username: "New Customer",
      accountType: "customer",
      approvalStatus: "approved",
      isActive: true
    });

    await registrationApi.register({
      accountType: "customer",
      email: "new.customer@example.com",
      password: "Customer.2026!",
      username: "New Customer"
    });

    expect(httpClient.request).toHaveBeenCalledWith("/auth/register", {
      auth: false,
      body: {
        accountType: "customer",
        email: "new.customer@example.com",
        password: "Customer.2026!",
        username: "New Customer"
      },
      method: "POST",
      retryOnUnauthorized: false
    });
    expect(setAuthTokens).not.toHaveBeenCalled();
  });

  it("uses the formal auth login URI in production even when legacy auth variables are present", async () => {
    vi.stubEnv("PROD", true);
    vi.stubEnv("VITE_LEGACY_AUTH_BASE_URL", "/legacy-auth");
    vi.stubEnv("VITE_LEGACY_AUTHORIZATION", "Bearer unsafe-production-token");
    vi.mocked(httpClient.request).mockResolvedValueOnce({
      accessToken: "access-token",
      refreshToken: "refresh-token",
      expiresIn: 900
    });

    await authApi.login("user@example.com", "S3cure-password!");

    expect(httpClient.request).toHaveBeenCalledWith(
      authEndpointPaths.formalLogin,
      expect.objectContaining({
        auth: false,
        body: {
          username: "user@example.com",
          password: "S3cure-password!"
        },
        method: "POST",
        retryOnUnauthorized: false
      })
    );
    const [, options] = vi.mocked(httpClient.request).mock.calls[0] ?? [];
    expect(options?.baseUrl).toBeUndefined();
    expect(options?.headers).toBeUndefined();
  });

  it("switches identity with the stored refresh token and persists the rotated token pair", async () => {
    vi.mocked(getStoredRefreshToken).mockReturnValueOnce("stored-refresh-token");
    vi.mocked(httpClient.request).mockResolvedValueOnce({
      accessToken: "next-access-token",
      refreshToken: "next-refresh-token",
      expiresIn: 900,
      me: {
        id: 5,
        email: "multi@example.com",
        username: "multi",
        avatarUrl: null,
        isActive: true,
        currentIdentity: { id: 51, type: "technician", scopeType: "technician_profile", scopeId: 3 },
        identities: [{ id: 51, type: "technician", scopeType: "technician_profile", scopeId: 3 }],
        roles: ["technician"],
        permissions: ["auth:me", "technician:services:write"],
        menus: ["menu:technician-app"]
      }
    });

    await authApi.switchIdentity(51);

    expect(httpClient.request).toHaveBeenCalledWith(authEndpointPaths.switchIdentity, expect.objectContaining({
      body: {
        refreshToken: "stored-refresh-token",
        identityId: 51
      },
      method: "POST",
      retryOnUnauthorized: false
    }));
    expect(setAuthTokens).toHaveBeenCalledWith({
      accessToken: "next-access-token",
      refreshToken: "next-refresh-token"
    });
  });

  it("uses the shared refresh request when restoring a session", async () => {
    vi.mocked(refreshStoredAccessToken).mockResolvedValueOnce({
      accessToken: "restored-access-token",
      expiresIn: 900
    });

    await expect(authApi.refresh()).resolves.toEqual({
      accessToken: "restored-access-token",
      expiresIn: 900
    });
    expect(refreshStoredAccessToken).toHaveBeenCalledTimes(1);
    expect(httpClient.request).not.toHaveBeenCalled();
  });

  it("sends the legacy captcha code with email login when provided", async () => {
    vi.stubEnv("VITE_LEGACY_AUTH_BASE_URL", "/legacy-auth");
    vi.stubEnv("VITE_LEGACY_AUTHORIZATION", "Bearer legacy-prelogin-token");
    vi.mocked(getDeviceFingerprint).mockResolvedValueOnce("visitor-token");
    vi.mocked(httpClient.request).mockResolvedValueOnce({
      accessToken: "access-token",
      refreshToken: "refresh-token",
      expiresIn: 900
    });

    await authApi.login("admin@example.com", "secret", "A1b2C");

    const [, options] = vi.mocked(httpClient.request).mock.calls[0] ?? [];
    expect(options?.baseUrl).toBe("/legacy-auth");
    expect(options?.body).toBeInstanceOf(FormData);
    expect((options?.body as FormData).get("username")).toBe("admin@example.com");
    expect((options?.body as FormData).get("password")).toBe("secret");
    expect((options?.body as FormData).get("type")).toBe("username");
    expect((options?.body as FormData).get("numcode")).toBe("A1b2C");
    expect(options?.headers).toEqual({
      Authorization: "Bearer legacy-prelogin-token",
      token: "visitor-token"
    });
  });

  it("normalizes the deployed legacy login payload into tokens and every frontend portal identity", async () => {
    vi.mocked(getDeviceFingerprint).mockResolvedValueOnce("visitor-token");
    vi.mocked(httpClient.request).mockResolvedValueOnce({
      uid: "11077991",
      nickname: "admin",
      face: "",
      token: "Bearer legacy-access-token"
    });

    const result = await authApi.login("admin", "secret", "1s5Yu");

    expect(setAuthTokens).toHaveBeenCalledWith({
      accessToken: "legacy-access-token",
      refreshToken: null
    });
    expect(result.me).toMatchObject({
      id: 11077991,
      username: "admin",
      roles: ["customer", "merchant_owner", "technician", "scout"],
      permissions: ["page:client-app", "page:merchant-app", "page:technician-app", "page:business-app"],
      menus: ["menu:client-app", "menu:merchant-app", "menu:technician-app", "menu:business-app"],
      currentIdentity: {
        type: "customer",
        scopeId: 11077991
      }
    });
    expect(result.me?.identities.map((identity) => identity.type)).toEqual(["customer", "merchant_owner", "technician", "scout"]);
  });

  it("requests the legacy captcha with the device token and a random cache buster", async () => {
    vi.stubEnv("VITE_LEGACY_AUTH_BASE_URL", "/legacy-auth");
    vi.stubEnv("VITE_LEGACY_AUTHORIZATION", "Bearer legacy-prelogin-token");
    vi.mocked(getDeviceFingerprint).mockResolvedValueOnce("visitor-token");
    vi.mocked(httpClient.requestDataUrl).mockResolvedValueOnce("data:image/png;base64,abc");

    await expect(authApi.fetchCaptcha()).resolves.toBe("data:image/png;base64,abc");

    expect(httpClient.requestDataUrl).toHaveBeenCalledWith(authEndpointPaths.captcha, expect.objectContaining({
      auth: false,
      baseUrl: "/legacy-auth",
      headers: {
        Authorization: "Bearer legacy-prelogin-token"
      },
      method: "GET",
      query: {
        token: "visitor-token",
        r: expect.any(String)
      },
      retryOnUnauthorized: false
    }));
    expect(authEndpointPaths.captcha).toBe("/captcha");
  });
});
