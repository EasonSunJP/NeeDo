import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { createServer as createNetServer } from "node:net";
import path from "node:path";
import process from "node:process";
import { resolveFormalDevConfig } from "./dev-formal-config.mjs";
import { waitForService } from "./dev-formal-runtime.mjs";
import { readGitCommonDirectory, resolveFormalMediaStorage } from "./formal-media-storage.mjs";

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const {
  backendPort,
  frontendPort,
  merchantApiPort,
  merchantApiProxyTarget,
  merchantApiRedisUrl,
  opsApiPort,
  opsApiProxyTarget,
  opsApiRedisUrl,
  proxyTarget,
  travelRouteHealthRedisUrl,
  liveDashboardRedisUrl
} = resolveFormalDevConfig(process.env);
const backendDirectory = path.resolve("backend");
const backendEnvFile = process.env.FORMAL_BACKEND_ENV_FILE || path.join(backendDirectory, ".env.dev");
const mediaStorage = resolveFormalMediaStorage({
  env: process.env,
  fileEnv: parseEnv(readFileSync(backendEnvFile, "utf8")),
  projectRoot: path.resolve("."),
  gitCommonDirectory: readGitCommonDirectory(path.resolve("."))
});
const mediaStorageEnv = {
  IM_MEDIA_STORAGE_DIR: mediaStorage.imMediaStorageDir,
  CONTENT_MEDIA_STORAGE_DIR: mediaStorage.contentMediaStorageDir
};
console.log(`[dev:formal] media storage (${mediaStorage.source})`);
console.log(`[dev:formal] IM media ${mediaStorage.imMediaStorageDir}`);
console.log(`[dev:formal] Content media ${mediaStorage.contentMediaStorageDir}`);
const tsxCommand = path.join(
  backendDirectory,
  "node_modules",
  ".bin",
  process.platform === "win32" ? "tsx.cmd" : "tsx"
);
const children = [];
let shuttingDown = false;

function withTimeout(promise, timeoutMs = 1500) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      const timer = setTimeout(() => reject(new Error("Timed out")), timeoutMs);
      timer.unref?.();
    })
  ]);
}

function isPortAvailable(port) {
  return new Promise((resolve) => {
    const probe = createNetServer();
    probe.unref();
    probe.once("error", () => resolve(false));
    probe.once("listening", () => probe.close(() => resolve(true)));
    probe.listen(port, "127.0.0.1");
  });
}

async function isApiServiceRunning(target, expectedService) {
  try {
    const response = await withTimeout(
      fetch(`${target}/api/v1/health`, { signal: AbortSignal.timeout(1200) })
    );
    const payload = await response.json();
    return response.ok && payload?.code === 0 && payload?.data?.service === expectedService;
  } catch {
    return false;
  }
}

const isFormalBackendRunning = () => isApiServiceRunning(proxyTarget, "needo-backend");
const isOpsApiRunning = () => isApiServiceRunning(opsApiProxyTarget, "needo-ops-api");
const isMerchantApiRunning = () =>
  isApiServiceRunning(merchantApiProxyTarget, "needo-merchant-api");

async function isFrontendRunning() {
  try {
    const response = await withTimeout(
      fetch(`http://127.0.0.1:${frontendPort}`, { signal: AbortSignal.timeout(1200) })
    );
    const html = await response.text();
    return response.ok && html.includes("NeeDo") && html.includes("portal-entry.js");
  } catch {
    return false;
  }
}

async function resolveServiceState(name, port, detector) {
  if (await detector()) {
    console.log(`[dev:formal] reusing ${name} on port ${port}`);
    return "reuse";
  }

  if (await isPortAvailable(port)) {
    return "free";
  }

  console.error(`[dev:formal] port ${port} is occupied by a non-NeeDo ${name} process`);
  return "blocked";
}

function start(name, command, args, options = {}) {
  const child = spawn(command, args, {
    cwd: options.cwd,
    env: { ...process.env, ...(options.env ?? {}) },
    stdio: "inherit"
  });
  child.on("error", (error) => {
    console.error(`[dev:formal] ${name} failed to start`, error);
    shutdown(1);
  });
  child.on("exit", (code, signal) => {
    if (!shuttingDown && !signal && code && code !== 0) {
      console.error(`[dev:formal] ${name} exited with code ${code}`);
      shutdown(code);
    }
  });
  children.push(child);
}

function shutdown(exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  process.exitCode = exitCode;
  children.forEach((child) => {
    if (child.exitCode === null && child.signalCode === null) child.kill("SIGTERM");
  });
  const timer = setTimeout(() => process.exit(exitCode), 1500);
  timer.unref?.();
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

const [backendState, opsApiState, merchantApiState, frontendState] = await Promise.all([
  resolveServiceState("formal backend", backendPort, isFormalBackendRunning),
  resolveServiceState("operations API", opsApiPort, isOpsApiRunning),
  resolveServiceState("merchant API", merchantApiPort, isMerchantApiRunning),
  resolveServiceState("frontend", frontendPort, isFrontendRunning)
]);

if (
  backendState === "blocked" ||
  opsApiState === "blocked" ||
  merchantApiState === "blocked" ||
  frontendState === "blocked"
) {
  process.exit(1);
}

if (backendState === "free") {
  start("formal backend", tsxCommand, ["watch", "src/server.ts"], {
    cwd: backendDirectory,
    env: {
      AUTH_TOKEN_AUDIENCE: "needo-backend",
      ...mediaStorageEnv,
      ENV_FILE: backendEnvFile,
      PORT: String(backendPort),
      SERVICE_NAME: "needo-backend",
      TRAVEL_ROUTE_HEALTH_REDIS_URL: travelRouteHealthRedisUrl,
      LIVE_DASHBOARD_REDIS_URL: liveDashboardRedisUrl
    }
  });
}

if (opsApiState === "free") {
  start("operations API", tsxCommand, ["watch", "src/ops-server.ts"], {
    cwd: backendDirectory,
    env: {
      AUTH_TOKEN_AUDIENCE: "needo-ops-api",
      ...mediaStorageEnv,
      ENV_FILE: backendEnvFile,
      PORT: String(opsApiPort),
      REDIS_URL: opsApiRedisUrl,
      SERVICE_NAME: "needo-ops-api",
      TRAVEL_ROUTE_HEALTH_REDIS_URL: travelRouteHealthRedisUrl,
      LIVE_DASHBOARD_REDIS_URL: liveDashboardRedisUrl
    }
  });
}

if (merchantApiState === "free") {
  start("merchant API", tsxCommand, ["watch", "src/merchant-server.ts"], {
    cwd: backendDirectory,
    env: {
      AUTH_TOKEN_AUDIENCE: "needo-merchant-api",
      ...mediaStorageEnv,
      ENV_FILE: backendEnvFile,
      PORT: String(merchantApiPort),
      REDIS_URL: merchantApiRedisUrl,
      SERVICE_NAME: "needo-merchant-api",
      TRAVEL_ROUTE_HEALTH_REDIS_URL: travelRouteHealthRedisUrl,
      LIVE_DASHBOARD_REDIS_URL: liveDashboardRedisUrl
    }
  });
}

if (frontendState === "free") {
  start("frontend", npmCommand, ["run", "dev:frontend", "--", "--port", String(frontendPort)], {
    env: {
      NEEDO_API_PROXY_TARGET: proxyTarget,
      NEEDO_MERCHANT_API_PROXY_TARGET: merchantApiProxyTarget,
      NEEDO_OPS_API_PROXY_TARGET: opsApiProxyTarget
    }
  });
}

try {
  await Promise.all([
    waitForService({
      name: "formal backend",
      detector: isFormalBackendRunning,
      timeoutMs: 15_000,
      intervalMs: 250
    }),
    waitForService({
      name: "operations API",
      detector: isOpsApiRunning,
      timeoutMs: 15_000,
      intervalMs: 250
    }),
    waitForService({
      name: "merchant API",
      detector: isMerchantApiRunning,
      timeoutMs: 15_000,
      intervalMs: 250
    }),
    waitForService({
      name: "frontend",
      detector: isFrontendRunning,
      timeoutMs: 15_000,
      intervalMs: 250
    })
  ]);

  console.log(`[dev:formal] frontend ready http://127.0.0.1:${frontendPort}`);
  console.log(`[dev:formal] backend ready  ${proxyTarget}/api/v1`);
  console.log(`[dev:formal] ops API ready  ${opsApiProxyTarget}/api/v1`);
  console.log(`[dev:formal] merchant API ready  ${merchantApiProxyTarget}/api/v1`);
} catch (error) {
  console.error(`[dev:formal] startup failed: ${error instanceof Error ? error.message : error}`);
  shutdown(1);
}
