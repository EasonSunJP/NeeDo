import { Router } from "express";
import type { AppDependencies } from "../app";
import type { AppConfig } from "../config/env";
import { EXCHANGE_PERMISSIONS } from "../constants/permissions.constants";
import { ExchangeBookingConversionController } from "../controllers/exchange-booking-conversion.controller";
import { createAuthenticateMiddleware } from "../middlewares/authenticate.middleware";
import { createAuthorizeMiddleware } from "../middlewares/authorize.middleware";
import { validateExchangeIdempotencyKey } from "../middlewares/exchange-idempotency-key.middleware";
import { validateRequest } from "../middlewares/validate-request.middleware";
import { AffiliateCheckoutRepository } from "../repositories/affiliate-checkout.repository";
import { AuditLogRepository } from "../repositories/audit-log.repository";
import { ExchangeBookingConversionRepository } from "../repositories/exchange-booking-conversion.repository";
import { BookingRepository } from "../repositories/booking.repository";
import { LiveDashboardOrderChangePublisher } from "../services/live-dashboard-order-change.publisher";
import { UserGlobalPolicyRepository } from "../repositories/user-global-policy.repository";
import { UserPolicyEnforcementRepository } from "../repositories/user-policy-enforcement.repository";
import { AffiliateCheckoutService } from "../services/affiliate-checkout.service";
import { AffiliateLinkTokenService } from "../services/affiliate-link-token.service";
import { AuditLogService } from "../services/audit-log.service";
import { ExchangeBookingConversionService } from "../services/exchange-booking-conversion.service";
import { UserGlobalPolicyService } from "../services/user-global-policy.service";
import { UserPolicyEnforcementService } from "../services/user-policy-enforcement.service";
import {
  exchangeBookingConversionBodySchema,
  exchangeBookingConversionPostIdParamSchema
} from "../validators/exchange-booking-conversion.validators";
import { createAuthServiceForRoutes } from "./auth-service.factory";
import { createBookingAutomationProcessorForRoutes } from "./booking.routes";

export const createExchangeBookingConversionRoutes = (
  config: AppConfig,
  dependencies: AppDependencies
): Router => {
  const router = Router();
  const authenticate = createAuthenticateMiddleware(
    createAuthServiceForRoutes(config, dependencies)
  );
  const audit = new AuditLogService(dependencies.auditLogRepository ?? new AuditLogRepository());
  const affiliate =
    dependencies.affiliateCheckoutService ??
    new AffiliateCheckoutService(
      new AffiliateCheckoutRepository(),
      new AffiliateLinkTokenService({
        secret: config.AFFILIATE_LINK_SECRET,
        publicBaseUrl: config.AFFILIATE_PUBLIC_BASE_URL
      })
    );
  const policy =
    dependencies.userPolicyEnforcementService ??
    new UserPolicyEnforcementService(
      dependencies.userPolicyEnforcementRepository ?? new UserPolicyEnforcementRepository(),
      new UserGlobalPolicyService(
        dependencies.userGlobalPolicyRepository ?? new UserGlobalPolicyRepository()
      )
    );
  const orderProjectionRepository = dependencies.bookingRepository?.findLiveDashboardOrderEvents
    ? { findLiveDashboardOrderEvents: dependencies.bookingRepository.findLiveDashboardOrderEvents.bind(dependencies.bookingRepository) }
    : new BookingRepository();
  const service =
    dependencies.exchangeBookingConversionService ??
    new ExchangeBookingConversionService(
      new ExchangeBookingConversionRepository(),
      audit,
      affiliate,
      policy,
      dependencies.realtimeService,
      undefined,
      dependencies.liveDashboardEventGateway ? new LiveDashboardOrderChangePublisher(
        orderProjectionRepository, dependencies.liveDashboardEventGateway
      ) : undefined,
      createBookingAutomationProcessorForRoutes(config, dependencies)
    );
  const controller = new ExchangeBookingConversionController(service);

  router.post(
    "/exchange/posts/:id/matching/bookings",
    authenticate(),
    createAuthorizeMiddleware(EXCHANGE_PERMISSIONS.matchingBookOwn),
    validateRequest({
      params: exchangeBookingConversionPostIdParamSchema,
      body: exchangeBookingConversionBodySchema
    }),
    validateExchangeIdempotencyKey,
    controller.createBookings
  );

  return router;
};
