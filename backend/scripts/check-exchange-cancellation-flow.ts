import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";
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
  const { envFile, databaseUrl } = validateExchangeCancellationBaseEnvironment({
    envFile: envFileValue
  });
  const databaseName = decodeURIComponent(databaseUrl.pathname.replace(/^\/+/, ""));
  const username = decodeURIComponent(databaseUrl.username);
  if (
    databaseUrl.protocol !== "mysql:" ||
    !loopbackHosts.has(databaseUrl.hostname) ||
    !scratchDatabasePattern.test(databaseName) ||
    !scratchUsernamePattern.test(username) ||
    username.slice("neec_".length) !== databaseName.slice("needo_exchange_cancel_".length) ||
    !databaseUrl.password
  ) {
    throw new Error("Exchange cancellation integration requires a dedicated scratch database");
  }
  return { envFile, databaseName, username, databaseUrl };
};

export const runExchangeCancellationCommand = (
  command: string,
  args: string[],
  environment: NodeJS.ProcessEnv
): void => {
  const result = spawnSync(command, args, {
    cwd: resolve(__dirname, ".."),
    env: environment,
    stdio: "pipe",
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024
  });
  const password = new URL(environment.DATABASE_URL!).password;
  const secrets = [
    environment.DATABASE_URL,
    password,
    decodeURIComponent(password),
    ...Object.entries(environment)
      .filter(([key]) => /PASSWORD|SECRET|TOKEN|API_KEY/u.test(key))
      .map(([, value]) => value)
  ].filter((value): value is string => Boolean(value));
  let output = (result.stdout ?? "") + (result.stderr ?? "");
  for (const secret of secrets.sort((a, b) => b.length - a.length)) {
    output = output.replaceAll(secret, "[redacted]");
  }
  output = output.replace(/mysql:\/\/[^\s"']+/gu, "mysql://[redacted]");
  process.stdout.write(output);
  if (result.error || result.status !== 0) {
    throw new Error("Exchange cancellation migration or integration command failed");
  }
};

export const resolveExchangeCancellationAdminCredentials = (
  source: RuntimeEnvironment,
  runtime: RuntimeEnvironment,
  isSocket: (path: string) => boolean = (path) => {
    try {
      return statSync(path).isSocket();
    } catch {
      return false;
    }
  }
): { user: string; password?: string; socketPath?: string } => {
  const socketPath = runtime.EXCHANGE_CANCELLATION_MYSQL_ADMIN_SOCKET_PATH?.trim();
  if (socketPath) {
    if (!isAbsolute(socketPath) || !isSocket(socketPath)) {
      throw new Error(
        "Administrator socket authentication requires an existing absolute Unix socket"
      );
    }
    return { user: "root", socketPath };
  }
  const explicitUser = runtime.EXCHANGE_CANCELLATION_MYSQL_ADMIN_USER?.trim();
  const user = explicitUser || (source.MYSQL_ROOT_PASSWORD !== undefined ? "root" : undefined);
  const password =
    runtime.EXCHANGE_CANCELLATION_MYSQL_ADMIN_PASSWORD ??
    (user === "root" ? source.MYSQL_ROOT_PASSWORD : undefined);
  if (!user || !password) {
    throw new Error("Explicit MySQL administrator credentials are required");
  }
  return { user, password };
};

export const verifyExchangeCancellationSocketAdmin = async (
  connection: Pick<SqlConnection, "query">
): Promise<void> => {
  const rows = (await connection.query("SELECT CURRENT_USER() AS principal")) as Array<{
    principal: string;
  }>;
  if (rows.length !== 1 || rows[0]?.principal !== "root@localhost") {
    throw new Error("Explicit socket administrator must be root@localhost");
  }
};

const scratchEnvironmentSource = (
  base: ExchangeCancellationBaseEnvironment,
  databaseUrl: string
): string => {
  const forbidden = new Set([
    "DATABASE_URL",
    "MYSQL_ROOT_PASSWORD",
    "EXCHANGE_CANCELLATION_MYSQL_ADMIN_USER",
    "EXCHANGE_CANCELLATION_MYSQL_ADMIN_SOCKET_PATH",
    "EXCHANGE_CANCELLATION_MYSQL_ADMIN_PASSWORD"
  ]);
  const retained = Object.entries(base.parsedEnvironment)
    // Integration setup supplies its own test auth secrets; source credentials are unnecessary.
    .filter(
      ([key, value]) =>
        !forbidden.has(key) && !/PASSWORD|SECRET|TOKEN|API_KEY/u.test(key) && value !== undefined
    )
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
  const principal = `${connection.escape(scratch.username)}@${connection.escape("localhost")}`;
  // Database privileges use SQL wildcard matching; grant only the exact generated name.
  const grantDatabase = scratch.databaseName.replaceAll("_", "\\_");
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
    await connection.query(`GRANT ALL PRIVILEGES ON \`${grantDatabase}\`.* TO ${principal}`);
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
      EXCHANGE_CANCELLATION_MYSQL_ADMIN_USER: undefined,
      EXCHANGE_CANCELLATION_MYSQL_ADMIN_SOCKET_PATH: undefined,
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
        await connection.query(`REVOKE ALL PRIVILEGES, GRANT OPTION FROM ${principal}`);
      } catch (error) {
        cleanupErrors.push(error);
      }
      try {
        await connection.query(`DROP USER ${principal}`);
      } catch (error) {
        cleanupErrors.push(error);
      }
    }
    for (const [sql, value] of [
      [
        "SELECT COUNT(*) AS total FROM information_schema.schemata WHERE schema_name=?",
        scratch.databaseName
      ],
      ["SELECT COUNT(*) AS total FROM mysql.user WHERE User=?", scratch.username],
      ["SELECT COUNT(*) AS total FROM mysql.db WHERE User=?", scratch.username]
    ] as const) {
      try {
        const rows = (await connection.query(sql, [value])) as Array<{ total?: number | bigint }>;
        if (Number(rows[0]?.total ?? 1) !== 0) {
          cleanupErrors.push(new Error("scratch database or authority still exists"));
        }
      } catch (error) {
        cleanupErrors.push(error);
      }
    }
    try {
      await rm(tempDirectory, { recursive: true, force: true });
      if (existsSync(tempDirectory))
        cleanupErrors.push(new Error("scratch credentials directory remains"));
    } catch (error) {
      cleanupErrors.push(error);
    }
    console.info(
      JSON.stringify({
        check: "exchange-cancellation-cleanup",
        databaseName: scratch.databaseName,
        cleanupVerified: cleanupErrors.length === 0,
        existingDatabaseModified: false
      })
    );
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

let checkerStage = "environment_validation";
async function main(): Promise<void> {
  const base = validateExchangeCancellationBaseEnvironment({
    envFile: process.env.FORMAL_BACKEND_ENV_FILE
  });
  checkerStage = "administrator_credentials";
  const credentials = resolveExchangeCancellationAdminCredentials(
    base.parsedEnvironment,
    process.env
  );
  const connectionOptions: ConnectionConfig = {
    ...(!credentials.socketPath
      ? {
          host: base.databaseUrl.hostname === "[::1]" ? "::1" : base.databaseUrl.hostname,
          ...(base.databaseUrl.port ? { port: Number(base.databaseUrl.port) } : {})
        }
      : {}),
    ...credentials,
    ...(!credentials.socketPath && base.parsedEnvironment.MYSQL_SOCKET_PATH
      ? { socketPath: base.parsedEnvironment.MYSQL_SOCKET_PATH }
      : {}),
    ...(base.parsedEnvironment.DATABASE_ALLOW_PUBLIC_KEY_RETRIEVAL === "true"
      ? { allowPublicKeyRetrieval: true }
      : {}),
    connectTimeout: 5_000,
    timezone: "Z"
  };
  checkerStage = "administrator_connection";
  const connection = await mariadb.createConnection(connectionOptions);
  try {
    if (credentials.socketPath) {
      checkerStage = "socket_administrator_identity";
      await verifyExchangeCancellationSocketAdmin(connection);
    }
    checkerStage = "scratch_database_setup";
    const result = await runExchangeCancellationScratchCheck(
      base,
      connection,
      async (environment) => {
        checkerStage = "scratch_migrations";
        runExchangeCancellationCommand("npm", ["run", "prisma:migrate:deploy"], environment);
        checkerStage = "scratch_integration";
        runExchangeCancellationCommand(
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
    const candidate = error && typeof error === "object" && "code" in error ? error.code : null;
    const code =
      typeof candidate === "string" && /^[A-Z_0-9]+$/u.test(candidate) ? candidate : undefined;
    // Driver messages can embed SQL containing the generated password. Emit only a safe stage/code.
    console.error(
      JSON.stringify({ check: "exchange-cancellation-flow", ok: false, stage: checkerStage, code })
    );
    process.exitCode = 1;
  });
}
