import { Router } from "express";
import type { AppDependencies } from "../app";
import type { AppConfig } from "../config/env";
import { ShopMembershipCardTopUpController } from "../controllers/shop-membership-card-topup.controller";
import { createAuthenticateMiddleware } from "../middlewares/authenticate.middleware";
import { createAuthorizeMiddleware } from "../middlewares/authorize.middleware";
import { validateRequest } from "../middlewares/validate-request.middleware";
import { AuditLogRepository } from "../repositories/audit-log.repository";
import { ShopMembershipCardTopUpRepository } from "../repositories/shop-membership-card-topup.repository";
import { AuditLogService } from "../services/audit-log.service";
import { ShopMembershipCardTopUpService } from "../services/shop-membership-card-topup.service";
import {
  shopMembershipCardTopUpCreateBodySchema,
  shopMembershipCardTopUpListQuerySchema,
  shopMembershipCardTopUpPublicIdParamSchema
} from "../validators/shop-membership-card-topup.validator";
import { createAuthServiceForRoutes } from "./auth-service.factory";

export const SHOP_MEMBERSHIP_CARD_TOPUP_ROUTE_PERMISSIONS = {
  create: "shop.member.card.topup.create",
  merchantRead: "shop.member.view",
  customerRead: "customer-profile:read"
} as const;

export const createShopMembershipCardTopUpRoutes = (config: AppConfig, dependencies: AppDependencies): Router => {
  const router = Router();
  const authenticate = createAuthenticateMiddleware(createAuthServiceForRoutes(config, dependencies));
  const service = new ShopMembershipCardTopUpService(
    dependencies.shopMembershipCardTopUpRepository ?? new ShopMembershipCardTopUpRepository(),
    new AuditLogService(dependencies.auditLogRepository ?? new AuditLogRepository())
  );
  const controller = new ShopMembershipCardTopUpController(service);

  router.post(
    "/merchant-admin/shop-membership-cards/:publicId/top-ups",
    authenticate(),
    createAuthorizeMiddleware(SHOP_MEMBERSHIP_CARD_TOPUP_ROUTE_PERMISSIONS.create),
    validateRequest({ params: shopMembershipCardTopUpPublicIdParamSchema, body: shopMembershipCardTopUpCreateBodySchema }),
    controller.create
  );
  router.get(
    "/merchant-admin/shop-membership-card-top-ups",
    authenticate(),
    createAuthorizeMiddleware(SHOP_MEMBERSHIP_CARD_TOPUP_ROUTE_PERMISSIONS.merchantRead),
    validateRequest({ query: shopMembershipCardTopUpListQuerySchema }),
    controller.merchantList
  );
  router.get(
    "/customer-profile/me/shop-membership-card-top-ups",
    authenticate(),
    createAuthorizeMiddleware(SHOP_MEMBERSHIP_CARD_TOPUP_ROUTE_PERMISSIONS.customerRead),
    validateRequest({ query: shopMembershipCardTopUpListQuerySchema }),
    controller.customerList
  );
  return router;
};
