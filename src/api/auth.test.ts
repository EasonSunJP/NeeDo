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

  it("uses the formal auth URI and username-compatible fields for password login", async () => {
    vi.mocked(httpClient.request).mockResolvedValueOnce({
      accessToken: "access-token",
      refreshToken: "refresh-token",
      expiresIn: 900
    });

    await authApi.login("admin", "secret");

    expect(httpClient.request).toHaveBeenCalledWith(authEndpointPaths.login, expect.objectContaining({
      auth: false,
      body: {
        username: "admin",
        password: "secret",
        type: "username"
      },
      method: "POST",
      retryOnUnauthorized: false
    }));
    const [, options] = vi.mocked(httpClient.request).mock.calls[0] ?? [];
    expect(options?.body).not.toBeInstanceOf(FormData);
    expect(authEndpointPaths.login).toBe("/auth/login");
    expect(authEndpointPaths.register).toBe("/reg");
    expect(setAuthTokens).toHaveBeenCalledWith({
      accessToken: "access-token",
      refreshToken: "refresh-token",
      expiresIn: 900
    });
  });

  it("sends the legacy captcha code with email login when provided", async () => {
    vi.mocked(getDeviceFingerprint).mockResolvedValueOnce("visitor-token");
    vi.mocked(httpClient.request).mockResolvedValueOnce({
      accessToken: "access-token",
      refreshToken: "refresh-token",
      expiresIn: 900
    });

    await authApi.login("admin@example.com", "secret", "A1b2C");

    const [, options] = vi.mocked(httpClient.request).mock.calls[0] ?? [];
    expect(options?.body).toEqual({
      username: "admin@example.com",
      password: "secret",
      type: "username",
      numcode: "A1b2C"
    });
    expect(options?.headers).toEqual({ token: "visitor-token" });
  });

  it("requests the legacy captcha with the device token and a random cache buster", async () => {
    vi.stubEnv("VITE_LEGACY_AUTH_BASE_URL", "/legacy-auth");
    vi.mocked(getDeviceFingerprint).mockResolvedValueOnce("visitor-token");
    vi.mocked(httpClient.requestDataUrl).mockResolvedValueOnce("data:image/png;base64,abc");

    await expect(authApi.fetchCaptcha()).resolves.toBe("data:image/png;base64,abc");

    expect(httpClient.requestDataUrl).toHaveBeenCalledWith(authEndpointPaths.captcha, expect.objectContaining({
      auth: false,
      baseUrl: "/legacy-auth",
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
