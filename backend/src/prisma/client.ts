import { PrismaClient, type Prisma } from "@prisma/client";
import { env } from "../config/env";

const prismaLogLevels: Prisma.LogLevel[] =
  env.NODE_ENV === "production" ? ["warn", "error"] : ["error"];

export const createPrismaClient = (): PrismaClient =>
  new PrismaClient({
    log: prismaLogLevels
  });

export const prisma = createPrismaClient();

export const disconnectPrisma = async (): Promise<void> => {
  await prisma.$disconnect();
};
