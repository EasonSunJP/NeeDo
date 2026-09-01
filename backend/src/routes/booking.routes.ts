import { Router } from "express";
import type { AppDependencies } from "../app";
import type { AppConfig } from "../config/env";
import { BookingController } from "../controllers/booking.controller";
import { createAuthenticateMiddleware } from "../middlewares/authenticate.middleware";
import { createAuthorizeMiddleware } from "../middlewares/authorize.middleware";
import { validateRequest } from "../middlewares/validate-request.middleware";
import { BookingRepository } from "../repositories/booking.repository";
import { AffiliateCheckoutRepository } from "../repositories/affiliate-checkout.repository";
import { AuditLogRepository } from "../repositories/audit-log.repository";
import { FeeRuleRepository } from "../repositories/fee-rule.repository";
import { LedgerRepository } from "../repositories/ledger.repository";
import { PlatformFeePolicyRepository } from "../repositories/platform-fee-policy.repository";
import { BookingService } from "../services/booking.service";
import { AuditLogService } from "../services/audit-log.service";
import { FeeCalculationService } from "../services/fee-calculation.service";
import { LedgerService } from "../services/ledger.service";
import { PlatformFeePolicyService } from "../services/platform-fee-policy.service";
import { AffiliateCheckoutService } from "../services/affiliate-checkout.service";
import { AffiliateLinkTokenService } from "../services/affiliate-link-token.service";
import {
  availabilityListQuerySchema,
  bookingCreateBodySchema,
  manualPaymentConfirmBodySchema,
  manualPaymentRefundBodySchema,
  orderCancelBodySchema,
  orderConfirmBodySchema,
  orderIdParamSchema,
  orderListQuerySchema,
  scheduleSlotCreateBodySchema,
  scheduleSlotListQuerySchema,
  scheduleSlotUpdateBodySchema
} from "../validators/booking.validator";
import { createAuthServiceForRoutes } from "./auth-service.factory";
import { createUserExperienceServiceForRoutes } from "./user-experience-service.factory";

export const BOOKING_ROUTE_PERMISSIONS = {
  create: "booking:create",
  listOrders: "order:list",
  getOrder: "order:read",
  confirm: "order:confirm",
  cancel: "order:cancel",
  start: "order:start",
  complete: "order:complete",
  merchantPaymentWrite: "merchant-admin:order-payment:write",
  backofficePaymentWrite: "backoffice:order-payment:write",
  scheduleList: "schedule:slots:list",
  scheduleWrite: "schedule:slots:write"
} as const;

export const createBookingRoutes = (config: AppConfig, dependencies: AppDependencies): Router => {
  const router = Router();
  const authService = createAuthServiceForRoutes(config, dependencies);
  const authenticate = createAuthenticateMiddleware(authService);
  const authorize = createAuthorizeMiddleware;
  const feeCalculationService = new FeeCalculationService(
    dependencies.feeRuleRepository ?? new FeeRuleRepository()
  );
  const auditLogService = new AuditLogService(
    dependencies.auditLogRepository ?? new AuditLogRepository()
  );
  const platformFeePolicyService = new PlatformFeePolicyService(
    dependencies.platformFeePolicyRepository ?? new PlatformFeePolicyRepository(),
    auditLogService
  );
  const ledgerService =
    dependencies.ledgerRepository || !dependencies.bookingRepository
      ? new LedgerService(
          dependencies.ledgerRepository ?? new LedgerRepository(),
          feeCalculationService,
          undefined,
          undefined,
          platformFeePolicyService
        )
      : undefined;
  const bookingService = new BookingService(
    dependencies.bookingRepository ?? new BookingRepository(),
    ledgerService,
    dependencies.realtimeService,
    auditLogService,
    dependencies.affiliateCheckoutService ??
      new AffiliateCheckoutService(
        new AffiliateCheckoutRepository(),
        new AffiliateLinkTokenService({
          secret: config.AFFILIATE_LINK_SECRET,
          publicBaseUrl: config.AFFILIATE_PUBLIC_BASE_URL
        }),
        { rewardLedger: ledgerService }
      ),
    createUserExperienceServiceForRoutes(dependencies)
  );
  const controller = new BookingController(bookingService);

  router.get(
    "/schedule/availability",
    validateRequest({ query: availabilityListQuerySchema }),
    controller.listAvailableSlots
  );
  router.post(
    "/bookings",
    authenticate(),
    authorize(BOOKING_ROUTE_PERMISSIONS.create),
    validateRequest({ body: bookingCreateBodySchema }),
    controller.createBooking
  );
  router.get(
    "/orders",
    authenticate(),
    authorize(BOOKING_ROUTE_PERMISSIONS.listOrders),
    validateRequest({ query: orderListQuerySchema }),
    controller.listOrders
  );
  router.get(
    "/orders/:id",
    authenticate(),
    authorize(BOOKING_ROUTE_PERMISSIONS.getOrder),
    validateRequest({ params: orderIdParamSchema }),
    controller.getOrder
  );
  router.post(
    "/orders/:id/confirm",
    authenticate(),
    authorize(BOOKING_ROUTE_PERMISSIONS.confirm),
    validateRequest({ params: orderIdParamSchema, body: orderConfirmBodySchema }),
    controller.confirmOrder
  );
  router.post(
    "/orders/:id/cancel",
    authenticate(),
    authorize(BOOKING_ROUTE_PERMISSIONS.cancel),
    validateRequest({ params: orderIdParamSchema, body: orderCancelBodySchema }),
    controller.cancelOrder
  );
  router.post(
    "/orders/:id/start",
    authenticate(),
    authorize(BOOKING_ROUTE_PERMISSIONS.start),
    validateRequest({ params: orderIdParamSchema }),
    controller.startOrder
  );
  router.post(
    "/orders/:id/complete",
    authenticate(),
    authorize(BOOKING_ROUTE_PERMISSIONS.complete),
    validateRequest({ params: orderIdParamSchema }),
    controller.completeOrder
  );
  router.post(
    "/merchant-admin/orders/:id/payment/confirm",
    authenticate(),
    authorize(BOOKING_ROUTE_PERMISSIONS.merchantPaymentWrite),
    validateRequest({ params: orderIdParamSchema, body: manualPaymentConfirmBodySchema }),
    controller.confirmManualPayment
  );
  router.post(
    "/merchant-admin/orders/:id/payment/refund",
    authenticate(),
    authorize(BOOKING_ROUTE_PERMISSIONS.merchantPaymentWrite),
    validateRequest({ params: orderIdParamSchema, body: manualPaymentRefundBodySchema }),
    controller.refundManualPayment
  );
  router.post(
    "/backoffice/orders/:id/payment/confirm",
    authenticate(),
    authorize(BOOKING_ROUTE_PERMISSIONS.backofficePaymentWrite),
    validateRequest({ params: orderIdParamSchema, body: manualPaymentConfirmBodySchema }),
    controller.confirmManualPayment
  );
  router.post(
    "/backoffice/orders/:id/payment/refund",
    authenticate(),
    authorize(BOOKING_ROUTE_PERMISSIONS.backofficePaymentWrite),
    validateRequest({ params: orderIdParamSchema, body: manualPaymentRefundBodySchema }),
    controller.refundManualPayment
  );
  router.get(
    "/technician/schedule/slots/:id",
    authenticate(),
    authorize(BOOKING_ROUTE_PERMISSIONS.scheduleList),
    validateRequest({ params: orderIdParamSchema }),
    controller.getScheduleSlot
  );
  ["/merchant-admin/schedule/slots", "/technician/schedule/slots"].forEach((path) => {
    router.get(path, authenticate(), authorize(BOOKING_ROUTE_PERMISSIONS.scheduleList), validateRequest({ query: scheduleSlotListQuerySchema }), controller.listScheduleSlots);
    router.post(path, authenticate(), authorize(BOOKING_ROUTE_PERMISSIONS.scheduleWrite), validateRequest({ body: scheduleSlotCreateBodySchema }), controller.createScheduleSlot);
    router.patch(`${path}/:id`, authenticate(), authorize(BOOKING_ROUTE_PERMISSIONS.scheduleWrite), validateRequest({ params: orderIdParamSchema, body: scheduleSlotUpdateBodySchema }), controller.updateScheduleSlot);
    router.delete(`${path}/:id`, authenticate(), authorize(BOOKING_ROUTE_PERMISSIONS.scheduleWrite), validateRequest({ params: orderIdParamSchema }), controller.deleteScheduleSlot);
  });

  return router;
};
