import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearAuthTokens,
  getAccessToken,
  getStoredRefreshToken,
  httpClient,
  setAuthTokens
} from "./httpClient";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
    status
  });
}

function createStorage() {
  const values = new Map<string, string>();

  return {
    clear: vi.fn(() => values.clear()),
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    key: vi.fn((index: number) => Array.from(values.keys())[index] ?? null),
    removeItem: vi.fn((key: string) => {
      values.delete(key);
    }),
    setItem: vi.fn((key: string, value: string) => {
      values.set(key, value);
    }),
    get length() {
      return values.size;
    }
  } satisfies Storage;
}

describe("httpClient auth tokens", () => {
  beforeEach(() => {
    vi.stubGlobal("window", {
      localStorage: createStorage()
    });
    vi.stubGlobal("fetch", vi.fn());
    clearAuthTokens();
  });

  afterEach(() => {
    clearAuthTokens();
    vi.unstubAllGlobals();
  });

  it("keeps the access token in memory and persists only the refresh token", () => {
    setAuthTokens({
      accessToken: "access-token",
      refreshToken: "refresh-token"
    });

    expect(getAccessToken()).toBe("access-token");
    expect(getStoredRefreshToken()).toBe("refresh-token");
    expect(window.localStorage.getItem("needo.auth.access-token")).toBeNull();
  });

  it("refreshes once after a 401 response and retries the original request", async () => {
    setAuthTokens({
      accessToken: "expired-access-token",
      refreshToken: "refresh-token"
    });
    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ code: 40003, message: "error.auth.token_invalid", data: null }, 401))
      .mockResolvedValueOnce(
        jsonResponse({
          code: 0,
          message: "success",
          data: {
            accessToken: "fresh-access-token",
            expiresIn: 900
          }
        })
      )
      .mockResolvedValueOnce(jsonResponse({ code: 0, message: "success", data: { list: [], total: 0, page: 1, pageSize: 20 } }));

    const result = await httpClient.request<{ list: unknown[] }>("/users", {
      query: { page: 1, pageSize: 20 }
    });

    expect(result.list).toEqual([]);
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "/api/v1/users?page=1&pageSize=20",
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer expired-access-token" })
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/v1/auth/refresh",
      expect.objectContaining({
        body: JSON.stringify({ refreshToken: "refresh-token" }),
        method: "POST"
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      "/api/v1/users?page=1&pageSize=20",
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer fresh-access-token" })
      })
    );
    expect(getAccessToken()).toBe("fresh-access-token");
  });
});
