import { access } from "node:fs/promises";
import path from "node:path";
import { createConnection, type Connection, type ConnectionConfig } from "mariadb";
import {
  buildSelectiveAccountExportSuccessOutput,
  exportSelectiveAccounts,
  parseLocalSourceDatabaseUrl,
  type SelectiveAccountExportPort
} from "./selective-account-export";

interface SelectiveAccountExportCliOptions {
  args?: readonly string[];
  env?: NodeJS.ProcessEnv;
  createConnection?: (config: ConnectionConfig) => Promise<Connection>;
  writeOutput?: (value: string) => void;
}

export const parseSelectiveAccountExportCliArgs = (args: readonly string[]): string => {
  if (args.length !== 2 || args[0] !== "--output" || !path.isAbsolute(args[1] ?? "")) {
    throw new Error("ACCOUNT_SYNC_CLI_ARGUMENT_INVALID");
  }
  return args[1];
};

const assertOutputDoesNotExist = async (outputPath: string): Promise<void> => {
  try {
    await access(outputPath);
  } catch {
    return;
  }
  throw new Error("ACCOUNT_SYNC_OUTPUT_EXISTS");
};

const createLocalConnectionConfig = (url: URL): ConnectionConfig => ({
  host: url.hostname.replace(/^\[|\]$/gu, ""),
  port: url.port ? Number(url.port) : 3306,
  user: decodeURIComponent(url.username),
  password: decodeURIComponent(url.password),
  database: url.pathname.replace(/^\/+/, ""),
  dateStrings: true
});

export const runSelectiveAccountExportCli = async (
  options: SelectiveAccountExportCliOptions = {}
): Promise<void> => {
  const env = options.env ?? process.env;
  const outputPath = parseSelectiveAccountExportCliArgs(options.args ?? process.argv.slice(2));
  const databaseUrl = env.DATABASE_URL;
  if (!databaseUrl || env.DEPLOY_ENV !== "local") throw new Error("ACCOUNT_SYNC_SOURCE_BOUNDARY_REJECTED");
  const sourceDatabaseUrl = parseLocalSourceDatabaseUrl(databaseUrl);
  await assertOutputDoesNotExist(outputPath);

  let connection: Connection | undefined;
  try {
    connection = await (options.createConnection ?? createConnection)(createLocalConnectionConfig(sourceDatabaseUrl));
    const currentConnection = connection;
    const port: SelectiveAccountExportPort = {
      deployEnv: env.DEPLOY_ENV,
      sourceDatabaseUrl: databaseUrl,
      outputPath,
      query: async (query, parameters = []) =>
        await currentConnection.query<Array<Record<string, unknown>>>(query, parameters)
    };
    const summary = await exportSelectiveAccounts(port, new Date());
    (options.writeOutput ?? console.log)(buildSelectiveAccountExportSuccessOutput(summary));
  } finally {
    await connection?.end();
  }
};

if (require.main === module) {
  runSelectiveAccountExportCli().catch(() => {
    console.error(JSON.stringify({ gate: "staging-selective-account-export", status: "failed", reason: "ACCOUNT_SYNC_EXPORT_FAILED" }));
    process.exitCode = 1;
  });
}
