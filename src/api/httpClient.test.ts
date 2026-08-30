import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import FingerprintJS from "@fingerprintjs/fingerprintjs";
import type { Agent, GetResult } from "@fingerprintjs/fingerprintjs";
import {
  apiRequestTimeoutMs,
  buildApiUrl,
  clearAuthTokens,
  getAccessToken,
  getStoredRefreshToken,
  httpClient,
  refreshStoredAccessToken,
  setAuthExpiredHandler,
  setExpectedAuthUserId,
  setAuthTokens
} from "./httpClient";
import type { AuthMePayload } from "../auth/rbac";
import { clearCachedDeviceFingerprint } from "../lib/deviceFingerprint";

vi.mock("@fingerprintjs/fingerprintjs", () => ({
  default: {
    load: vi.fn()
  }
}));

describe("httpClient query serialization", () => {
  it("serializes repeated scalar values as repeated query keys", () => {
    expect(buildApiUrl("/search", {
      entityType: "shop",
      keywords: ["LifeDance", "家政"],
      categoryIds: [3, 9],
      page: 1
    })).toBe(
      "/api/v1/search?entityType=shop&keywords=LifeDance&keywords=%E5%AE%B6%E6%94%BF&categoryIds=3&categoryIds=9&page=1"
    );
  });

  it("keeps existing scalar and omitted query behavior unchanged", () => {
    expect(buildApiUrl("/search", {
      keyword: "Wellness 渋谷",
      page: 2,
      enabled: false,
      empty: "",
      missing: undefined
    })).toBe(
      "/api/v1/search?keyword=Wellness+%E6%B8%8B%E8%B0%B7&page=2&enabled=false"
    );
  });
});

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

function accessTokenForSubject(subject: number) {
  const payload = Buffer.from(JSON.stringify({ sub: String(subject) })).toString("base64url");
  return `header.${payload}.signature`;
}

describe("httpClient auth tokens", () => {
  beforeEach(() => {
    vi.stubGlobal("window", {
      localStorage: createStorage(),
      sessionStorage: createStorage()
    });
    vi.stubGlobal("fetch", vi.fn());
    vi.mocked(FingerprintJS.load).mockReset();
    clearAuthTokens();
    clearCachedDeviceFingerprint();
  });

  afterEach(() => {
    vi.useRealTimers();
    setAuthExpiredHandler(null);
    setExpectedAuthUserId(null);
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
    expect(window.sessionStorage.getItem("needo.auth.refresh-token")).toBe("refresh-token");
    expect(window.localStorage.getItem("needo.auth.refresh-token")).toBeNull();
  });

  it("refreshes a mismatched in-memory token before sending an authenticated mutation", async () => {
    const staleToken = accessTokenForSubject(81);
    const alignedToken = accessTokenForSubject(1);
    setExpectedAuthUserId(1);
    setAuthTokens({ accessToken: staleToken, refreshToken: "admin-refresh-token" });
    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce(jsonResponse({
        code: 0,
        message: "success",
        data: { accessToken: alignedToken, expiresIn: 900 }
      }))
      .mockResolvedValueOnce(jsonResponse({ code: 0, message: "success", data: { updated: true } }));

    await expect(httpClient.request<{ updated: boolean }>("/im/messages/1/reactions", {
      body: { emoji: "😂" },
      method: "PUT"
    })).resolves.toEqual({ updated: true });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "/api/v1/auth/refresh",
      expect.objectContaining({ method: "POST" })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/v1/im/messages/1/reactions",
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: `Bearer ${alignedToken}` }),
        method: "PUT"
      })
    );
  });

  it("fails closed instead of sending a request when refresh keeps the wrong token subject", async () => {
    const mismatchedToken = accessTokenForSubject(81);
    const onAuthExpired = vi.fn();
    setExpectedAuthUserId(1);
    setAuthTokens({ accessToken: mismatchedToken, refreshToken: "admin-refresh-token" });
    setAuthExpiredHandler(onAuthExpired);
    const fetchMock = vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({
      code: 0,
      message: "success",
      data: { accessToken: mismatchedToken, expiresIn: 900 }
    }));

    await expect(httpClient.request("/im/messages/1/reactions", {
      body: { emoji: "😂" },
      method: "PUT"
    })).rejects.toMatchObject({
      code: 401,
      message: "error.auth.session_mismatch",
      status: 401
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/auth/refresh",
      expect.objectContaining({ method: "POST" })
    );
    expect(getAccessToken()).toBeNull();
    expect(getStoredRefreshToken()).toBeNull();
    expect(onAuthExpired).toHaveBeenCalledTimes(1);
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

  it("expires the local session when a protected request receives 401 without a refresh token", async () => {
    const onAuthExpired = vi.fn();
    setAuthTokens({ accessToken: "stale-access-token" });
    setAuthExpiredHandler(onAuthExpired);
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse({ code: 40105, message: "error.auth.token_invalid", data: null }, 401)
    );

    await expect(httpClient.request("/affiliate/profile")).rejects.toMatchObject({
      code: 40105,
      message: "error.auth.token_invalid",
      status: 401
    });

    expect(getAccessToken()).toBeNull();
    expect(onAuthExpired).toHaveBeenCalledTimes(1);
  });

  it("coalesces explicit session restoration and unauthorized retries into one refresh request", async () => {
    setAuthTokens({
      accessToken: "expired-access-token",
      refreshToken: "refresh-token"
    });
    let resolveRefresh: ((response: Response) => void) | undefined;
    const fetchMock = vi.mocked(fetch).mockImplementationOnce(
      () => new Promise<Response>((resolve) => {
        resolveRefresh = resolve;
      })
    );

    const firstRefresh = refreshStoredAccessToken();
    const secondRefresh = refreshStoredAccessToken();

    await Promise.resolve();
    await Promise.resolve();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    resolveRefresh?.(jsonResponse({
      code: 0,
      message: "success",
      data: {
        accessToken: "fresh-access-token",
        expiresIn: 900
      }
    }));

    await expect(Promise.all([firstRefresh, secondRefresh])).resolves.toEqual([
      { accessToken: "fresh-access-token", expiresIn: 900 },
      { accessToken: "fresh-access-token", expiresIn: 900 }
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
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

  it("honors a caller abort signal without misreporting it as a timeout", async () => {
    const callerController = new AbortController();
    vi.mocked(fetch).mockImplementationOnce((_url, init) => {
      const requestSignal = (init as RequestInit).signal;

      return new Promise<Response>((_resolve, reject) => {
        if (requestSignal?.aborted) {
          reject(new DOMException("Aborted", "AbortError"));
          return;
        }
        requestSignal?.addEventListener("abort", () => {
          reject(new DOMException("Aborted", "AbortError"));
        });
      });
    });

    const request = httpClient.request("/affiliate/alliances/me", {
      signal: callerController.signal
    });
    callerController.abort();

    await expect(request).rejects.toMatchObject({ name: "AbortError" });
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

  it("sends protected application images as raw binary without a JSON content type", async () => {
    setAuthTokens({ accessToken: "applicant-access-token" });
    const file = new File([new Uint8Array([0xff, 0xd8, 0xff])], "portrait.jpg", { type: "image/jpeg" });
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ code: 0, message: "success", data: { id: 7 } }));

    await httpClient.request("/identity-applications/3/media", {
      body: file,
      headers: { "Content-Type": file.type },
      method: "POST"
    });

    expect(fetch).toHaveBeenCalledWith(
      "/api/v1/identity-applications/3/media",
      expect.objectContaining({
        body: file,
        headers: expect.objectContaining({
          Authorization: "Bearer applicant-access-token",
          "Content-Type": "image/jpeg"
        })
      })
    );
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

  it("adds the selected shop scope to requests made during a read-only merchant preview", async () => {
    setAuthTokens({ accessToken: "admin-access-token" });
    window.sessionStorage.setItem("needo.merchant-admin.read-only-preview", JSON.stringify({
      version: 1,
      subjectType: "shop",
      subjectId: 22,
      subjectName: "Kichijoji Family Care",
      selectedShopId: 22,
      shops: [{ id: 22, name: "Kichijoji Family Care" }],
      returnTo: "/admin/merchants"
    }));
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ code: 0, message: "success", data: { list: [] } }));

    await httpClient.request("/merchant-admin/orders");

    expect(fetch).toHaveBeenCalledWith(
      "/api/v1/merchant-admin/orders",
      expect.objectContaining({
        headers: expect.objectContaining({
          "X-NeeDo-Merchant-Preview-Shop-Id": "22"
        })
      })
    );
  });

  it("blocks merchant-preview writes in the client before they reach the network", async () => {
    setAuthTokens({ accessToken: "admin-access-token" });
    window.sessionStorage.setItem("needo.merchant-admin.read-only-preview", JSON.stringify({
      version: 1,
      subjectType: "shop",
      subjectId: 22,
      subjectName: "Kichijoji Family Care",
      selectedShopId: 22,
      shops: [{ id: 22, name: "Kichijoji Family Care" }],
      returnTo: "/admin/merchants"
    }));

    await expect(httpClient.request("/merchant-admin/shop", {
      body: { name: "Must not be saved" },
      method: "PATCH"
    })).rejects.toMatchObject({
      code: 403,
      message: "error.merchant_preview.read_only",
      status: 403
    });
    expect(fetch).not.toHaveBeenCalled();
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

  it("refreshes once after a 401 response and retries a protected data URL request", async () => {
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
      .mockResolvedValueOnce(
        new Response(new Uint8Array([1, 2, 3]), {
          headers: { "content-type": "image/png" },
          status: 200
        })
      );

    await expect(httpClient.requestDataUrl("/identity-applications/3/media/4")).resolves.toBe(
      "data:image/png;base64,AQID"
    );

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "/api/v1/identity-applications/3/media/4",
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
      "/api/v1/identity-applications/3/media/4",
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer fresh-access-token" })
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
