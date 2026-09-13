import { Router } from "express";
import type { AppDependencies } from "../app";
import type { AppConfig } from "../config/env";
import { FIELD_JOB_PERMISSIONS } from "../constants/permissions.constants";
import { FieldJobController } from "../controllers/field-job.controller";
import { createAuthenticateMiddleware } from "../middlewares/authenticate.middleware";
import { createAuthorizeMiddleware } from "../middlewares/authorize.middleware";
import { validateRequest } from "../middlewares/validate-request.middleware";
import { AuditLogRepository } from "../repositories/audit-log.repository";
import { FieldJobRepository } from "../repositories/field-job.repository";
import { AuditLogService } from "../services/audit-log.service";
import { FieldJobService } from "../services/field-job.service";
import { fieldJobIdParamSchema, fieldJobListQuerySchema } from "../validators/field-job.validator";
import { createAuthServiceForRoutes } from "./auth-service.factory";

export const createFieldJobRoutes = (config: AppConfig, dependencies: AppDependencies): Router => {
  const router = Router();
  const authenticate = createAuthenticateMiddleware(
    createAuthServiceForRoutes(config, dependencies)
  );
  const authorize = createAuthorizeMiddleware(FIELD_JOB_PERMISSIONS.read);
  const repository = dependencies.fieldJobRepository ?? new FieldJobRepository();
  const service = new FieldJobService(
    repository,
    new AuditLogService(dependencies.auditLogRepository ?? new AuditLogRepository())
  );
  const controller = new FieldJobController(service);

  router.get(
    "/backoffice/field-jobs",
    authenticate(),
    authorize,
    validateRequest({ query: fieldJobListQuerySchema }),
    controller.list
  );
  router.get(
    "/backoffice/field-jobs/:id",
    authenticate(),
    authorize,
    validateRequest({ params: fieldJobIdParamSchema }),
    controller.get
  );
  return router;
};
