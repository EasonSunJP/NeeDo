import { spawn } from "node:child_process";
import { createServer as createNetServer } from "node:net";

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const children = [];
let shuttingDown = false;
const frontendPort = Number(process.env.FRONTEND_PORT || 5180);
const backendPort = Number(process.env.MOCK_BACKEND_PORT || 4176);

function start(name, script) {
  const child = spawn(npmCommand, ["run", script], {
    stdio: "inherit",
    env: process.env
  });

  child.on("error", (error) => {
    console.error(`[${name}] failed to start`, error);
    shutdown(1);
  });

  child.on("exit", (code, signal) => {
    if (signal) {
      console.log(`[${name}] exited via signal ${signal}`);
      return;
    }

    if (code && code !== 0) {
      console.error(`[${name}] exited with code ${code}`);
      shutdown(code);
    }
  });

  children.push({ name, child });
}

function terminateChild({ name, child }, signal) {
  if (child.exitCode !== null || child.signalCode !== null) {
    return;
  }

  try {
    // Keep child processes attached to this launcher so closing the terminal
    // does not leave orphaned Vite / mock-backend instances occupying ports.
    child.kill(signal);
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ESRCH") {
      return;
    }

    console.error(`[dev-all] failed to stop ${name} with ${signal}`, error);
  }
}

function shutdown(exitCode = 0) {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;

  for (const entry of children) {
    terminateChild(entry, "SIGTERM");
  }

  // Give npm/vite/node a moment to unwind before we leave; if a child
  // ignores SIGTERM we force-kill the detached process group.
  const shutdownTimer = setTimeout(() => {
    for (const entry of children) {
      terminateChild(entry, "SIGKILL");
    }

    process.exit(exitCode);
  }, 1500);

  shutdownTimer.unref?.();
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

function withTimeout(promise, timeoutMs = 1200) {
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

    probe.once("error", (error) => {
      probe.close();

      if (error?.code === "EADDRINUSE") {
        resolve(false);
        return;
      }

      console.error(`[dev-all] failed to probe port ${port}`, error);
      resolve(false);
    });

    probe.once("listening", () => {
      probe.close(() => resolve(true));
    });

    probe.listen(port, "0.0.0.0");
  });
}

async function isNeedoFrontendRunning(port) {
  try {
    const response = await withTimeout(fetch(`http://127.0.0.1:${port}`));

    if (!response.ok) {
      return false;
    }

    const html = await response.text();

    return html.includes("NeeDo") && html.includes("portal-entry.js");
  } catch {
    return false;
  }
}

async function isNeedoMockBackendRunning(port) {
  try {
    const response = await withTimeout(fetch(`http://127.0.0.1:${port}/health`));

    if (!response.ok) {
      return false;
    }

    const payload = await response.json();

    return payload?.mode === "mock-backend";
  } catch {
    return false;
  }
}

async function resolveServiceState(name, port, detector) {
  if (await isPortAvailable(port)) {
    return "free";
  }

  if (await detector(port)) {
    console.log(`[dev-all] ${name} already running on port ${port}, reusing existing service`);
    return "reuse";
  }

  console.error(`[dev-all] port ${port} is occupied by another process, cannot safely start ${name}`);
  return "blocked";
}

console.log("[dev-all] starting frontend and mock backend");
console.log("[dev-all] frontend: npm run dev:frontend");
console.log("[dev-all] backend:  npm run dev:backend");

const frontendState = await resolveServiceState("frontend", frontendPort, isNeedoFrontendRunning);
const backendState = await resolveServiceState("backend", backendPort, isNeedoMockBackendRunning);

if (frontendState === "blocked" || backendState === "blocked") {
  process.exit(1);
}

if (frontendState === "free") {
  start("frontend", "dev:frontend");
}

if (backendState === "free") {
  start("backend", "dev:backend");
}

if (children.length === 0) {
  console.log("[dev-all] frontend and backend are already available on their default ports");
}
