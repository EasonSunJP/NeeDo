import { createApp } from "./app";
import { env } from "./config/env";
import { logger } from "./config/logger";
import { disconnectRedis } from "./config/redis";
import { disconnectPrisma } from "./prisma/client";
import { AffiliateTaskExpiryRepository } from "./repositories/affiliate-task-expiry.repository";
import { IdentityApplicationPurgeRepository } from "./repositories/identity-application-purge.repository";
import { LedgerRepository } from "./repositories/ledger.repository";
import { AffiliateTaskExpiryService } from "./services/affiliate-task-expiry.service";
import { IdentityApplicationMediaFileStorage } from "./services/identity-application-media.storage";
import { IdentityApplicationPurgeService } from "./services/identity-application-purge.service";
import { LedgerService } from "./services/ledger.service";
import { AffiliateTaskExpiryWorker } from "./workers/affiliate-task-expiry.worker";
import { IdentityApplicationPurgeWorker } from "./workers/identity-application-purge.worker";

const app = createApp(env);
const identityApplicationPurgeWorker = new IdentityApplicationPurgeWorker(
  new IdentityApplicationPurgeService(
    new IdentityApplicationPurgeRepository(),
    new IdentityApplicationMediaFileStorage(env.IDENTITY_APPLICATION_MEDIA_STORAGE_DIR)
  ),
  logger,
  env.IDENTITY_APPLICATION_PURGE_INTERVAL_MS
);
const affiliateTaskExpiryWorker = new AffiliateTaskExpiryWorker(
  new AffiliateTaskExpiryService(
    new AffiliateTaskExpiryRepository(),
    new LedgerService(new LedgerRepository()),
    ({ taskId, code, message }) => {
      logger.error(
        { taskId, code, message },
        "Affiliate task expiry candidate failed"
      );
    }
  ),
  logger,
  env.AFFILIATE_TASK_EXPIRY_INTERVAL_MS,
  env.AFFILIATE_TASK_EXPIRY_BATCH_SIZE
);

const server = app.listen(env.PORT, () => {
  logger.info(
    {
      port: env.PORT,
      apiPrefix: env.API_PREFIX,
      environment: env.NODE_ENV
    },
    "NeeDo backend started"
  );
  identityApplicationPurgeWorker.start();
  affiliateTaskExpiryWorker.start();
});

const shutdown = (signal: NodeJS.Signals): void => {
  affiliateTaskExpiryWorker.stop();
  identityApplicationPurgeWorker.stop();
  logger.info({ signal }, "NeeDo backend shutdown requested");
  server.close((error) => {
    if (error) {
      logger.error({ error }, "NeeDo backend shutdown failed");
      process.exit(1);
    }

    Promise.all([disconnectPrisma(), disconnectRedis()])
      .then(() => {
        logger.info("NeeDo backend stopped");
        process.exit(0);
      })
      .catch((disconnectError) => {
        logger.error({ error: disconnectError }, "NeeDo backend dependency shutdown failed");
        process.exit(1);
      });
  });
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
