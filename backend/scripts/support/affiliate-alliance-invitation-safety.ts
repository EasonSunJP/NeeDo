type AffiliateAllianceInvitationEnvironment = {
  envFile?: string;
  envFileExists: boolean;
  nodeEnv?: string;
  deployEnv?: string;
  databaseUrl?: string;
};

type CapturedAffiliateAllianceInvitationCleanupIds = {
  userIds: number[];
  allianceIds: number[];
  invitationIds: number[];
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

export function assertExplicitAffiliateAllianceInvitationEnvFile(
  envFileValue: string | undefined,
  envFileExists: (path: string) => boolean
): string {
  const envFile = envFileValue?.trim();
  assert(envFile, "Affiliate alliance invitation check requires ENV_FILE");
  assert(envFileExists(envFile), `environment file was not found: ${envFile}`);
  return envFile;
}

export function assertSafeAffiliateAllianceInvitationEnvironment(
  input: AffiliateAllianceInvitationEnvironment
): { databaseName: string; envFile: string; maskedDatabaseTarget: string } {
  const envFile = input.envFile?.trim();
  assert(envFile, "Affiliate alliance invitation check requires ENV_FILE");
  assert(input.envFileExists, `environment file was not found: ${envFile}`);

  const nodeEnvironment = (input.nodeEnv ?? "").trim().toLowerCase();
  const deployEnvironment = (input.deployEnv ?? "").trim().toLowerCase();
  assert(
    !["production", "prod", "staging"].includes(nodeEnvironment) &&
      !["production", "prod", "staging"].includes(deployEnvironment),
    "affiliate alliance invitation check rejects production and staging environments"
  );

  let databaseUrl: URL;
  try {
    databaseUrl = new URL(input.databaseUrl ?? "");
  } catch {
    throw new Error("affiliate alliance invitation check requires a valid DATABASE_URL");
  }
  assert(databaseUrl.protocol === "mysql:", "affiliate alliance invitation check only accepts MySQL");
  assert(
    ["localhost", "127.0.0.1", "[::1]"].includes(databaseUrl.hostname),
    "affiliate alliance invitation check only accepts a local MySQL host"
  );
  const databaseName = decodeURIComponent(databaseUrl.pathname.replace(/^\//, ""));
  assert(databaseName.length > 0, "DATABASE_URL must include a database name");
  assert(
    !/(^|[_-])(prod|production|staging)([_-]|$)/i.test(databaseName),
    "affiliate alliance invitation check rejects production-looking database names"
  );

  const port = databaseUrl.port ? `:${databaseUrl.port}` : "";
  return {
    databaseName,
    envFile,
    maskedDatabaseTarget: `mysql://${databaseUrl.hostname}${port}/${databaseName}`
  };
}

export function assertCapturedAffiliateAllianceInvitationCleanupIds(
  input: CapturedAffiliateAllianceInvitationCleanupIds
): void {
  assert(input.userIds.length > 0, "cleanup requires captured user ids");
  assert(input.allianceIds.length > 0, "cleanup requires captured alliance ids");
  assert(input.invitationIds.length > 0, "cleanup requires captured invitation ids");
}
