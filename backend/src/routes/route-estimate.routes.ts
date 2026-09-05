import { Router } from "express";
import type { AppDependencies } from "../app";
import type { AppConfig } from "../config/env";
import { TRAVEL_FARE_PERMISSIONS } from "../constants/permissions.constants";
import { RouteEstimateController } from "../controllers/route-estimate.controller";
import { createAuthenticateMiddleware } from "../middlewares/authenticate.middleware";
import { createAuthorizeMiddleware } from "../middlewares/authorize.middleware";
import { createTravelEstimateIpRateLimitMiddleware } from "../middlewares/security.middleware";
import { validateRequest } from "../middlewares/validate-request.middleware";
import { AuditLogRepository } from "../repositories/audit-log.repository";
import { RouteEstimateRepository } from "../repositories/route-estimate.repository";
import { AuditLogService } from "../services/audit-log.service";
import { DisabledRouteDistanceProvider } from "../services/route-distance.provider";
import { GeoapifyRouteDistanceProvider } from "../services/geoapify-route-distance.provider";
import { createRouteProviderHealthStore } from "../services/route-provider-health";
import { RouteEstimateService } from "../services/route-estimate.service";
import { routeEstimateCreateBodySchema } from "../validators/route-estimate.validator";
import { createAuthServiceForRoutes } from "./auth-service.factory";

export const createRouteEstimateRoutes = (config: AppConfig, dependencies: AppDependencies): Router => {
  const router = Router();
  const authenticate = createAuthenticateMiddleware(createAuthServiceForRoutes(config, dependencies));
  const provider = dependencies.routeDistanceProvider ?? (config.TRAVEL_ROUTE_PROVIDER === "geoapify" && config.GEOAPIFY_API_KEY
    ? new GeoapifyRouteDistanceProvider({ apiBaseUrl: config.GEOAPIFY_API_BASE_URL, apiKey: config.GEOAPIFY_API_KEY, timeoutMs: config.TRAVEL_ROUTE_TIMEOUT_MS, maxRetries: config.TRAVEL_ROUTE_MAX_RETRIES, healthStore: dependencies.routeProviderHealthStore ?? createRouteProviderHealthStore(config) })
    : new DisabledRouteDistanceProvider());
  const service = new RouteEstimateService(
    dependencies.routeEstimateRepository ?? new RouteEstimateRepository(), provider,
    new AuditLogService(dependencies.auditLogRepository ?? new AuditLogRepository()),
    { estimateTtlSeconds: config.TRAVEL_ESTIMATE_TTL_SECONDS, cacheTtlSeconds: config.TRAVEL_ROUTE_CACHE_TTL_SECONDS, negativeCacheTtlSeconds: config.TRAVEL_ROUTE_NEGATIVE_CACHE_TTL_SECONDS }
  );
  const controller = new RouteEstimateController(service);
  router.post("/bookings/travel-estimates", createTravelEstimateIpRateLimitMiddleware(config), authenticate(), createAuthorizeMiddleware(TRAVEL_FARE_PERMISSIONS.estimateCreate), validateRequest({ body: routeEstimateCreateBodySchema }), controller.create);
  return router;
};
