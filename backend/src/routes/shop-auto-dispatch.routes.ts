import { Router } from "express";
import type { AppDependencies } from "../app";
import type { AppConfig } from "../config/env";
import { ShopAutoDispatchController } from "../controllers/shop-auto-dispatch.controller";
import { createAuthenticateMiddleware } from "../middlewares/authenticate.middleware";
import { createAuthorizeMiddleware } from "../middlewares/authorize.middleware";
import { validateRequest } from "../middlewares/validate-request.middleware";
import { AuditLogRepository } from "../repositories/audit-log.repository";
import { ShopAutoDispatchRepository } from "../repositories/shop-auto-dispatch.repository";
import { AuditLogService } from "../services/audit-log.service";
import { ShopAutoDispatchService } from "../services/shop-auto-dispatch.service";
import { shopAutoDispatchRuleBodySchema } from "../validators/shop-auto-dispatch.validator";
import { createAuthServiceForRoutes } from "./auth-service.factory";

export function createShopAutoDispatchRoutes(config: AppConfig, dependencies: AppDependencies): Router {
  const router = Router();
  const authenticate = createAuthenticateMiddleware(createAuthServiceForRoutes(config, dependencies));
  const authorize = createAuthorizeMiddleware;
  const controller = new ShopAutoDispatchController(new ShopAutoDispatchService(
    new ShopAutoDispatchRepository(),
    new AuditLogService(dependencies.auditLogRepository ?? new AuditLogRepository())
  ));
  router.get(
    "/merchant-admin/auto-dispatch-rule",
    authenticate(),
    authorize("schedule:slots:list"),
    controller.read
  );
  router.put(
    "/merchant-admin/auto-dispatch-rule",
    authenticate(),
    authorize("schedule:slots:write"),
    validateRequest({ body: shopAutoDispatchRuleBodySchema }),
    controller.update
  );
  return router;
}
