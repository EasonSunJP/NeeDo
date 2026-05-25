import { beforeEach, describe, expect, it, vi } from "vitest";
import { authApi, authEndpointPaths } from "./auth";
import { httpClient, setAuthTokens } from "./httpClient";

vi.mock("./httpClient", () => ({
  clearAuthTokens: vi.fn(),
  getStoredRefreshToken: vi.fn(),
  httpClient: {
    request: vi.fn()
  },
  setAccessToken: vi.fn(),
  setAuthTokens: vi.fn()
}));

describe("authApi endpoint paths", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses the legacy deployed auth URI and form fields for email login", async () => {
    vi.mocked(httpClient.request).mockResolvedValueOnce({
      accessToken: "access-token",
      refreshToken: "refresh-token",
      expiresIn: 900
    });

    await authApi.login("admin@example.com", "secret");

    expect(httpClient.request).toHaveBeenCalledWith(authEndpointPaths.login, expect.objectContaining({
      auth: false,
      body: expect.any(URLSearchParams),
      method: "POST",
      retryOnUnauthorized: false
    }));
    const [, options] = vi.mocked(httpClient.request).mock.calls[0] ?? [];
    expect(options?.body).toBeInstanceOf(URLSearchParams);
    expect((options?.body as URLSearchParams).toString()).toBe("username=admin%40example.com&password=secret&type=username");
    expect(authEndpointPaths.login).toBe("/login");
    expect(authEndpointPaths.register).toBe("/reg");
    expect(setAuthTokens).toHaveBeenCalledWith({
      accessToken: "access-token",
      refreshToken: "refresh-token",
      expiresIn: 900
    });
  });
});
