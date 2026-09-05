import { Router } from "express";
import type { AppDependencies } from "../app";
import type { AppConfig } from "../config/env";
import { TechnicianServiceBookingContextController } from "../controllers/technician-service-booking-context.controller";
import { createAuthenticateMiddleware } from "../middlewares/authenticate.middleware";
import { createAuthorizeMiddleware } from "../middlewares/authorize.middleware";
import { validateRequest } from "../middlewares/validate-request.middleware";
import { TechnicianServiceBookingContextRepository } from "../repositories/technician-service-booking-context.repository";
import { TechnicianServiceBookingContextService } from "../services/technician-service-booking-context.service";
import { technicianServiceBookingContextParamSchema } from "../validators/technician-service-booking-context.validator";
import { BOOKING_ROUTE_PERMISSIONS } from "./booking.routes";
import { createAuthServiceForRoutes } from "./auth-service.factory";

export const createTechnicianServiceBookingContextRoutes = (
  config: AppConfig,
  dependencies: AppDependencies
): Router => {
  const router = Router();
  const service =
    dependencies.technicianServiceBookingContextService ??
    new TechnicianServiceBookingContextService(
      new TechnicianServiceBookingContextRepository()
    );
  const controller = new TechnicianServiceBookingContextController(service);

  router.get(
    "/technician-services/:id/booking-context",
    createAuthenticateMiddleware(createAuthServiceForRoutes(config, dependencies))(),
    createAuthorizeMiddleware(BOOKING_ROUTE_PERMISSIONS.create),
    validateRequest({ params: technicianServiceBookingContextParamSchema }),
    controller.getContext
  );

  return router;
};
