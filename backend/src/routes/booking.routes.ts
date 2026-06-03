import { Router } from "express";
import type { AppDependencies } from "../app";
import type { AppConfig } from "../config/env";
import { BookingController } from "../controllers/booking.controller";
import { createAuthenticateMiddleware } from "../middlewares/authenticate.middleware";
import { createAuthorizeMiddleware } from "../middlewares/authorize.middleware";
import { validateRequest } from "../middlewares/validate-request.middleware";
import { BookingRepository } from "../repositories/booking.repository";
import { FeeRuleRepository } from "../repositories/fee-rule.repository";
import { LedgerRepository } from "../repositories/ledger.repository";
import { BookingService } from "../services/booking.service";
import { FeeCalculationService } from "../services/fee-calculation.service";
import { LedgerService } from "../services/ledger.service";
import {
  availabilityListQuerySchema,
  bookingCreateBodySchema,
  orderCancelBodySchema,
  orderIdParamSchema,
  orderListQuerySchema
} from "../validators/booking.validator";
import { createAuthServiceForRoutes } from "./auth-service.factory";

export const BOOKING_ROUTE_PERMISSIONS = {
  create: "booking:create",
  listOrders: "order:list",
  getOrder: "order:read",
  confirm: "order:confirm",
  cancel: "order:cancel",
  start: "order:start",
  complete: "order:complete"
} as const;

export const createBookingRoutes = (config: AppConfig, dependencies: AppDependencies): Router => {
  const router = Router();
  const authService = createAuthServiceForRoutes(config, dependencies);
  const authenticate = createAuthenticateMiddleware(authService);
  const authorize = createAuthorizeMiddleware;
  const feeCalculationService = new FeeCalculationService(
    dependencies.feeRuleRepository ?? new FeeRuleRepository()
  );
  const ledgerService =
    dependencies.ledgerRepository || !dependencies.bookingRepository
      ? new LedgerService(
          dependencies.ledgerRepository ?? new LedgerRepository(),
          feeCalculationService
        )
      : undefined;
  const bookingService = new BookingService(
    dependencies.bookingRepository ?? new BookingRepository(),
    ledgerService,
    dependencies.realtimeService
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
    validateRequest({ params: orderIdParamSchema }),
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

  return router;
};
