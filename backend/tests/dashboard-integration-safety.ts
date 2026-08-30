const integrationDatabaseError =
  "Dashboard MySQL integration requires the explicit loopback needo_test database";
const allowedHosts = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

export function requireDashboardIntegrationDatabaseUrl({
  databaseUrl,
  envFile
}: {
  databaseUrl?: string;
  envFile?: string;
}): string {
  if (!envFile?.trim()) {
    throw new Error(
      "Dashboard MySQL integration requires ENV_FILE; inherited DATABASE_URL values are forbidden"
    );
  }
  if (!databaseUrl?.trim()) {
    throw new Error("Dashboard MySQL integration ENV_FILE must define DATABASE_URL");
  }

  let parsed: URL;
  try {
    parsed = new URL(databaseUrl.trim());
  } catch {
    throw new Error(integrationDatabaseError);
  }
  const database = decodeURIComponent(parsed.pathname.replace(/^\/+/, ""));
  if (
    parsed.protocol !== "mysql:" ||
    !allowedHosts.has(parsed.hostname) ||
    database !== "needo_test"
  ) {
    throw new Error(integrationDatabaseError);
  }
  return databaseUrl.trim();
}
