import { EXCHANGE_SIMULATION_DEFAULT_SEED } from "./exchange-simulation.constants";

export interface SimulationSeedConfig {
  databaseUrl: string;
  databaseName: string;
  defaultPassword: string;
  exchangeSeed: string;
  preserveExistingPasswords: boolean;
}

export const shouldRunFormalSeedEntrypoint = (
  isMainModule: boolean,
  env: Readonly<Record<string, string | undefined>>
): boolean => isMainModule && env.ALLOW_STAGING_SIMULATION_SYNC !== "true";

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
  const nodeEnvironment = (env.NODE_ENV ?? "development").toLowerCase();
  const deployEnvironment = (env.DEPLOY_ENV ?? "local").toLowerCase();
  const stagingSync = env.ALLOW_STAGING_SIMULATION_SYNC === "true";
  if (stagingSync) {
    const databaseUrl = requireValue(env.DATABASE_URL, "DATABASE_URL");
    const parsedDatabaseUrl = new URL(databaseUrl);
    const databaseName = parsedDatabaseUrl.pathname.replace(/^\//, "");
    if (
      nodeEnvironment !== "development" ||
      deployEnvironment !== "staging" ||
      env.ALLOW_SIMULATION_SEED !== "false" ||
      parsedDatabaseUrl.hostname !== "mysql" ||
      databaseName !== "needo_staging"
    ) {
      throw new Error("The one-shot staging sync boundary is invalid.");
    }
    return {
      databaseUrl,
      databaseName,
      defaultPassword: "existing-passwords-preserved",
      exchangeSeed: env.EXCHANGE_SIMULATION_SEED?.trim() || EXCHANGE_SIMULATION_DEFAULT_SEED,
      preserveExistingPasswords: true
    };
  }

  if (env.ALLOW_SIMULATION_SEED !== "true") {
    throw new Error("Set ALLOW_SIMULATION_SEED=true explicitly to run the local simulation seed.");
  }

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
    ),
    exchangeSeed: env.EXCHANGE_SIMULATION_SEED?.trim() || EXCHANGE_SIMULATION_DEFAULT_SEED,
    preserveExistingPasswords: false
  };
};
