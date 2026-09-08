import { Router } from "express";
import type { AppDependencies } from "../app";
import type { AppConfig } from "../config/env";
import { PlatformPartnerController } from "../controllers/platform-partner.controller";
import { createAuthenticateMiddleware } from "../middlewares/authenticate.middleware";
import { createAuthorizeMiddleware } from "../middlewares/authorize.middleware";
import { validateRequest } from "../middlewares/validate-request.middleware";
import { AuditLogRepository } from "../repositories/audit-log.repository";
import { PlatformPartnerRepository } from "../repositories/platform-partner.repository";
import { AuditLogService } from "../services/audit-log.service";
import { PlatformPartnerService } from "../services/platform-partner.service";
import {
  agentListQuerySchema,
  agentParamSchema,
  agentShopReferralBodySchema,
  agentShopReferralListQuerySchema,
  platformPartnerProfileBodySchema,
  platformPartnerHistoryQuerySchema,
  platformPartnerUserParamSchema
} from "../validators/platform-partner.validator";
import { createAuthServiceForRoutes } from "./auth-service.factory";

export const PLATFORM_PARTNER_ROUTE_PERMISSIONS = {
  markProfile: "backoffice:partner-profile:write",
  readProfiles: "backoffice:users:read",
  readAgents: "backoffice:agent:read",
  writeAgents: "backoffice:agent:write"
} as const;

export const createPlatformPartnerRoutes = (
  config: AppConfig,
  dependencies: AppDependencies
): Router => {
  const router = Router();
  const authenticate = createAuthenticateMiddleware(
    createAuthServiceForRoutes(config, dependencies)
  );
  const service = new PlatformPartnerService(
    dependencies.platformPartnerRepository ?? new PlatformPartnerRepository(),
    new AuditLogService(dependencies.auditLogRepository ?? new AuditLogRepository())
  );
  const controller = new PlatformPartnerController(service);

  router.post(
    "/backoffice/users/:userId/partner-profiles",
    authenticate(),
    createAuthorizeMiddleware(PLATFORM_PARTNER_ROUTE_PERMISSIONS.markProfile),
    validateRequest({
      params: platformPartnerUserParamSchema,
      body: platformPartnerProfileBodySchema
    }),
    controller.markProfile
  );
  router.get(
    "/backoffice/users/:userId/partner-profiles",
    authenticate(),
    createAuthorizeMiddleware(PLATFORM_PARTNER_ROUTE_PERMISSIONS.readProfiles),
    validateRequest({
      params: platformPartnerUserParamSchema,
      query: platformPartnerHistoryQuerySchema
    }),
    controller.listUserProfiles
  );
  router.get(
    "/backoffice/agents",
    authenticate(),
    createAuthorizeMiddleware(PLATFORM_PARTNER_ROUTE_PERMISSIONS.readAgents),
    validateRequest({ query: agentListQuerySchema }),
    controller.listAgents
  );
  router.post(
    "/backoffice/agents/:agentPublicId/shop-referrals",
    authenticate(),
    createAuthorizeMiddleware(PLATFORM_PARTNER_ROUTE_PERMISSIONS.writeAgents),
    validateRequest({
      params: agentParamSchema,
      body: agentShopReferralBodySchema
    }),
    controller.linkShop
  );
  router.get(
    "/backoffice/agents/:agentPublicId/shop-referrals",
    authenticate(),
    createAuthorizeMiddleware(PLATFORM_PARTNER_ROUTE_PERMISSIONS.readAgents),
    validateRequest({
      params: agentParamSchema,
      query: agentShopReferralListQuerySchema
    }),
    controller.listShopReferrals
  );

  return router;
};
