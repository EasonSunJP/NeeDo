import { spawn } from "node:child_process";
import { createServer as createNetServer } from "node:net";
import path from "node:path";
import process from "node:process";
import { resolveFormalDevConfig } from "./dev-formal-config.mjs";

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const { backendPort, frontendPort, proxyTarget } = resolveFormalDevConfig(process.env);
const backendDirectory = path.resolve("backend");
const backendEnvFile = process.env.FORMAL_BACKEND_ENV_FILE || path.join(backendDirectory, ".env.dev");
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

async function isFormalBackendRunning() {
  try {
    const response = await withTimeout(
      fetch(`${proxyTarget}/api/v1/health`, { signal: AbortSignal.timeout(1200) })
    );
    const payload = await response.json();
    return response.ok && payload?.code === 0 && payload?.data?.service === "needo-backend";
  } catch {
    return false;
  }
}

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
  children.forEach((child) => {
    if (child.exitCode === null && child.signalCode === null) child.kill("SIGTERM");
  });
  const timer = setTimeout(() => process.exit(exitCode), 1500);
  timer.unref?.();
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

const [backendState, frontendState] = await Promise.all([
  resolveServiceState("formal backend", backendPort, isFormalBackendRunning),
  resolveServiceState("frontend", frontendPort, isFrontendRunning)
]);

if (backendState === "blocked" || frontendState === "blocked") {
  process.exit(1);
}

if (backendState === "free") {
  start("formal backend", tsxCommand, ["watch", "src/server.ts"], {
    cwd: backendDirectory,
    env: { ENV_FILE: backendEnvFile, PORT: String(backendPort) }
  });
}

if (frontendState === "free") {
  start("frontend", npmCommand, ["run", "dev:frontend", "--", "--port", String(frontendPort)], {
    env: { NEEDO_API_PROXY_TARGET: proxyTarget }
  });
}

console.log(`[dev:formal] frontend http://127.0.0.1:${frontendPort}`);
console.log(`[dev:formal] backend  ${proxyTarget}/api/v1`);
