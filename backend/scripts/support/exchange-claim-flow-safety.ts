import { config as loadDotenv } from "dotenv";
import { existsSync } from "node:fs";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

export type ExchangeClaimFlowTarget = {
  envFile: string;
  databaseName: string;
  maskedDatabaseTarget: string;
};

export function requireSafeExchangeClaimFlowEnvironment(
  envFileValue: string | undefined,
  fileExists: (path: string) => boolean = existsSync
): ExchangeClaimFlowTarget {
  const envFile = envFileValue?.trim();
  assert(envFile, "Exchange claim flow checker requires an explicit ENV_FILE");
  assert(fileExists(envFile), `environment file was not found: ${envFile}`);

  const loaded = loadDotenv({ path: envFile, override: true });
  assert(!loaded.error, `environment file could not be loaded: ${envFile}`);
  const nodeEnvironment = (process.env.NODE_ENV ?? "").trim().toLowerCase();
  const deployEnvironment = (process.env.DEPLOY_ENV ?? "").trim().toLowerCase();
  assert(
    !["production", "prod", "staging"].includes(nodeEnvironment) &&
      !["production", "prod", "staging"].includes(deployEnvironment),
    "Exchange claim flow checker rejects production and staging runtimes"
  );

  let databaseUrl: URL;
  try {
    databaseUrl = new URL(process.env.DATABASE_URL ?? "");
  } catch {
    throw new Error("Exchange claim flow checker requires a valid DATABASE_URL");
  }
  assert(databaseUrl.protocol === "mysql:", "Exchange claim flow checker only accepts MySQL");
  assert(
    ["localhost", "127.0.0.1", "[::1]"].includes(databaseUrl.hostname),
    "Exchange claim flow checker only accepts localhost or 127.0.0.1"
  );
  const databaseName = decodeURIComponent(databaseUrl.pathname.replace(/^\/+/, ""));
  assert(databaseName, "DATABASE_URL must include a database name");
  assert(
    !/(?:^|[_-])(?:prod|production|staging)(?:$|[_-])/iu.test(databaseName),
    "Exchange claim flow checker rejects production-looking database names"
  );
  const port = databaseUrl.port ? `:${databaseUrl.port}` : "";
  return {
    envFile,
    databaseName,
    maskedDatabaseTarget: `mysql://${databaseUrl.hostname}${port}/${databaseName}`
  };
}
