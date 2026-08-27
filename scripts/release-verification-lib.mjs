export function resolveApiBaseUrl(value) {
  const normalized = String(value || "").trim().replace(/\/+$/, "");
  const parsed = new URL(normalized);

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error("BASE_URL must use http or https");
  }

  return normalized.endsWith("/api/v1") ? normalized : `${normalized}/api/v1`;
}

export function percentile(values, quantile) {
  if (values.length === 0) {
    return 0;
  }

  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.ceil(sorted.length * quantile) - 1);

  return sorted[Math.max(0, index)];
}

export function summarizeDurations(values) {
  return {
    count: values.length,
    p50Ms: Number(percentile(values, 0.5).toFixed(2)),
    p95Ms: Number(percentile(values, 0.95).toFixed(2)),
    p99Ms: Number(percentile(values, 0.99).toFixed(2)),
    maxMs: Number(Math.max(0, ...values).toFixed(2))
  };
}

export function hasBenchmarkErrors(results) {
  return results.some((result) => result.errors > 0);
}

export async function requestEnvelope(fetchImpl, url, options = {}) {
  const response = await fetchImpl(url, options);
  const contentType = response.headers.get("content-type") || "";
  const body = contentType.includes("json") ? await response.json() : null;

  if (!response.ok || body?.code !== 0 || body?.data == null) {
    throw new Error(
      `${options.method || "GET"} ${url} failed: HTTP ${response.status} ${body?.message || "invalid response"}`
    );
  }

  return body.data;
}

export async function runProductionSmoke({
  baseUrl,
  email = "",
  password = "",
  fetchImpl = fetch
}) {
  const apiBaseUrl = resolveApiBaseUrl(baseUrl);
  const checks = [];
  const get = async (name, path, options) => {
    const data = await requestEnvelope(fetchImpl, `${apiBaseUrl}${path}`, options);
    checks.push(name);
    return data;
  };

  const health = await get("health", "/health");
  if (!['ok', 'degraded'].includes(health.status)) {
    throw new Error(`Unexpected health status: ${health.status}`);
  }

  const readiness = await get("ready", "/ready");
  if (readiness.status !== "ready") {
    throw new Error(`Backend is not ready: ${readiness.status}`);
  }

  await get("categories", "/categories?page=1&pageSize=1");
  await get("services", "/services?page=1&pageSize=1&sort=recommended");
  await get("home", "/home/recommendations?city=tokyo&limit=1");

  if (email || password) {
    if (!email || !password) {
      throw new Error("SMOKE_EMAIL and SMOKE_PASSWORD must be provided together");
    }

    const login = await get("login", "/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ loginIdentifier: email, password })
    });
    if (!login.accessToken || !login.refreshToken) {
      throw new Error("Login response did not include access and refresh tokens");
    }

    const authorization = { authorization: `Bearer ${login.accessToken}` };
    await get("auth-me", "/auth/me", { headers: authorization });
    await get("logout", "/auth/logout", {
      method: "POST",
      headers: { ...authorization, "content-type": "application/json" },
      body: JSON.stringify({ refreshToken: login.refreshToken })
    });
  }

  return checks;
}
