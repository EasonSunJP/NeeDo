import { env } from "./env";

export interface DatabaseEnvConfig {
  DATABASE_URL: string;
}

export interface DatabaseConfig {
  provider: "mysql";
  charset: "utf8mb4";
  collation: "utf8mb4_unicode_ci";
  url: string;
}

export const getDatabaseConfig = (config: DatabaseEnvConfig = env): DatabaseConfig => ({
  provider: "mysql",
  charset: "utf8mb4",
  collation: "utf8mb4_unicode_ci",
  url: config.DATABASE_URL
});
