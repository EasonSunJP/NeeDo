export interface SimulationSeedConfig {
  databaseUrl: string;
  databaseName: string;
  defaultPassword: string;
}

const requireValue = (value: string | undefined, name: string): string => {
  const normalized = value?.trim();
  if (!normalized) {
    throw new Error(`${name} is required for the local simulation seed.`);
  }
  return normalized;
};

export const getSimulationSeedConfig = (
  env: Readonly<Record<string, string | undefined>>
): SimulationSeedConfig => {
  if (env.ALLOW_SIMULATION_SEED !== "true") {
    throw new Error("Set ALLOW_SIMULATION_SEED=true explicitly to run the local simulation seed.");
  }

  const nodeEnvironment = (env.NODE_ENV ?? "development").toLowerCase();
  const deployEnvironment = (env.DEPLOY_ENV ?? "local").toLowerCase();
  if (nodeEnvironment === "production" || !["local", "test"].includes(deployEnvironment)) {
    throw new Error("The simulation seed is disabled for production and non-local deployments.");
  }

  const databaseUrl = requireValue(env.DATABASE_URL, "DATABASE_URL");
  const parsedDatabaseUrl = new URL(databaseUrl);
  const localHosts = new Set(["localhost", "127.0.0.1", "[::1]"]);
  if (!localHosts.has(parsedDatabaseUrl.hostname)) {
    throw new Error("The simulation seed only accepts a local MySQL host.");
  }

  const databaseName = parsedDatabaseUrl.pathname.replace(/^\//, "");
  if (!databaseName) {
    throw new Error("DATABASE_URL must include a local database name.");
  }
  if (/(?:^|[_-])(prod|production)(?:$|[_-])/i.test(databaseName)) {
    throw new Error("The simulation seed refuses a production database name.");
  }

  return {
    databaseUrl,
    databaseName,
    defaultPassword: requireValue(
      env.SIMULATION_DEFAULT_PASSWORD || env.TEST_USER_DEFAULT_PASSWORD,
      "SIMULATION_DEFAULT_PASSWORD or TEST_USER_DEFAULT_PASSWORD"
    )
  };
};
