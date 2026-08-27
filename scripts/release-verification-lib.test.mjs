import { describe, expect, it, vi } from "vitest";
import {
  hasBenchmarkErrors,
  percentile,
  resolveApiBaseUrl,
  runProductionSmoke,
  summarizeDurations
} from "./release-verification-lib.mjs";

function jsonResponse(data) {
  return new Response(JSON.stringify({ code: 0, message: "success", data }), {
    status: 200,
    headers: { "content-type": "application/json" }
  });
}

describe("release verification helpers", () => {
  it("normalizes the formal API base URL", () => {
    expect(resolveApiBaseUrl("https://needo.dackou.com/")).toBe(
      "https://needo.dackou.com/api/v1"
    );
    expect(resolveApiBaseUrl("http://127.0.0.1:3102/api/v1")).toBe(
      "http://127.0.0.1:3102/api/v1"
    );
  });

  it("calculates nearest-rank latency percentiles", () => {
    expect(percentile([40, 10, 30, 20], 0.5)).toBe(20);
    expect(summarizeDurations([10, 20, 30, 40])).toEqual({
      count: 4,
      p50Ms: 20,
      p95Ms: 40,
      p99Ms: 40,
      maxMs: 40
    });
    expect(hasBenchmarkErrors([{ errors: 0 }, { errors: 1 }])).toBe(true);
    expect(hasBenchmarkErrors([{ errors: 0 }])).toBe(false);
  });

  it("checks public and authenticated formal flows without logging secrets", async () => {
    const requests = [];
    const fetchImpl = vi.fn(async (url, options = {}) => {
      requests.push({ url, options });
      if (String(url).endsWith("/health")) return jsonResponse({ status: "ok" });
      if (String(url).endsWith("/ready")) return jsonResponse({ status: "ready" });
      if (String(url).endsWith("/auth/login")) {
        return jsonResponse({ accessToken: "access-secret", refreshToken: "refresh-secret" });
      }
      return jsonResponse({ list: [] });
    });

    const checks = await runProductionSmoke({
      baseUrl: "https://needo.dackou.com",
      email: "smoke@example.test",
      password: "secret",
      fetchImpl
    });

    expect(checks).toEqual([
      "health",
      "ready",
      "categories",
      "services",
      "home",
      "login",
      "auth-me",
      "logout"
    ]);
    expect(requests.map((request) => request.url)).toContain(
      "https://needo.dackou.com/api/v1/auth/me"
    );
    const loginRequest = requests.find((request) => String(request.url).endsWith("/auth/login"));
    expect(JSON.parse(loginRequest.options.body)).toEqual({
      loginIdentifier: "smoke@example.test",
      password: "secret"
    });
    expect(requests.at(-1).options.headers.authorization).toBe("Bearer access-secret");
  });
});
