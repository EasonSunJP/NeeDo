import { createApp } from "./app";
import { env } from "./config/env";
import { logger } from "./config/logger";
import { disconnectRedis } from "./config/redis";
import { disconnectPrisma } from "./prisma/client";
import { AffiliateTaskExpiryRepository } from "./repositories/affiliate-task-expiry.repository";
import { BookingUserRewardExpiryRepository } from "./repositories/booking-user-reward-expiry.repository";
import { IdentityApplicationPurgeRepository } from "./repositories/identity-application-purge.repository";
import { LedgerRepository } from "./repositories/ledger.repository";
import { AffiliateTaskExpiryService } from "./services/affiliate-task-expiry.service";
import { BookingUserRewardExpiryService } from "./services/booking-user-reward-expiry.service";
import { IdentityApplicationMediaFileStorage } from "./services/identity-application-media.storage";
import { IdentityApplicationPurgeService } from "./services/identity-application-purge.service";
import { createShutdownHandler } from "./server-shutdown";
import { LedgerService } from "./services/ledger.service";
import { AffiliateTaskExpiryWorker } from "./workers/affiliate-task-expiry.worker";
import { BookingUserRewardExpiryWorker } from "./workers/booking-user-reward-expiry.worker";
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
const bookingUserRewardExpiryWorker = new BookingUserRewardExpiryWorker(
  new BookingUserRewardExpiryService(
    new BookingUserRewardExpiryRepository(),
    ({ financialId, code, message }) => {
      logger.error(
        { financialId, code, message },
        "Booking user reward expiry candidate failed"
      );
    }
  ),
  logger,
  env.BOOKING_USER_REWARD_EXPIRY_INTERVAL_MS,
  env.BOOKING_USER_REWARD_EXPIRY_BATCH_SIZE
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
  bookingUserRewardExpiryWorker.start();
});

const shutdown = createShutdownHandler({
  closeServer: (callback) => server.close(callback),
  disconnect: async () => {
    await Promise.all([disconnectPrisma(), disconnectRedis()]);
  },
  exit: (code) => process.exit(code),
  logger,
  stopWorker: () => {
    bookingUserRewardExpiryWorker.stop();
    affiliateTaskExpiryWorker.stop();
    identityApplicationPurgeWorker.stop();
  }
});

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
