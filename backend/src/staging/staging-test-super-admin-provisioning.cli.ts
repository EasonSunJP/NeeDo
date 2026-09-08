import { disconnectRedis } from "../config/redis";
import { disconnectPrisma, prisma } from "../prisma/client";
import { RedisAuthSessionStore } from "../services/auth-session.store";
import {
  StagingTestSuperAdminProvisioningRepository,
  StagingTestSuperAdminProvisioningService,
  parseStagingTestSuperAdminProvisioningConfig
} from "./staging-test-super-admin-provisioning";

const main = async (): Promise<void> => {
  const config = parseStagingTestSuperAdminProvisioningConfig(process.env);
  const service = new StagingTestSuperAdminProvisioningService(
    new StagingTestSuperAdminProvisioningRepository(prisma)
  );
  try {
    const result = await service.provision(config);
    const sessions = new RedisAuthSessionStore();
    for (const account of result.accounts) {
      await sessions.revokeAllRefreshTokens(account.userId, account.sessionGeneration);
      await sessions.clearFailedLoginForAccount(account.userId);
    }
    console.log(
      JSON.stringify({
        status: "ok",
        shopId: result.shopId,
        shopNo: result.shopNo,
        accounts: result.accounts.map((account) => ({
          userId: account.userId,
          email: account.email,
          identityTypes: account.identityTypes,
          roleCodes: account.roleCodes
        }))
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
