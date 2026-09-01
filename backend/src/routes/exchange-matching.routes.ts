import { Router, type RequestHandler } from "express";
import { ZodError } from "zod";
import type { AppDependencies } from "../app";
import type { AppConfig } from "../config/env";
import { ERROR_CODES } from "../constants/error-codes";
import { EXCHANGE_PERMISSIONS } from "../constants/permissions.constants";
import { ExchangeMatchingController } from "../controllers/exchange-matching.controller";
import { createAuthenticateMiddleware } from "../middlewares/authenticate.middleware";
import { createAuthorizeMiddleware } from "../middlewares/authorize.middleware";
import { validateRequest } from "../middlewares/validate-request.middleware";
import { ExchangeMatchingRepository } from "../repositories/exchange-matching.repository";
import { ExchangeMatchingService } from "../services/exchange-matching.service";
import { AppError } from "../utils/app-error";
import {
  exchangeMatchingPostIdParamSchema,
  selectExchangeMatchSchema
} from "../validators/exchange-matching.validators";
import { exchangeIdempotencyKeySchema } from "../validators/exchange.validators";
import { createAuthServiceForRoutes } from "./auth-service.factory";

const validateIdempotencyKey: RequestHandler = (request, response, next) => {
  try {
    response.locals.exchangeMatchingIdempotencyKey = exchangeIdempotencyKeySchema.parse(
      request.get("Idempotency-Key")
    );
    next();
  } catch (error) {
    next(
      error instanceof ZodError
        ? new AppError({
            code: ERROR_CODES.VALIDATION,
            message: "error.validation",
            statusCode: 400,
            cause: error
          })
        : error
    );
  }
};

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
    validateIdempotencyKey,
    controller.select
  );

  return router;
};
