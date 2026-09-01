import { Router } from "express";
import type { AppDependencies } from "../app";
import type { AppConfig } from "../config/env";
import { MerchantProfileController } from "../controllers/merchant-profile.controller";
import { createAuthenticateMiddleware } from "../middlewares/authenticate.middleware";
import { createAuthorizeMiddleware } from "../middlewares/authorize.middleware";
import { validateRequest } from "../middlewares/validate-request.middleware";
import { AuditLogRepository } from "../repositories/audit-log.repository";
import { MerchantProfileRepository } from "../repositories/merchant-profile.repository";
import { AuditLogService } from "../services/audit-log.service";
import { CustomerAvatarFileStorage } from "../services/customer-avatar.storage";
import { MerchantProfileService } from "../services/merchant-profile.service";
import { merchantProfileUpdateBodySchema } from "../validators/merchant-profile.validator";
import { createAuthServiceForRoutes } from "./auth-service.factory";

export const MERCHANT_PROFILE_ROUTE_PERMISSIONS = {
  read: "merchant-profile:read",
  write: "merchant-profile:write"
} as const;

export const createMerchantProfileRoutes = (
  config: AppConfig,
  dependencies: AppDependencies
): Router => {
  const router = Router();
  const authenticate = createAuthenticateMiddleware(createAuthServiceForRoutes(config, dependencies));
  const service = new MerchantProfileService(
    dependencies.merchantProfileRepository ?? new MerchantProfileRepository(),
    new AuditLogService(dependencies.auditLogRepository ?? new AuditLogRepository()),
    dependencies.customerAvatarStorage ??
      new CustomerAvatarFileStorage(
        config.CUSTOMER_AVATAR_STORAGE_DIR,
        config.CUSTOMER_AVATAR_PUBLIC_BASE_URL
      )
  );
  const controller = new MerchantProfileController(service);

  router.get(
    "/merchant-profile/me",
    authenticate(),
    createAuthorizeMiddleware(MERCHANT_PROFILE_ROUTE_PERMISSIONS.read),
    controller.getMine
  );
  router.patch(
    "/merchant-profile/me",
    authenticate(),
    createAuthorizeMiddleware(MERCHANT_PROFILE_ROUTE_PERMISSIONS.write),
    validateRequest({ body: merchantProfileUpdateBodySchema }),
    controller.updateMine
  );
  return router;
};
