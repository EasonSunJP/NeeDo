import { config as loadDotenv } from "dotenv";
import { existsSync } from "node:fs";

import { migrateLifeDanceAdminOwnership } from "../src/simulation/lifedance-admin-ownership";

const main = async (): Promise<void> => {
  const envFile = process.env.ENV_FILE || ".env.dev";
  if (!existsSync(envFile)) {
    throw new Error(`environment file was not found: ${envFile}`);
  }
  process.env.ENV_FILE = envFile;
  loadDotenv({ path: envFile });
  const { prisma, disconnectPrisma } = await import("../src/prisma/client");

  try {
    const result = await prisma.$transaction(
      (tx) => migrateLifeDanceAdminOwnership(tx),
      { maxWait: 20_000, timeout: 30_000 }
    );
    console.log(JSON.stringify({ status: "ok", ...result }));
  } finally {
    await disconnectPrisma();
  }
};

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
