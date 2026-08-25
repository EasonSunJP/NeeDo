import { Router } from "express";
import type { AppDependencies } from "../app";
import type { AppConfig } from "../config/env";
import { OperationsMerchantApplicationController } from "../controllers/operations-merchant-application.controller";
import { createAuthenticateMiddleware } from "../middlewares/authenticate.middleware";
import { createAuthorizeMiddleware } from "../middlewares/authorize.middleware";
import { validateRequest } from "../middlewares/validate-request.middleware";
import {
  operationsMerchantApplicationIdParamSchema,
  operationsMerchantApplicationListQuerySchema,
  operationsMerchantApplicationRejectBodySchema,
  operationsMerchantApplicationReviewBodySchema
} from "../validators/operations-merchant-application.validator";
import { createAuthServiceForRoutes } from "./auth-service.factory";
import { createMerchantApplicationReviewServiceForRoutes } from "./operations-merchant-application-service.factory";

export const OPERATIONS_MERCHANT_APPLICATION_ROUTE_PERMISSIONS = {
  read: "ops:merchant-application:read",
  review: "ops:merchant-application:review"
} as const;

export const createOperationsMerchantApplicationRoutes = (
  config: AppConfig,
  dependencies: AppDependencies
): Router => {
  const router = Router();
  const authenticate = createAuthenticateMiddleware(createAuthServiceForRoutes(config, dependencies));
  const controller = new OperationsMerchantApplicationController(
    createMerchantApplicationReviewServiceForRoutes(config, dependencies)
  );

  router.get(
    "/ops/merchant-applications",
    authenticate(),
    createAuthorizeMiddleware(OPERATIONS_MERCHANT_APPLICATION_ROUTE_PERMISSIONS.read),
    validateRequest({ query: operationsMerchantApplicationListQuerySchema }),
    controller.list
  );
  router.get(
    "/ops/merchant-applications/:id",
    authenticate(),
    createAuthorizeMiddleware(OPERATIONS_MERCHANT_APPLICATION_ROUTE_PERMISSIONS.read),
    validateRequest({ params: operationsMerchantApplicationIdParamSchema }),
    controller.get
  );
  router.post(
    "/ops/merchant-applications/:id/approve",
    authenticate(),
    createAuthorizeMiddleware(OPERATIONS_MERCHANT_APPLICATION_ROUTE_PERMISSIONS.review),
    validateRequest({
      params: operationsMerchantApplicationIdParamSchema,
      body: operationsMerchantApplicationReviewBodySchema
    }),
    controller.approve
  );
  router.post(
    "/ops/merchant-applications/:id/reject",
    authenticate(),
    createAuthorizeMiddleware(OPERATIONS_MERCHANT_APPLICATION_ROUTE_PERMISSIONS.review),
    validateRequest({
      params: operationsMerchantApplicationIdParamSchema,
      body: operationsMerchantApplicationRejectBodySchema
    }),
    controller.reject
  );

  return router;
};
