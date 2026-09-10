import { Router } from "express";
import type { AppDependencies } from "../app";
import type { AppConfig } from "../config/env";
import { ShopMembershipCardPlanController } from "../controllers/shop-membership-card-plan.controller";
import { createAuthenticateMiddleware } from "../middlewares/authenticate.middleware";
import { createAuthorizeMiddleware } from "../middlewares/authorize.middleware";
import { validateRequest } from "../middlewares/validate-request.middleware";
import { AuditLogRepository } from "../repositories/audit-log.repository";
import { ShopMembershipCardPlanRepository } from "../repositories/shop-membership-card-plan.repository";
import { AuditLogService } from "../services/audit-log.service";
import { ShopMembershipCardPlanService } from "../services/shop-membership-card-plan.service";
import {
  membershipRewardFeePolicyCreateBodySchema,
  membershipRewardFeePolicyListQuerySchema,
  shopMembershipCardPlanDraftBodySchema,
  shopMembershipCardPlanListQuerySchema,
  shopMembershipCardPlanPreviewBodySchema,
  shopMembershipCardPlanPublicIdParamSchema,
  shopMembershipCardPlanPublishBodySchema,
  shopMembershipCardPlanRetireBodySchema
} from "../validators/shop-membership-card-plan.validator";
import { createAuthServiceForRoutes } from "./auth-service.factory";

export const SHOP_MEMBERSHIP_CARD_PLAN_ROUTE_PERMISSIONS = {
  view: "shop.member.card_plan.view",
  manage: "shop.member.card_plan.manage",
  publish: "shop.member.card_plan.publish",
  feeRead: "page:backoffice-membership-reward-fee",
  feeWrite: "button:backoffice-membership-reward-fee-create"
} as const;

export const createShopMembershipCardPlanRoutes = (
  config: AppConfig,
  dependencies: AppDependencies
): Router => {
  const router = Router();
  const authenticate = createAuthenticateMiddleware(
    createAuthServiceForRoutes(config, dependencies)
  );
  const authorize = (permission: string) => [authenticate(), createAuthorizeMiddleware(permission)];
  const service = new ShopMembershipCardPlanService(
    dependencies.shopMembershipCardPlanRepository ?? new ShopMembershipCardPlanRepository(),
    new AuditLogService(dependencies.auditLogRepository ?? new AuditLogRepository())
  );
  const controller = new ShopMembershipCardPlanController(service);

  router.get(
    "/merchant-admin/shop-membership-card-plans",
    ...authorize(SHOP_MEMBERSHIP_CARD_PLAN_ROUTE_PERMISSIONS.view),
    validateRequest({ query: shopMembershipCardPlanListQuerySchema }),
    controller.list
  );
  router.post(
    "/merchant-admin/shop-membership-card-plans",
    ...authorize(SHOP_MEMBERSHIP_CARD_PLAN_ROUTE_PERMISSIONS.manage),
    validateRequest({ body: shopMembershipCardPlanDraftBodySchema }),
    controller.create
  );
  router.get(
    "/merchant-admin/shop-membership-card-plans/:publicId",
    ...authorize(SHOP_MEMBERSHIP_CARD_PLAN_ROUTE_PERMISSIONS.view),
    validateRequest({ params: shopMembershipCardPlanPublicIdParamSchema }),
    controller.get
  );
  router.patch(
    "/merchant-admin/shop-membership-card-plans/:publicId/draft",
    ...authorize(SHOP_MEMBERSHIP_CARD_PLAN_ROUTE_PERMISSIONS.manage),
    validateRequest({
      params: shopMembershipCardPlanPublicIdParamSchema,
      body: shopMembershipCardPlanDraftBodySchema
    }),
    controller.updateDraft
  );
  router.post(
    "/merchant-admin/shop-membership-card-plans/:publicId/preview",
    ...authorize(SHOP_MEMBERSHIP_CARD_PLAN_ROUTE_PERMISSIONS.view),
    validateRequest({
      params: shopMembershipCardPlanPublicIdParamSchema,
      body: shopMembershipCardPlanPreviewBodySchema
    }),
    controller.preview
  );
  router.post(
    "/merchant-admin/shop-membership-card-plans/:publicId/publish",
    ...authorize(SHOP_MEMBERSHIP_CARD_PLAN_ROUTE_PERMISSIONS.publish),
    validateRequest({
      params: shopMembershipCardPlanPublicIdParamSchema,
      body: shopMembershipCardPlanPublishBodySchema
    }),
    controller.publish
  );
  router.post(
    "/merchant-admin/shop-membership-card-plans/:publicId/retire",
    ...authorize(SHOP_MEMBERSHIP_CARD_PLAN_ROUTE_PERMISSIONS.manage),
    validateRequest({
      params: shopMembershipCardPlanPublicIdParamSchema,
      body: shopMembershipCardPlanRetireBodySchema
    }),
    controller.retire
  );
  router.get(
    "/backoffice/membership-reward-fee-policy",
    ...authorize(SHOP_MEMBERSHIP_CARD_PLAN_ROUTE_PERMISSIONS.feeRead),
    validateRequest({ query: membershipRewardFeePolicyListQuerySchema }),
    controller.getFeePolicy
  );
  router.post(
    "/backoffice/membership-reward-fee-policy/versions",
    ...authorize(SHOP_MEMBERSHIP_CARD_PLAN_ROUTE_PERMISSIONS.feeWrite),
    validateRequest({ body: membershipRewardFeePolicyCreateBodySchema }),
    controller.createFeePolicyVersion
  );

  return router;
};
