import { Router } from "express";
import type { AppDependencies } from "../app";
import type { AppConfig } from "../config/env";
import { ShopMembershipCardAdjustmentController } from "../controllers/shop-membership-card-adjustment.controller";
import { createAuthenticateMiddleware } from "../middlewares/authenticate.middleware";
import { createAuthorizeMiddleware } from "../middlewares/authorize.middleware";
import { validateRequest } from "../middlewares/validate-request.middleware";
import { AuditLogRepository } from "../repositories/audit-log.repository";
import { ShopMembershipCardAdjustmentRepository } from "../repositories/shop-membership-card-adjustment.repository";
import { AuditLogService } from "../services/audit-log.service";
import { ShopMembershipCardAdjustmentService } from "../services/shop-membership-card-adjustment.service";
import {
  shopMembershipCardAdjustmentCancelBodySchema,
  shopMembershipCardAdjustmentCreateBodySchema,
  shopMembershipCardAdjustmentDecisionBodySchema,
  shopMembershipCardAdjustmentListQuerySchema,
  shopMembershipCardAdjustmentPublicIdParamSchema
} from "../validators/shop-membership-card-adjustment.validator";
import { createAuthServiceForRoutes } from "./auth-service.factory";

export const SHOP_MEMBERSHIP_CARD_ADJUSTMENT_ROUTE_PERMISSIONS = {
  request: "shop.member.card.adjust.request",
  customerRead: "customer-profile:read"
} as const;

export const createShopMembershipCardAdjustmentRoutes = (config: AppConfig, dependencies: AppDependencies): Router => {
  const router = Router();
  const authenticate = createAuthenticateMiddleware(createAuthServiceForRoutes(config, dependencies));
  const service = new ShopMembershipCardAdjustmentService(
    dependencies.shopMembershipCardAdjustmentRepository ?? new ShopMembershipCardAdjustmentRepository(),
    new AuditLogService(dependencies.auditLogRepository ?? new AuditLogRepository())
  );
  const controller = new ShopMembershipCardAdjustmentController(service);

  router.post(
    "/merchant-admin/shop-membership-cards/:publicId/adjustment-requests",
    authenticate(),
    createAuthorizeMiddleware(SHOP_MEMBERSHIP_CARD_ADJUSTMENT_ROUTE_PERMISSIONS.request),
    validateRequest({ params: shopMembershipCardAdjustmentPublicIdParamSchema, body: shopMembershipCardAdjustmentCreateBodySchema }),
    controller.create
  );
  router.get(
    "/merchant-admin/shop-membership-card-adjustment-requests",
    authenticate(),
    createAuthorizeMiddleware(SHOP_MEMBERSHIP_CARD_ADJUSTMENT_ROUTE_PERMISSIONS.request),
    validateRequest({ query: shopMembershipCardAdjustmentListQuerySchema }),
    controller.merchantList
  );
  router.post(
    "/merchant-admin/shop-membership-card-adjustment-requests/:publicId/cancel",
    authenticate(),
    createAuthorizeMiddleware(SHOP_MEMBERSHIP_CARD_ADJUSTMENT_ROUTE_PERMISSIONS.request),
    validateRequest({ params: shopMembershipCardAdjustmentPublicIdParamSchema, body: shopMembershipCardAdjustmentCancelBodySchema }),
    controller.cancel
  );
  router.get(
    "/customer-profile/me/shop-membership-card-adjustment-requests",
    authenticate(),
    createAuthorizeMiddleware(SHOP_MEMBERSHIP_CARD_ADJUSTMENT_ROUTE_PERMISSIONS.customerRead),
    validateRequest({ query: shopMembershipCardAdjustmentListQuerySchema }),
    controller.customerList
  );
  router.post(
    "/customer-profile/me/shop-membership-card-adjustment-requests/:publicId/decision",
    authenticate(),
    createAuthorizeMiddleware(SHOP_MEMBERSHIP_CARD_ADJUSTMENT_ROUTE_PERMISSIONS.customerRead),
    validateRequest({ params: shopMembershipCardAdjustmentPublicIdParamSchema, body: shopMembershipCardAdjustmentDecisionBodySchema }),
    controller.decide
  );
  return router;
};
