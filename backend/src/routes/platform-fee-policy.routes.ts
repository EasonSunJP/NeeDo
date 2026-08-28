import { Router } from "express";
import type { AppDependencies } from "../app";
import type { AppConfig } from "../config/env";
import { PlatformFeePolicyController } from "../controllers/platform-fee-policy.controller";
import { createAuthenticateMiddleware } from "../middlewares/authenticate.middleware";
import { createAuthorizeMiddleware } from "../middlewares/authorize.middleware";
import { validateRequest } from "../middlewares/validate-request.middleware";
import { AuditLogRepository } from "../repositories/audit-log.repository";
import { PlatformFeePolicyRepository } from "../repositories/platform-fee-policy.repository";
import { AuditLogService } from "../services/audit-log.service";
import { PlatformFeePolicyService } from "../services/platform-fee-policy.service";
import {
  globalPlatformFeeUpdateBodySchema,
  platformFeeShopIdParamSchema,
  shopFeeEnabledUpdateBodySchema,
  shopPlatformFeePolicyListQuerySchema
} from "../validators/platform-fee-policy.validator";
import { createAuthServiceForRoutes } from "./auth-service.factory";

export const PLATFORM_FEE_POLICY_ROUTE_PERMISSIONS = {
  read: "backoffice:platform-fee-policy:read",
  write: "backoffice:platform-fee-policy:write"
} as const;

export const createPlatformFeePolicyRoutes = (
  config: AppConfig,
  dependencies: AppDependencies
): Router => {
  const router = Router();
  const authenticate = createAuthenticateMiddleware(
    createAuthServiceForRoutes(config, dependencies)
  );
  const service = new PlatformFeePolicyService(
    dependencies.platformFeePolicyRepository ?? new PlatformFeePolicyRepository(),
    new AuditLogService(dependencies.auditLogRepository ?? new AuditLogRepository())
  );
  const controller = new PlatformFeePolicyController(service);

  router.get(
    "/backoffice/platform-fee-policy",
    authenticate(),
    createAuthorizeMiddleware(PLATFORM_FEE_POLICY_ROUTE_PERMISSIONS.read),
    controller.getGlobalPolicy
  );
  router.patch(
    "/backoffice/platform-fee-policy",
    authenticate(),
    createAuthorizeMiddleware(PLATFORM_FEE_POLICY_ROUTE_PERMISSIONS.write),
    validateRequest({ body: globalPlatformFeeUpdateBodySchema }),
    controller.updateGlobalPolicy
  );
  router.get(
    "/backoffice/shop-platform-fee-policies",
    authenticate(),
    createAuthorizeMiddleware(PLATFORM_FEE_POLICY_ROUTE_PERMISSIONS.read),
    validateRequest({ query: shopPlatformFeePolicyListQuerySchema }),
    controller.listShopPolicies
  );
  router.patch(
    "/backoffice/shops/:shopId/platform-fee-policy",
    authenticate(),
    createAuthorizeMiddleware(PLATFORM_FEE_POLICY_ROUTE_PERMISSIONS.write),
    validateRequest({
      params: platformFeeShopIdParamSchema,
      body: shopFeeEnabledUpdateBodySchema
    }),
    controller.updateShopFeeEnabled
  );

  return router;
};
