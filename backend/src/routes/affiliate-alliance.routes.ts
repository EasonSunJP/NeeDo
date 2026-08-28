import { Router } from "express";
import type { AppDependencies } from "../app";
import type { AppConfig } from "../config/env";
import { AffiliateAllianceController } from "../controllers/affiliate-alliance.controller";
import { createAuthenticateMiddleware } from "../middlewares/authenticate.middleware";
import { createAuthorizeMiddleware } from "../middlewares/authorize.middleware";
import { validateRequest } from "../middlewares/validate-request.middleware";
import { AffiliateAllianceRepository } from "../repositories/affiliate-alliance.repository";
import { AuditLogRepository } from "../repositories/audit-log.repository";
import { AffiliateAllianceService } from "../services/affiliate-alliance.service";
import { AuditLogService } from "../services/audit-log.service";
import { affiliateAllianceCreateBodySchema } from "../validators/affiliate-alliance.validator";
import { createAuthServiceForRoutes } from "./auth-service.factory";

export const AFFILIATE_ALLIANCE_ROUTE_PERMISSIONS = {
  read: "page:affiliate-alliance",
  create: "button:affiliate-alliance-create"
} as const;

export const createAffiliateAllianceRoutes = (
  config: AppConfig,
  dependencies: AppDependencies
): Router => {
  const router = Router();
  const authenticate = createAuthenticateMiddleware(
    createAuthServiceForRoutes(config, dependencies)
  );
  const service =
    dependencies.affiliateAllianceService ??
    new AffiliateAllianceService(
      dependencies.affiliateAllianceRepository ?? new AffiliateAllianceRepository(),
      new AuditLogService(dependencies.auditLogRepository ?? new AuditLogRepository())
    );
  const controller = new AffiliateAllianceController(service);

  router.get(
    "/affiliate/alliances/me",
    authenticate(),
    createAuthorizeMiddleware(AFFILIATE_ALLIANCE_ROUTE_PERMISSIONS.read),
    controller.getMine
  );
  router.post(
    "/affiliate/alliances",
    authenticate(),
    createAuthorizeMiddleware(AFFILIATE_ALLIANCE_ROUTE_PERMISSIONS.create),
    validateRequest({ body: affiliateAllianceCreateBodySchema }),
    controller.createMine
  );

  return router;
};
