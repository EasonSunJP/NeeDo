import express, { Router, type Express } from "express";
import { createOpenApiRoutes } from "./api/openapi";
import { env, type AppConfig } from "./config/env";
import { checkRedisHealth, type RedisHealthStatus } from "./config/redis";
import type { DatabaseHealthStatus } from "./config/database";
import { checkDatabaseHealth } from "./prisma/client";
import { errorMiddleware } from "./middlewares/error.middleware";
import { createCacheHeadersMiddleware } from "./middlewares/cache.middleware";
import { createMetricsMiddleware } from "./middlewares/metrics.middleware";
import { notFoundMiddleware } from "./middlewares/not-found.middleware";
import { createRequestLoggerMiddleware } from "./middlewares/request-logger.middleware";
import {
  createCorsMiddleware,
  createHelmetMiddleware,
  createRateLimitMiddleware
} from "./middlewares/security.middleware";
import { createTracingMiddleware } from "./middlewares/tracing.middleware";
import type { AuditLogRepositoryPort } from "./repositories/audit-log.repository";
import type { AffiliateProfileRepositoryPort } from "./repositories/affiliate-profile.repository";
import { AuthRepository, type AuthRepositoryPort } from "./repositories/auth.repository";
import type { BackofficeRepositoryPort } from "./services/backoffice.service";
import type {
  AffiliateTaskRepositoryPort,
  AffiliateTaskService
} from "./services/affiliate-task.service";
import type {
  AffiliateMarketplaceRepositoryPort,
  AffiliateMarketplaceService
} from "./services/affiliate-marketplace.service";
import type { AffiliateCheckoutService } from "./services/affiliate-checkout.service";
import type { AffiliateProfileService } from "./services/affiliate-profile.service";
import type {
  AffiliateAllianceRepositoryPort,
  AffiliateAllianceService
} from "./services/affiliate-alliance.service";
import type { BookingRepositoryPort } from "./repositories/booking.repository";
import type { CompensationProfileRepositoryPort } from "./services/compensation-profile.service";
import type { CoreReadRepositoryPort } from "./repositories/core-read.repository";
import type { CustomerProfileRepositoryPort } from "./repositories/customer-profile.repository";
import type { ShopMembershipRepositoryPort } from "./repositories/shop-membership.repository";
import type { ShopMembershipCardPlanRepositoryPort } from "./repositories/shop-membership-card-plan.repository";
import type { TechnicianProfileRepositoryPort } from "./repositories/technician-profile.repository";
import type { FeeRuleRepositoryPort } from "./services/fee-calculation.service";
import type { PlatformFeePolicyRepositoryPort } from "./services/platform-fee-policy.service";
import type { OrderAcceptancePauseRepositoryPort } from "./services/order-acceptance-pause.service";
import type {
  AffiliatePlatformFeeRepositoryPort,
  AffiliatePlatformFeeService
} from "./services/affiliate-platform-fee.service";
import type { LedgerRepositoryPort } from "./services/ledger.service";
import type { IdentityApplicationRepositoryPort } from "./services/identity-application.service";
import type { IdentityApplicationService } from "./services/identity-application.service";
import type { IdentityApplicationMediaRepositoryPort } from "./services/identity-application-media.service";
import type { IdentityApplicationMediaService } from "./services/identity-application-media.service";
import type { IdentityApplicationMediaStoragePort } from "./services/identity-application-media.storage";
import type { ContentMediaRepositoryPort } from "./services/content-media.service";
import type { ContentMediaService } from "./services/content-media.service";
import type { SocialMediaRepositoryPort } from "./services/social-media.service";
import type { SocialMediaService } from "./services/social-media.service";
import type { OfficialAnnouncementRepositoryPort } from "./services/official-announcement.service";
import type { OfficialAnnouncementService } from "./services/official-announcement.service";
import type {
  CarouselPublicationRepositoryPort,
  CarouselPublicationService
} from "./services/carousel-publication.service";
import {
  assertContentMediaStorageIsolationSync,
  type ContentMediaStoragePort
} from "./services/content-media.storage";
import type { AffiliateIdentityActivationRepositoryPort } from "./services/affiliate-identity-activation.service";
import type { AffiliateIdentityActivationService } from "./services/affiliate-identity-activation.service";
import type { AffiliateWithdrawalEligibilityRepositoryPort } from "./services/affiliate-withdrawal-eligibility.service";
import type { AffiliateWithdrawalEligibilityService } from "./services/affiliate-withdrawal-eligibility.service";
import type { AffiliateBankAccountRepositoryPort } from "./services/affiliate-bank-account.service";
import type { AffiliateBankAccountService } from "./services/affiliate-bank-account.service";
import type { MerchantContractAcceptanceRepositoryPort } from "./services/merchant-contract-acceptance.service";
import type { MerchantContractAcceptanceService } from "./services/merchant-contract-acceptance.service";
import type {
  ContractReceiptRepositoryPort,
  ContractReceiptService
} from "./services/contract-receipt.service";
import type { ProtectedBankAccountRepositoryPort } from "./services/protected-bank-account.service";
import type { ProtectedBankAccountService } from "./services/protected-bank-account.service";
import type { TechnicianApplicationReviewRepositoryPort } from "./services/technician-application-review.service";
import type { TechnicianApplicationReviewService } from "./services/technician-application-review.service";
import type { TechnicianResumeExportService } from "./services/technician-resume-export.service";
import type { TechnicianResumeRepository } from "./repositories/technician-resume.repository";
import type { MerchantApplicationReviewRepositoryPort } from "./services/merchant-application-review.service";
import type { MerchantApplicationReviewService } from "./services/merchant-application-review.service";
import type { MerchantFinanceRulesRepositoryPort } from "./services/merchant-finance-rules.service";
import type {
  MerchantSaasBillingRepositoryPort,
  PaymentProvider
} from "./services/merchant-saas-billing.service";
import type { OrderFinanceRepositoryPort } from "./services/order-finance.service";
import type { PayrollRepositoryPort } from "./services/payroll.service";
import type { PayrollSchedulePolicyRepositoryPort } from "./services/payroll-schedule-policy.service";
import type { PermissionRepositoryPort } from "./repositories/permission.repository";
import type { PricingModeRepositoryPort } from "./services/pricing-mode.service";
import type { PublicIdentifierRepositoryPort } from "./services/public-identifier.service";
import type { TechnicianShopAffiliationRepositoryPort } from "./services/technician-shop-affiliation.service";
import {
  RealtimeRepository,
  type RealtimeRepositoryPort
} from "./repositories/realtime.repository";
import type { RoleRepositoryPort } from "./repositories/role.repository";
import type { UserRepositoryPort } from "./repositories/user.repository";
import type { TestAccountRepositoryPort } from "./repositories/test-account.repository";
import { createAuthRoutes } from "./routes/auth.routes";
import { createAffiliateTaskRoutes } from "./routes/affiliate-task.routes";
import { createAffiliateMarketplaceRoutes } from "./routes/affiliate-marketplace.routes";
import { createAffiliateProfileRoutes } from "./routes/affiliate-profile.routes";
import { createAffiliateAllianceRoutes } from "./routes/affiliate-alliance.routes";
import { createBackofficeRoutes } from "./routes/backoffice.routes";
import { createBookingRoutes } from "./routes/booking.routes";
import { createCompensationProfileRoutes } from "./routes/compensation-profile.routes";
import { createCoreReadRoutes } from "./routes/core-read.routes";
import { createCustomerProfileRoutes } from "./routes/customer-profile.routes";
import { createShopMembershipRoutes } from "./routes/shop-membership.routes";
import { createShopMembershipCardPlanRoutes } from "./routes/shop-membership-card-plan.routes";
import { createTechnicianProfileRoutes } from "./routes/technician-profile.routes";
import { createFeeRuleRoutes } from "./routes/fee-rule.routes";
import { createPlatformFeePolicyRoutes } from "./routes/platform-fee-policy.routes";
import { createOrderAcceptancePauseRoutes } from "./routes/order-acceptance-pause.routes";
import { createAffiliatePlatformFeeRoutes } from "./routes/affiliate-platform-fee.routes";
import { createHealthRoutes } from "./routes/health.routes";
import { createLedgerRoutes } from "./routes/ledger.routes";
import { createIdentityApplicationRoutes } from "./routes/identity-application.routes";
import { createIdentityApplicationMediaRoutes } from "./routes/identity-application-media.routes";
import { createImMediaRoutes } from "./routes/im-media.routes";
import { createImVoiceMessageRoutes } from "./routes/im-voice-message.routes";
import { createContentMediaRoutes } from "./routes/content-media.routes";
import { createSocialMediaRoutes } from "./routes/social-media.routes";
import { createOfficialAnnouncementRoutes } from "./routes/official-announcement.routes";
import { createCarouselPublicationRoutes } from "./routes/carousel-publication.routes";
import { createIdentityActivationRoutes } from "./routes/identity-activation.routes";
import { createMerchantTechnicianApplicationRoutes } from "./routes/merchant-technician-application.routes";
import { createOperationsMerchantApplicationRoutes } from "./routes/operations-merchant-application.routes";
import { createMerchantFinanceRulesRoutes } from "./routes/merchant-finance-rules.routes";
import { createMerchantSaasBillingRoutes } from "./routes/merchant-saas-billing.routes";
import { createObservabilityRoutes } from "./routes/observability.routes";
import { createOrderFinanceRoutes } from "./routes/order-finance.routes";
import { createPayrollRoutes } from "./routes/payroll.routes";
import { createPayrollSchedulePolicyRoutes } from "./routes/payroll-schedule-policy.routes";
import { createPermissionRoutes } from "./routes/permission.routes";
import { createPricingModeRoutes } from "./routes/pricing-mode.routes";
import { createRealtimeRoutes } from "./routes/realtime.routes";
import { createExchangeRoutes } from "./routes/exchange.routes";
import { createTechnicianShopAffiliationRoutes } from "./routes/technician-shop-affiliation.routes";
import { createRoleRoutes } from "./routes/role.routes";
import { createUserRoutes } from "./routes/user.routes";
import type { OtpDeliveryClient } from "./services/auth-otp-delivery.service";
import type { AuthSessionStore } from "./services/auth-session.store";
import type { VerificationChallengeStore } from "./services/auth-verification-challenge.store";
import type { GoogleCredentialVerifierPort } from "./services/google-credential-verifier.service";
import type { CustomerAvatarStoragePort } from "./services/customer-avatar.storage";
import type { ExchangeService } from "./services/exchange.service";
import {
  SseRealtimeEventGateway,
  type RealtimeEventGatewayPort
} from "./services/realtime-event.gateway";
import { RealtimeService } from "./services/realtime.service";
import type { ImMediaStoragePort } from "./services/im-media.storage";
import type { ImMediaService } from "./services/im-media.service";
import type { ImVoiceDurationProbePort } from "./services/im-voice-duration-probe";
import type { ImVoiceStoragePort } from "./services/im-voice.storage";
import type { ImVoiceMessageService } from "./services/im-voice-message.service";
import { PersonalIdentityScopeService } from "./services/personal-identity-scope.service";
import {
  ObservabilityMetricsService,
  type ObservabilityMetricsPort
} from "./services/observability.service";

export interface AppDependencies {
  redisHealthCheck: () => Promise<RedisHealthStatus>;
  databaseHealthCheck?: () => Promise<DatabaseHealthStatus>;
  metricsService?: ObservabilityMetricsPort;
  authRepository?: AuthRepositoryPort;
  testOnlyAllowLegacyAuthAdapters?: boolean;
  authSessionStore?: AuthSessionStore;
  otpDeliveryClient?: OtpDeliveryClient;
  verificationChallengeStore?: VerificationChallengeStore;
  googleCredentialVerifier?: GoogleCredentialVerifierPort;
  auditLogRepository?: AuditLogRepositoryPort;
  permissionRepository?: PermissionRepositoryPort;
  pricingModeRepository?: PricingModeRepositoryPort;
  publicIdentifierRepository?: PublicIdentifierRepositoryPort;
  technicianShopAffiliationRepository?: TechnicianShopAffiliationRepositoryPort;
  roleRepository?: RoleRepositoryPort;
  userRepository?: UserRepositoryPort;
  testAccountRepository?: TestAccountRepositoryPort;
  coreReadRepository?: CoreReadRepositoryPort;
  customerProfileRepository?: CustomerProfileRepositoryPort;
  shopMembershipRepository?: ShopMembershipRepositoryPort;
  shopMembershipCardPlanRepository?: ShopMembershipCardPlanRepositoryPort;
  technicianProfileRepository?: TechnicianProfileRepositoryPort;
  customerAvatarStorage?: CustomerAvatarStoragePort;
  feeRuleRepository?: FeeRuleRepositoryPort;
  platformFeePolicyRepository?: PlatformFeePolicyRepositoryPort;
  orderAcceptancePauseRepository?: OrderAcceptancePauseRepositoryPort;
  affiliatePlatformFeeRepository?: AffiliatePlatformFeeRepositoryPort;
  affiliatePlatformFeeService?: AffiliatePlatformFeeService;
  merchantFinanceRulesRepository?: MerchantFinanceRulesRepositoryPort;
  merchantSaasBillingRepository?: MerchantSaasBillingRepositoryPort;
  paymentProvider?: PaymentProvider;
  orderFinanceRepository?: OrderFinanceRepositoryPort;
  payrollRepository?: PayrollRepositoryPort;
  payrollSchedulePolicyRepository?: PayrollSchedulePolicyRepositoryPort;
  compensationProfileRepository?: CompensationProfileRepositoryPort;
  bookingRepository?: BookingRepositoryPort;
  ledgerRepository?: LedgerRepositoryPort;
  identityApplicationRepository?: IdentityApplicationRepositoryPort;
  identityApplicationService?: IdentityApplicationService;
  identityApplicationMediaRepository?: IdentityApplicationMediaRepositoryPort;
  identityApplicationMediaService?: IdentityApplicationMediaService;
  identityApplicationMediaStorage?: IdentityApplicationMediaStoragePort;
  contentMediaRepository?: ContentMediaRepositoryPort;
  contentMediaService?: ContentMediaService;
  contentMediaStorage?: ContentMediaStoragePort;
  socialMediaRepository?: SocialMediaRepositoryPort;
  socialMediaService?: SocialMediaService;
  socialMediaStorage?: ContentMediaStoragePort;
  officialAnnouncementRepository?: OfficialAnnouncementRepositoryPort;
  officialAnnouncementService?: OfficialAnnouncementService;
  carouselPublicationRepository?: CarouselPublicationRepositoryPort;
  carouselPublicationService?: CarouselPublicationService;
  affiliateIdentityActivationRepository?: AffiliateIdentityActivationRepositoryPort;
  affiliateIdentityActivationService?: AffiliateIdentityActivationService;
  affiliateProfileRepository?: AffiliateProfileRepositoryPort;
  affiliateProfileService?: AffiliateProfileService;
  affiliateAllianceRepository?: AffiliateAllianceRepositoryPort;
  affiliateAllianceService?: AffiliateAllianceService;
  affiliateWithdrawalEligibilityRepository?: AffiliateWithdrawalEligibilityRepositoryPort;
  affiliateWithdrawalEligibilityService?: AffiliateWithdrawalEligibilityService;
  affiliateBankAccountRepository?: AffiliateBankAccountRepositoryPort;
  affiliateBankAccountService?: AffiliateBankAccountService;
  merchantContractAcceptanceRepository?: MerchantContractAcceptanceRepositoryPort;
  merchantContractAcceptanceService?: MerchantContractAcceptanceService;
  contractReceiptRepository?: ContractReceiptRepositoryPort;
  contractReceiptService?: ContractReceiptService;
  protectedBankAccountRepository?: ProtectedBankAccountRepositoryPort;
  protectedBankAccountService?: ProtectedBankAccountService;
  technicianApplicationReviewRepository?: TechnicianApplicationReviewRepositoryPort;
  technicianApplicationReviewService?: TechnicianApplicationReviewService;
  technicianResumeRepository?: TechnicianResumeRepository;
  technicianResumeExportService?: TechnicianResumeExportService;
  merchantApplicationReviewRepository?: MerchantApplicationReviewRepositoryPort;
  merchantApplicationReviewService?: MerchantApplicationReviewService;
  backofficeRepository?: BackofficeRepositoryPort;
  affiliateTaskRepository?: AffiliateTaskRepositoryPort;
  affiliateTaskService?: AffiliateTaskService;
  affiliateMarketplaceRepository?: AffiliateMarketplaceRepositoryPort;
  affiliateMarketplaceService?: AffiliateMarketplaceService;
  affiliateCheckoutService?: AffiliateCheckoutService;
  realtimeRepository?: RealtimeRepositoryPort;
  realtimeEventGateway?: RealtimeEventGatewayPort;
  realtimeService?: RealtimeService;
  personalIdentityScopeService?: Pick<PersonalIdentityScopeService, "resolve">;
  imMediaStorage?: ImMediaStoragePort;
  imMediaService?: ImMediaService;
  imVoiceDurationProbe?: ImVoiceDurationProbePort;
  imVoiceStorage?: ImVoiceStoragePort;
  imVoiceMessageService?: ImVoiceMessageService;
  exchangeService?: ExchangeService;
}

const createDefaultAppDependencies = (): AppDependencies => ({
  redisHealthCheck: checkRedisHealth,
  databaseHealthCheck: checkDatabaseHealth
});

export const createApp = (
  config: AppConfig = env,
  dependencies: AppDependencies = createDefaultAppDependencies()
): Express => {
  assertContentMediaStorageIsolationSync(
    config.CONTENT_MEDIA_STORAGE_DIR,
    config.IDENTITY_APPLICATION_MEDIA_STORAGE_DIR
  );
  const app = express();
  const apiRouter = Router();
  const metricsService = dependencies.metricsService ?? new ObservabilityMetricsService(config);

  if (config.TRUST_PROXY) {
    app.set("trust proxy", 1);
  }

  app.disable("x-powered-by");
  app.use(createTracingMiddleware(config));
  app.use(createRequestLoggerMiddleware(config));
  app.use(createMetricsMiddleware(config, metricsService));
  app.use(createHelmetMiddleware());
  app.use(createCorsMiddleware(config));
  app.use(express.json({ limit: config.REQUEST_BODY_LIMIT }));
  app.use(express.urlencoded({ extended: false, limit: config.REQUEST_BODY_LIMIT }));
  app.use(createRateLimitMiddleware(config));
  app.use(createCacheHeadersMiddleware(config));

  const realtimeRepository = dependencies.realtimeRepository ?? new RealtimeRepository();
  const realtimeEventGateway = dependencies.realtimeEventGateway ?? new SseRealtimeEventGateway();
  const authRepository = dependencies.authRepository ?? new AuthRepository();
  const personalIdentityScopeService =
    dependencies.personalIdentityScopeService ?? new PersonalIdentityScopeService(authRepository);
  const realtimeService =
    dependencies.realtimeService ??
    new RealtimeService(realtimeRepository, realtimeEventGateway, personalIdentityScopeService);
  const resolvedDependencies: AppDependencies = {
    ...dependencies,
    databaseHealthCheck: dependencies.databaseHealthCheck ?? checkDatabaseHealth,
    metricsService,
    authRepository,
    realtimeRepository,
    realtimeEventGateway,
    realtimeService,
    personalIdentityScopeService
  };

  apiRouter.use(createHealthRoutes(config, resolvedDependencies));
  apiRouter.use(createObservabilityRoutes(config, metricsService));
  apiRouter.use(createAuthRoutes(config, resolvedDependencies));
  apiRouter.use(createPermissionRoutes(config, resolvedDependencies));
  apiRouter.use(createRoleRoutes(config, resolvedDependencies));
  apiRouter.use(createUserRoutes(config, resolvedDependencies));
  apiRouter.use(createCoreReadRoutes(resolvedDependencies));
  apiRouter.use(createCustomerProfileRoutes(config, resolvedDependencies));
  apiRouter.use(createShopMembershipRoutes(config, resolvedDependencies));
  apiRouter.use(createShopMembershipCardPlanRoutes(config, resolvedDependencies));
  apiRouter.use(createTechnicianProfileRoutes(config, resolvedDependencies));
  apiRouter.use(createPricingModeRoutes(config, resolvedDependencies));
  apiRouter.use(createFeeRuleRoutes(config, resolvedDependencies));
  apiRouter.use(createPlatformFeePolicyRoutes(config, resolvedDependencies));
  apiRouter.use(createOrderAcceptancePauseRoutes(config, resolvedDependencies));
  apiRouter.use(createAffiliatePlatformFeeRoutes(config, resolvedDependencies));
  apiRouter.use(createMerchantFinanceRulesRoutes(config, resolvedDependencies));
  apiRouter.use(createOrderFinanceRoutes(config, resolvedDependencies));
  apiRouter.use(createPayrollRoutes(config, resolvedDependencies));
  apiRouter.use(createPayrollSchedulePolicyRoutes(config, resolvedDependencies));
  apiRouter.use(createCompensationProfileRoutes(config, resolvedDependencies));
  apiRouter.use(createLedgerRoutes(config, resolvedDependencies));
  apiRouter.use(createIdentityApplicationRoutes(config, resolvedDependencies));
  apiRouter.use(createIdentityApplicationMediaRoutes(config, resolvedDependencies));
  apiRouter.use(createContentMediaRoutes(config, resolvedDependencies));
  apiRouter.use(createOfficialAnnouncementRoutes(config, resolvedDependencies));
  apiRouter.use(createCarouselPublicationRoutes(config, resolvedDependencies));
  apiRouter.use(createIdentityActivationRoutes(config, resolvedDependencies));
  apiRouter.use(createAffiliateProfileRoutes(config, resolvedDependencies));
  apiRouter.use(createAffiliateAllianceRoutes(config, resolvedDependencies));
  apiRouter.use(createMerchantTechnicianApplicationRoutes(config, resolvedDependencies));
  apiRouter.use(createOperationsMerchantApplicationRoutes(config, resolvedDependencies));
  apiRouter.use(createAffiliateTaskRoutes(config, resolvedDependencies));
  apiRouter.use(createAffiliateMarketplaceRoutes(config, resolvedDependencies));
  apiRouter.use(createBookingRoutes(config, resolvedDependencies));
  apiRouter.use(createBackofficeRoutes(config, resolvedDependencies));
  apiRouter.use(createMerchantSaasBillingRoutes(config, resolvedDependencies));
  apiRouter.use(createImMediaRoutes(config, resolvedDependencies));
  apiRouter.use(createImVoiceMessageRoutes(config, resolvedDependencies));
  apiRouter.use(createSocialMediaRoutes(config, resolvedDependencies));
  apiRouter.use(createRealtimeRoutes(config, resolvedDependencies));
  apiRouter.use(createExchangeRoutes(config, resolvedDependencies));
  apiRouter.use(createTechnicianShopAffiliationRoutes(config, resolvedDependencies));
  if (config.OPENAPI_ENABLED) {
    apiRouter.use(createOpenApiRoutes(config));
  }

  app.use(config.API_PREFIX, apiRouter);
  app.use(
    "/media/customer-avatars",
    createCustomerAvatarStaticMiddleware(config.CUSTOMER_AVATAR_STORAGE_DIR)
  );
  app.use("/media/im", createImMediaStaticMiddleware(config.IM_MEDIA_STORAGE_DIR));
  app.use("/media/content", createContentMediaStaticMiddleware(config.CONTENT_MEDIA_STORAGE_DIR));
  app.use(notFoundMiddleware);
  app.use(errorMiddleware);

  return app;
};

const customerAvatarFilenamePattern = /^\/[a-f0-9]{64}\.(?:jpg|png|webp)$/;
const contentMediaFilenamePattern = /^\/[a-f0-9]{64}\.(?:jpg|png|webp)$/;

const createContentMediaStaticMiddleware = (directory: string) => {
  const staticMiddleware = express.static(directory, {
    index: false,
    redirect: false,
    setHeaders: (response) => {
      response.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      response.setHeader("Content-Disposition", "inline");
      response.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
    }
  });

  return (
    request: express.Request,
    response: express.Response,
    next: express.NextFunction
  ): void => {
    if (!contentMediaFilenamePattern.test(request.path)) {
      next();
      return;
    }
    staticMiddleware(request, response, next);
  };
};

const createCustomerAvatarStaticMiddleware = (directory: string) => {
  const staticMiddleware = express.static(directory, {
    index: false,
    redirect: false,
    setHeaders: (response) => {
      response.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      response.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
    }
  });

  return (
    request: express.Request,
    response: express.Response,
    next: express.NextFunction
  ): void => {
    if (!customerAvatarFilenamePattern.test(request.path)) {
      next();
      return;
    }

    staticMiddleware(request, response, next);
  };
};

const imMediaFilenamePattern = /^\/[a-f0-9]{64}\.(?:jpg|png|webp|webm|mp4|ogg)$/;

const createImMediaStaticMiddleware = (directory: string) => {
  const staticMiddleware = express.static(directory, {
    index: false,
    redirect: false,
    setHeaders: (response) => {
      response.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      response.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
      response.setHeader("X-Content-Type-Options", "nosniff");
    }
  });

  return (
    request: express.Request,
    response: express.Response,
    next: express.NextFunction
  ): void => {
    if (!imMediaFilenamePattern.test(request.path)) {
      next();
      return;
    }
    staticMiddleware(request, response, next);
  };
};
