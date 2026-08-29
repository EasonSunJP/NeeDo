import { Router } from "express";
import type { AppDependencies } from "../app";
import type { AppConfig } from "../config/env";
import { TechnicianProfileController } from "../controllers/technician-profile.controller";
import { createAuthenticateMiddleware } from "../middlewares/authenticate.middleware";
import { createAuthorizeMiddleware } from "../middlewares/authorize.middleware";
import { validateRequest } from "../middlewares/validate-request.middleware";
import { AuditLogRepository } from "../repositories/audit-log.repository";
import { TechnicianProfileRepository } from "../repositories/technician-profile.repository";
import { AuditLogService } from "../services/audit-log.service";
import { CustomerAvatarFileStorage } from "../services/customer-avatar.storage";
import { TechnicianProfileService } from "../services/technician-profile.service";
import { technicianProfileUpdateBodySchema } from "../validators/technician-profile.validator";
import { createAuthServiceForRoutes } from "./auth-service.factory";

export const TECHNICIAN_PROFILE_ROUTE_PERMISSIONS = {
  read: "technician-profile:read",
  write: "technician-profile:write"
} as const;

export const createTechnicianProfileRoutes = (
  config: AppConfig,
  dependencies: AppDependencies
): Router => {
  const router = Router();
  const authenticate = createAuthenticateMiddleware(createAuthServiceForRoutes(config, dependencies));
  const service = new TechnicianProfileService(
    dependencies.technicianProfileRepository ?? new TechnicianProfileRepository(),
    new AuditLogService(dependencies.auditLogRepository ?? new AuditLogRepository()),
    dependencies.customerAvatarStorage ??
      new CustomerAvatarFileStorage(
        config.CUSTOMER_AVATAR_STORAGE_DIR,
        config.CUSTOMER_AVATAR_PUBLIC_BASE_URL
      )
  );
  const controller = new TechnicianProfileController(service);

  router.get(
    "/technician-profile/me",
    authenticate(),
    createAuthorizeMiddleware(TECHNICIAN_PROFILE_ROUTE_PERMISSIONS.read),
    controller.getMine
  );
  router.patch(
    "/technician-profile/me",
    authenticate(),
    createAuthorizeMiddleware(TECHNICIAN_PROFILE_ROUTE_PERMISSIONS.write),
    validateRequest({ body: technicianProfileUpdateBodySchema }),
    controller.updateMine
  );

  return router;
};
