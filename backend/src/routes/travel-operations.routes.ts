import { Router } from "express";
import type { AppDependencies } from "../app";
import type { AppConfig } from "../config/env";
import { TRAVEL_FARE_PERMISSIONS } from "../constants/permissions.constants";
import { TravelOperationsController } from "../controllers/travel-operations.controller";
import { createAuthenticateMiddleware } from "../middlewares/authenticate.middleware";
import { createAuthorizeMiddleware } from "../middlewares/authorize.middleware";
import { validateRequest } from "../middlewares/validate-request.middleware";
import { AuditLogRepository } from "../repositories/audit-log.repository";
import { TravelOperationsRepository } from "../repositories/travel-operations.repository";
import { AuditLogService } from "../services/audit-log.service";
import { createRouteProviderHealthStore } from "../services/route-provider-health";
import { TravelOperationsService } from "../services/travel-operations.service";
import { travelFarePolicyListQuerySchema } from "../validators/travel-operations.validator";
import { createAuthServiceForRoutes } from "./auth-service.factory";

export const createTravelOperationsRoutes = (config: AppConfig, dependencies: AppDependencies): Router => {
  const router = Router();
  const authenticate = createAuthenticateMiddleware(createAuthServiceForRoutes(config, dependencies));
  const service = new TravelOperationsService(config, dependencies.travelOperationsRepository ?? new TravelOperationsRepository(), new AuditLogService(dependencies.auditLogRepository ?? new AuditLogRepository()), dependencies.routeProviderHealthStore ?? createRouteProviderHealthStore(config));
  const controller = new TravelOperationsController(service);
  router.get("/backoffice/travel/providers/status", authenticate(), createAuthorizeMiddleware(TRAVEL_FARE_PERMISSIONS.backofficeRead), controller.providerStatus);
  router.get("/backoffice/travel/fare-policies", authenticate(), createAuthorizeMiddleware(TRAVEL_FARE_PERMISSIONS.backofficeRead), validateRequest({ query: travelFarePolicyListQuerySchema }), controller.listFarePolicies);
  return router;
};
