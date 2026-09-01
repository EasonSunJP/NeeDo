import { Router } from "express";
import type { AppDependencies } from "../app";
import type { AppConfig } from "../config/env";
import { ShopMembershipCardRedemptionController } from "../controllers/shop-membership-card-redemption.controller";
import { createAuthenticateMiddleware } from "../middlewares/authenticate.middleware";
import { createAuthorizeMiddleware } from "../middlewares/authorize.middleware";
import { validateRequest } from "../middlewares/validate-request.middleware";
import { AuditLogRepository } from "../repositories/audit-log.repository";
import { LedgerRepository } from "../repositories/ledger.repository";
import { ShopMembershipCardRedemptionRepository } from "../repositories/shop-membership-card-redemption.repository";
import { AuditLogService } from "../services/audit-log.service";
import { LedgerService } from "../services/ledger.service";
import { ShopMembershipCardRedemptionService } from "../services/shop-membership-card-redemption.service";
import {
  shopMembershipCardRedemptionCandidateQuerySchema,
  shopMembershipCardRedemptionCreateBodySchema,
  shopMembershipCardRedemptionListQuerySchema,
  shopMembershipCardRedemptionPublicIdParamSchema
} from "../validators/shop-membership-card-redemption.validator";
import { createAuthServiceForRoutes } from "./auth-service.factory";

export const SHOP_MEMBERSHIP_CARD_REDEMPTION_ROUTE_PERMISSIONS = {
  create: "shop.member.card.redeem",
  candidates: "shop.member.card.redeem",
  merchantRead: "shop.member.view",
  customerRead: "customer-profile:read"
} as const;

export const createShopMembershipCardRedemptionRoutes = (
  config: AppConfig,
  dependencies: AppDependencies
): Router => {
  const router = Router();
  const authenticate = createAuthenticateMiddleware(createAuthServiceForRoutes(config, dependencies));
  const service = new ShopMembershipCardRedemptionService(
    dependencies.shopMembershipCardRedemptionRepository
      ?? new ShopMembershipCardRedemptionRepository(),
    dependencies.ledgerService
      ?? new LedgerService(dependencies.ledgerRepository ?? new LedgerRepository()),
    new AuditLogService(dependencies.auditLogRepository ?? new AuditLogRepository())
  );
  const controller = new ShopMembershipCardRedemptionController(service);

  router.get(
    "/merchant-admin/shop-membership-cards/:publicId/redemption-candidates",
    authenticate(),
    createAuthorizeMiddleware(SHOP_MEMBERSHIP_CARD_REDEMPTION_ROUTE_PERMISSIONS.candidates),
    validateRequest({
      params: shopMembershipCardRedemptionPublicIdParamSchema,
      query: shopMembershipCardRedemptionCandidateQuerySchema
    }),
    controller.candidates
  );
  router.post(
    "/merchant-admin/shop-membership-cards/:publicId/redemptions",
    authenticate(),
    createAuthorizeMiddleware(SHOP_MEMBERSHIP_CARD_REDEMPTION_ROUTE_PERMISSIONS.create),
    validateRequest({
      params: shopMembershipCardRedemptionPublicIdParamSchema,
      body: shopMembershipCardRedemptionCreateBodySchema
    }),
    controller.create
  );
  router.get(
    "/merchant-admin/shop-membership-card-redemptions",
    authenticate(),
    createAuthorizeMiddleware(SHOP_MEMBERSHIP_CARD_REDEMPTION_ROUTE_PERMISSIONS.merchantRead),
    validateRequest({ query: shopMembershipCardRedemptionListQuerySchema }),
    controller.merchantList
  );
  router.get(
    "/customer-profile/me/shop-membership-card-redemptions",
    authenticate(),
    createAuthorizeMiddleware(SHOP_MEMBERSHIP_CARD_REDEMPTION_ROUTE_PERMISSIONS.customerRead),
    validateRequest({ query: shopMembershipCardRedemptionListQuerySchema }),
    controller.customerList
  );
  return router;
};
