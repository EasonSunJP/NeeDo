import { Router } from "express";
import type { AppDependencies } from "../app";
import type { AppConfig } from "../config/env";
import { EXCHANGE_OPERATIONS_PERMISSIONS } from "../constants/permissions.constants";
import { ExchangeOperationsController } from "../controllers/exchange-operations.controller";
import { createAuthenticateMiddleware } from "../middlewares/authenticate.middleware";
import { createAuthorizeMiddleware } from "../middlewares/authorize.middleware";
import { validateRequest } from "../middlewares/validate-request.middleware";
import { ExchangeOperationsRepository } from "../repositories/exchange-operations.repository";
import { ExchangeOperationsService } from "../services/exchange-operations.service";
import {
  exchangeOperationsListQuerySchema,
  exchangeOperationsPostIdParamSchema
} from "../validators/exchange-operations.validator";
import { createAuthServiceForRoutes } from "./auth-service.factory";

export const createExchangeOperationsRoutes = (
  config: AppConfig,
  dependencies: AppDependencies
): Router => {
  const router = Router();
  const authenticate = createAuthenticateMiddleware(
    createAuthServiceForRoutes(config, dependencies)
  );
  const service =
    dependencies.exchangeOperationsService ??
    new ExchangeOperationsService(new ExchangeOperationsRepository());
  const controller = new ExchangeOperationsController(service);

  router.get(
    "/backoffice/exchange/posts",
    authenticate(),
    createAuthorizeMiddleware(EXCHANGE_OPERATIONS_PERMISSIONS.read),
    validateRequest({ query: exchangeOperationsListQuerySchema }),
    controller.list
  );
  router.get(
    "/backoffice/exchange/posts/:id",
    authenticate(),
    createAuthorizeMiddleware(EXCHANGE_OPERATIONS_PERMISSIONS.read),
    validateRequest({ params: exchangeOperationsPostIdParamSchema }),
    controller.detail
  );

  return router;
};

