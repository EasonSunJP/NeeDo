import { hash } from "bcryptjs";
import { config as loadDotenv } from "dotenv";
import { existsSync } from "node:fs";

const BCRYPT_ROUNDS = 12;

const main = async (): Promise<void> => {
  const envFile = process.env.ENV_FILE || ".env.dev";
  if (!existsSync(envFile)) throw new Error(`environment file was not found: ${envFile}`);
  process.env.ENV_FILE = envFile;
  loadDotenv({ path: envFile });

  const [
    { prisma, disconnectPrisma },
    { disconnectRedis },
    provisioning,
    authSessions,
    { TestNdpProvisioningRepository },
    { TestNdpProvisioningService }
  ] =
    await Promise.all([
      import("../src/prisma/client"),
      import("../src/config/redis"),
      import("../src/simulation/lifedance-admin2-provisioning"),
      import("../src/services/auth-session.store"),
      import("../src/repositories/test-ndp-provisioning.repository"),
      import("../src/services/test-ndp-provisioning.service")
    ]);
  provisioning.assertLocalAdmin2ProvisioningTarget(process.env);
  const password = provisioning.resolveLifeDanceAdmin2Password(process.env);
  const passwordHash = await hash(password, BCRYPT_ROUNDS);

  try {
    const result = await prisma.$transaction(
      (tx) => provisioning.provisionLifeDanceAdmin2(tx, passwordHash),
      { maxWait: 20_000, timeout: 60_000 }
    );
    await provisioning.calibrateLifeDanceAdmin2TestNdp(
      result.userId,
      new TestNdpProvisioningService(new TestNdpProvisioningRepository(prisma))
    );
    const sessions = new authSessions.RedisAuthSessionStore();
    await sessions.revokeAllRefreshTokens(result.userId, result.sessionGeneration);
    await sessions.clearFailedLoginForAccount(result.userId);
    console.log(
      JSON.stringify({
        status: "ok",
        email: provisioning.LIFEDANCE_ADMIN2_PLAN.email,
        needoId: provisioning.LIFEDANCE_ADMIN2_PLAN.needoId,
        shopName: provisioning.LIFEDANCE_ADMIN2_PLAN.shopName,
        userId: result.userId,
        shopId: result.shopId,
        merchantAccountId: result.merchantAccountId,
        friendCount: result.friendUserIds.length
      })
    );
  } finally {
    await Promise.all([disconnectPrisma(), disconnectRedis()]);
  }
};

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
