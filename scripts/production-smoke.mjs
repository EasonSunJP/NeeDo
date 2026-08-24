import process from "node:process";
import { runProductionSmoke } from "./release-verification-lib.mjs";

const baseUrl = process.env.SMOKE_BASE_URL || "http://127.0.0.1:3000";

try {
  const checks = await runProductionSmoke({
    baseUrl,
    email: process.env.SMOKE_EMAIL || "",
    password: process.env.SMOKE_PASSWORD || ""
  });
  console.log(`[production-smoke] PASS ${checks.length} checks against ${baseUrl}`);
  console.log(`[production-smoke] ${checks.join(", ")}`);
} catch (error) {
  console.error(`[production-smoke] FAIL ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
