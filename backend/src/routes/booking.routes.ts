import { WorkStatusService } from "../services/work-status.service";
import { Router } from "express";
import type { AppDependencies } from "../app";
import type { AppConfig } from "../config/env";
import { BookingController } from "../controllers/booking.controller";
import { ServicePrepaymentController } from "../controllers/service-prepayment.controller";
import {
  createAuthenticateMiddleware,
  createOptionalAuthenticateMiddleware
} from "../middlewares/authenticate.middleware";
import { createAuthorizeMiddleware } from "../middlewares/authorize.middleware";
import { validateRequest } from "../middlewares/validate-request.middleware";
import { BookingRepository } from "../repositories/booking.repository";
import { AuthRepository } from "../repositories/auth.repository";
import { MerchantShopContextRepository } from "../repositories/merchant-shop-context.repository";
import { AffiliateCheckoutRepository } from "../repositories/affiliate-checkout.repository";
import { AuditLogRepository } from "../repositories/audit-log.repository";
import { FeeRuleRepository } from "../repositories/fee-rule.repository";
import { LedgerRepository } from "../repositories/ledger.repository";
import { ServicePrepaymentRepository } from "../repositories/service-prepayment.repository";
import { NdpExchangeRateRepository } from "../repositories/ndp-exchange-rate.repository";
import { PlatformFeePolicyRepository } from "../repositories/platform-fee-policy.repository";
import { BookingService } from "../services/booking.service";
import { SchedulePreloadService } from "../services/schedule-preload.service";
import { AuditLogService } from "../services/audit-log.service";
import { FeeCalculationService } from "../services/fee-calculation.service";
import { LedgerService } from "../services/ledger.service";
import { ServicePrepaymentService } from "../services/service-prepayment.service";
import { NdpExchangeRateService } from "../services/ndp-exchange-rate.service";
import { PlatformFeePolicyService } from "../services/platform-fee-policy.service";
import { AffiliateCheckoutService } from "../services/affiliate-checkout.service";
import { AffiliateLinkTokenService } from "../services/affiliate-link-token.service";
import {
  availabilityWindowCreateBodySchema,
  availabilityWindowListQuerySchema,
  availabilityWindowUpdateBodySchema,
  availabilityListQuerySchema,
  bookingCreateBodySchema,
  bookingGroupCreateBodySchema,
  bookingGroupPublicIdParamSchema,
  createOrderAddOnBodySchema,
  confirmReceiptBodySchema,
  endServiceBodySchema,
  manualPaymentConfirmBodySchema,
  manualPaymentRefundBodySchema,
  merchantOrderEditBodySchema,
  orderCancelBodySchema,
  orderConfirmBodySchema,
  orderAddOnDecisionBodySchema,
  orderAddOnServiceListQuerySchema,
  orderAddOnIdParamsSchema,
  orderAssignTechnicianBodySchema,
  orderIdParamSchema,
  orderListQuerySchema,
  orderReviewCreateBodySchema,
  orderTimelineCommentBodySchema,
  payWithNdpBodySchema,
  selectPaymentMethodBodySchema,
  startServiceBodySchema,
  overdueAppointmentResolutionBodySchema,
  scheduleSlotCreateBodySchema,
  scheduleSlotDeleteQuerySchema,
  scheduleSlotListQuerySchema,
  schedulePreloadQuerySchema,
  scheduleSlotUpdateBodySchema,
  technicianManualBookingBodySchema
} from "../validators/booking.validator";
import { servicePrepaymentCreateBodySchema } from "../validators/service-prepayment.validator";
import { createAuthServiceForRoutes } from "./auth-service.factory";
import { createUserExperienceServiceForRoutes } from "./user-experience-service.factory";
import { TechnicianAutomationRepository } from "../repositories/technician-automation.repository";
import { ShopVisibilityRepository } from "../repositories/shop-visibility.repository";
import { TechnicianAutomationProcessor } from "../services/technician-automation-processor";

export const BOOKING_ROUTE_PERMISSIONS = {
  create: "booking:create",
  listOrders: "order:list",
  getOrder: "order:read",
  confirm: "order:confirm",
  cancel: "order:cancel",
  serviceStart: "order:service:start",
  overdueResolution: "order:overdue-resolution:create",
  addOnWrite: "order:add-on:write",
  serviceEnd: "order:service:end",
  reviewCreate: "order:review:create",
  checkoutRead: "order:checkout:read",
  checkoutPaymentMethodWrite: "order:checkout:payment-method:write",
  checkoutNdpPay: "order:checkout:ndp:pay",
  checkoutReceiptConfirm: "order:checkout:receipt:confirm",
  merchantCheckoutReceiptOverride: "merchant-admin:order:checkout:receipt-override",
  checkoutReceiptOverride: "backoffice:order:checkout:receipt-override",
  merchantPaymentWrite: "merchant-admin:order-payment:write",
  backofficePaymentWrite: "backoffice:order-payment:write",
  scheduleList: "schedule:slots:list",
  scheduleWrite: "schedule:slots:write",
  manualCreate: "technician:booking:manual-create"
} as const;

export const createBookingRoutes = (config: AppConfig, dependencies: AppDependencies): Router => {
  const router = Router();
  const authService = createAuthServiceForRoutes(config, dependencies);
  const authenticate = createAuthenticateMiddleware(authService);
  const optionalAuthenticate = createOptionalAuthenticateMiddleware(authService);
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
  const ndpExchangeRateService =
    dependencies.ndpExchangeRateService ??
    new NdpExchangeRateService(
      dependencies.ndpExchangeRateRepository ?? new NdpExchangeRateRepository(),
      auditLogService
    );
  const bookingRepository =
    dependencies.bookingRepository ??
    new BookingRepository(undefined, dependencies.administrativeRegionRepository);
  const servicePrepaymentService = new ServicePrepaymentService(
    new ServicePrepaymentRepository(),
    ledgerService ?? new LedgerService(dependencies.ledgerRepository ?? new LedgerRepository()),
    ndpExchangeRateService
  );
  const bookingService = new BookingService(
    bookingRepository,
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
    ndpExchangeRateService,
    createUserExperienceServiceForRoutes(dependencies),
    undefined,
    dependencies.userPolicyEnforcementService,
    dependencies.platformAccessPolicyService,
    dependencies.workStatusService??new WorkStatusService(undefined,undefined,dependencies.realtimeEventGateway),
    dependencies.liveDashboardEventGateway,
    dependencies.shopVisibilityRepository ?? new ShopVisibilityRepository(),
    servicePrepaymentService
  );
  const automationProcessor =
    dependencies.technicianBookingAutomationProcessor ??
    (dependencies.bookingRepository ? undefined : new TechnicianAutomationProcessor(
      new TechnicianAutomationRepository(),
      {
        confirmBooking: async (input) => {
          await bookingService.transitionOrder(
            {
              userId: input.technicianUserId,
              roles: ["technician"],
              currentIdentityId: input.technicianIdentityId,
              currentIdentityType: "technician",
              currentIdentityScopeType: "technician_profile",
              currentIdentityScopeId: input.technicianProfileId
            },
            input.orderId,
            "confirm"
          );
        }
      },
      {
        applyRequest: async () => {
          throw new Error("request automation authority is unavailable on booking routes");
        }
      }
    ));
  const schedulePreloadService = new SchedulePreloadService(
    dependencies.authRepository ?? new AuthRepository(),
    dependencies.merchantShopContextRepository ?? new MerchantShopContextRepository(),
    bookingRepository
  );
  const controller = new BookingController(bookingService, automationProcessor, schedulePreloadService);
  const prepaymentController = new ServicePrepaymentController(
    servicePrepaymentService,
    automationProcessor
  );

  router.get(
    "/schedule/availability",
    optionalAuthenticate,
    validateRequest({ query: availabilityListQuerySchema }),
    controller.listAvailableSlots
  );
  router.get(
    "/schedule/preload",
    authenticate(),
    validateRequest({ query: schedulePreloadQuerySchema }),
    controller.preloadSchedule
  );
  router.post(
    "/bookings",
    authenticate(),
    authorize(BOOKING_ROUTE_PERMISSIONS.create),
    validateRequest({ body: bookingCreateBodySchema }),
    controller.createBooking
  );
  router.post(
    "/bookings/groups",
    authenticate(),
    authorize(BOOKING_ROUTE_PERMISSIONS.create),
    validateRequest({ body: bookingGroupCreateBodySchema }),
    controller.createGroupBooking
  );
  router.get(
    "/bookings/groups/:publicId",
    authenticate(),
    authorize(BOOKING_ROUTE_PERMISSIONS.getOrder),
    validateRequest({ params: bookingGroupPublicIdParamSchema }),
    controller.getGroupBooking
  );
  router.post(
    "/bookings/:id/service-prepayment",
    authenticate(),
    authorize(BOOKING_ROUTE_PERMISSIONS.create),
    validateRequest({ params: orderIdParamSchema, body: servicePrepaymentCreateBodySchema }),
    prepaymentController.createBooking
  );
  router.post(
    "/technician/manual-bookings",
    authenticate(),
    authorize(BOOKING_ROUTE_PERMISSIONS.manualCreate),
    validateRequest({ body: technicianManualBookingBodySchema }),
    controller.createTechnicianManualBooking
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
    "/orders/:id/assign-technician",
    authenticate(),
    authorize(BOOKING_ROUTE_PERMISSIONS.confirm),
    validateRequest({ params: orderIdParamSchema, body: orderAssignTechnicianBodySchema }),
    controller.assignOrderTechnician
  );
  router.patch(
    "/orders/:id/merchant-edit",
    authenticate(),
    authorize(BOOKING_ROUTE_PERMISSIONS.confirm),
    validateRequest({ params: orderIdParamSchema, body: merchantOrderEditBodySchema }),
    controller.editMerchantOrder
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
    "/orders/:id/service/start",
    authenticate(),
    authorize(BOOKING_ROUTE_PERMISSIONS.serviceStart),
    validateRequest({ params: orderIdParamSchema, body: startServiceBodySchema }),
    controller.startService
  );
  router.post(
    "/orders/:id/overdue-resolution",
    authenticate(),
    authorize(BOOKING_ROUTE_PERMISSIONS.overdueResolution),
    validateRequest({ params: orderIdParamSchema, body: overdueAppointmentResolutionBodySchema }),
    controller.resolveOverdueAppointment
  );
  router.post(
    "/orders/:id/add-ons",
    authenticate(),
    authorize(BOOKING_ROUTE_PERMISSIONS.addOnWrite),
    validateRequest({ params: orderIdParamSchema, body: createOrderAddOnBodySchema }),
    controller.createOrderAddOn
  );
  router.get(
    "/orders/:id/add-on-services",
    authenticate(),
    authorize(BOOKING_ROUTE_PERMISSIONS.getOrder),
    validateRequest({ params: orderIdParamSchema, query: orderAddOnServiceListQuerySchema }),
    controller.listOrderAddOnServices
  );
  router.post(
    "/orders/:id/add-ons/:addOnId/accept",
    authenticate(),
    authorize(BOOKING_ROUTE_PERMISSIONS.addOnWrite),
    validateRequest({ params: orderAddOnIdParamsSchema, body: orderAddOnDecisionBodySchema }),
    controller.acceptOrderAddOn
  );
  router.post(
    "/orders/:id/add-ons/:addOnId/reject",
    authenticate(),
    authorize(BOOKING_ROUTE_PERMISSIONS.addOnWrite),
    validateRequest({ params: orderAddOnIdParamsSchema, body: orderAddOnDecisionBodySchema }),
    controller.rejectOrderAddOn
  );
  router.post(
    "/orders/:id/service/end",
    authenticate(),
    authorize(BOOKING_ROUTE_PERMISSIONS.serviceEnd),
    validateRequest({ params: orderIdParamSchema, body: endServiceBodySchema }),
    controller.endService
  );
  router.post(
    "/orders/:id/reviews",
    authenticate(),
    authorize(BOOKING_ROUTE_PERMISSIONS.reviewCreate),
    validateRequest({ params: orderIdParamSchema, body: orderReviewCreateBodySchema }),
    controller.createOrderReview
  );
  router.get(
    "/orders/:id/reviews/mine",
    authenticate(),
    authorize(BOOKING_ROUTE_PERMISSIONS.reviewCreate),
    validateRequest({ params: orderIdParamSchema }),
    controller.getOwnOrderReview
  );
  router.post(
    "/orders/:id/timeline/comments",
    authenticate(),
    authorize(BOOKING_ROUTE_PERMISSIONS.getOrder),
    validateRequest({ params: orderIdParamSchema, body: orderTimelineCommentBodySchema }),
    controller.createOrderTimelineComment
  );
  router.get(
    "/orders/:id/checkout",
    authenticate(),
    authorize(BOOKING_ROUTE_PERMISSIONS.checkoutRead),
    validateRequest({ params: orderIdParamSchema }),
    controller.getCheckout
  );
  router.post(
    "/orders/:id/checkout/payment-method",
    authenticate(),
    authorize(BOOKING_ROUTE_PERMISSIONS.checkoutPaymentMethodWrite),
    validateRequest({ params: orderIdParamSchema, body: selectPaymentMethodBodySchema }),
    controller.selectCheckoutPaymentMethod
  );
  router.post(
    "/orders/:id/checkout/pay/ndp",
    authenticate(),
    authorize(BOOKING_ROUTE_PERMISSIONS.checkoutNdpPay),
    validateRequest({ params: orderIdParamSchema, body: payWithNdpBodySchema }),
    controller.payCheckoutWithNdp
  );
  router.post(
    "/orders/:id/checkout/confirm-receipt",
    authenticate(),
    authorize(BOOKING_ROUTE_PERMISSIONS.checkoutReceiptConfirm),
    validateRequest({ params: orderIdParamSchema, body: confirmReceiptBodySchema }),
    controller.confirmCheckoutReceipt
  );
  router.post(
    "/merchant-admin/orders/:id/checkout/confirm-receipt",
    authenticate(),
    authorize(BOOKING_ROUTE_PERMISSIONS.merchantCheckoutReceiptOverride),
    validateRequest({ params: orderIdParamSchema, body: confirmReceiptBodySchema }),
    controller.overrideMerchantCheckoutReceipt
  );
  router.post(
    "/backoffice/orders/:id/checkout/confirm-receipt",
    authenticate(),
    authorize(BOOKING_ROUTE_PERMISSIONS.checkoutReceiptOverride),
    validateRequest({ params: orderIdParamSchema, body: confirmReceiptBodySchema }),
    controller.overrideCheckoutReceipt
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
    router.get(
      path,
      authenticate(),
      authorize(BOOKING_ROUTE_PERMISSIONS.scheduleList),
      validateRequest({ query: scheduleSlotListQuerySchema }),
      controller.listScheduleSlots
    );
    router.post(
      path,
      authenticate(),
      authorize(BOOKING_ROUTE_PERMISSIONS.scheduleWrite),
      validateRequest({ body: scheduleSlotCreateBodySchema }),
      controller.createScheduleSlot
    );
    router.patch(
      `${path}/:id`,
      authenticate(),
      authorize(BOOKING_ROUTE_PERMISSIONS.scheduleWrite),
      validateRequest({ params: orderIdParamSchema, body: scheduleSlotUpdateBodySchema }),
      controller.updateScheduleSlot
    );
    router.delete(
      `${path}/:id`,
      authenticate(),
      authorize(BOOKING_ROUTE_PERMISSIONS.scheduleWrite),
      validateRequest({ params: orderIdParamSchema, query: scheduleSlotDeleteQuerySchema }),
      controller.deleteScheduleSlot
    );
  });
  ["/merchant-admin/availability-windows", "/technician/availability-windows"].forEach((path) => {
    router.get(path, authenticate(), authorize(BOOKING_ROUTE_PERMISSIONS.scheduleList), validateRequest({ query: availabilityWindowListQuerySchema }), controller.listAvailabilityWindows);
    router.post(path, authenticate(), authorize(BOOKING_ROUTE_PERMISSIONS.scheduleWrite), validateRequest({ body: availabilityWindowCreateBodySchema }), controller.createAvailabilityWindow);
    router.patch(`${path}/:id`, authenticate(), authorize(BOOKING_ROUTE_PERMISSIONS.scheduleWrite), validateRequest({ params: orderIdParamSchema, body: availabilityWindowUpdateBodySchema }), controller.updateAvailabilityWindow);
    router.delete(`${path}/:id`, authenticate(), authorize(BOOKING_ROUTE_PERMISSIONS.scheduleWrite), validateRequest({ params: orderIdParamSchema }), controller.deleteAvailabilityWindow);
  });

  return router;
};
