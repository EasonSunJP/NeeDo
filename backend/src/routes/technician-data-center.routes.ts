import { Router } from "express";
import type { AppDependencies } from "../app";
import type { AppConfig } from "../config/env";
import { TechnicianDataCenterController } from "../controllers/technician-data-center.controller";
import { createAuthenticateMiddleware } from "../middlewares/authenticate.middleware";
import { createAuthorizeMiddleware } from "../middlewares/authorize.middleware";
import { validateRequest } from "../middlewares/validate-request.middleware";
import { AuditLogRepository } from "../repositories/audit-log.repository";
import { TechnicianDataCenterRepository } from "../repositories/technician-data-center.repository";
import { AuditLogService } from "../services/audit-log.service";
import { TechnicianDataCenterService } from "../services/technician-data-center.service";
import { technicianDataCenterQuerySchema } from "../validators/technician-data-center.validator";
import { createAuthServiceForRoutes } from "./auth-service.factory";

export const TECHNICIAN_DATA_CENTER_ROUTE_PERMISSION = "technician-data-center:read";

export const createTechnicianDataCenterRoutes = (
  config: AppConfig,
  dependencies: AppDependencies
): Router => {
  const router = Router();
  const authenticate = createAuthenticateMiddleware(
    createAuthServiceForRoutes(config, dependencies)
  );
  const service = new TechnicianDataCenterService(
    dependencies.technicianDataCenterRepository ?? new TechnicianDataCenterRepository(),
    new AuditLogService(dependencies.auditLogRepository ?? new AuditLogRepository())
  );
  const controller = new TechnicianDataCenterController(service);
  router.get(
    "/technician/data-center",
    authenticate(),
    createAuthorizeMiddleware(TECHNICIAN_DATA_CENTER_ROUTE_PERMISSION),
    validateRequest({ query: technicianDataCenterQuerySchema }),
    controller.getMine
  );
  return router;
};
