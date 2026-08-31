import { Router } from "express";
import type { AppDependencies } from "../app";
import type { AppConfig } from "../config/env";
import { EXCHANGE_REQUEST_FEE_PERMISSIONS } from "../constants/permissions.constants";
import { ExchangeRequestFeeController } from "../controllers/exchange-request-fee.controller";
import { createAuthenticateMiddleware } from "../middlewares/authenticate.middleware";
import { createAuthorizeMiddleware } from "../middlewares/authorize.middleware";
import { validateRequest } from "../middlewares/validate-request.middleware";
import { ExchangeRequestFeeRepository } from "../repositories/exchange-request-fee.repository";
import { ExchangeRequestFeeService } from "../services/exchange-request-fee.service";
import {
  createExchangeRequestFeeVersionSchema,
  exchangeRequestFeeHistoryQuerySchema
} from "../validators/exchange-request-fee.validator";
import { createAuthServiceForRoutes } from "./auth-service.factory";

export const createExchangeRequestFeeRoutes = (
  config: AppConfig,
  dependencies: AppDependencies
): Router => {
  const router = Router();
  const authenticate = createAuthenticateMiddleware(
    createAuthServiceForRoutes(config, dependencies)
  );
  const service =
    dependencies.exchangeRequestFeeService ??
    new ExchangeRequestFeeService(new ExchangeRequestFeeRepository());
  const controller = new ExchangeRequestFeeController(service);

  router.get(
    "/backoffice/exchange-request-fee/current",
    authenticate(),
    createAuthorizeMiddleware(EXCHANGE_REQUEST_FEE_PERMISSIONS.read),
    controller.getCurrent
  );
  router.get(
    "/backoffice/exchange-request-fee/versions",
    authenticate(),
    createAuthorizeMiddleware(EXCHANGE_REQUEST_FEE_PERMISSIONS.read),
    validateRequest({ query: exchangeRequestFeeHistoryQuerySchema }),
    controller.listVersions
  );
  router.post(
    "/backoffice/exchange-request-fee/versions",
    authenticate(),
    createAuthorizeMiddleware(EXCHANGE_REQUEST_FEE_PERMISSIONS.write),
    validateRequest({ body: createExchangeRequestFeeVersionSchema }),
    controller.createVersion
  );

  return router;
};
