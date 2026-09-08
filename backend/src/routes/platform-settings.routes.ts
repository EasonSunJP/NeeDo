import { Router } from "express";
import type { AppDependencies } from "../app";
import type { AppConfig } from "../config/env";
import { PLATFORM_SETTINGS_PERMISSIONS } from "../constants/permissions.constants";
import { PlatformSettingsController } from "../controllers/platform-settings.controller";
import { createAuthenticateMiddleware } from "../middlewares/authenticate.middleware";
import { createAuthorizeMiddleware } from "../middlewares/authorize.middleware";
import { validateRequest } from "../middlewares/validate-request.middleware";
import { AuditLogRepository } from "../repositories/audit-log.repository";
import { PlatformSettingsRepository } from "../repositories/platform-settings.repository";
import { AuditLogService } from "../services/audit-log.service";
import { PlatformSettingsResolver } from "../services/platform-settings.resolver";
import { PlatformSettingsService } from "../services/platform-settings.service";
import {
  platformBasicSettingsBodySchema,
  platformPaymentSettingsBodySchema
} from "../validators/platform-settings.validator";
import { createAuthServiceForRoutes } from "./auth-service.factory";

export const createPlatformSettingsRoutes = (
  config: AppConfig,
  dependencies: AppDependencies
): Router => {
  const router = Router();
  const authenticate = createAuthenticateMiddleware(
    createAuthServiceForRoutes(config, dependencies)
  );
  const repository = dependencies.platformSettingsRepository ?? new PlatformSettingsRepository();
  const resolver =
    dependencies.platformSettingsResolver ?? new PlatformSettingsResolver(repository);
  const service =
    dependencies.platformSettingsService ??
    new PlatformSettingsService(
      repository,
      resolver,
      new AuditLogService(dependencies.auditLogRepository ?? new AuditLogRepository())
    );
  const controller = new PlatformSettingsController(service);

  router.get("/platform/settings/public", controller.getPublic);
  router.get(
    "/backoffice/system-settings",
    authenticate(),
    createAuthorizeMiddleware(PLATFORM_SETTINGS_PERMISSIONS.read),
    controller.getForOperations
  );
  router.put(
    "/backoffice/system-settings/basic",
    authenticate(),
    createAuthorizeMiddleware(PLATFORM_SETTINGS_PERMISSIONS.write),
    validateRequest({ body: platformBasicSettingsBodySchema }),
    controller.updateBasic
  );
  router.put(
    "/backoffice/system-settings/payment",
    authenticate(),
    createAuthorizeMiddleware(PLATFORM_SETTINGS_PERMISSIONS.paymentWrite),
    validateRequest({ body: platformPaymentSettingsBodySchema }),
    controller.updatePayment
  );

  return router;
};
