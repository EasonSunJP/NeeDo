import { createApp } from "./app";
import { env } from "./config/env";
import { logger } from "./config/logger";
import { disconnectRedis } from "./config/redis";
import { disconnectPrisma } from "./prisma/client";
import { AffiliateTaskExpiryRepository } from "./repositories/affiliate-task-expiry.repository";
import { AffiliateAllianceRepository } from "./repositories/affiliate-alliance.repository";
import { AuditLogRepository } from "./repositories/audit-log.repository";
import { CarouselPublicationRepository } from "./repositories/carousel-publication.repository";
import { IdentityApplicationPurgeRepository } from "./repositories/identity-application-purge.repository";
import { LedgerRepository } from "./repositories/ledger.repository";
import { OfficialAnnouncementRepository } from "./repositories/official-announcement.repository";
import { AffiliateTaskExpiryService } from "./services/affiliate-task-expiry.service";
import { AffiliateAllianceInvitationExpiryService } from "./services/affiliate-alliance-invitation-expiry.service";
import { ContentPublicationSchedulerService } from "./services/content-publication-scheduler.service";
import { IdentityApplicationMediaFileStorage } from "./services/identity-application-media.storage";
import { IdentityApplicationPurgeService } from "./services/identity-application-purge.service";
import { createShutdownHandler } from "./server-shutdown";
import { LedgerService } from "./services/ledger.service";
import { AffiliateTaskExpiryWorker } from "./workers/affiliate-task-expiry.worker";
import { AffiliateAllianceInvitationExpiryWorker } from "./workers/affiliate-alliance-invitation-expiry.worker";
import { ContentPublicationWorker } from "./workers/content-publication.worker";
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
const affiliateAllianceInvitationExpiryWorker = new AffiliateAllianceInvitationExpiryWorker(
  new AffiliateAllianceInvitationExpiryService(new AffiliateAllianceRepository()),
  logger,
  env.AFFILIATE_ALLIANCE_INVITATION_EXPIRY_INTERVAL_MS,
  env.AFFILIATE_ALLIANCE_INVITATION_EXPIRY_BATCH_SIZE
);
const contentPublicationWorker = new ContentPublicationWorker(
  new ContentPublicationSchedulerService(
    new OfficialAnnouncementRepository(),
    new CarouselPublicationRepository(),
    new AuditLogRepository(),
    env.CONTENT_PUBLICATION_MAX_ACTIVATION_ATTEMPTS,
    (failure) => {
      logger.error(failure, "Content publication release activation failed");
    }
  ),
  logger,
  env.CONTENT_PUBLICATION_INTERVAL_MS,
  env.CONTENT_PUBLICATION_BATCH_SIZE
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
  affiliateAllianceInvitationExpiryWorker.start();
  contentPublicationWorker.start();
});

const shutdown = createShutdownHandler({
  closeServer: (callback) => server.close(callback),
  disconnect: async () => {
    await Promise.all([disconnectPrisma(), disconnectRedis()]);
  },
  exit: (code) => process.exit(code),
  logger,
  stopWorker: () => {
    contentPublicationWorker.stop();
    affiliateAllianceInvitationExpiryWorker.stop();
    affiliateTaskExpiryWorker.stop();
    identityApplicationPurgeWorker.stop();
  }
});

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
