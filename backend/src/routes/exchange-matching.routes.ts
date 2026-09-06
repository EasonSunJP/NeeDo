import { Router } from "express";
import type { AppDependencies } from "../app";
import type { AppConfig } from "../config/env";
import { EXCHANGE_PERMISSIONS } from "../constants/permissions.constants";
import { ExchangeMatchingController } from "../controllers/exchange-matching.controller";
import { createAuthenticateMiddleware } from "../middlewares/authenticate.middleware";
import { createAuthorizeMiddleware } from "../middlewares/authorize.middleware";
import { validateExchangeIdempotencyKey } from "../middlewares/exchange-idempotency-key.middleware";
import { validateRequest } from "../middlewares/validate-request.middleware";
import { ExchangeMatchingRepository } from "../repositories/exchange-matching.repository";
import { ExchangeMatchingService } from "../services/exchange-matching.service";
import {
  confirmQuickExchangeBudgetSchema,
  exchangeMatchingPostIdParamSchema,
  selectExchangeMatchSchema
} from "../validators/exchange-matching.validators";
import { createAuthServiceForRoutes } from "./auth-service.factory";

export const createExchangeMatchingRoutes = (
  config: AppConfig,
  dependencies: AppDependencies
): Router => {
  const router = Router();
  const authenticate = createAuthenticateMiddleware(
    createAuthServiceForRoutes(config, dependencies)
  );
  const service =
    dependencies.exchangeMatchingService ??
    new ExchangeMatchingService(new ExchangeMatchingRepository());
  const controller = new ExchangeMatchingController(service);

  router.get(
    "/exchange/posts/:id/matching",
    authenticate(),
    createAuthorizeMiddleware(EXCHANGE_PERMISSIONS.matchingReadOwn),
    validateRequest({ params: exchangeMatchingPostIdParamSchema }),
    controller.get
  );
  router.post(
    "/exchange/posts/:id/matching/select",
    authenticate(),
    createAuthorizeMiddleware(EXCHANGE_PERMISSIONS.matchingSelectOwn),
    validateRequest({ params: exchangeMatchingPostIdParamSchema, body: selectExchangeMatchSchema }),
    validateExchangeIdempotencyKey,
    controller.select
  );
  router.post(
    "/exchange/posts/:id/matching/quick/confirm-budget",
    authenticate(),
    createAuthorizeMiddleware(EXCHANGE_PERMISSIONS.matchingSelectOwn),
    validateRequest({
      params: exchangeMatchingPostIdParamSchema,
      body: confirmQuickExchangeBudgetSchema
    }),
    validateExchangeIdempotencyKey,
    controller.confirmQuickBudget
  );

  return router;
};
