import { config as loadDotenv } from "dotenv";
import { existsSync } from "node:fs";
import { checkFormalExchangeSimulation } from "../src/simulation/exchange-simulation-checker";
import { getSimulationSeedConfig } from "../src/simulation/simulation-seed-config";

const assert: (condition: unknown, message: string) => asserts condition = (condition, message) => {
  if (!condition) throw new Error(message);
};

const main = async (): Promise<void> => {
  const envFile = process.env.ENV_FILE || ".env.dev";
  assert(existsSync(envFile), `environment file was not found: ${envFile}`);
  process.env.ENV_FILE = envFile;
  loadDotenv({ path: envFile, override: true });
  getSimulationSeedConfig(process.env);
  const { prisma, disconnectPrisma } = await import("../src/prisma/client");

  try {
    console.log(JSON.stringify(await checkFormalExchangeSimulation(prisma), null, 2));
  } finally {
    await disconnectPrisma();
  }
};

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? (error.stack ?? error.message) : String(error));
  process.exitCode = 1;
});
