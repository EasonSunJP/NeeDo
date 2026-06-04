import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import FingerprintJS from "@fingerprintjs/fingerprintjs";
import type { Agent, GetResult } from "@fingerprintjs/fingerprintjs";
import {
  apiRequestTimeoutMs,
  clearAuthTokens,
  getAccessToken,
  getStoredRefreshToken,
  httpClient,
  setAuthTokens
} from "./httpClient";
import type { AuthMePayload } from "../auth/rbac";
import { clearCachedDeviceFingerprint } from "../lib/deviceFingerprint";

vi.mock("@fingerprintjs/fingerprintjs", () => ({
  default: {
    load: vi.fn()
  }
}));

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

function createFingerprintAgent(visitorId: string) {
  const result = {
    visitorId,
    confidence: { score: 1 },
    components: {} as GetResult["components"],
    version: "test"
  } satisfies GetResult;
  const get = vi.fn<Agent["get"]>(async () => result);

  return {
    agent: { get } satisfies Agent,
    get
  };
}

describe("httpClient auth tokens", () => {
  beforeEach(() => {
    vi.stubGlobal("window", {
      localStorage: createStorage()
    });
    vi.stubGlobal("fetch", vi.fn());
    vi.mocked(FingerprintJS.load).mockReset();
    clearAuthTokens();
    clearCachedDeviceFingerprint();
  });

  afterEach(() => {
    vi.useRealTimers();
    clearAuthTokens();
    clearCachedDeviceFingerprint();
    vi.unstubAllEnvs();
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

  it("aborts hung API requests instead of leaving login actions stuck", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockImplementationOnce((_url, init) => {
      const signal = (init as RequestInit).signal;

      return new Promise<Response>((_resolve, reject) => {
        signal?.addEventListener("abort", () => {
          reject(new DOMException("Aborted", "AbortError"));
        });
      });
    });

    const request = httpClient.request("/auth/login", {
      auth: false,
      body: {
        email: "admin@example.com",
        password: "secret"
      }
    }).catch((error: unknown) => error);

    await vi.advanceTimersByTimeAsync(apiRequestTimeoutMs);

    await expect(request).resolves.toMatchObject({
      code: 408,
      message: "error.network.timeout",
      status: 408
    });
  });

  it("reports non-json API responses as a routing error", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response("<!doctype html><html><body>NeeDo</body></html>", {
        headers: { "content-type": "text/html" },
        status: 200
      })
    );

    await expect(httpClient.request("/auth/login", { auth: false })).rejects.toMatchObject({
      code: 404,
      message: "error.resource_not_found",
      status: 404
    });
  });

  it("reads formal CSV export responses as a download envelope", async () => {
    setAuthTokens({
      accessToken: "merchant-access-token",
      refreshToken: "refresh-token"
    });
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response("shop_name,total_net_pay_jpy\nGINZA Calm Body Lab,12960", {
        headers: {
          "content-disposition": "attachment; filename=\"merchant-pay-runs-2026-06-04.csv\"",
          "content-type": "text/csv; charset=utf-8"
        },
        status: 200
      })
    );

    await expect(httpClient.requestCsvExport("/merchant-admin/pay-runs/export")).resolves.toEqual({
      filename: "merchant-pay-runs-2026-06-04.csv",
      contentType: "text/csv; charset=utf-8",
      csv: "shop_name,total_net_pay_jpy\nGINZA Calm Body Lab,12960"
    });

    expect(fetch).toHaveBeenCalledWith(
      "/api/v1/merchant-admin/pay-runs/export",
      expect.objectContaining({
        headers: expect.objectContaining({
          Accept: "text/csv",
          Authorization: "Bearer merchant-access-token"
        })
      })
    );
  });

  it("uses msg from non-NeeDo JSON API errors when message is absent", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse({
        code: 100011,
        msg: "token不能为空"
      })
    );

    await expect(httpClient.request("/login", { auth: false })).rejects.toMatchObject({
      code: 100011,
      message: "token不能为空",
      status: 200
    });
  });

  it("does not expose a public Authorization header on pre-login requests", async () => {
    vi.stubEnv("VITE_API_PUBLIC_AUTHORIZATION", "Bearer public-prelogin-token");
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ code: 0, message: "success", data: { ok: true } }));

    await httpClient.request("/login", {
      auth: false,
      body: new URLSearchParams({
        username: "admin@example.com",
        password: "secret",
        type: "username"
      })
    });

    expect(fetch).toHaveBeenCalledWith(
      "/api/v1/login",
      expect.objectContaining({
        headers: expect.not.objectContaining({
          Authorization: "Bearer public-prelogin-token"
        })
      })
    );
  });

  it("can read legacy captcha image responses as data URLs", async () => {
    vi.stubEnv("VITE_API_PUBLIC_AUTHORIZATION", "Bearer public-prelogin-token");
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(new Uint8Array([1, 2, 3]), {
        headers: { "content-type": "image/png" },
        status: 200
      })
    );

    await expect(httpClient.requestDataUrl("/captcha", {
      auth: false,
      method: "GET",
      query: {
        token: "visitor-token",
        r: "captcha-request"
      },
      retryOnUnauthorized: false
    })).resolves.toBe("data:image/png;base64,AQID");

    expect(fetch).toHaveBeenCalledWith(
      "/api/v1/captcha?token=visitor-token&r=captcha-request",
      expect.objectContaining({
        body: undefined,
        headers: expect.not.objectContaining({
          Authorization: "Bearer public-prelogin-token"
        }),
        method: "GET"
      })
    );
  });

  it("can route legacy captcha requests through a dedicated local proxy base", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({
      code: 0,
      msg: "success",
      data: "data:image/png;base64,abc"
    }));

    await expect(httpClient.requestDataUrl("/captcha", {
      auth: false,
      baseUrl: "/legacy-auth",
      method: "GET",
      query: {
        token: "visitor-token",
        r: "captcha-request"
      },
      retryOnUnauthorized: false
    })).resolves.toBe("data:image/png;base64,abc");

    expect(fetch).toHaveBeenCalledWith(
      "/legacy-auth/captcha?token=visitor-token&r=captcha-request",
      expect.objectContaining({
        body: undefined,
        method: "GET"
      })
    );
  });

  it("serves static demo auth responses without calling the network", async () => {
    vi.stubEnv("VITE_NEEDO_STATIC_DEMO", "true");
    const fetchMock = vi.mocked(fetch);

    const result = await httpClient.request<AuthMePayload>("/auth/me");

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      username: "admin",
      roles: expect.arrayContaining(["admin", "merchant_owner", "technician", "customer"]),
      permissions: expect.arrayContaining(["page:dashboard", "page:user-management"]),
      menus: expect.arrayContaining(["menu:dashboard", "menu:user-management"])
    });
  });

  it("serves static demo captcha data without calling the network", async () => {
    vi.stubEnv("VITE_NEEDO_STATIC_DEMO", "true");
    const fetchMock = vi.mocked(fetch);

    await expect(httpClient.requestDataUrl("/captcha", {
      auth: false,
      method: "GET"
    })).resolves.toMatch(/^data:image\/svg\+xml;base64,/);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not attach the device fingerprint header by default", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ code: 0, message: "success", data: { ok: true } }));

    await httpClient.request("/login", {
      auth: false,
      body: {
        email: "admin@example.com",
        password: "secret"
      }
    });

    expect(fetch).toHaveBeenCalledWith(
      "/api/v1/login",
      expect.objectContaining({
        headers: expect.not.objectContaining({
          "X-Needo-Device-Fingerprint": expect.any(String)
        })
      })
    );
    expect(FingerprintJS.load).not.toHaveBeenCalled();
  });

  it("attaches the legacy token fingerprint header when the legacy auth API enables it", async () => {
    vi.stubEnv("VITE_ENABLE_DEVICE_TOKEN_HEADER", "true");
    const { agent } = createFingerprintAgent("legacy-device-token");
    vi.mocked(FingerprintJS.load).mockResolvedValue(agent);
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ code: 0, message: "success", data: { ok: true } }));

    await httpClient.request("/login", {
      auth: false,
      body: new URLSearchParams({
        username: "admin@example.com",
        password: "secret",
        type: "username"
      })
    });

    expect(fetch).toHaveBeenCalledWith(
      "/api/v1/login",
      expect.objectContaining({
        headers: expect.objectContaining({
          token: "legacy-device-token"
        })
      })
    );
  });

  it("attaches the FingerprintJS visitorId only when the formal fingerprint header is enabled", async () => {
    vi.stubEnv("VITE_ENABLE_DEVICE_FINGERPRINT_HEADER", "true");
    const { agent } = createFingerprintAgent("visitor-http-client");
    vi.mocked(FingerprintJS.load).mockResolvedValue(agent);
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ code: 0, message: "success", data: { ok: true } }));

    await httpClient.request("/login", {
      auth: false,
      body: {
        email: "admin@example.com",
        password: "secret"
      }
    });

    expect(fetch).toHaveBeenCalledWith(
      "/api/v1/login",
      expect.objectContaining({
        headers: expect.objectContaining({
          "X-Needo-Device-Fingerprint": "visitor-http-client"
        })
      })
    );
  });
});
