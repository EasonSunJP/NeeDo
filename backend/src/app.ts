import { createEkycApplicationRoutes } from "./routes/ekyc-application.routes";
import type { EkycApplicationRepositoryPort, EkycApplicationService } from "./services/ekyc-application.service";
import type { OperationsMemberRepositoryPort } from "./repositories/operations-member.repository";
import { createWorkStatusRoutes } from './routes/work-status.routes';
import type { WorkStatusService } from './services/work-status.service';
import { createSosRoutes } from "./routes/sos.routes";
import type { SosService, SosRepositoryPort } from "./services/sos.service";
import express, { Router, type Express } from "express";
import { compatibilityApiRouteManifest, type ApiRouteOwnership } from "./apps/api-route-manifest";
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
import { createPlatformMaintenanceMiddleware } from "./middlewares/platform-maintenance.middleware";
import {
  AuditLogRepository,
  type AuditLogRepositoryPort
} from "./repositories/audit-log.repository";
import type { AffiliateProfileRepositoryPort } from "./repositories/affiliate-profile.repository";
import { AuthRepository, type AuthRepositoryPort } from "./repositories/auth.repository";
import type { MerchantShopContextRepositoryPort } from "./repositories/merchant-shop-context.repository";
import type { BackofficeRepositoryPort } from "./services/backoffice.service";
import type { BackofficeUserReviewRepositoryPort } from "./repositories/backoffice-user-review.repository";
import type { BackofficeUserReviewService } from "./services/backoffice-user-review.service";
import type { BackofficeUserUsageRepositoryPort } from "./repositories/backoffice-user-usage.repository";
import type { BackofficeUserUsageService } from "./services/backoffice-user-usage.service";
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
import type { NdpExchangeRateRepositoryPort } from "./repositories/ndp-exchange-rate.repository";
import type { CompensationProfileRepositoryPort } from "./services/compensation-profile.service";
import type { CoreReadRepositoryPort } from "./repositories/core-read.repository";
import type { SearchQueryRecorderRepositoryPort } from "./repositories/search-query-recorder.repository";
import type { ServiceSearchAnalyticsRepositoryPort } from "./repositories/service-search-analytics.repository";
import type { SearchQueryRecorderPort } from "./services/search-query-recorder.service";
import type { ShopTaxonomyRepositoryPort } from "./repositories/shop-taxonomy.repository";
import type { EntityEngagementRepositoryPort } from "./repositories/entity-engagement.repository";
import type { CustomerProfileRepositoryPort } from "./repositories/customer-profile.repository";
import {
  PlatformMembershipRepository,
  type PlatformMembershipRepositoryPort
} from "./repositories/platform-membership.repository";
import {
  PlatformSettingsRepository,
  type PlatformSettingsRepositoryPort
} from "./repositories/platform-settings.repository";
import {
  ImServerRetentionRepository,
  type ImMediaLifecycleRepositoryPort
} from "./repositories/im-server-retention.repository";
import {
  ImPolicyRepository,
  type ImPolicyRepositoryPort
} from "./repositories/im-policy.repository";
import {
  LegalDocumentRepository,
  type LegalDocumentRepositoryPort
} from "./repositories/legal-document.repository";
import type { UserExperienceRepositoryPort } from "./domain/user-experience";
import type { BackofficeUserGroupRepositoryPort } from "./domain/backoffice-user-group";
import type { UserGlobalPolicyRepositoryPort } from "./domain/user-global-policy";
import type { UserPolicyEnforcementRepositoryPort } from "./domain/user-policy-enforcement";
import type { NdpExperienceCampaignRepositoryPort } from "./domain/ndp-experience-campaign";
import type { UserPolicyEnforcementService } from "./services/user-policy-enforcement.service";
import type { ShopMembershipRepositoryPort } from "./repositories/shop-membership.repository";
import type { ShopMembershipCardPlanRepositoryPort } from "./repositories/shop-membership-card-plan.repository";
import type { ShopMembershipCardIssuanceRepositoryPort } from "./services/shop-membership-card-issuance.service";
import type { MembershipAnalyticsRepositoryPort } from "./repositories/membership-analytics.repository";
import type { ShopMembershipCardAdjustmentRepositoryPort } from "./services/shop-membership-card-adjustment.service";
import type { ShopMembershipCardTopUpRepositoryPort } from "./services/shop-membership-card-topup.service";
import type { ShopMembershipCardRedemptionRepositoryPort } from "./services/shop-membership-card-redemption.service";
import type { ShopMembershipCardRefundRepositoryPort } from "./services/shop-membership-card-refund.service";
import type { ReleasePublicationRepositoryPort } from "./repositories/release-publication.repository";
import { createReleasePublicationRoutes } from "./routes/release-publication.routes";
import type { AnalyticsRankingRepositoryPort } from "./repositories/analytics-ranking.repository";
import type { AgentCommissionRuleRepositoryPort } from "./repositories/agent-commission-rule.repository";
import type { OperatingCostRepositoryPort } from "./repositories/operating-cost.repository";
import type { AgentSettlementRepositoryPort } from "./repositories/agent-settlement.repository";
import type { AdministrativeRegionRepositoryPort } from "./repositories/administrative-region.repository";
import type { LiveDashboardRepositoryPort } from "./repositories/live-dashboard.repository";
import type { TechnicianProfileRepositoryPort } from "./repositories/technician-profile.repository";
import type { TechnicianDataCenterRepositoryPort } from "./services/technician-data-center.service";
import type { MerchantProfileRepositoryPort } from "./repositories/merchant-profile.repository";
import type { FeeRuleRepositoryPort } from "./services/fee-calculation.service";
import type { PlatformFeePolicyRepositoryPort } from "./services/platform-fee-policy.service";
import type { ShopTravelFarePolicyRepositoryPort } from "./services/shop-travel-fare-policy.service";
import type { RouteEstimateRepositoryPort } from "./services/route-estimate.service";
import type { RouteDistanceProvider } from "./services/route-distance.provider";
import type { RouteProviderHealthStorePort } from "./services/route-provider-health";
import type { TravelOperationsRepositoryPort } from "./services/travel-operations.service";
import type { OrderAcceptancePauseRepositoryPort } from "./services/order-acceptance-pause.service";
import type { NdpExchangeRateService } from "./services/ndp-exchange-rate.service";
import type { OrderPerformanceRepositoryPort } from "./repositories/order-performance.repository";
import type { OrderRefundCaseRepositoryPort } from "./services/order-refund-case.service";
import type {
  AffiliatePlatformFeeRepositoryPort,
  AffiliatePlatformFeeService
} from "./services/affiliate-platform-fee.service";
import type { LedgerRepositoryPort, LedgerService } from "./services/ledger.service";
import type { IdentityApplicationRepositoryPort } from "./services/identity-application.service";
import type { IdentityApplicationService } from "./services/identity-application.service";
import type { IdentityApplicationMediaRepositoryPort } from "./services/identity-application-media.service";
import type { IdentityApplicationMediaService } from "./services/identity-application-media.service";
import type { IdentityApplicationMediaStoragePort } from "./services/identity-application-media.storage";
import type { ContentMediaRepositoryPort } from "./services/content-media.service";
import type { ContentMediaService } from "./services/content-media.service";
import type { OfficialNoticeMediaStoragePort } from "./services/official-notice-media.storage";
import type {
  OfficialNoticeMediaRepositoryPort,
  OfficialNoticeMediaService
} from "./services/official-notice-media.service";
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
import type { PlatformPartnerRepositoryPort } from "./services/platform-partner.service";
import type { TechnicianShopAffiliationRepositoryPort } from "./services/technician-shop-affiliation.service";
import type { ShopEmployeeDirectoryRepositoryPort } from "./services/shop-employee-directory.service";
import {
  RealtimeRepository,
  type RealtimeRepositoryPort
} from "./repositories/realtime.repository";
import type { ImChatRecordRepositoryPort } from "./repositories/im-chat-record.repository";
import type { ImMessageTranslationRepositoryPort } from "./repositories/im-message-translation.repository";
import type { RoleRepositoryPort } from "./repositories/role.repository";
import type { UserRepositoryPort } from "./repositories/user.repository";
import type { TestAccountRepositoryPort } from "./repositories/test-account.repository";
import { createAuthRoutes } from "./routes/auth.routes";
import { createAffiliateTaskRoutes } from "./routes/affiliate-task.routes";
import { createAffiliateMarketplaceRoutes } from "./routes/affiliate-marketplace.routes";
import { createAffiliateProfileRoutes } from "./routes/affiliate-profile.routes";
import { createAffiliateAllianceRoutes } from "./routes/affiliate-alliance.routes";
import { createBackofficeRoutes } from "./routes/backoffice.routes";
import { createBackofficeUserReviewRoutes } from "./routes/backoffice-user-review.routes";
import { createBackofficeUserUsageRoutes } from "./routes/backoffice-user-usage.routes";
import { createBookingRoutes } from "./routes/booking.routes";
import { createCompensationProfileRoutes } from "./routes/compensation-profile.routes";
import { createCoreReadRoutes } from "./routes/core-read.routes";
import { createShopTaxonomyRoutes } from "./routes/shop-taxonomy.routes";
import { createEntityEngagementRoutes } from "./routes/entity-engagement.routes";
import { createCustomerProfileRoutes } from "./routes/customer-profile.routes";
import { createShopMembershipRoutes } from "./routes/shop-membership.routes";
import { createShopMembershipCardPlanRoutes } from "./routes/shop-membership-card-plan.routes";
import { createShopMembershipCardIssuanceRoutes } from "./routes/shop-membership-card-issuance.routes";
import { createMembershipAnalyticsRoutes } from "./routes/membership-analytics.routes";
import { createShopMembershipCardAdjustmentRoutes } from "./routes/shop-membership-card-adjustment.routes";
import { createShopMembershipCardTopUpRoutes } from "./routes/shop-membership-card-topup.routes";
import { createShopMembershipCardRedemptionRoutes } from "./routes/shop-membership-card-redemption.routes";
import { createAnalyticsRankingRoutes } from "./routes/analytics-ranking.routes";
import { createTechnicianProfileRoutes } from "./routes/technician-profile.routes";
import { createTechnicianDataCenterRoutes } from "./routes/technician-data-center.routes";
import { createMerchantProfileRoutes } from "./routes/merchant-profile.routes";
import { createFeeRuleRoutes } from "./routes/fee-rule.routes";
import { createPlatformFeePolicyRoutes } from "./routes/platform-fee-policy.routes";
import { createShopTravelFarePolicyRoutes } from "./routes/shop-travel-fare-policy.routes";
import { createRouteEstimateRoutes } from "./routes/route-estimate.routes";
import { createTravelOperationsRoutes } from "./routes/travel-operations.routes";
import { createPlatformMembershipRoutes } from "./routes/platform-membership.routes";
import { createPlatformSettingsRoutes } from "./routes/platform-settings.routes";
import { createBackofficeUserGroupRoutes } from "./routes/backoffice-user-group.routes";
import { createUserGlobalPolicyRoutes } from "./routes/user-global-policy.routes";
import { createImPolicyRoutes } from "./routes/im-policy.routes";
import { createLegalDocumentRoutes } from "./routes/legal-document.routes";
import { createOrderAcceptancePauseRoutes } from "./routes/order-acceptance-pause.routes";
import { createOrderPerformanceRoutes } from "./routes/order-performance.routes";
import { createOrderRefundCaseRoutes } from "./routes/order-refund-case.routes";
import { createAffiliatePlatformFeeRoutes } from "./routes/affiliate-platform-fee.routes";
import { createNdpExchangeRateRoutes } from "./routes/ndp-exchange-rate.routes";
import { createHealthRoutes } from "./routes/health.routes";
import { createLedgerRoutes } from "./routes/ledger.routes";
import { createIdentityApplicationRoutes } from "./routes/identity-application.routes";
import { createIdentityApplicationMediaRoutes } from "./routes/identity-application-media.routes";
import { createImMediaRoutes } from "./routes/im-media.routes";
import { createImChatRecordRoutes } from "./routes/im-chat-record.routes";
import { createImMessageTranslationRoutes } from "./routes/im-message-translation.routes";
import { createImVoiceMessageRoutes } from "./routes/im-voice-message.routes";
import { createContentMediaRoutes } from "./routes/content-media.routes";
import { createSocialMediaRoutes } from "./routes/social-media.routes";
import { createOfficialAnnouncementRoutes } from "./routes/official-announcement.routes";
import {
  createMerchantOfficialNoticeManagementRoutes,
  createOfficialNoticeManagementRoutes,
  createOfficialNoticeRecipientRoutes
} from "./routes/official-notice.routes";
import type {
  OfficialNoticeRepositoryPort,
  OfficialNoticeService
} from "./services/official-notice.service";
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
import { createExchangeClaimRoutes } from "./routes/exchange-claim.routes";
import { createExchangeMatchingRoutes } from "./routes/exchange-matching.routes";
import { createExchangeBookingConversionRoutes } from "./routes/exchange-booking-conversion.routes";
import { createExchangeCancellationRoutes } from "./routes/exchange-cancellation.routes";
import { createExchangeRequestFeeRoutes } from "./routes/exchange-request-fee.routes";
import { createTechnicianShopAffiliationRoutes } from "./routes/technician-shop-affiliation.routes";
import { createShopEmployeeDirectoryRoutes } from "./routes/shop-employee-directory.routes";
import { createPlatformPartnerRoutes } from "./routes/platform-partner.routes";
import { createAgentCommissionRuleRoutes } from "./routes/agent-commission-rule.routes";
import { createOperatingCostRoutes } from "./routes/operating-cost.routes";
import { createServiceSearchAnalyticsRoutes } from "./routes/service-search-analytics.routes";
import { createAgentSettlementRoutes } from "./routes/agent-settlement.routes";
import { createAdministrativeRegionRoutes } from "./routes/administrative-region.routes";
import { createRoleRoutes } from "./routes/role.routes";
import { createUserRoutes } from "./routes/user.routes";
import { createUserExperienceServiceForRoutes } from "./routes/user-experience-service.factory";
import { createUserExperienceRoutes } from "./routes/user-experience.routes";
import type { OtpDeliveryClient } from "./services/auth-otp-delivery.service";
import type { AuthSessionStore } from "./services/auth-session.store";
import type { LiveDashboardCachePort } from "./services/live-dashboard-cache.service";
import type { LiveDashboardEventGatewayPort } from "./services/live-dashboard-event.gateway";
import type { MerchantShopAuditOutboxTrigger } from "./services/auth.service";
import type { VerificationChallengeStore } from "./services/auth-verification-challenge.store";
import type { GoogleCredentialVerifierPort } from "./services/google-credential-verifier.service";
import type { CustomerAvatarStoragePort } from "./services/customer-avatar.storage";
import { PlatformMembershipService } from "./services/platform-membership.service";
import type { UserExperienceService } from "./services/user-experience.service";
import type { BackofficeUserGroupService } from "./services/backoffice-user-group.service";
import type { UserGlobalPolicyService } from "./services/user-global-policy.service";
import type { NdpExperienceCampaignService } from "./services/ndp-experience-campaign.service";
import { AuditLogService } from "./services/audit-log.service";
import {
  PlatformAccessPolicyService,
  type PlatformAccessPolicyPort
} from "./services/platform-access-policy.service";
import { PlatformSettingsResolver } from "./services/platform-settings.resolver";
import { PlatformSettingsService } from "./services/platform-settings.service";
import type { ExchangeService } from "./services/exchange.service";
import type { ExchangeClaimService } from "./services/exchange-claim.service";
import type { ExchangeMatchingService } from "./services/exchange-matching.service";
import type { ExchangeBookingConversionService } from "./services/exchange-booking-conversion.service";
import type { ExchangeCancellationService } from "./services/exchange-cancellation.service";
import type { ExchangeRequestFeeService } from "./services/exchange-request-fee.service";
import {
  SseRealtimeEventGateway,
  type RealtimeEventGatewayPort
} from "./services/realtime-event.gateway";
import { RealtimeService } from "./services/realtime.service";
import type { ImMediaStoragePort } from "./services/im-media.storage";
import type { ImMediaService } from "./services/im-media.service";
import { ImPolicyService } from "./services/im-policy.service";
import { LegalDocumentService } from "./services/legal-document.service";
import type { ImChatRecordMediaStoragePort } from "./services/im-chat-record-media.storage";
import type { ImChatRecordService } from "./services/im-chat-record.service";
import type { ImMessageTranslationService } from "./services/im-message-translation.service";
import type { TranslationProvider } from "./services/im-translation.provider";
import type { ImVoiceDurationProbePort } from "./services/im-voice-duration-probe";
import type { ImVoiceStoragePort } from "./services/im-voice.storage";
import type { ImVoiceMessageService } from "./services/im-voice-message.service";
import { PersonalIdentityScopeService } from "./services/personal-identity-scope.service";
import {
  ObservabilityMetricsService,
  type ObservabilityMetricsPort
} from "./services/observability.service";

export interface AppDependencies {
  workStatusService?: WorkStatusService;
  redisHealthCheck: () => Promise<RedisHealthStatus>;
  databaseHealthCheck?: () => Promise<DatabaseHealthStatus>;
  metricsService?: ObservabilityMetricsPort;
  authRepository?: AuthRepositoryPort;
  merchantShopContextRepository?: MerchantShopContextRepositoryPort;
  testOnlyAllowLegacyAuthAdapters?: boolean;
  authSessionStore?: AuthSessionStore;
  merchantShopAuditOutboxTrigger?: MerchantShopAuditOutboxTrigger;
  otpDeliveryClient?: OtpDeliveryClient;
  verificationChallengeStore?: VerificationChallengeStore;
  googleCredentialVerifier?: GoogleCredentialVerifierPort;
  auditLogRepository?: AuditLogRepositoryPort;
  permissionRepository?: PermissionRepositoryPort;
  pricingModeRepository?: PricingModeRepositoryPort;
  publicIdentifierRepository?: PublicIdentifierRepositoryPort;
  platformPartnerRepository?: PlatformPartnerRepositoryPort;
  technicianShopAffiliationRepository?: TechnicianShopAffiliationRepositoryPort;
  shopEmployeeDirectoryRepository?: ShopEmployeeDirectoryRepositoryPort;
  roleRepository?: RoleRepositoryPort;
  userRepository?: UserRepositoryPort;
  operationsMemberRepository?: OperationsMemberRepositoryPort;
  testAccountRepository?: TestAccountRepositoryPort;
  coreReadRepository?: CoreReadRepositoryPort;
  searchQueryRecorderRepository?: SearchQueryRecorderRepositoryPort;
  searchQueryRecorder?: SearchQueryRecorderPort;
  serviceSearchAnalyticsRepository?: ServiceSearchAnalyticsRepositoryPort;
  shopTaxonomyRepository?: ShopTaxonomyRepositoryPort;
  entityEngagementRepository?: EntityEngagementRepositoryPort;
  customerProfileRepository?: CustomerProfileRepositoryPort;
  shopMembershipRepository?: ShopMembershipRepositoryPort;
  shopMembershipCardPlanRepository?: ShopMembershipCardPlanRepositoryPort;
  shopMembershipCardIssuanceRepository?: ShopMembershipCardIssuanceRepositoryPort;
  membershipAnalyticsRepository?: MembershipAnalyticsRepositoryPort;
  shopMembershipCardAdjustmentRepository?: ShopMembershipCardAdjustmentRepositoryPort;
  shopMembershipCardTopUpRepository?: ShopMembershipCardTopUpRepositoryPort;
  shopMembershipCardRedemptionRepository?: ShopMembershipCardRedemptionRepositoryPort;
  shopMembershipCardRefundRepository?: ShopMembershipCardRefundRepositoryPort;
  releasePublicationRepository?: ReleasePublicationRepositoryPort;
  analyticsRankingRepository?: AnalyticsRankingRepositoryPort;
  agentCommissionRuleRepository?: AgentCommissionRuleRepositoryPort;
  operatingCostRepository?: OperatingCostRepositoryPort;
  agentSettlementRepository?: AgentSettlementRepositoryPort;
  administrativeRegionRepository?: AdministrativeRegionRepositoryPort;
  liveDashboardRepository?: LiveDashboardRepositoryPort;
  liveDashboardCache?: LiveDashboardCachePort;
  liveDashboardEventGateway?: LiveDashboardEventGatewayPort;
  liveDashboardClock?: () => Date;
  analyticsRankingClock?: () => Date;
  technicianProfileRepository?: TechnicianProfileRepositoryPort;
  technicianDataCenterRepository?: TechnicianDataCenterRepositoryPort;
  merchantProfileRepository?: MerchantProfileRepositoryPort;
  customerAvatarStorage?: CustomerAvatarStoragePort;
  feeRuleRepository?: FeeRuleRepositoryPort;
  platformFeePolicyRepository?: PlatformFeePolicyRepositoryPort;
  shopTravelFarePolicyRepository?: ShopTravelFarePolicyRepositoryPort;
  routeEstimateRepository?: RouteEstimateRepositoryPort;
  routeDistanceProvider?: RouteDistanceProvider;
  routeProviderHealthStore?: RouteProviderHealthStorePort;
  travelOperationsRepository?: TravelOperationsRepositoryPort;
  orderAcceptancePauseRepository?: OrderAcceptancePauseRepositoryPort;
  orderPerformanceRepository?: OrderPerformanceRepositoryPort;
  orderRefundCaseRepository?: OrderRefundCaseRepositoryPort;
  affiliatePlatformFeeRepository?: AffiliatePlatformFeeRepositoryPort;
  affiliatePlatformFeeService?: AffiliatePlatformFeeService;
  ndpExchangeRateRepository?: NdpExchangeRateRepositoryPort;
  ndpExchangeRateService?: NdpExchangeRateService;
  merchantFinanceRulesRepository?: MerchantFinanceRulesRepositoryPort;
  merchantSaasBillingRepository?: MerchantSaasBillingRepositoryPort;
  paymentProvider?: PaymentProvider;
  orderFinanceRepository?: OrderFinanceRepositoryPort;
  payrollRepository?: PayrollRepositoryPort;
  payrollSchedulePolicyRepository?: PayrollSchedulePolicyRepositoryPort;
  compensationProfileRepository?: CompensationProfileRepositoryPort;
  bookingRepository?: BookingRepositoryPort;
  ledgerRepository?: LedgerRepositoryPort;
  ekycApplicationRepository?: EkycApplicationRepositoryPort;
  ekycApplicationService?: EkycApplicationService;
  identityApplicationRepository?: IdentityApplicationRepositoryPort;
  identityApplicationService?: IdentityApplicationService;
  identityApplicationMediaRepository?: IdentityApplicationMediaRepositoryPort;
  identityApplicationMediaService?: IdentityApplicationMediaService;
  identityApplicationMediaStorage?: IdentityApplicationMediaStoragePort;
  contentMediaRepository?: ContentMediaRepositoryPort;
  contentMediaService?: ContentMediaService;
  contentMediaStorage?: ContentMediaStoragePort;
  officialNoticeMediaRepository?: OfficialNoticeMediaRepositoryPort;
  officialNoticeMediaService?: OfficialNoticeMediaService;
  officialNoticeMediaStorage?: OfficialNoticeMediaStoragePort;
  socialMediaRepository?: SocialMediaRepositoryPort;
  socialMediaService?: SocialMediaService;
  socialMediaStorage?: ContentMediaStoragePort;
  officialAnnouncementRepository?: OfficialAnnouncementRepositoryPort;
  officialAnnouncementService?: OfficialAnnouncementService;
  officialNoticeRepository?: OfficialNoticeRepositoryPort;
  officialNoticeService?: OfficialNoticeService;
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
  backofficeUserReviewRepository?: BackofficeUserReviewRepositoryPort;
  backofficeUserReviewService?: Pick<
    BackofficeUserReviewService,
    "listForOperations" | "listForMerchant" | "amend"
  >;
  backofficeUserUsageRepository?: BackofficeUserUsageRepositoryPort;
  backofficeUserUsageService?: Pick<
    BackofficeUserUsageService,
    | "listForOperations"
    | "listForMerchant"
    | "getTimelineForOperations"
    | "getTimelineForMerchant"
    | "appendComment"
    | "amendRefund"
  >;
  platformMembershipService?: Pick<PlatformMembershipService, "changeEntitlement">;
  platformMembershipResolverService?: Pick<
    PlatformMembershipService,
    "resolveMembershipAt" | "hasEffectiveBenefitAt"
  >;
  userExperienceService?: Pick<
    UserExperienceService,
    | "recordEvent"
    | "recordNdpConsumption"
    | "recordNdpReversal"
    | "recordMembershipRenewal"
    | "getSummary"
    | "listEntries"
  >;
  userExperienceRepository?: UserExperienceRepositoryPort;
  platformMembershipAdministrationService?: Pick<
    PlatformMembershipService,
    | "listTiersForAdministration"
    | "getTierDraft"
    | "saveTierDraft"
    | "publishTierVersion"
    | "listBenefitsForAdministration"
    | "updateBenefit"
    | "changeEntitlement"
    | "adjustUserMembership"
    | "getMyMembership"
    | "getMyMembershipBenefits"
  >;
  platformMembershipRepository?: PlatformMembershipRepositoryPort;
  platformSettingsRepository?: PlatformSettingsRepositoryPort;
  platformSettingsResolver?: PlatformSettingsResolver;
  platformSettingsService?: Pick<
    PlatformSettingsService,
    "getPublic" | "getForOperations" | "updateBasic" | "updatePayment"
  >;
  platformAccessPolicyService?: PlatformAccessPolicyPort;
  imPolicyRepository?: ImPolicyRepositoryPort;
  imPolicyService?: Pick<ImPolicyService, "get" | "update">;
  legalDocumentRepository?: LegalDocumentRepositoryPort;
  legalDocumentService?: Pick<
    LegalDocumentService,
    | "list"
    | "create"
    | "updateMetadata"
    | "getLocale"
    | "saveDraft"
    | "publish"
    | "listReleases"
    | "getPublicCurrent"
  >;
  backofficeUserGroupService?: Pick<
    BackofficeUserGroupService,
    | "listGroups"
    | "listGroupMembers"
    | "createCustomGroup"
    | "updateCustomGroup"
    | "archiveCustomGroup"
    | "setCustomGroupMembers"
  >;
  backofficeUserGroupRepository?: BackofficeUserGroupRepositoryPort;
  userGlobalPolicyService?: Pick<
    UserGlobalPolicyService,
    "getCurrentAndDraft" | "saveDraft" | "publishDraft"
  >;
  userGlobalPolicyRepository?: UserGlobalPolicyRepositoryPort;
  userPolicyEnforcementRepository?: UserPolicyEnforcementRepositoryPort;
  userPolicyEnforcementService?: Pick<
    UserPolicyEnforcementService,
    "evaluateAccountCompliance" | "assertServiceEkyc"
  >;
  ndpExperienceCampaignService?: Pick<
    NdpExperienceCampaignService,
    "listCampaigns" | "saveDraft" | "publishDraft" | "archiveCampaign"
  >;
  ndpExperienceCampaignRepository?: NdpExperienceCampaignRepositoryPort;
  affiliateTaskRepository?: AffiliateTaskRepositoryPort;
  affiliateTaskService?: AffiliateTaskService;
  affiliateMarketplaceRepository?: AffiliateMarketplaceRepositoryPort;
  affiliateMarketplaceService?: AffiliateMarketplaceService;
  affiliateCheckoutService?: AffiliateCheckoutService;
  realtimeRepository?: RealtimeRepositoryPort;
  realtimeEventGateway?: RealtimeEventGatewayPort;
  sosService?: SosService;
  sosRepository?: SosRepositoryPort;
  realtimeService?: RealtimeService;
  personalIdentityScopeService?: Pick<PersonalIdentityScopeService, "resolve">;
  imMediaStorage?: ImMediaStoragePort;
  imMediaService?: ImMediaService;
  imMediaLifecycleRepository?: ImMediaLifecycleRepositoryPort;
  imChatRecordRepository?: ImChatRecordRepositoryPort;
  imChatRecordMediaStorage?: ImChatRecordMediaStoragePort;
  imChatRecordService?: ImChatRecordService;
  imMessageTranslationRepository?: ImMessageTranslationRepositoryPort;
  translationProvider?: TranslationProvider;
  imMessageTranslationService?: Pick<ImMessageTranslationService, "translateVisibleMessages">;
  imVoiceDurationProbe?: ImVoiceDurationProbePort;
  imVoiceStorage?: ImVoiceStoragePort;
  imVoiceMessageService?: ImVoiceMessageService;
  exchangeService?: ExchangeService;
  exchangeClaimService?: ExchangeClaimService;
  exchangeMatchingService?: ExchangeMatchingService;
  exchangeBookingConversionService?: ExchangeBookingConversionService;
  exchangeCancellationService?: ExchangeCancellationService;
  exchangeRequestFeeService?: ExchangeRequestFeeService;
  ledgerService?: LedgerService;
}

export interface CreateAppOptions {
  routeManifest?: readonly ApiRouteOwnership[];
}

const createDefaultAppDependencies = (): AppDependencies => ({
  redisHealthCheck: checkRedisHealth,
  databaseHealthCheck: checkDatabaseHealth
});

export const createApp = (
  config: AppConfig = env,
  dependencies: AppDependencies = createDefaultAppDependencies(),
  options: CreateAppOptions = {}
): Express => {
  assertContentMediaStorageIsolationSync(
    config.CONTENT_MEDIA_STORAGE_DIR,
    config.IDENTITY_APPLICATION_MEDIA_STORAGE_DIR
  );
  const app = express();
  const apiRouter = Router();
  const routeManifest = new Set(options.routeManifest ?? compatibilityApiRouteManifest);
  const mounts = (ownership: ApiRouteOwnership | readonly ApiRouteOwnership[]): boolean => {
    const allowed = Array.isArray(ownership) ? ownership : [ownership];
    return allowed.some((item) => routeManifest.has(item));
  };
  const mount = (
    ownership: ApiRouteOwnership | readonly ApiRouteOwnership[],
    router: Router
  ): void => {
    if (mounts(ownership)) apiRouter.use(router);
  };
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
  const userExperienceService = createUserExperienceServiceForRoutes(dependencies);
  const platformSettingsRepository =
    dependencies.platformSettingsRepository ?? new PlatformSettingsRepository();
  const platformSettingsResolver =
    dependencies.platformSettingsResolver ??
    new PlatformSettingsResolver(platformSettingsRepository);
  const platformSettingsService =
    dependencies.platformSettingsService ??
    new PlatformSettingsService(
      platformSettingsRepository,
      platformSettingsResolver,
      new AuditLogService(dependencies.auditLogRepository ?? new AuditLogRepository())
    );
  const platformAccessPolicyService =
    dependencies.platformAccessPolicyService ??
    (config.NODE_ENV === "test"
      ? undefined
      : new PlatformAccessPolicyService(platformSettingsResolver));
  const imPolicyRepository = dependencies.imPolicyRepository ?? new ImPolicyRepository();
  const imPolicyService =
    dependencies.imPolicyService ??
    new ImPolicyService(
      imPolicyRepository,
      new AuditLogService(dependencies.auditLogRepository ?? new AuditLogRepository())
    );
  const imMediaLifecycleRepository =
    dependencies.imMediaLifecycleRepository ?? new ImServerRetentionRepository();
  const legalDocumentRepository =
    dependencies.legalDocumentRepository ?? new LegalDocumentRepository();
  const legalDocumentService =
    dependencies.legalDocumentService ??
    new LegalDocumentService(
      legalDocumentRepository,
      new AuditLogService(dependencies.auditLogRepository ?? new AuditLogRepository())
    );
  const platformMembershipRepository =
    dependencies.platformMembershipRepository ?? new PlatformMembershipRepository();
  const platformMembershipResolverService =
    dependencies.platformMembershipResolverService ??
    new PlatformMembershipService(platformMembershipRepository);
  const realtimeService =
    dependencies.realtimeService ??
    new RealtimeService(
      realtimeRepository,
      realtimeEventGateway,
      personalIdentityScopeService,
      userExperienceService,
      undefined,
      platformMembershipResolverService
    );
  const resolvedDependencies: AppDependencies = {
    ...dependencies,
    databaseHealthCheck: dependencies.databaseHealthCheck ?? checkDatabaseHealth,
    metricsService,
    authRepository,
    realtimeRepository,
    realtimeEventGateway,
    realtimeService,
    userExperienceService,
    personalIdentityScopeService,
    platformSettingsRepository,
    platformSettingsResolver,
    platformSettingsService,
    imPolicyRepository,
    imPolicyService,
    imMediaLifecycleRepository,
    legalDocumentRepository,
    legalDocumentService,
    ...(platformAccessPolicyService ? { platformAccessPolicyService } : {}),
    platformMembershipRepository,
    platformMembershipResolverService
  };

  apiRouter.use((request, response, next) => {
    const isBackoffice = request.path === "/backoffice" || request.path.startsWith("/backoffice/");
    const isMerchantAdmin =
      request.path === "/merchant-admin" || request.path.startsWith("/merchant-admin/");
    if ((!mounts("backoffice") && isBackoffice) || (!mounts("merchant-admin") && isMerchantAdmin)) {
      notFoundMiddleware(request, response, next);
      return;
    }
    next();
  });

  mount("shared", createHealthRoutes(config, resolvedDependencies));
  mount("shared", createObservabilityRoutes(config, metricsService));
  mount("shared", createPlatformSettingsRoutes(config, resolvedDependencies));
  mount("shared", createImPolicyRoutes(config, resolvedDependencies));
  mount("shared", createLegalDocumentRoutes(config, resolvedDependencies));
  mount("shared", createAuthRoutes(config, resolvedDependencies));
  if (platformAccessPolicyService) {
    apiRouter.use(createPlatformMaintenanceMiddleware(platformAccessPolicyService));
  }
  mount("backoffice", createPermissionRoutes(config, resolvedDependencies));
  mount("backoffice", createRoleRoutes(config, resolvedDependencies));
  mount("backoffice", createUserRoutes(config, resolvedDependencies));
  mount("shared", createCoreReadRoutes(config, resolvedDependencies));
  mount("shared", createAdministrativeRegionRoutes(resolvedDependencies));
  mount(["shared", "merchant-admin"], createShopTaxonomyRoutes(config, resolvedDependencies));
  mount("shared", createEntityEngagementRoutes(config, resolvedDependencies));
  mount("merchant-admin", createCustomerProfileRoutes(config, resolvedDependencies));
  mount("merchant-admin", createShopMembershipRoutes(config, resolvedDependencies));
  mount(
    ["backoffice", "merchant-admin"],
    createShopMembershipCardPlanRoutes(config, resolvedDependencies)
  );
  mount("merchant-admin", createShopMembershipCardIssuanceRoutes(config, resolvedDependencies));
  mount(
    ["backoffice", "merchant-admin"],
    createMembershipAnalyticsRoutes(config, resolvedDependencies)
  );
  mount("merchant-admin", createShopMembershipCardAdjustmentRoutes(config, resolvedDependencies));
  mount("merchant-admin", createShopMembershipCardTopUpRoutes(config, resolvedDependencies));
  mount("merchant-admin", createShopMembershipCardRedemptionRoutes(config, resolvedDependencies));
  mount("backoffice", createReleasePublicationRoutes(config, resolvedDependencies));
  mount("backoffice", createAnalyticsRankingRoutes(config, resolvedDependencies));
  mount("shared", createTechnicianProfileRoutes(config, resolvedDependencies));
  mount("shared", createTechnicianDataCenterRoutes(config, resolvedDependencies));
  mount("merchant-admin", createMerchantProfileRoutes(config, resolvedDependencies));
  mount("merchant-admin", createPricingModeRoutes(config, resolvedDependencies));
  mount("shared", createFeeRuleRoutes(config, resolvedDependencies));
  mount(
    ["backoffice", "merchant-admin"],
    createPlatformFeePolicyRoutes(config, resolvedDependencies)
  );
  mount("merchant-admin", createShopTravelFarePolicyRoutes(config, resolvedDependencies));
  mount("shared", createRouteEstimateRoutes(config, resolvedDependencies));
  mount("backoffice", createTravelOperationsRoutes(config, resolvedDependencies));
  mount("backoffice", createPlatformMembershipRoutes(config, resolvedDependencies));
  mount("backoffice", createUserExperienceRoutes(config, resolvedDependencies));
  mount("backoffice", createBackofficeUserGroupRoutes(config, resolvedDependencies));
  mount("backoffice", createUserGlobalPolicyRoutes(config, resolvedDependencies));
  mount(
    ["backoffice", "merchant-admin"],
    createOrderAcceptancePauseRoutes(config, resolvedDependencies)
  );
  mount("backoffice", createOrderPerformanceRoutes(config, resolvedDependencies));
  mount(
    ["shared", "backoffice", "merchant-admin"],
    createOrderRefundCaseRoutes(config, resolvedDependencies)
  );
  mount("backoffice", createAffiliatePlatformFeeRoutes(config, resolvedDependencies));
  mount("backoffice", createNdpExchangeRateRoutes(config, resolvedDependencies));
  mount("merchant-admin", createMerchantFinanceRulesRoutes(config, resolvedDependencies));
  mount(["backoffice", "merchant-admin"], createOrderFinanceRoutes(config, resolvedDependencies));
  mount(["backoffice", "merchant-admin"], createPayrollRoutes(config, resolvedDependencies));
  mount("merchant-admin", createPayrollSchedulePolicyRoutes(config, resolvedDependencies));
  mount("merchant-admin", createCompensationProfileRoutes(config, resolvedDependencies));
  mount(["shared", "backoffice"], createLedgerRoutes(config, resolvedDependencies));
  mount("shared", createEkycApplicationRoutes(config, resolvedDependencies));
  mount("backoffice", createEkycApplicationRoutes(config, resolvedDependencies, true));
  mount("backoffice", createIdentityApplicationRoutes(config, resolvedDependencies));
  mount("backoffice", createIdentityApplicationMediaRoutes(config, resolvedDependencies));
  mount("backoffice", createContentMediaRoutes(config, resolvedDependencies));
  mount("backoffice", createOfficialAnnouncementRoutes(config, resolvedDependencies));
  mount("backoffice", createOfficialNoticeManagementRoutes(config, resolvedDependencies));
  mount(
    "merchant-admin",
    createMerchantOfficialNoticeManagementRoutes(config, resolvedDependencies)
  );
  mount("shared", createOfficialNoticeRecipientRoutes(config, resolvedDependencies));
  mount("backoffice", createCarouselPublicationRoutes(config, resolvedDependencies));
  mount("shared", createIdentityActivationRoutes(config, resolvedDependencies));
  mount("shared", createAffiliateProfileRoutes(config, resolvedDependencies));
  mount("shared", createAffiliateAllianceRoutes(config, resolvedDependencies));
  mount("merchant-admin", createMerchantTechnicianApplicationRoutes(config, resolvedDependencies));
  mount("backoffice", createOperationsMerchantApplicationRoutes(config, resolvedDependencies));
  mount(["backoffice", "merchant-admin"], createAffiliateTaskRoutes(config, resolvedDependencies));
  mount("shared", createAffiliateMarketplaceRoutes(config, resolvedDependencies));
  mount(["backoffice", "merchant-admin"], createBookingRoutes(config, resolvedDependencies));
  mount(["backoffice", "merchant-admin"], createBackofficeRoutes(config, resolvedDependencies));
  mount(
    ["backoffice", "merchant-admin"],
    createBackofficeUserReviewRoutes(config, resolvedDependencies)
  );
  mount(
    ["backoffice", "merchant-admin"],
    createBackofficeUserUsageRoutes(config, resolvedDependencies)
  );
  mount("backoffice", createMerchantSaasBillingRoutes(config, resolvedDependencies));
  mount("shared", createImMediaRoutes(config, resolvedDependencies));
  mount("shared", createImVoiceMessageRoutes(config, resolvedDependencies));
  mount("shared", createSocialMediaRoutes(config, resolvedDependencies));
  mount("shared", createImChatRecordRoutes(config, resolvedDependencies));
  mount("shared", createImMessageTranslationRoutes(config, resolvedDependencies));
  mount("shared", createRealtimeRoutes(config, resolvedDependencies));
  mount("shared", createWorkStatusRoutes(config, resolvedDependencies));
  mount("shared", createSosRoutes(config, resolvedDependencies));
  mount("shared", createExchangeRoutes(config, resolvedDependencies));
  mount("shared", createExchangeClaimRoutes(config, resolvedDependencies));
  mount("shared", createExchangeMatchingRoutes(config, resolvedDependencies));
  mount("shared", createExchangeBookingConversionRoutes(config, resolvedDependencies));
  mount("shared", createExchangeCancellationRoutes(config, resolvedDependencies));
  mount("backoffice", createExchangeRequestFeeRoutes(config, resolvedDependencies));
  mount("merchant-admin", createTechnicianShopAffiliationRoutes(config, resolvedDependencies));
  mount("merchant-admin", createShopEmployeeDirectoryRoutes(config, resolvedDependencies));
  mount("backoffice", createPlatformPartnerRoutes(config, resolvedDependencies));
  mount("backoffice", createAgentCommissionRuleRoutes(config, resolvedDependencies));
  mount("backoffice", createOperatingCostRoutes(config, resolvedDependencies));
  mount("backoffice", createServiceSearchAnalyticsRoutes(config, resolvedDependencies));
  mount("backoffice", createAgentSettlementRoutes(config, resolvedDependencies));
  if (config.OPENAPI_ENABLED && options.routeManifest === undefined) {
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
const contentMediaFilenamePattern = /^\/[a-f0-9]{64}\.(?:jpg|png|webp|mp4|webm|pdf|txt)$/;

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
      response.setHeader("Cache-Control", "private, no-store");
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
