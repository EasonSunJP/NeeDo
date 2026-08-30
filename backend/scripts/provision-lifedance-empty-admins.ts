import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "@prisma/client";
import { hash } from "bcryptjs";
import { config as loadDotenv } from "dotenv";
import { existsSync } from "node:fs";
import {
  assertLocalEmptyAdminProvisioningTarget,
  provisionLifeDanceEmptyAdmins,
  resolveSharedTestAccountPassword
} from "../src/simulation/lifedance-empty-admin-provisioning";

const BCRYPT_ROUNDS = 12;

const main = async (): Promise<void> => {
  const envFile = process.env.ENV_FILE || ".env.dev";
  if (!existsSync(envFile)) throw new Error(`environment file was not found: ${envFile}`);
  loadDotenv({ path: envFile });
  assertLocalEmptyAdminProvisioningTarget(process.env);
  const password = resolveSharedTestAccountPassword(process.env);
  const passwordHash = await hash(password, BCRYPT_ROUNDS);
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required.");
  const prisma = new PrismaClient({ adapter: new PrismaMariaDb(databaseUrl), log: ["error"] });

  try {
    const actor = await prisma.user.findFirst({
      where: { email: "admin@lifedance.com", isActive: true, deletedAt: null },
      select: { id: true }
    });
    if (!actor) throw new Error("Active admin@lifedance.com actor is required.");
    const result = await prisma.$transaction(
      (tx) => provisionLifeDanceEmptyAdmins(tx, { passwordHash, actorUserId: actor.id }),
      { maxWait: 20_000, timeout: 60_000 }
    );
    console.log(
      JSON.stringify({
        status: "ok",
        accounts: result.accounts,
        operator: result.operator
      })
    );
  } finally {
    await prisma.$disconnect();
  }
};

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
