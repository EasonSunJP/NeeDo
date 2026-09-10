import { Router } from "express";
import type { AppDependencies } from "../app";
import type { AppConfig } from "../config/env";
import { CustomerProfileController } from "../controllers/customer-profile.controller";
import { createAuthenticateMiddleware } from "../middlewares/authenticate.middleware";
import { createAuthorizeMiddleware } from "../middlewares/authorize.middleware";
import { validateRequest } from "../middlewares/validate-request.middleware";
import { AuditLogRepository } from "../repositories/audit-log.repository";
import { CustomerProfileRepository } from "../repositories/customer-profile.repository";
import { AuditLogService } from "../services/audit-log.service";
import { CustomerAvatarFileStorage } from "../services/customer-avatar.storage";
import { CustomerProfileService } from "../services/customer-profile.service";
import { customerProfileUpdateBodySchema } from "../validators/customer-profile.validator";
import { createAuthServiceForRoutes } from "./auth-service.factory";

export const CUSTOMER_PROFILE_ROUTE_PERMISSIONS = {
  read: "customer-profile:read",
  write: "customer-profile:write"
} as const;

export const createCustomerProfileRoutes = (
  config: AppConfig,
  dependencies: AppDependencies
): Router => {
  const router = Router();
  const authenticate = createAuthenticateMiddleware(
    createAuthServiceForRoutes(config, dependencies)
  );
  const customerProfileService = new CustomerProfileService(
    dependencies.customerProfileRepository ?? new CustomerProfileRepository(),
    new AuditLogService(dependencies.auditLogRepository ?? new AuditLogRepository()),
    dependencies.customerAvatarStorage ??
      new CustomerAvatarFileStorage(
        config.CUSTOMER_AVATAR_STORAGE_DIR,
        config.CUSTOMER_AVATAR_PUBLIC_BASE_URL
      ),
    dependencies.personalIdentityScopeService,
    dependencies.profileUpdatedNotificationPort
  );
  const controller = new CustomerProfileController(customerProfileService);

  router.get(
    "/customer-profile/me",
    authenticate(),
    createAuthorizeMiddleware(CUSTOMER_PROFILE_ROUTE_PERMISSIONS.read),
    controller.getMine
  );
  router.patch(
    "/customer-profile/me",
    authenticate(),
    createAuthorizeMiddleware(CUSTOMER_PROFILE_ROUTE_PERMISSIONS.write),
    validateRequest({ body: customerProfileUpdateBodySchema }),
    controller.updateMine
  );

  return router;
};
