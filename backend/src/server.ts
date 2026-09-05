import { createApp } from "./app";
import { env } from "./config/env";
import { logger } from "./config/logger";
import { checkRedisHealth, createRedisClient, disconnectRedis } from "./config/redis";
import { disconnectPrisma } from "./prisma/client";
import { createMerchantShopAuditCompletionRuntime } from "./prisma/merchant-shop-audit-completion.runtime";
import { AffiliateAllianceRepository } from "./repositories/affiliate-alliance.repository";
import { AffiliateTaskExpiryRepository } from "./repositories/affiliate-task-expiry.repository";
import { AuditLogRepository } from "./repositories/audit-log.repository";
import { BookingUserRewardExpiryRepository } from "./repositories/booking-user-reward-expiry.repository";
import { ShopMembershipCardAdjustmentRepository } from "./repositories/shop-membership-card-adjustment.repository";
import { ExchangeClaimRepository } from "./repositories/exchange-claim.repository";
import { ExchangePostRepository } from "./repositories/exchange.repository";
import { ExchangeRequestFeeRepository } from "./repositories/exchange-request-fee.repository";
import { AuthRepository } from "./repositories/auth.repository";
import { CarouselPublicationRepository } from "./repositories/carousel-publication.repository";
import { IdentityApplicationPurgeRepository } from "./repositories/identity-application-purge.repository";
import { ImPrivacyExpiryRepository } from "./repositories/im-privacy-expiry.repository";
import { ImServerRetentionRepository } from "./repositories/im-server-retention.repository";
import { LedgerRepository } from "./repositories/ledger.repository";
import { OfficialAnnouncementRepository } from "./repositories/official-announcement.repository";
import { OfficialNoticeRepository } from "./repositories/official-notice.repository";
import { OrderServiceExpiryRepository } from "./repositories/order-service-expiry.repository";
import { RealtimeRepository } from "./repositories/realtime.repository";
import { PlatformMembershipRepository } from "./repositories/platform-membership.repository";
import { NdpExperienceCampaignRepository } from "./repositories/ndp-experience-campaign.repository";
import { UserGlobalPolicyRepository } from "./repositories/user-global-policy.repository";
import { UserPolicyEnforcementRepository } from "./repositories/user-policy-enforcement.repository";
import { UserExperienceRepository } from "./repositories/user-experience.repository";
import { AffiliateAllianceInvitationExpiryService } from "./services/affiliate-alliance-invitation-expiry.service";
import { AffiliateTaskExpiryService } from "./services/affiliate-task-expiry.service";
import { BookingUserRewardExpiryService } from "./services/booking-user-reward-expiry.service";
import { ShopMembershipCardAdjustmentExpiryService } from "./services/shop-membership-card-adjustment-expiry.service";
import { ContentPublicationSchedulerService } from "./services/content-publication-scheduler.service";
import { FriendRequestExpiryService } from "./services/friend-request-expiry.service";
import { IdentityApplicationMediaFileStorage } from "./services/identity-application-media.storage";
import { IdentityApplicationPurgeService } from "./services/identity-application-purge.service";
import { ImPrivacyExpiryService } from "./services/im-privacy-expiry.service";
import { ImServerRetentionService } from "./services/im-server-retention.service";
import { ImMediaFileStorage } from "./services/im-media.storage";
import { RedisAuthSessionStore } from "./services/auth-session.store";
import { MerchantShopAuditOutboxService } from "./services/merchant-shop-audit-outbox.service";
import { OrderServiceExpiryService } from "./services/order-service-expiry.service";
import { ExchangeClaimService } from "./services/exchange-claim.service";
import { ExchangeService } from "./services/exchange.service";
import { ExchangeRequestFeeService } from "./services/exchange-request-fee.service";
import { PersonalIdentityScopeService } from "./services/personal-identity-scope.service";
import { NdpExperienceCampaignService } from "./services/ndp-experience-campaign.service";
import { PlatformMembershipService } from "./services/platform-membership.service";
import { UserExperienceService } from "./services/user-experience.service";
import { UserGlobalPolicyService } from "./services/user-global-policy.service";
import { UserPolicyEnforcementService } from "./services/user-policy-enforcement.service";
import { RedisRealtimeEventBus } from "./services/redis-realtime-event.bus";
import { SseRealtimeEventGateway } from "./services/realtime-event.gateway";
import { createShutdownHandler } from "./server-shutdown";
import { LedgerService } from "./services/ledger.service";
import { AffiliateAllianceInvitationExpiryWorker } from "./workers/affiliate-alliance-invitation-expiry.worker";
import { AffiliateTaskExpiryWorker } from "./workers/affiliate-task-expiry.worker";
import { BookingUserRewardExpiryWorker } from "./workers/booking-user-reward-expiry.worker";
import { ShopMembershipCardAdjustmentExpiryWorker } from "./workers/shop-membership-card-adjustment-expiry.worker";
import { ExchangePostExpiryWorker } from "./workers/exchange-post-expiry.worker";
import { ContentPublicationWorker } from "./workers/content-publication.worker";
import { FriendRequestExpiryWorker } from "./workers/friend-request-expiry.worker";
import { IdentityApplicationPurgeWorker } from "./workers/identity-application-purge.worker";
import { ImPrivacyExpiryWorker } from "./workers/im-privacy-expiry.worker";
import { ImServerRetentionWorker } from "./workers/im-server-retention.worker";
import { MerchantShopAuditOutboxWorker } from "./workers/merchant-shop-audit-outbox.worker";
import { OrderServiceExpiryWorker } from "./workers/order-service-expiry.worker";
import { OfficialNoticeWorker } from "./workers/official-notice.worker";

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
const authRepository = new AuthRepository();
const officialNoticeRepository = new OfficialNoticeRepository(
  undefined,
  env.OFFICIAL_NOTICE_MAX_DELIVERY_ATTEMPTS,
  realtimeEventGateway
);
const platformMembershipRepository = new PlatformMembershipRepository();
const userExperienceRepository = new UserExperienceRepository();
const userGlobalPolicyRepository = new UserGlobalPolicyRepository();
const userPolicyEnforcementRepository = new UserPolicyEnforcementRepository();
const userPolicyEnforcementService = new UserPolicyEnforcementService(
  userPolicyEnforcementRepository,
  new UserGlobalPolicyService(userGlobalPolicyRepository)
);
const ndpExperienceCampaignRepository = new NdpExperienceCampaignRepository();
const platformMembershipResolver = new PlatformMembershipService(platformMembershipRepository);
const userExperienceService = new UserExperienceService(
  userExperienceRepository,
  platformMembershipResolver,
  new UserGlobalPolicyService(userGlobalPolicyRepository),
  new NdpExperienceCampaignService(ndpExperienceCampaignRepository)
);
const exchangeRequestFeeService = new ExchangeRequestFeeService(new ExchangeRequestFeeRepository());
const exchangeLedgerService = new LedgerService(
  new LedgerRepository(),
  undefined,
  undefined,
  undefined,
  undefined,
  undefined,
  userExperienceService
);
const exchangeService = new ExchangeService(
  new ExchangePostRepository(),
  undefined,
  new PersonalIdentityScopeService(authRepository),
  exchangeRequestFeeService,
  exchangeLedgerService,
  userPolicyEnforcementService,
  platformMembershipResolver
);
const exchangeClaimService = new ExchangeClaimService(
  new ExchangeClaimRepository(),
  new ExchangePostRepository()
);
const authSessionStore = new RedisAuthSessionStore(undefined, {
  onSecurityEvent: (event) => {
    logger.error(event, "Merchant shop switch receipt post-state mismatch");
  }
});
const merchantShopAuditOutboxWorker = new MerchantShopAuditOutboxWorker(
  () => {
    const redisClient = createRedisClient(env, {
      disableOfflineQueue: true,
      commandsQueueMaxLength: 100
    });
    redisClient.on("error", (error) => {
      logger.error({ error }, "Merchant shop audit outbox Redis connection error");
    });
    const sessionStore = new RedisAuthSessionStore(() => redisClient, {
      onSecurityEvent: (event) => {
        logger.error(event, "Merchant shop audit outbox receipt post-state mismatch");
      }
    });
    const completionRuntime = createMerchantShopAuditCompletionRuntime(env, {
      socketTimeoutMs: env.AUTH_MERCHANT_SHOP_AUDIT_OUTBOX_DRAIN_TIMEOUT_MS,
      onDisconnectError: (error) => {
        logger.error({ error }, "Merchant shop audit completion database disconnect failed");
      }
    });
    return {
      service: new MerchantShopAuditOutboxService(completionRuntime.repository, sessionStore),
      destroy: async () => {
        let redisError: unknown;
        try {
          if (redisClient.isOpen) redisClient.destroy();
        } catch (error) {
          redisError = error;
        }
        try {
          await completionRuntime.destroy();
        } catch (databaseError) {
          if (redisError) {
            throw new AggregateError(
              [redisError, databaseError],
              "Merchant shop audit worker runtime shutdown failed"
            );
          }
          throw databaseError;
        }
        if (redisError) throw redisError;
      }
    };
  },
  logger,
  env.AUTH_MERCHANT_SHOP_AUDIT_OUTBOX_INTERVAL_MS,
  1_000,
  {
    drainTimeoutMs: env.AUTH_MERCHANT_SHOP_AUDIT_OUTBOX_DRAIN_TIMEOUT_MS,
    shutdownTimeoutMs: env.AUTH_MERCHANT_SHOP_AUDIT_OUTBOX_SHUTDOWN_TIMEOUT_MS
  }
);
const app = createApp(env, {
  redisHealthCheck: checkRedisHealth,
  realtimeEventGateway,
  exchangeService,
  exchangeClaimService,
  exchangeRequestFeeService,
  ledgerService: exchangeLedgerService,
  authRepository,
  authSessionStore,
  platformMembershipRepository,
  platformMembershipResolverService: platformMembershipResolver,
  userExperienceService,
  userExperienceRepository,
  userGlobalPolicyRepository,
  userPolicyEnforcementRepository,
  userPolicyEnforcementService,
  ndpExperienceCampaignRepository,
  officialNoticeRepository,
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
const orderServiceExpiryWorker = new OrderServiceExpiryWorker(
  new OrderServiceExpiryService(
    new OrderServiceExpiryRepository(undefined, ({ orderId, code, message }) => {
      logger.error({ orderId, code, message }, "Order service expiry candidate failed");
    })
  ),
  logger,
  env.ORDER_SERVICE_EXPIRY_INTERVAL_MS,
  env.ORDER_SERVICE_EXPIRY_BATCH_SIZE
);
const shopMembershipCardAdjustmentExpiryWorker = new ShopMembershipCardAdjustmentExpiryWorker(
  new ShopMembershipCardAdjustmentExpiryService(new ShopMembershipCardAdjustmentRepository()),
  logger,
  env.SHOP_MEMBERSHIP_CARD_ADJUSTMENT_EXPIRY_INTERVAL_MS,
  env.SHOP_MEMBERSHIP_CARD_ADJUSTMENT_EXPIRY_BATCH_SIZE
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
const officialNoticeWorker = new OfficialNoticeWorker(officialNoticeRepository, {
  intervalMs: env.OFFICIAL_NOTICE_DELIVERY_INTERVAL_MS,
  batchSize: env.OFFICIAL_NOTICE_DELIVERY_BATCH_SIZE,
  logger
});
const imPrivacyExpiryWorker = new ImPrivacyExpiryWorker(
  new ImPrivacyExpiryService(new ImPrivacyExpiryRepository(), realtimeEventGateway),
  logger,
  env.IM_PRIVACY_EXPIRY_INTERVAL_MS,
  env.IM_PRIVACY_EXPIRY_BATCH_SIZE
);
const imServerRetentionWorker = new ImServerRetentionWorker(
  new ImServerRetentionService(
    new ImServerRetentionRepository(),
    new ImMediaFileStorage(env.IM_MEDIA_STORAGE_DIR)
  ),
  logger,
  env.IM_SERVER_RETENTION_INTERVAL_MS,
  env.IM_SERVER_RETENTION_BATCH_SIZE
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
  orderServiceExpiryWorker.start();
  shopMembershipCardAdjustmentExpiryWorker.start();
  if (env.EXCHANGE_EXPIRY_WORKER_ENABLED) {
    exchangePostExpiryWorker.start();
  }
  affiliateAllianceInvitationExpiryWorker.start();
  contentPublicationWorker.start();
  officialNoticeWorker.start();
  imPrivacyExpiryWorker.start();
  imServerRetentionWorker.start();
  merchantShopAuditOutboxWorker.start();
});

const shutdown = createShutdownHandler({
  closeServer: (callback) => server.close(callback),
  disconnect: async () => {
    await Promise.all([disconnectPrisma(), disconnectRedis(), realtimeEventGateway.close()]);
  },
  exit: (code) => process.exit(code),
  logger,
  forceStopWorker: () => merchantShopAuditOutboxWorker.forceDestroy(),
  workerStopTimeoutMs: env.AUTH_MERCHANT_SHOP_AUDIT_OUTBOX_SHUTDOWN_TIMEOUT_MS,
  stopWorker: async () => {
    void realtimeEventGateway.close().catch((error) => {
      logger.error({ error }, "Realtime gateway shutdown failed");
    });
    bookingUserRewardExpiryWorker.stop();
    orderServiceExpiryWorker.stop();
    shopMembershipCardAdjustmentExpiryWorker.stop();
    exchangePostExpiryWorker.stop();
    contentPublicationWorker.stop();
    officialNoticeWorker.stop();
    affiliateAllianceInvitationExpiryWorker.stop();
    affiliateTaskExpiryWorker.stop();
    friendRequestExpiryWorker.stop();
    identityApplicationPurgeWorker.stop();
    imPrivacyExpiryWorker.stop();
    imServerRetentionWorker.stop();
    await Promise.all([merchantShopAuditOutboxWorker.stop(), officialNoticeWorker.stopAndDrain()]);
  }
});

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
