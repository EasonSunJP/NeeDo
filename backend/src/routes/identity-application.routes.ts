import { Router } from "express";
import type { AppDependencies } from "../app";
import type { AppConfig } from "../config/env";
import { IdentityApplicationController } from "../controllers/identity-application.controller";
import { createAuthenticateMiddleware } from "../middlewares/authenticate.middleware";
import { createAuthorizeMiddleware } from "../middlewares/authorize.middleware";
import { validateRequest } from "../middlewares/validate-request.middleware";
import {
  createMerchantApplicationBodySchema,
  bindMerchantBankAccountBodySchema,
  createTechnicianApplicationBodySchema,
  eligibleMerchantSearchQuerySchema,
  identityApplicationIdParamSchema,
  identityApplicationListQuerySchema,
  identityApplicationVersionBodySchema,
  updateMerchantShowcaseBodySchema,
  updateTechnicianApplicationBodySchema
} from "../validators/identity-application.validator";
import { createAuthServiceForRoutes } from "./auth-service.factory";
import {
  createIdentityApplicationServiceForRoutes,
  createProtectedBankAccountServiceForRoutes
} from "./identity-application-service.factory";

export const IDENTITY_APPLICATION_ROUTE_PERMISSIONS = {
  own: "identity-application:own"
} as const;

export const createIdentityApplicationRoutes = (
  config: AppConfig,
  dependencies: AppDependencies
): Router => {
  const router = Router();
  const authenticate = createAuthenticateMiddleware(
    createAuthServiceForRoutes(config, dependencies)
  );
  const authorize = createAuthorizeMiddleware(IDENTITY_APPLICATION_ROUTE_PERMISSIONS.own);
  const authorizeBank = createAuthorizeMiddleware("bank-account:own");
  const controller = new IdentityApplicationController(
    createIdentityApplicationServiceForRoutes(config, dependencies),
    createProtectedBankAccountServiceForRoutes(config, dependencies)
  );

  router.get(
    "/identity-applications/mine",
    authenticate(),
    authorize,
    validateRequest({ query: identityApplicationListQuerySchema }),
    controller.listMine
  );
  router.get(
    "/merchants/search",
    authenticate(),
    authorize,
    validateRequest({ query: eligibleMerchantSearchQuerySchema }),
    controller.searchEligibleShops
  );
  router.post(
    "/identity-applications/technician",
    authenticate(),
    authorize,
    validateRequest({ body: createTechnicianApplicationBodySchema }),
    controller.createTechnicianDraft
  );
  router.patch(
    "/identity-applications/:id/technician-profile",
    authenticate(),
    authorize,
    validateRequest({
      params: identityApplicationIdParamSchema,
      body: updateTechnicianApplicationBodySchema
    }),
    controller.updateTechnicianDraft
  );
  router.post(
    "/identity-applications/merchant",
    authenticate(),
    authorize,
    validateRequest({ body: createMerchantApplicationBodySchema }),
    controller.createMerchantDraft
  );
  router.patch(
    "/identity-applications/:id/merchant-showcase",
    authenticate(),
    authorize,
    validateRequest({
      params: identityApplicationIdParamSchema,
      body: updateMerchantShowcaseBodySchema
    }),
    controller.updateMerchantShowcase
  );
  router.patch(
    "/identity-applications/:id/merchant-bank-account",
    authenticate(),
    authorizeBank,
    validateRequest({
      params: identityApplicationIdParamSchema,
      body: bindMerchantBankAccountBodySchema
    }),
    controller.bindMerchantBankAccount
  );
  router.post(
    "/identity-applications/:id/submit",
    authenticate(),
    authorize,
    validateRequest({
      params: identityApplicationIdParamSchema,
      body: identityApplicationVersionBodySchema
    }),
    controller.submit
  );
  router.post(
    "/identity-applications/:id/withdraw",
    authenticate(),
    authorize,
    validateRequest({
      params: identityApplicationIdParamSchema,
      body: identityApplicationVersionBodySchema
    }),
    controller.withdraw
  );

  return router;
};
