import { Router } from "express";
import type { AppDependencies } from "../app";
import type { AppConfig } from "../config/env";
import { EXCHANGE_PERMISSIONS } from "../constants/permissions.constants";
import { ExchangeIntelligenceServiceController } from "../controllers/exchange-intelligence-service.controller";
import { createAuthenticateMiddleware } from "../middlewares/authenticate.middleware";
import { createAuthorizeMiddleware } from "../middlewares/authorize.middleware";
import { validateRequest } from "../middlewares/validate-request.middleware";
import { ExchangeIntelligenceServiceRepository } from "../repositories/exchange-intelligence-service.repository";
import { ExchangePostRepository } from "../repositories/exchange.repository";
import { ExchangeIntelligenceServiceService } from "../services/exchange-intelligence-service.service";
import { exchangeIntelligenceServiceOptionListQuerySchema } from "../validators/exchange-intelligence-service.validators";
import { createAuthServiceForRoutes } from "./auth-service.factory";

export const createExchangeIntelligenceServiceRoutes = (
  config: AppConfig,
  dependencies: AppDependencies
): Router => {
  const router = Router();
  const authenticate = createAuthenticateMiddleware(
    createAuthServiceForRoutes(config, dependencies)
  );
  const service =
    dependencies.exchangeIntelligenceServiceService ??
    new ExchangeIntelligenceServiceService(
      new ExchangeIntelligenceServiceRepository(),
      new ExchangePostRepository()
    );
  const controller = new ExchangeIntelligenceServiceController(service);

  router.get(
    "/exchange/intelligence/service-options",
    authenticate(),
    createAuthorizeMiddleware(EXCHANGE_PERMISSIONS.intelligenceServiceOptionList),
    validateRequest({ query: exchangeIntelligenceServiceOptionListQuerySchema }),
    controller.listOptions
  );

  return router;
};
