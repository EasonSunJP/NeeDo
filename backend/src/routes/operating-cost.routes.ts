import { Router } from "express";
import type { AppDependencies } from "../app";
import type { AppConfig } from "../config/env";
import { OperatingCostController } from "../controllers/operating-cost.controller";
import { createAuthenticateMiddleware } from "../middlewares/authenticate.middleware";
import { createAuthorizeMiddleware } from "../middlewares/authorize.middleware";
import { validateRequest } from "../middlewares/validate-request.middleware";
import { AuditLogRepository } from "../repositories/audit-log.repository";
import { OperatingCostRepository } from "../repositories/operating-cost.repository";
import { AuditLogService } from "../services/audit-log.service";
import { OperatingCostService } from "../services/operating-cost.service";
import {
  operatingCostCreateBodySchema,
  operatingCostDeleteBodySchema,
  operatingCostListQuerySchema,
  operatingCostParamSchema,
  operatingCostPublishBodySchema,
  operatingCostUpdateBodySchema
} from "../validators/operating-cost.validator";
import { createAuthServiceForRoutes } from "./auth-service.factory";

export const OPERATING_COST_PERMISSIONS = {
  read: "backoffice:operating-cost:read",
  write: "backoffice:operating-cost:write"
} as const;

export const createOperatingCostRoutes = (
  config: AppConfig,
  dependencies: AppDependencies
): Router => {
  const router = Router();
  const authenticate = createAuthenticateMiddleware(
    createAuthServiceForRoutes(config, dependencies)
  );
  const service = new OperatingCostService(
    dependencies.operatingCostRepository ?? new OperatingCostRepository(),
    new AuditLogService(dependencies.auditLogRepository ?? new AuditLogRepository())
  );
  const controller = new OperatingCostController(service);

  router.get(
    "/backoffice/operating-costs",
    authenticate(),
    createAuthorizeMiddleware(OPERATING_COST_PERMISSIONS.read),
    validateRequest({ query: operatingCostListQuerySchema }),
    controller.list
  );
  router.post(
    "/backoffice/operating-costs",
    authenticate(),
    createAuthorizeMiddleware(OPERATING_COST_PERMISSIONS.write),
    validateRequest({ body: operatingCostCreateBodySchema }),
    controller.create
  );
  router.patch(
    "/backoffice/operating-costs/:publicId",
    authenticate(),
    createAuthorizeMiddleware(OPERATING_COST_PERMISSIONS.write),
    validateRequest({ params: operatingCostParamSchema, body: operatingCostUpdateBodySchema }),
    controller.update
  );
  router.delete(
    "/backoffice/operating-costs/:publicId",
    authenticate(),
    createAuthorizeMiddleware(OPERATING_COST_PERMISSIONS.write),
    validateRequest({ params: operatingCostParamSchema, body: operatingCostDeleteBodySchema }),
    controller.remove
  );
  router.post(
    "/backoffice/operating-costs/:publicId/publish",
    authenticate(),
    createAuthorizeMiddleware(OPERATING_COST_PERMISSIONS.write),
    validateRequest({ params: operatingCostParamSchema, body: operatingCostPublishBodySchema }),
    controller.publish
  );

  return router;
};
