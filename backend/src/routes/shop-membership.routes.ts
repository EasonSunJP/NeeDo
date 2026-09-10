import { Router } from "express";
import type { AppDependencies } from "../app";
import type { AppConfig } from "../config/env";
import { ShopMembershipController } from "../controllers/shop-membership.controller";
import { createAuthenticateMiddleware } from "../middlewares/authenticate.middleware";
import { createAuthorizeMiddleware } from "../middlewares/authorize.middleware";
import { validateRequest } from "../middlewares/validate-request.middleware";
import { AuditLogRepository } from "../repositories/audit-log.repository";
import { ShopMembershipRepository } from "../repositories/shop-membership.repository";
import { AuditLogService } from "../services/audit-log.service";
import { ShopMembershipService } from "../services/shop-membership.service";
import {
  customerShopMembershipListQuerySchema,
  shopMembershipActivityQuerySchema,
  shopMembershipAnalyticsQuerySchema,
  shopMembershipCandidateQuerySchema,
  shopMembershipCardListQuerySchema,
  shopMembershipCreateBodySchema,
  shopMembershipListQuerySchema,
  shopMembershipPublicIdParamSchema
} from "../validators/shop-membership.validator";
import { createAuthServiceForRoutes } from "./auth-service.factory";

export const SHOP_MEMBERSHIP_ROUTE_PERMISSIONS = {
  view: "shop.member.view",
  create: "shop.member.create",
  analytics: "shop.member.analytics.view",
  operationLog: "shop.member.operation_log.view",
  customerRead: "customer-profile:read"
} as const;

export const createShopMembershipRoutes = (
  config: AppConfig,
  dependencies: AppDependencies
): Router => {
  const router = Router();
  const authenticate = createAuthenticateMiddleware(
    createAuthServiceForRoutes(config, dependencies)
  );
  const service = new ShopMembershipService(
    dependencies.shopMembershipRepository ?? new ShopMembershipRepository(),
    new AuditLogService(dependencies.auditLogRepository ?? new AuditLogRepository())
  );
  const controller = new ShopMembershipController(service);
  const protect = (permission: string) => [authenticate(), createAuthorizeMiddleware(permission)];

  router.get(
    "/merchant-admin/shop-memberships/overview",
    ...protect(SHOP_MEMBERSHIP_ROUTE_PERMISSIONS.view),
    controller.merchantOverview
  );
  router.get(
    "/merchant-admin/shop-memberships",
    ...protect(SHOP_MEMBERSHIP_ROUTE_PERMISSIONS.view),
    validateRequest({ query: shopMembershipListQuerySchema }),
    controller.merchantList
  );
  router.post(
    "/merchant-admin/shop-memberships",
    ...protect(SHOP_MEMBERSHIP_ROUTE_PERMISSIONS.create),
    validateRequest({ body: shopMembershipCreateBodySchema }),
    controller.merchantCreate
  );
  router.get(
    "/merchant-admin/shop-memberships/:publicId",
    ...protect(SHOP_MEMBERSHIP_ROUTE_PERMISSIONS.view),
    validateRequest({ params: shopMembershipPublicIdParamSchema }),
    controller.merchantDetail
  );
  router.get(
    "/merchant-admin/shop-membership-candidates",
    ...protect(SHOP_MEMBERSHIP_ROUTE_PERMISSIONS.create),
    validateRequest({ query: shopMembershipCandidateQuerySchema }),
    controller.merchantCandidates
  );
  router.get(
    "/merchant-admin/shop-membership-cards",
    ...protect(SHOP_MEMBERSHIP_ROUTE_PERMISSIONS.view),
    validateRequest({ query: shopMembershipCardListQuerySchema }),
    controller.merchantCards
  );
  router.get(
    "/merchant-admin/shop-membership-activities",
    ...protect(SHOP_MEMBERSHIP_ROUTE_PERMISSIONS.operationLog),
    validateRequest({ query: shopMembershipActivityQuerySchema }),
    controller.merchantActivities
  );
  router.get(
    "/merchant-admin/shop-membership-analytics",
    ...protect(SHOP_MEMBERSHIP_ROUTE_PERMISSIONS.analytics),
    validateRequest({ query: shopMembershipAnalyticsQuerySchema }),
    controller.merchantAnalytics
  );
  router.get(
    "/customer-profile/me/shop-memberships",
    ...protect(SHOP_MEMBERSHIP_ROUTE_PERMISSIONS.customerRead),
    validateRequest({ query: customerShopMembershipListQuerySchema }),
    controller.customerList
  );
  router.get(
    "/customer-profile/me/shop-memberships/:publicId",
    ...protect(SHOP_MEMBERSHIP_ROUTE_PERMISSIONS.customerRead),
    validateRequest({ params: shopMembershipPublicIdParamSchema }),
    controller.customerDetail
  );

  return router;
};
