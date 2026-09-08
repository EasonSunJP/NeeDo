import { Router } from "express";
import type { AppDependencies } from "../app";
import type { AppConfig } from "../config/env";
import { ShopMembershipCardIssuanceController } from "../controllers/shop-membership-card-issuance.controller";
import { createAuthenticateMiddleware } from "../middlewares/authenticate.middleware";
import { createAuthorizeMiddleware } from "../middlewares/authorize.middleware";
import { validateRequest } from "../middlewares/validate-request.middleware";
import { AuditLogRepository } from "../repositories/audit-log.repository";
import { ShopMembershipCardIssuanceRepository } from "../repositories/shop-membership-card-issuance.repository";
import { AuditLogService } from "../services/audit-log.service";
import { ShopMembershipCardIssuanceService } from "../services/shop-membership-card-issuance.service";
import {
  shopMembershipCardIssuanceBodySchema,
  shopMembershipCardIssuanceParamSchema
} from "../validators/shop-membership-card-issuance.validator";
import { createAuthServiceForRoutes } from "./auth-service.factory";

export const SHOP_MEMBERSHIP_CARD_ISSUANCE_ROUTE_PERMISSIONS = {
  issue: "shop.member.card.issue"
} as const;

export const createShopMembershipCardIssuanceRoutes = (
  config: AppConfig,
  dependencies: AppDependencies
): Router => {
  const router = Router();
  const authenticate = createAuthenticateMiddleware(
    createAuthServiceForRoutes(config, dependencies)
  );
  const service = new ShopMembershipCardIssuanceService(
    dependencies.shopMembershipCardIssuanceRepository ?? new ShopMembershipCardIssuanceRepository(),
    new AuditLogService(dependencies.auditLogRepository ?? new AuditLogRepository())
  );
  const controller = new ShopMembershipCardIssuanceController(service);

  router.post(
    "/merchant-admin/shop-memberships/:publicId/cards",
    authenticate(),
    createAuthorizeMiddleware(SHOP_MEMBERSHIP_CARD_ISSUANCE_ROUTE_PERMISSIONS.issue),
    validateRequest({
      params: shopMembershipCardIssuanceParamSchema,
      body: shopMembershipCardIssuanceBodySchema
    }),
    controller.issue
  );
  return router;
};
