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

  it("uses the formal NeeDo auth URI for email login", async () => {
    vi.mocked(httpClient.request).mockResolvedValueOnce({
      accessToken: "access-token",
      refreshToken: "refresh-token",
      expiresIn: 900
    });

    await authApi.login("admin@example.com", "secret");

    expect(httpClient.request).toHaveBeenCalledWith(authEndpointPaths.login, {
      auth: false,
      body: {
        email: "admin@example.com",
        password: "secret"
      },
      method: "POST",
      retryOnUnauthorized: false
    });
    expect(authEndpointPaths.login).toBe("/auth/login");
    expect(setAuthTokens).toHaveBeenCalledWith({
      accessToken: "access-token",
      refreshToken: "refresh-token",
      expiresIn: 900
    });
  });
});
