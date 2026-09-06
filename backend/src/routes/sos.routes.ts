import { Router } from "express";
import type { AppDependencies } from "../app";
import type { AppConfig } from "../config/env";
import { SosController } from "../controllers/sos.controller";
import { createAuthenticateMiddleware } from "../middlewares/authenticate.middleware";
import { createAuthorizeMiddleware } from "../middlewares/authorize.middleware";
import { validateRequest } from "../middlewares/validate-request.middleware";
import { SosRepository } from "../repositories/sos.repository";
import { SosService } from "../services/sos.service";
import { SseRealtimeEventGateway } from "../services/realtime-event.gateway";
import {
  sosAlertParams,
  sosOrderParams,
  sosSendBody,
  sosListQuery,
  sosResolveBody
} from "../validators/sos.validator";
import { createAuthServiceForRoutes } from "./auth-service.factory";
export const createSosRoutes = (config: AppConfig, dependencies: AppDependencies): Router => {
  const router = Router();
  const authenticate = createAuthenticateMiddleware(
    createAuthServiceForRoutes(config, dependencies)
  );
  const controller = new SosController(
    dependencies.sosService ??
      new SosService(
        dependencies.sosRepository ?? new SosRepository(),
        dependencies.realtimeEventGateway ?? new SseRealtimeEventGateway()
      )
  );
  router.get(
    "/bookings/:orderId/sos-availability",
    authenticate(),
    createAuthorizeMiddleware("sos:create"),
    validateRequest({ params: sosOrderParams }),
    controller.availability
  );
  router.post(
    "/bookings/:orderId/sos",
    authenticate(),
    createAuthorizeMiddleware("sos:create"),
    validateRequest({ params: sosOrderParams, body: sosSendBody }),
    controller.send
  );
  router.get(
    "/sos-alerts/count",
    authenticate(),
    createAuthorizeMiddleware("sos:list"),
    controller.count
  );
  router.get(
    "/sos-alerts",
    authenticate(),
    createAuthorizeMiddleware("sos:list"),
    validateRequest({ query: sosListQuery }),
    controller.list
  );
  router.post(
    "/sos-alerts/:alertId/resolve",
    authenticate(),
    createAuthorizeMiddleware("sos:resolve"),
    validateRequest({ params: sosAlertParams, body: sosResolveBody }),
    controller.resolve
  );
  return router;
};
