import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { authApi, authEndpointPaths } from "./auth";
import { httpClient, setAuthTokens } from "./httpClient";
import { getDeviceFingerprint } from "../lib/deviceFingerprint";

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
    expect(authEndpointPaths.register).toBe("/reg");
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
