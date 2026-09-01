import { Router, type RequestHandler } from "express";
import { ZodError } from "zod";
import type { AppDependencies } from "../app";
import type { AppConfig } from "../config/env";
import { ERROR_CODES } from "../constants/error-codes";
import { EXCHANGE_PERMISSIONS } from "../constants/permissions.constants";
import { ExchangeClaimController } from "../controllers/exchange-claim.controller";
import { createAuthenticateMiddleware } from "../middlewares/authenticate.middleware";
import { createAuthorizeMiddleware } from "../middlewares/authorize.middleware";
import { validateRequest } from "../middlewares/validate-request.middleware";
import { ExchangeClaimRepository } from "../repositories/exchange-claim.repository";
import { ExchangePostRepository } from "../repositories/exchange.repository";
import { ExchangeClaimService } from "../services/exchange-claim.service";
import { AppError } from "../utils/app-error";
import {
  createExchangeClaimSchema,
  exchangeClaimIdParamSchema,
  exchangeClaimListQuerySchema,
  exchangeClaimOptionListQuerySchema,
  exchangeClaimPostIdParamSchema
} from "../validators/exchange-claim.validators";
import { exchangeIdempotencyKeySchema } from "../validators/exchange.validators";
import { createAuthServiceForRoutes } from "./auth-service.factory";

const validateIdempotencyKey: RequestHandler = (request, response, next) => {
  try {
    response.locals.exchangeClaimIdempotencyKey = exchangeIdempotencyKeySchema.parse(
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

export const createExchangeClaimRoutes = (
  config: AppConfig,
  dependencies: AppDependencies
): Router => {
  const router = Router();
  const authenticate = createAuthenticateMiddleware(
    createAuthServiceForRoutes(config, dependencies)
  );
  const service =
    dependencies.exchangeClaimService ??
    new ExchangeClaimService(new ExchangeClaimRepository(), new ExchangePostRepository());
  const controller = new ExchangeClaimController(service);

  router.get(
    "/exchange/posts/:id/claim-options",
    authenticate(),
    createAuthorizeMiddleware(EXCHANGE_PERMISSIONS.claimOptionList),
    validateRequest({
      params: exchangeClaimPostIdParamSchema,
      query: exchangeClaimOptionListQuerySchema
    }),
    controller.listOptions
  );
  router.post(
    "/exchange/posts/:id/claims",
    authenticate(),
    createAuthorizeMiddleware(EXCHANGE_PERMISSIONS.claimCreate),
    validateRequest({ params: exchangeClaimPostIdParamSchema, body: createExchangeClaimSchema }),
    validateIdempotencyKey,
    controller.create
  );
  router.get(
    "/exchange/posts/:id/claims/mine",
    authenticate(),
    createAuthorizeMiddleware(EXCHANGE_PERMISSIONS.claimReadOwn),
    validateRequest({ params: exchangeClaimPostIdParamSchema }),
    controller.getMine
  );
  router.get(
    "/exchange/posts/:id/claims",
    authenticate(),
    createAuthorizeMiddleware(EXCHANGE_PERMISSIONS.claimListOwnedRequest),
    validateRequest({
      params: exchangeClaimPostIdParamSchema,
      query: exchangeClaimListQuerySchema
    }),
    controller.listReceived
  );
  router.post(
    "/exchange/claims/:claimId/withdraw",
    authenticate(),
    createAuthorizeMiddleware(EXCHANGE_PERMISSIONS.claimWithdrawOwn),
    validateRequest({ params: exchangeClaimIdParamSchema }),
    validateIdempotencyKey,
    controller.withdraw
  );

  return router;
};
