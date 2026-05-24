import { PrismaClient, type Prisma } from "@prisma/client";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { env } from "../config/env";

const prismaLogLevels: Prisma.LogLevel[] =
  env.NODE_ENV === "production" ? ["warn", "error"] : ["error"];

const createPrismaAdapter = (): PrismaMariaDb => new PrismaMariaDb(env.DATABASE_URL);

export const createPrismaClient = (): PrismaClient =>
  new PrismaClient({
    adapter: createPrismaAdapter(),
    log: prismaLogLevels
  });

export const prisma = createPrismaClient();

export const disconnectPrisma = async (): Promise<void> => {
  await prisma.$disconnect();
};
