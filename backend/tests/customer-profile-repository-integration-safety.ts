const integrationDatabaseError =
  "Customer profile repository integration tests require an explicitly allowed local database";

const allowedHosts = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
const allowedDatabaseNames = new Set(["needo_dev", "needo_test"]);

export function assertSafeCustomerProfileRepositoryDatabaseUrl(databaseUrl: string): string {
  let parsed: URL;

  try {
    parsed = new URL(databaseUrl);
  } catch {
    throw new Error(integrationDatabaseError);
  }

  const databaseName = decodeURIComponent(parsed.pathname.replace(/^\/+/, ""));

  if (
    parsed.protocol !== "mysql:" ||
    !allowedHosts.has(parsed.hostname) ||
    !allowedDatabaseNames.has(databaseName)
  ) {
    throw new Error(integrationDatabaseError);
  }

  return databaseUrl;
}

export function requireCustomerProfileRepositoryIntegrationDatabaseUrl({
  databaseUrl,
  envFile
}: {
  databaseUrl?: string;
  envFile?: string;
}): string {
  if (!envFile?.trim()) {
    throw new Error(
      "Customer profile repository integration tests require ENV_FILE; inherited DATABASE_URL values are forbidden"
    );
  }

  if (!databaseUrl?.trim()) {
    throw new Error("The integration ENV_FILE must define DATABASE_URL");
  }

  return assertSafeCustomerProfileRepositoryDatabaseUrl(databaseUrl.trim());
}
