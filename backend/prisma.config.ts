import { existsSync } from "node:fs";
import { config as loadDotenv } from "dotenv";
import { defineConfig } from "prisma/config";

const resolveEnvFile = (): string | undefined => {
  if (process.env.ENV_FILE) {
    return process.env.ENV_FILE;
  }

  if (existsSync(".env")) {
    return ".env";
  }

  if (existsSync(".env.dev")) {
    return ".env.dev";
  }

  return undefined;
};

const envFile = resolveEnvFile();

if (envFile) {
  loadDotenv({ path: envFile });
} else {
  loadDotenv();
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations"
  },
  datasource: {
    url: process.env.DATABASE_URL
  }
});
