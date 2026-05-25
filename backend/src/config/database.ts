import { env } from "./env";

export interface DatabaseEnvConfig {
  DATABASE_URL: string;
  DATABASE_POOL_CONNECTION_LIMIT: number;
  DATABASE_POOL_ACQUIRE_TIMEOUT_MS: number;
  DATABASE_POOL_IDLE_TIMEOUT_MS: number;
  DATABASE_POOL_CONNECT_TIMEOUT_MS: number;
}

export interface DatabaseConfig {
  provider: "mysql";
  charset: "utf8mb4";
  collation: "utf8mb4_unicode_ci";
  url: string;
  pool: {
    connectionLimit: number;
    acquireTimeoutMs: number;
    idleTimeoutMs: number;
    connectTimeoutMs: number;
  };
}

export interface DatabaseHealthStatus {
  status: "ok" | "error";
  latencyMs?: number;
  poolSize?: number;
  message?: string;
}

export interface MariaDbPoolRuntimeConfig {
  host: string;
  port?: number;
  user?: string;
  password?: string;
  database?: string;
  charset: "utf8mb4";
  collation: "utf8mb4_unicode_ci";
  connectionLimit: number;
  acquireTimeout: number;
  idleTimeout: number;
  connectTimeout: number;
}

export const getDatabaseConfig = (config: DatabaseEnvConfig = env): DatabaseConfig => ({
  provider: "mysql",
  charset: "utf8mb4",
  collation: "utf8mb4_unicode_ci",
  url: config.DATABASE_URL,
  pool: {
    connectionLimit: config.DATABASE_POOL_CONNECTION_LIMIT,
    acquireTimeoutMs: config.DATABASE_POOL_ACQUIRE_TIMEOUT_MS,
    idleTimeoutMs: config.DATABASE_POOL_IDLE_TIMEOUT_MS,
    connectTimeoutMs: config.DATABASE_POOL_CONNECT_TIMEOUT_MS
  }
});

export const createMariaDbPoolConfig = (
  config: DatabaseEnvConfig = env
): MariaDbPoolRuntimeConfig => {
  const databaseUrl = new URL(config.DATABASE_URL);
  const database = databaseUrl.pathname.replace(/^\//, "");

  return {
    host: databaseUrl.hostname,
    port: databaseUrl.port ? Number(databaseUrl.port) : undefined,
    user: databaseUrl.username ? decodeURIComponent(databaseUrl.username) : undefined,
    password: databaseUrl.password ? decodeURIComponent(databaseUrl.password) : undefined,
    database: database ? decodeURIComponent(database) : undefined,
    charset: "utf8mb4",
    collation: "utf8mb4_unicode_ci",
    connectionLimit: config.DATABASE_POOL_CONNECTION_LIMIT,
    acquireTimeout: config.DATABASE_POOL_ACQUIRE_TIMEOUT_MS,
    idleTimeout: config.DATABASE_POOL_IDLE_TIMEOUT_MS,
    connectTimeout: config.DATABASE_POOL_CONNECT_TIMEOUT_MS
  };
};
