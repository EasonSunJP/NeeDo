import { spawnSync } from "node:child_process";
import { readFileSync, realpathSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseDotenv } from "dotenv";

const allowedHosts = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
const backendRoot = realpathSync(fileURLToPath(new URL("../", import.meta.url)));
const packageJson = JSON.parse(readFileSync(resolve(backendRoot, "package.json"), "utf8")) as {
  name?: string;
};

if (packageJson.name !== "@needo/backend") {
  throw new Error("Membership-ranking check must run from the canonical NeeDo backend package");
}

const envFileInput = process.env.FORMAL_BACKEND_ENV_FILE?.trim();
if (!envFileInput) {
  throw new Error("check:membership-ranking requires FORMAL_BACKEND_ENV_FILE");
}
const envFile = realpathSync(resolve(process.cwd(), envFileInput));
const parsedEnv = parseDotenv(readFileSync(envFile));
const databaseUrl = parsedEnv.DATABASE_URL?.trim();
if (!databaseUrl) {
  throw new Error("FORMAL_BACKEND_ENV_FILE must define DATABASE_URL");
}
if ([parsedEnv.NODE_ENV, parsedEnv.DEPLOY_ENV, process.env.NODE_ENV, process.env.DEPLOY_ENV]
  .some((value) => value !== undefined && /prod|production|staging/iu.test(value))) {
  throw new Error("Membership-ranking check refuses production and staging environments");
}

let parsedDatabaseUrl: URL;
try {
  parsedDatabaseUrl = new URL(databaseUrl);
} catch {
  throw new Error("Membership-ranking check requires a valid MySQL DATABASE_URL");
}
const database = decodeURIComponent(parsedDatabaseUrl.pathname.replace(/^\/+/, ""));
if (
  parsedDatabaseUrl.protocol !== "mysql:" ||
  !allowedHosts.has(parsedDatabaseUrl.hostname) ||
  database !== "needo_test"
) {
  throw new Error("Membership-ranking check requires an explicit loopback needo_test database");
}

const acceptanceSuites = [
  "tests/membership-analytics.repository.integration.test.ts",
  "tests/analytics-ranking.repository.integration.test.ts",
  "tests/membership-analytics.repository.test.ts",
  "tests/shop-membership-card-issuance.service.test.ts",
  "tests/analytics-ranking.repository.test.ts"
] as const;

const result = spawnSync(
  process.execPath,
  [
    resolve(backendRoot, "scripts/run-jest-suite.cjs"),
    ...acceptanceSuites,
    "--runInBand"
  ],
  {
    cwd: backendRoot,
    env: {
      ...process.env,
      FORMAL_BACKEND_ENV_FILE: envFile,
      RUN_MEMBERSHIP_ANALYTICS_MYSQL_INTEGRATION: "true",
      RUN_ANALYTICS_RANKING_MYSQL_INTEGRATION: "true"
    },
    stdio: "inherit"
  }
);

if (result.error) throw result.error;
if (result.status !== 0) {
  throw new Error(`Membership-ranking acceptance failed with status ${String(result.status)}`);
}

console.info(JSON.stringify({
  ok: true,
  database,
  rollbackFixtures: 2,
  suites: acceptanceSuites
}));
