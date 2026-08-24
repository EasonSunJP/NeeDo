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

export function resolveFormalDevConfig(env) {
  const backendPort = parsePort(env.FORMAL_BACKEND_PORT, 3000, "FORMAL_BACKEND_PORT");
  const frontendPort = parsePort(env.FRONTEND_PORT, 5180, "FRONTEND_PORT");

  return {
    backendPort,
    frontendPort,
    proxyTarget: `http://127.0.0.1:${backendPort}`
  };
}
