import { createApp } from "./app";
import { env } from "./config/env";
import { logger } from "./config/logger";
import { checkRedisHealth, createRedisClient, disconnectRedis } from "./config/redis";
import { disconnectPrisma } from "./prisma/client";
import { AffiliateAllianceRepository } from "./repositories/affiliate-alliance.repository";
import { AffiliateTaskExpiryRepository } from "./repositories/affiliate-task-expiry.repository";
import { AuditLogRepository } from "./repositories/audit-log.repository";
import { BookingUserRewardExpiryRepository } from "./repositories/booking-user-reward-expiry.repository";
import { ExchangePostRepository } from "./repositories/exchange.repository";
import { AuthRepository } from "./repositories/auth.repository";
import { CarouselPublicationRepository } from "./repositories/carousel-publication.repository";
import { IdentityApplicationPurgeRepository } from "./repositories/identity-application-purge.repository";
import { ImPrivacyExpiryRepository } from "./repositories/im-privacy-expiry.repository";
import { LedgerRepository } from "./repositories/ledger.repository";
import { OfficialAnnouncementRepository } from "./repositories/official-announcement.repository";
import { RealtimeRepository } from "./repositories/realtime.repository";
import { AffiliateAllianceInvitationExpiryService } from "./services/affiliate-alliance-invitation-expiry.service";
import { AffiliateTaskExpiryService } from "./services/affiliate-task-expiry.service";
import { BookingUserRewardExpiryService } from "./services/booking-user-reward-expiry.service";
import { ContentPublicationSchedulerService } from "./services/content-publication-scheduler.service";
import { FriendRequestExpiryService } from "./services/friend-request-expiry.service";
import { IdentityApplicationMediaFileStorage } from "./services/identity-application-media.storage";
import { IdentityApplicationPurgeService } from "./services/identity-application-purge.service";
import { ImPrivacyExpiryService } from "./services/im-privacy-expiry.service";
import { RedisAuthSessionStore } from "./services/auth-session.store";
import { MerchantShopAuditOutboxService } from "./services/merchant-shop-audit-outbox.service";
import { ExchangeService } from "./services/exchange.service";
import { PersonalIdentityScopeService } from "./services/personal-identity-scope.service";
import { RedisRealtimeEventBus } from "./services/redis-realtime-event.bus";
import { SseRealtimeEventGateway } from "./services/realtime-event.gateway";
import { createShutdownHandler } from "./server-shutdown";
import { LedgerService } from "./services/ledger.service";
import { AffiliateAllianceInvitationExpiryWorker } from "./workers/affiliate-alliance-invitation-expiry.worker";
import { AffiliateTaskExpiryWorker } from "./workers/affiliate-task-expiry.worker";
import { BookingUserRewardExpiryWorker } from "./workers/booking-user-reward-expiry.worker";
import { ExchangePostExpiryWorker } from "./workers/exchange-post-expiry.worker";
import { ContentPublicationWorker } from "./workers/content-publication.worker";
import { FriendRequestExpiryWorker } from "./workers/friend-request-expiry.worker";
import { IdentityApplicationPurgeWorker } from "./workers/identity-application-purge.worker";
import { ImPrivacyExpiryWorker } from "./workers/im-privacy-expiry.worker";
import { MerchantShopAuditOutboxWorker } from "./workers/merchant-shop-audit-outbox.worker";

const realtimeEventGateway = new SseRealtimeEventGateway({
  eventBus: new RedisRealtimeEventBus({
    channel: env.REALTIME_REDIS_CHANNEL,
    publisher: createRedisClient(),
    subscriber: createRedisClient(),
    onError: (error, connection) => {
      logger.error({ connection, error }, "Realtime Redis connection error");
    }
  }),
  onError: (error, operation) => {
    logger.error({ error, operation }, "Realtime event delivery error");
  }
});
const exchangeService = new ExchangeService(
  new ExchangePostRepository(),
  undefined,
  new PersonalIdentityScopeService(new AuthRepository())
);
const authRepository = new AuthRepository();
const authSessionStore = new RedisAuthSessionStore(undefined, {
  onSecurityEvent: (event) => {
    logger.error(event, "Merchant shop switch receipt post-state mismatch");
  }
});
const merchantShopAuditOutboxWorker = new MerchantShopAuditOutboxWorker(
  new MerchantShopAuditOutboxService(authRepository, authSessionStore),
  logger,
  env.AUTH_MERCHANT_SHOP_AUDIT_OUTBOX_INTERVAL_MS
);
const app = createApp(env, {
  redisHealthCheck: checkRedisHealth,
  realtimeEventGateway,
  exchangeService,
  authRepository,
  authSessionStore,
  merchantShopAuditOutboxTrigger: merchantShopAuditOutboxWorker
});
const identityApplicationPurgeWorker = new IdentityApplicationPurgeWorker(
  new IdentityApplicationPurgeService(
    new IdentityApplicationPurgeRepository(),
    new IdentityApplicationMediaFileStorage(env.IDENTITY_APPLICATION_MEDIA_STORAGE_DIR)
  ),
  logger,
  env.IDENTITY_APPLICATION_PURGE_INTERVAL_MS
);
const friendRequestExpiryWorker = new FriendRequestExpiryWorker(
  new FriendRequestExpiryService(new RealtimeRepository(), realtimeEventGateway),
  logger,
  env.FRIEND_REQUEST_EXPIRY_INTERVAL_MS,
  env.FRIEND_REQUEST_EXPIRY_BATCH_SIZE
);
const affiliateTaskExpiryWorker = new AffiliateTaskExpiryWorker(
  new AffiliateTaskExpiryService(
    new AffiliateTaskExpiryRepository(),
    new LedgerService(new LedgerRepository()),
    ({ taskId, code, message }) => {
      logger.error({ taskId, code, message }, "Affiliate task expiry candidate failed");
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
      logger.error({ financialId, code, message }, "Booking user reward expiry candidate failed");
    }
  ),
  logger,
  env.BOOKING_USER_REWARD_EXPIRY_INTERVAL_MS,
  env.BOOKING_USER_REWARD_EXPIRY_BATCH_SIZE
);
const exchangePostExpiryWorker = new ExchangePostExpiryWorker(
  exchangeService,
  logger,
  env.EXCHANGE_EXPIRY_INTERVAL_MS,
  env.EXCHANGE_EXPIRY_BATCH_SIZE
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
const imPrivacyExpiryWorker = new ImPrivacyExpiryWorker(
  new ImPrivacyExpiryService(new ImPrivacyExpiryRepository(), realtimeEventGateway),
  logger,
  env.IM_PRIVACY_EXPIRY_INTERVAL_MS,
  env.IM_PRIVACY_EXPIRY_BATCH_SIZE
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
  friendRequestExpiryWorker.start();
  identityApplicationPurgeWorker.start();
  affiliateTaskExpiryWorker.start();
  bookingUserRewardExpiryWorker.start();
  if (env.EXCHANGE_EXPIRY_WORKER_ENABLED) {
    exchangePostExpiryWorker.start();
  }
  affiliateAllianceInvitationExpiryWorker.start();
  contentPublicationWorker.start();
  imPrivacyExpiryWorker.start();
  merchantShopAuditOutboxWorker.start();
});

const shutdown = createShutdownHandler({
  closeServer: (callback) => server.close(callback),
  disconnect: async () => {
    await Promise.all([disconnectPrisma(), disconnectRedis(), realtimeEventGateway.close()]);
  },
  exit: (code) => process.exit(code),
  logger,
  stopWorker: () => {
    void realtimeEventGateway.close().catch((error) => {
      logger.error({ error }, "Realtime gateway shutdown failed");
    });
    bookingUserRewardExpiryWorker.stop();
    exchangePostExpiryWorker.stop();
    contentPublicationWorker.stop();
    affiliateAllianceInvitationExpiryWorker.stop();
    affiliateTaskExpiryWorker.stop();
    friendRequestExpiryWorker.stop();
    identityApplicationPurgeWorker.stop();
    imPrivacyExpiryWorker.stop();
    merchantShopAuditOutboxWorker.stop();
  }
});

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
