import { Router } from "express";
import type { AppConfig } from "../config/env";
import type { AppDependencies } from "../app";
import { OrderPerformanceController } from "../controllers/order-performance.controller";
import { createAuthenticateMiddleware } from "../middlewares/authenticate.middleware";
import { createAuthorizeMiddleware } from "../middlewares/authorize.middleware";
import { validateRequest } from "../middlewares/validate-request.middleware";
import { AuditLogRepository } from "../repositories/audit-log.repository";
import { OrderPerformanceRepository } from "../repositories/order-performance.repository";
import { AuditLogService } from "../services/audit-log.service";
import { OrderPerformanceService } from "../services/order-performance.service";
import {
  orderPerformanceCommandBodySchema,
  orderPerformanceOrderParamSchema
} from "../validators/order-performance.validator";
import { createAuthServiceForRoutes } from "./auth-service.factory";

export const ORDER_PERFORMANCE_WRITE_PERMISSION = "backoffice:order-performance:write" as const;

export const createOrderPerformanceRoutes = (
  config: AppConfig,
  dependencies: AppDependencies
): Router => {
  const router = Router();
  const authenticate = createAuthenticateMiddleware(
    createAuthServiceForRoutes(config, dependencies)
  );
  const service = new OrderPerformanceService(
    dependencies.orderPerformanceRepository ?? new OrderPerformanceRepository(),
    new AuditLogService(dependencies.auditLogRepository ?? new AuditLogRepository())
  );
  const controller = new OrderPerformanceController(service);
  const commandMiddleware = [
    authenticate(),
    createAuthorizeMiddleware(ORDER_PERFORMANCE_WRITE_PERMISSION),
    validateRequest({
      params: orderPerformanceOrderParamSchema,
      body: orderPerformanceCommandBodySchema
    })
  ];

  router.post(
    "/backoffice/orders/:id/technician-uncompleted",
    ...commandMiddleware,
    controller.classifyTechnicianUncompleted
  );
  router.post(
    "/backoffice/orders/:id/special-cancellation",
    ...commandMiddleware,
    controller.applySpecialExclusion
  );
  router.post(
    "/backoffice/orders/:id/special-cancellation/revoke",
    ...commandMiddleware,
    controller.revokeSpecialExclusion
  );

  return router;
};
