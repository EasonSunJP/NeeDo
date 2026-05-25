import { PrismaClient, type Prisma } from "@prisma/client";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import {
  createMariaDbPoolConfig,
  getDatabaseConfig,
  type DatabaseHealthStatus
} from "../config/database";
import { env } from "../config/env";

const prismaLogLevels: Prisma.LogLevel[] =
  env.NODE_ENV === "production" ? ["warn", "error"] : ["error"];

export interface DatabaseHealthClient {
  $queryRaw: <T = unknown>(strings: TemplateStringsArray, ...values: unknown[]) => Promise<T>;
}

const databaseConfig = getDatabaseConfig(env);

const createPrismaAdapter = (): PrismaMariaDb => {
  const poolConfig = createMariaDbPoolConfig(env);

  return new PrismaMariaDb(poolConfig, {
    database: poolConfig.database
  });
};

export const createPrismaClient = (): PrismaClient =>
  new PrismaClient({
    adapter: createPrismaAdapter(),
    log: prismaLogLevels
  });

export const prisma = createPrismaClient();

export const disconnectPrisma = async (): Promise<void> => {
  await prisma.$disconnect();
};

export const checkDatabaseHealth = async (
  client: DatabaseHealthClient = prisma
): Promise<DatabaseHealthStatus> => {
  const startedAt = Date.now();

  try {
    await client.$queryRaw`SELECT 1`;

    return {
      status: "ok",
      latencyMs: Date.now() - startedAt,
      poolSize: databaseConfig.pool.connectionLimit
    };
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? error.message : "Unknown database health check error"
    };
  }
};
