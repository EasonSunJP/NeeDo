import { Router } from "express";
import type { AppDependencies } from "../app";
import type { AppConfig } from "../config/env";
import { AffiliateProfileController } from "../controllers/affiliate-profile.controller";
import { createAuthenticateMiddleware } from "../middlewares/authenticate.middleware";
import { createAuthorizeMiddleware } from "../middlewares/authorize.middleware";
import { validateRequest } from "../middlewares/validate-request.middleware";
import { AffiliateProfileRepository } from "../repositories/affiliate-profile.repository";
import { AuditLogRepository } from "../repositories/audit-log.repository";
import { AffiliateChannelUrlService } from "../services/affiliate-channel-url.service";
import { AffiliateProfileService } from "../services/affiliate-profile.service";
import { AuditLogService } from "../services/audit-log.service";
import {
  affiliateChannelCreateBodySchema,
  affiliateChannelDeleteQuerySchema,
  affiliateChannelIdParamSchema,
  affiliateChannelUpdateBodySchema,
  affiliateProfileUpdateBodySchema
} from "../validators/affiliate-profile.validator";
import { createAuthServiceForRoutes } from "./auth-service.factory";

export const AFFILIATE_PROFILE_ROUTE_PERMISSIONS = {
  read: "page:affiliate-profile",
  edit: "button:affiliate-profile-edit"
} as const;

export const createAffiliateProfileRoutes = (
  config: AppConfig,
  dependencies: AppDependencies
): Router => {
  const router = Router();
  const authenticate = createAuthenticateMiddleware(
    createAuthServiceForRoutes(config, dependencies)
  );
  const service =
    dependencies.affiliateProfileService ??
    new AffiliateProfileService(
      dependencies.affiliateProfileRepository ?? new AffiliateProfileRepository(),
      new AuditLogService(dependencies.auditLogRepository ?? new AuditLogRepository()),
      new AffiliateChannelUrlService()
    );
  const controller = new AffiliateProfileController(service);

  router.get(
    "/affiliate/profile",
    authenticate(),
    createAuthorizeMiddleware(AFFILIATE_PROFILE_ROUTE_PERMISSIONS.read),
    controller.getMine
  );
  router.patch(
    "/affiliate/profile",
    authenticate(),
    createAuthorizeMiddleware(AFFILIATE_PROFILE_ROUTE_PERMISSIONS.edit),
    validateRequest({ body: affiliateProfileUpdateBodySchema }),
    controller.updateMine
  );
  router.post(
    "/affiliate/profile/channels",
    authenticate(),
    createAuthorizeMiddleware(AFFILIATE_PROFILE_ROUTE_PERMISSIONS.edit),
    validateRequest({ body: affiliateChannelCreateBodySchema }),
    controller.createChannel
  );
  router.patch(
    "/affiliate/profile/channels/:channelId",
    authenticate(),
    createAuthorizeMiddleware(AFFILIATE_PROFILE_ROUTE_PERMISSIONS.edit),
    validateRequest({
      params: affiliateChannelIdParamSchema,
      body: affiliateChannelUpdateBodySchema
    }),
    controller.updateChannel
  );
  router.delete(
    "/affiliate/profile/channels/:channelId",
    authenticate(),
    createAuthorizeMiddleware(AFFILIATE_PROFILE_ROUTE_PERMISSIONS.edit),
    validateRequest({
      params: affiliateChannelIdParamSchema,
      query: affiliateChannelDeleteQuerySchema
    }),
    controller.deleteChannel
  );

  return router;
};
