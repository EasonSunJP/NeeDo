import { Router } from "express";
import type { AppDependencies } from "../app";
import type { AppConfig } from "../config/env";
import { TRAVEL_FARE_PERMISSIONS } from "../constants/permissions.constants";
import { ShopTravelFarePolicyController } from "../controllers/shop-travel-fare-policy.controller";
import { createAuthenticateMiddleware } from "../middlewares/authenticate.middleware";
import { createAuthorizeMiddleware } from "../middlewares/authorize.middleware";
import { validateRequest } from "../middlewares/validate-request.middleware";
import { AuditLogRepository } from "../repositories/audit-log.repository";
import { ShopTravelFarePolicyRepository } from "../repositories/shop-travel-fare-policy.repository";
import { AuditLogService } from "../services/audit-log.service";
import { ShopTravelFarePolicyService } from "../services/shop-travel-fare-policy.service";
import { shopTravelFarePolicyHistoryQuerySchema, shopTravelFarePolicyPublishBodySchema } from "../validators/shop-travel-fare-policy.validator";
import { createAuthServiceForRoutes } from "./auth-service.factory";

export const createShopTravelFarePolicyRoutes = (config: AppConfig, dependencies: AppDependencies): Router => {
  const router = Router();
  const authenticate = createAuthenticateMiddleware(createAuthServiceForRoutes(config, dependencies));
  const service = new ShopTravelFarePolicyService(
    dependencies.shopTravelFarePolicyRepository ?? new ShopTravelFarePolicyRepository(),
    new AuditLogService(dependencies.auditLogRepository ?? new AuditLogRepository())
  );
  const controller = new ShopTravelFarePolicyController(service);

  router.get("/merchant-admin/travel-fare-policy", authenticate(), createAuthorizeMiddleware(TRAVEL_FARE_PERMISSIONS.merchantRead), controller.getPolicy);
  router.get("/merchant-admin/travel-fare-policy/versions", authenticate(), createAuthorizeMiddleware(TRAVEL_FARE_PERMISSIONS.merchantRead), validateRequest({ query: shopTravelFarePolicyHistoryQuerySchema }), controller.listVersions);
  router.post("/merchant-admin/travel-fare-policy/versions", authenticate(), createAuthorizeMiddleware(TRAVEL_FARE_PERMISSIONS.merchantWrite), validateRequest({ body: shopTravelFarePolicyPublishBodySchema }), controller.publishVersion);
  return router;
};
