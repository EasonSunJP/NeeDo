import { Router } from "express";
import type { AppDependencies } from "../app";
import type { AppConfig } from "../config/env";
import { CompensationProfileController } from "../controllers/compensation-profile.controller";
import { createAuthenticateMiddleware } from "../middlewares/authenticate.middleware";
import { createAuthorizeMiddleware } from "../middlewares/authorize.middleware";
import { validateRequest } from "../middlewares/validate-request.middleware";
import { AuditLogRepository } from "../repositories/audit-log.repository";
import { CompensationProfileRepository } from "../repositories/compensation-profile.repository";
import { AuditLogService } from "../services/audit-log.service";
import { CompensationProfileService } from "../services/compensation-profile.service";
import {
  compensationProfileBodySchema,
  compensationProfileParamSchema,
  compensationProfilePreviewBodySchema
} from "../validators/compensation-profile.validator";
import { createAuthServiceForRoutes } from "./auth-service.factory";

export const COMPENSATION_PROFILE_ROUTE_PERMISSIONS = {
  read: "merchant-admin:compensation-profile:read",
  write: "merchant-admin:compensation-profile:write",
  preview: "merchant-admin:compensation-profile:preview"
} as const;

export const createCompensationProfileRoutes = (
  config: AppConfig,
  dependencies: AppDependencies
): Router => {
  const router = Router();
  const authService = createAuthServiceForRoutes(config, dependencies);
  const authenticate = createAuthenticateMiddleware(authService);
  const authorize = createAuthorizeMiddleware;
  const auditLogService = new AuditLogService(
    dependencies.auditLogRepository ?? new AuditLogRepository()
  );
  const service = new CompensationProfileService(
    dependencies.compensationProfileRepository ?? new CompensationProfileRepository(),
    auditLogService
  );
  const controller = new CompensationProfileController(service);

  router.get(
    "/merchant-admin/shops/:shopId/technicians/:technicianProfileId/compensation-profile",
    authenticate(),
    authorize(COMPENSATION_PROFILE_ROUTE_PERMISSIONS.read),
    validateRequest({ params: compensationProfileParamSchema }),
    controller.getCompensationProfile
  );
  router.put(
    "/merchant-admin/shops/:shopId/technicians/:technicianProfileId/compensation-profile",
    authenticate(),
    authorize(COMPENSATION_PROFILE_ROUTE_PERMISSIONS.write),
    validateRequest({
      params: compensationProfileParamSchema,
      body: compensationProfileBodySchema
    }),
    controller.updateCompensationProfile
  );
  router.post(
    "/merchant-admin/shops/:shopId/technicians/:technicianProfileId/compensation-profile/preview",
    authenticate(),
    authorize(COMPENSATION_PROFILE_ROUTE_PERMISSIONS.preview),
    validateRequest({
      params: compensationProfileParamSchema,
      body: compensationProfilePreviewBodySchema
    }),
    controller.previewCompensationProfile
  );

  return router;
};
