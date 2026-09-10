function parsePort(value, fallback, field) {
  if (value == null || String(value).trim() === "") {
    return fallback;
  }

  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`${field} must be an integer between 1 and 65535`);
  }

  return port;
}

function parseRedisUrl(value, fallback, field) {
  const candidate = value == null || String(value).trim() === "" ? fallback : String(value).trim();
  let parsed;
  try {
    parsed = new URL(candidate);
  } catch {
    throw new Error(`${field} must be a valid Redis URL`);
  }
  if (parsed.protocol !== "redis:" && parsed.protocol !== "rediss:") {
    throw new Error(`${field} must use redis: or rediss:`);
  }
  return candidate.replace(/\/+$/, "");
}

export function resolveFormalDevConfig(env) {
  const backendPort = parsePort(env.FORMAL_BACKEND_PORT, 3000, "FORMAL_BACKEND_PORT");
  const opsApiPort = parsePort(env.FORMAL_OPS_API_PORT, 3001, "FORMAL_OPS_API_PORT");
  const merchantApiPort = parsePort(
    env.FORMAL_MERCHANT_API_PORT,
    3002,
    "FORMAL_MERCHANT_API_PORT"
  );
  const frontendPort = parsePort(env.FRONTEND_PORT, 5180, "FRONTEND_PORT");
  const ports = [backendPort, opsApiPort, merchantApiPort, frontendPort];
  if (new Set(ports).size !== ports.length) {
    throw new Error("Formal backend, ops API, merchant API, and frontend ports must be distinct");
  }
  const opsApiRedisUrl = parseRedisUrl(
    env.FORMAL_OPS_API_REDIS_URL,
    "redis://127.0.0.1:6379/1",
    "FORMAL_OPS_API_REDIS_URL"
  );
  const merchantApiRedisUrl = parseRedisUrl(
    env.FORMAL_MERCHANT_API_REDIS_URL,
    "redis://127.0.0.1:6379/2",
    "FORMAL_MERCHANT_API_REDIS_URL"
  );
  const travelRouteHealthRedisUrl = parseRedisUrl(
    env.FORMAL_TRAVEL_ROUTE_HEALTH_REDIS_URL,
    "redis://127.0.0.1:6379/0",
    "FORMAL_TRAVEL_ROUTE_HEALTH_REDIS_URL"
  );
  if (opsApiRedisUrl === merchantApiRedisUrl) {
    throw new Error("Operations and merchant API Redis URLs must be distinct");
  }
  const liveDashboardRedisUrl = parseRedisUrl(
    env.FORMAL_LIVE_DASHBOARD_REDIS_URL,
    travelRouteHealthRedisUrl,
    "FORMAL_LIVE_DASHBOARD_REDIS_URL"
  );

  return {
    backendPort,
    frontendPort,
    merchantApiPort,
    merchantApiProxyTarget: `http://127.0.0.1:${merchantApiPort}`,
    merchantApiRedisUrl,
    opsApiPort,
    opsApiProxyTarget: `http://127.0.0.1:${opsApiPort}`,
    opsApiRedisUrl,
    proxyTarget: `http://127.0.0.1:${backendPort}`,
    travelRouteHealthRedisUrl,
    liveDashboardRedisUrl
  };
}
