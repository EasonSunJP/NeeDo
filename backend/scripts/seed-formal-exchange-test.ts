import { config as loadDotenv } from "dotenv";
import { existsSync } from "node:fs";
import { buildExchangeSimulationPlan } from "../src/simulation/exchange-simulation-plan";
import {
  applyExchangeSimulationPlan,
  discoverExchangeSimulationActors
} from "../src/simulation/exchange-simulation-seed";
import { getSimulationSeedConfig } from "../src/simulation/simulation-seed-config";

const assert: (condition: unknown, message: string) => asserts condition = (condition, message) => {
  if (!condition) throw new Error(message);
};

const main = async (): Promise<void> => {
  const envFile = process.env.ENV_FILE || ".env.dev";
  assert(existsSync(envFile), `environment file was not found: ${envFile}`);
  process.env.ENV_FILE = envFile;
  loadDotenv({ path: envFile, override: true });
  const config = getSimulationSeedConfig(process.env);
  const { prisma, disconnectPrisma } = await import("../src/prisma/client");

  try {
    const actors = await discoverExchangeSimulationActors(prisma);
    const plan = buildExchangeSimulationPlan(actors, config.exchangeSeed);
    const summary = await applyExchangeSimulationPlan(prisma, plan);
    console.log(JSON.stringify({ ...summary, seed: config.exchangeSeed, status: "ok" }, null, 2));
  } finally {
    await disconnectPrisma();
  }
};

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? (error.stack ?? error.message) : String(error));
  process.exitCode = 1;
});
