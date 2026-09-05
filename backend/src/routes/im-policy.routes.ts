import { Router } from "express";
import type { AppDependencies } from "../app";
import type { AppConfig } from "../config/env";
import { PLATFORM_SETTINGS_PERMISSIONS } from "../constants/permissions.constants";
import { ImPolicyController } from "../controllers/im-policy.controller";
import { createAuthenticateMiddleware } from "../middlewares/authenticate.middleware";
import { createAuthorizeMiddleware } from "../middlewares/authorize.middleware";
import { validateRequest } from "../middlewares/validate-request.middleware";
import { AuditLogRepository } from "../repositories/audit-log.repository";
import { ImPolicyRepository } from "../repositories/im-policy.repository";
import { AuditLogService } from "../services/audit-log.service";
import { ImPolicyService } from "../services/im-policy.service";
import { imRetentionSettingsBodySchema } from "../validators/im-policy.validator";
import { createAuthServiceForRoutes } from "./auth-service.factory";

export const createImPolicyRoutes = (
  config: AppConfig,
  dependencies: AppDependencies
): Router => {
  const router = Router();
  const authenticate = createAuthenticateMiddleware(
    createAuthServiceForRoutes(config, dependencies)
  );
  const repository = dependencies.imPolicyRepository ?? new ImPolicyRepository();
  const service =
    dependencies.imPolicyService ??
    new ImPolicyService(
      repository,
      new AuditLogService(dependencies.auditLogRepository ?? new AuditLogRepository())
    );
  const controller = new ImPolicyController(service);

  router.get(
    "/backoffice/system-settings/im-retention",
    authenticate(),
    createAuthorizeMiddleware(PLATFORM_SETTINGS_PERMISSIONS.read),
    controller.get
  );
  router.put(
    "/backoffice/system-settings/im-retention",
    authenticate(),
    createAuthorizeMiddleware(PLATFORM_SETTINGS_PERMISSIONS.write),
    validateRequest({ body: imRetentionSettingsBodySchema }),
    controller.update
  );
  return router;
};
