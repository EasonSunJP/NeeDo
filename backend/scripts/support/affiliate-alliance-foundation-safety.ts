type AffiliateAllianceFoundationEnvironment = {
  envFile?: string;
  envFileExists: boolean;
  nodeEnv?: string;
  deployEnv?: string;
  databaseUrl?: string;
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

export function assertExplicitAffiliateAllianceFoundationEnvFile(
  envFileValue: string | undefined,
  envFileExists: (path: string) => boolean
): string {
  const envFile = envFileValue?.trim();
  assert(envFile, "Affiliate alliance foundation check requires ENV_FILE");
  assert(envFileExists(envFile), `environment file was not found: ${envFile}`);
  return envFile;
}

export function assertSafeAffiliateAllianceFoundationEnvironment(
  input: AffiliateAllianceFoundationEnvironment
): { databaseName: string; envFile: string } {
  const envFile = input.envFile?.trim();
  assert(envFile, "Affiliate alliance foundation check requires ENV_FILE");
  assert(input.envFileExists, `environment file was not found: ${envFile}`);

  const runtimeEnvironment = (input.nodeEnv ?? "").trim().toLowerCase();
  const deployEnvironment = (input.deployEnv ?? "").trim().toLowerCase();
  assert(
    !["production", "prod", "staging"].includes(runtimeEnvironment) &&
      !["production", "prod", "staging"].includes(deployEnvironment),
    "affiliate alliance foundation check rejects production and staging environments"
  );

  let databaseUrl: URL;
  try {
    databaseUrl = new URL(input.databaseUrl ?? "");
  } catch {
    throw new Error("affiliate alliance foundation check requires a valid DATABASE_URL");
  }
  assert(
    databaseUrl.protocol === "mysql:",
    "affiliate alliance foundation check only accepts MySQL"
  );
  assert(
    ["localhost", "127.0.0.1", "[::1]"].includes(databaseUrl.hostname),
    "affiliate alliance foundation check only accepts a local MySQL host"
  );

  const databaseName = decodeURIComponent(databaseUrl.pathname.replace(/^\//, ""));
  assert(databaseName.length > 0, "DATABASE_URL must include a database name");
  assert(
    !/(^|[_-])(prod|production|staging)([_-]|$)/i.test(databaseName),
    "affiliate alliance foundation check rejects production-looking database names"
  );

  return { databaseName, envFile };
}
