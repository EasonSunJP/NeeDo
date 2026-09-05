import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { parse as parseDotenv } from "dotenv";
import mariadb, { type ConnectionConfig } from "mariadb";

type RuntimeEnvironment = Record<string, string | undefined>;

type BaseEnvironmentInput = {
  envFile: string | undefined;
  fileExists?: (path: string) => boolean;
  parsedEnvironment?: RuntimeEnvironment;
};

type SqlConnection = {
  query(sql: string, values?: unknown[]): Promise<unknown>;
  escape(value: string): string;
};

export type ExchangeCancellationBaseEnvironment = {
  envFile: string;
  source: string;
  parsedEnvironment: RuntimeEnvironment;
  databaseUrl: URL;
};

export type ExchangeCancellationScratchTarget = {
  baseDatabaseName: string;
  databaseName: string;
  databaseUrl: string;
  username: string;
  password: string;
};

export type ExchangeCancellationScratchResult = {
  baseDatabaseName: string;
  databaseName: string;
  cleanupVerified: boolean;
  existingDatabaseModified: false;
};

const loopbackHosts = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);
const scratchDatabasePattern = /^needo_exchange_cancel_[a-f0-9]{24}$/u;
const scratchUsernamePattern = /^neec_[a-f0-9]{24}$/u;

export const validateExchangeCancellationBaseEnvironment = (
  input: BaseEnvironmentInput | undefined
): ExchangeCancellationBaseEnvironment => {
  const resolvedInput = input ?? { envFile: undefined };
  const envFile = resolvedInput.envFile?.trim();
  if (!envFile) throw new Error("FORMAL_BACKEND_ENV_FILE is required");
  const fileExists = resolvedInput.fileExists ?? existsSync;
  if (!fileExists(envFile)) throw new Error("FORMAL_BACKEND_ENV_FILE does not exist");

  const source = resolvedInput.parsedEnvironment ? "" : readFileSync(envFile, "utf8");
  const parsedEnvironment = resolvedInput.parsedEnvironment ?? parseDotenv(source);
  if (
    [parsedEnvironment.NODE_ENV, parsedEnvironment.DEPLOY_ENV].some((value) =>
      /^(?:prod|production|staging)$/iu.test(value?.trim() ?? "")
    )
  ) {
    throw new Error("Exchange cancellation flow checker rejects production and staging runtimes");
  }
  if (
    !["development", "test"].includes(parsedEnvironment.NODE_ENV ?? "") ||
    !["local", "development", "test"].includes(parsedEnvironment.DEPLOY_ENV ?? "")
  ) {
    throw new Error("Exchange cancellation checker requires explicit local non-production labels");
  }

  let databaseUrl: URL;
  try {
    databaseUrl = new URL(parsedEnvironment.DATABASE_URL ?? "");
  } catch {
    throw new Error("FORMAL_BACKEND_ENV_FILE must define a valid DATABASE_URL");
  }
  if (databaseUrl.protocol !== "mysql:") {
    throw new Error("Exchange cancellation flow checker only accepts MySQL");
  }
  if (!loopbackHosts.has(databaseUrl.hostname)) {
    throw new Error("Exchange cancellation flow checker only accepts loopback MySQL");
  }
  const databaseName = decodeURIComponent(databaseUrl.pathname.replace(/^\/+/, ""));
  if (!databaseName || /(?:^|[_-])(?:prod|production|staging)(?:$|[_-])/iu.test(databaseName)) {
    throw new Error("Exchange cancellation flow checker rejects unsafe base database names");
  }

  return { envFile, source, parsedEnvironment, databaseUrl };
};

export const createExchangeCancellationScratchTarget = (
  baseDatabaseUrl: string,
  suffix: string,
  password = randomBytes(24).toString("base64url")
): ExchangeCancellationScratchTarget => {
  if (!/^[a-f0-9]{24}$/u.test(suffix)) {
    throw new Error("Exchange cancellation scratch suffix must be 24 lowercase hex characters");
  }
  const databaseUrl = new URL(baseDatabaseUrl);
  const baseDatabaseName = decodeURIComponent(databaseUrl.pathname.replace(/^\/+/, ""));
  const databaseName = `needo_exchange_cancel_${suffix}`;
  const username = `neec_${suffix}`;
  databaseUrl.pathname = `/${databaseName}`;
  databaseUrl.username = username;
  databaseUrl.password = password;
  return {
    baseDatabaseName,
    databaseName,
    databaseUrl: databaseUrl.toString(),
    username,
    password
  };
};

export const requireExchangeCancellationScratchEnvironment = (envFileValue: string | undefined) => {
  const envFile = envFileValue?.trim();
  if (!envFile) {
    throw new Error("Exchange cancellation integration requires FORMAL_BACKEND_ENV_FILE");
  }
  const parsed = parseDotenv(readFileSync(envFile, "utf8"));
  const databaseUrl = new URL(parsed.DATABASE_URL ?? "");
  const databaseName = decodeURIComponent(databaseUrl.pathname.replace(/^\/+/, ""));
  const username = decodeURIComponent(databaseUrl.username);
  if (
    databaseUrl.protocol !== "mysql:" ||
    !loopbackHosts.has(databaseUrl.hostname) ||
    !scratchDatabasePattern.test(databaseName) ||
    !scratchUsernamePattern.test(username) ||
    !databaseUrl.password
  ) {
    throw new Error("Exchange cancellation integration requires a dedicated scratch database");
  }
  return { envFile, databaseName, username, databaseUrl };
};

const run = (command: string, args: string[], environment: NodeJS.ProcessEnv): void => {
  const result = spawnSync(command, args, {
    cwd: resolve(__dirname, ".."),
    env: environment,
    stdio: "inherit"
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed with status ${String(result.status)}`);
  }
};

const scratchEnvironmentSource = (
  base: ExchangeCancellationBaseEnvironment,
  databaseUrl: string
): string => {
  const forbidden = new Set([
    "DATABASE_URL",
    "MYSQL_ROOT_PASSWORD",
    "EXCHANGE_CANCELLATION_MYSQL_ADMIN_PASSWORD"
  ]);
  const retained = Object.entries(base.parsedEnvironment)
    .filter(([key, value]) => !forbidden.has(key) && value !== undefined)
    .map(([key, value]) => `${key}=${JSON.stringify(value)}`);
  retained.push(`DATABASE_URL=${JSON.stringify(databaseUrl)}`);
  return `${retained.join("\n")}\n`;
};

export async function runExchangeCancellationScratchCheck(
  base: ExchangeCancellationBaseEnvironment,
  connection: SqlConnection,
  checks: (environment: NodeJS.ProcessEnv) => Promise<void>
): Promise<ExchangeCancellationScratchResult> {
  const scratch = createExchangeCancellationScratchTarget(
    base.databaseUrl.toString(),
    randomBytes(12).toString("hex")
  );
  const principal = `${connection.escape(scratch.username)}@${connection.escape("%")}`;
  const tempDirectory = await mkdtemp(join(tmpdir(), "needo-exchange-cancellation-"));
  const scratchEnvFile = join(tempDirectory, "integration.env");
  let createdDatabase = false;
  let createdUser = false;
  let checkError: unknown;
  const cleanupErrors: unknown[] = [];

  try {
    await connection.query(
      `CREATE DATABASE \`${scratch.databaseName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
    );
    createdDatabase = true;
    await connection.query(
      `CREATE USER ${principal} IDENTIFIED BY ${connection.escape(scratch.password)}`
    );
    createdUser = true;
    await connection.query(`GRANT ALL PRIVILEGES ON \`${scratch.databaseName}\`.* TO ${principal}`);
    await writeFile(scratchEnvFile, scratchEnvironmentSource(base, scratch.databaseUrl), {
      encoding: "utf8",
      mode: 0o600
    });
    requireExchangeCancellationScratchEnvironment(scratchEnvFile);
    await checks({
      ...process.env,
      ENV_FILE: scratchEnvFile,
      FORMAL_BACKEND_ENV_FILE: scratchEnvFile,
      DATABASE_URL: scratch.databaseUrl,
      RUN_EXCHANGE_CANCELLATION_INTEGRATION: "true",
      MYSQL_ROOT_PASSWORD: undefined,
      EXCHANGE_CANCELLATION_MYSQL_ADMIN_PASSWORD: undefined
    });
  } catch (error) {
    checkError = error;
  } finally {
    if (createdDatabase) {
      try {
        await connection.query(`DROP DATABASE \`${scratch.databaseName}\``);
      } catch (error) {
        cleanupErrors.push(error);
      }
    }
    if (createdUser) {
      try {
        await connection.query(
          `REVOKE ALL PRIVILEGES ON \`${scratch.databaseName}\`.* FROM ${principal}`
        );
      } catch (error) {
        cleanupErrors.push(error);
      }
      try {
        await connection.query(`DROP USER ${principal}`);
      } catch (error) {
        cleanupErrors.push(error);
      }
    }
    try {
      const rows = (await connection.query(
        "SELECT COUNT(*) AS total FROM information_schema.schemata WHERE schema_name=?",
        [scratch.databaseName]
      )) as Array<{ total?: number | bigint }>;
      if (Number(rows[0]?.total ?? 1) !== 0) {
        cleanupErrors.push(new Error("scratch database still exists"));
      }
    } catch (error) {
      cleanupErrors.push(error);
    }
    await rm(tempDirectory, { recursive: true, force: true });
  }

  if (cleanupErrors.length > 0) {
    throw new AggregateError(cleanupErrors, "Exchange cancellation scratch cleanup failed");
  }
  if (checkError) throw checkError;
  return {
    baseDatabaseName: scratch.baseDatabaseName,
    databaseName: scratch.databaseName,
    cleanupVerified: true,
    existingDatabaseModified: false
  };
}

async function main(): Promise<void> {
  const base = validateExchangeCancellationBaseEnvironment({
    envFile: process.env.FORMAL_BACKEND_ENV_FILE
  });
  const adminUsername = process.env.EXCHANGE_CANCELLATION_MYSQL_ADMIN_USER?.trim() || "root";
  const connectionOptions: ConnectionConfig = {
    host: base.databaseUrl.hostname === "[::1]" ? "::1" : base.databaseUrl.hostname,
    ...(base.databaseUrl.port ? { port: Number(base.databaseUrl.port) } : {}),
    user: adminUsername,
    ...(process.env.EXCHANGE_CANCELLATION_MYSQL_ADMIN_PASSWORD !== undefined
      ? { password: process.env.EXCHANGE_CANCELLATION_MYSQL_ADMIN_PASSWORD }
      : {}),
    ...(base.parsedEnvironment.MYSQL_SOCKET_PATH
      ? { socketPath: base.parsedEnvironment.MYSQL_SOCKET_PATH }
      : {}),
    ...(base.parsedEnvironment.DATABASE_ALLOW_PUBLIC_KEY_RETRIEVAL === "true"
      ? { allowPublicKeyRetrieval: true }
      : {}),
    connectTimeout: 5_000,
    timezone: "Z"
  };
  const connection = await mariadb.createConnection(connectionOptions);
  try {
    const result = await runExchangeCancellationScratchCheck(
      base,
      connection,
      async (environment) => {
        run("npm", ["run", "prisma:migrate:deploy"], environment);
        run(
          process.execPath,
          [
            resolve(__dirname, "run-jest-suite.cjs"),
            "--runTestsByPath",
            "tests/exchange-cancellation.repository.integration.test.ts",
            "--runInBand"
          ],
          environment
        );
      }
    );
    console.info(JSON.stringify({ check: "exchange-cancellation-flow", ...result }));
  } finally {
    await connection.end();
  }
}

if (process.env.JEST_WORKER_ID === undefined && require.main === module) {
  void main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "Exchange cancellation check failed";
    console.error(JSON.stringify({ check: "exchange-cancellation-flow", ok: false, message }));
    process.exitCode = 1;
  });
}
