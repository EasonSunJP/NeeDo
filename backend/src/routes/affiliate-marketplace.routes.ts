import { Router } from "express";
import type { AppDependencies } from "../app";
import type { AppConfig } from "../config/env";
import { AffiliateMarketplaceController } from "../controllers/affiliate-marketplace.controller";
import { createAuthenticateMiddleware } from "../middlewares/authenticate.middleware";
import { createAuthorizeMiddleware } from "../middlewares/authorize.middleware";
import { validateRequest } from "../middlewares/validate-request.middleware";
import { AffiliateMarketplaceRepository } from "../repositories/affiliate-marketplace.repository";
import { AffiliateLinkTokenService } from "../services/affiliate-link-token.service";
import { AffiliateMarketplaceService } from "../services/affiliate-marketplace.service";
import {
  affiliateClaimListQuerySchema,
  affiliateMarketplaceClaimIdParamSchema,
  affiliateMarketplaceListQuerySchema,
  affiliateMarketplaceTaskIdParamSchema,
  affiliatePublicTokenParamSchema,
  createAffiliateClaimBodySchema
} from "../validators/affiliate-marketplace.validator";
import { createAuthServiceForRoutes } from "./auth-service.factory";

export const AFFILIATE_MARKETPLACE_ROUTE_PERMISSIONS = {
  read: "page:affiliate-marketplace",
  claim: "button:affiliate-claim"
} as const;

export const createAffiliateMarketplaceRoutes = (
  config: AppConfig,
  dependencies: AppDependencies
): Router => {
  const router = Router();
  const authenticate = createAuthenticateMiddleware(
    createAuthServiceForRoutes(config, dependencies)
  );
  const repository =
    dependencies.affiliateMarketplaceRepository ?? new AffiliateMarketplaceRepository();
  const linkTokens = new AffiliateLinkTokenService({
    secret: config.AFFILIATE_LINK_SECRET,
    publicBaseUrl: config.AFFILIATE_PUBLIC_BASE_URL
  });
  const service =
    dependencies.affiliateMarketplaceService ??
    new AffiliateMarketplaceService(repository, linkTokens);
  const controller = new AffiliateMarketplaceController(service);

  router.get(
    "/affiliate/tasks",
    authenticate(),
    createAuthorizeMiddleware(AFFILIATE_MARKETPLACE_ROUTE_PERMISSIONS.read),
    validateRequest({ query: affiliateMarketplaceListQuerySchema }),
    controller.listTasks
  );
  router.get(
    "/affiliate/tasks/:taskId",
    authenticate(),
    createAuthorizeMiddleware(AFFILIATE_MARKETPLACE_ROUTE_PERMISSIONS.read),
    validateRequest({ params: affiliateMarketplaceTaskIdParamSchema }),
    controller.getTask
  );
  router.post(
    "/affiliate/tasks/:taskId/claims",
    authenticate(),
    createAuthorizeMiddleware(AFFILIATE_MARKETPLACE_ROUTE_PERMISSIONS.claim),
    validateRequest({
      params: affiliateMarketplaceTaskIdParamSchema,
      body: createAffiliateClaimBodySchema
    }),
    controller.claimTask
  );
  router.get(
    "/affiliate/claims",
    authenticate(),
    createAuthorizeMiddleware(AFFILIATE_MARKETPLACE_ROUTE_PERMISSIONS.read),
    validateRequest({ query: affiliateClaimListQuerySchema }),
    controller.listMyClaims
  );
  router.get(
    "/affiliate/claims/:claimId",
    authenticate(),
    createAuthorizeMiddleware(AFFILIATE_MARKETPLACE_ROUTE_PERMISSIONS.read),
    validateRequest({ params: affiliateMarketplaceClaimIdParamSchema }),
    controller.getMyClaim
  );
  router.get(
    "/affiliate/resolve/:publicToken",
    validateRequest({ params: affiliatePublicTokenParamSchema }),
    controller.resolveLink
  );

  return router;
};
